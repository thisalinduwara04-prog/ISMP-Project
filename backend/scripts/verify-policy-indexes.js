/* eslint-disable no-console */
// T1 proof: the policy data layer's integrity rules are enforced by MongoDB,
// not by application code.
//
//   npm run verify:policies
//
// The distinction matters. A check written in a service can be bypassed by the
// next service, by a script, or by a race between two requests. A unique index
// cannot be bypassed by anything. Each case below therefore asserts on the
// DRIVER's duplicate-key error (E11000), not on an AppError we raised.
//
// Everything runs in a throwaway database alongside the real one
// (<your-db>_indexcheck), which is dropped at the end, so this is safe to run
// against a development or Atlas connection without touching seeded data.

const mongoose = require('mongoose');

const env = require('../src/config/env');
const redact = require('../src/utils/redactUri');
const Policy = require('../src/models/Policy');
const PolicyVersion = require('../src/models/PolicyVersion');
const Acknowledgement = require('../src/models/Acknowledgement');
const { POLICY_CATEGORY, POLICY_VERSION_STATUS } = require('../src/constants/policies');
const { ROLES, DEPARTMENTS } = require('../src/constants/roles');

const VERIFICATION_DB_SUFFIX = '_indexcheck';

const results = [];
const isDuplicateKeyError = (error) => !!error && (error.code === 11000 || error.code === 11001);

// A case passes when the operation failed FOR THE EXPECTED REASON. An
// operation that succeeds when it should not is the whole point of the script,
// so it is reported as loudly as a crash.
const expectRejection = async (label, detail, operation, matcher) => {
  try {
    await operation();
    results.push({ label, ok: false, note: 'ACCEPTED - the constraint is missing' });
  } catch (error) {
    const ok = matcher(error);
    results.push({
      label,
      ok,
      note: ok ? detail : `rejected, but for the wrong reason: ${error.message}`,
    });
  }
};

const expectSuccess = async (label, detail, operation) => {
  try {
    await operation();
    results.push({ label, ok: true, note: detail });
  } catch (error) {
    results.push({ label, ok: false, note: `REJECTED: ${error.message}` });
  }
};

const objectId = () => new mongoose.Types.ObjectId();

const run = async () => {
  const dbName = (mongoose.connection.name || 'ispm') + '';
  console.log(`\n  Database : ${dbName}`);
  console.log(`  URI      : ${redact(env.MONGO_URI)}\n`);

  // Build the indexes declared in the schemas before testing them. syncIndexes
  // also drops anything left over from an earlier shape, so the printout below
  // reflects the code exactly.
  await Promise.all([
    Policy.syncIndexes(),
    PolicyVersion.syncIndexes(),
    Acknowledgement.syncIndexes(),
  ]);

  for (const model of [Policy, PolicyVersion, Acknowledgement]) {
    const indexes = await model.collection.indexes();
    console.log(`  ${model.collection.collectionName}`);
    indexes.forEach((index) => {
      const flags = [
        index.unique ? 'unique' : null,
        index.partialFilterExpression
          ? `partial ${JSON.stringify(index.partialFilterExpression)}`
          : null,
      ].filter(Boolean);
      console.log(`    - ${JSON.stringify(index.key)}${flags.length ? `  [${flags.join(', ')}]` : ''}`);
    });
    console.log('');
  }

  const ownerId = objectId();
  const userId = objectId();

  const policy = await Policy.create({
    title: 'Acceptable Use Policy',
    code: 'ZZ-INDEXCHECK-001',
    category: POLICY_CATEGORY.GENERAL,
    ownerId,
  });

  const versionFields = {
    policyId: policy._id,
    title: policy.title,
    body: 'Do not plug unknown USB devices into company machines.',
    authoredBy: ownerId,
  };

  // 1. One published version per policy - the rule the whole module rests on.
  await PolicyVersion.create({
    ...versionFields,
    versionNumber: 1,
    status: POLICY_VERSION_STATUS.PUBLISHED,
    publishedAt: new Date(),
  });

  await expectRejection(
    'Second PUBLISHED version for the same policy',
    'rejected by the partial unique index one_published_version_per_policy',
    () =>
      PolicyVersion.create({
        ...versionFields,
        versionNumber: 2,
        changeNote: 'Attempting a second live version.',
        status: POLICY_VERSION_STATUS.PUBLISHED,
        publishedAt: new Date(),
      }),
    isDuplicateKeyError
  );

  // 2. ...but the partial filter must still allow the states that are normal.
  await expectSuccess(
    'A DRAFT alongside the PUBLISHED version',
    'accepted - the partial filter constrains PUBLISHED only',
    () =>
      PolicyVersion.create({
        ...versionFields,
        versionNumber: 2,
        changeNote: 'Added USB storage restriction.',
        status: POLICY_VERSION_STATUS.DRAFT,
      })
  );

  // 3. Version numbering cannot collide, so "next version = highest + 1" is
  //    safe even when two admins press Save at the same instant.
  await expectRejection(
    'Duplicate versionNumber for the same policy',
    'rejected by the unique index { policyId, versionNumber }',
    () => PolicyVersion.create({ ...versionFields, versionNumber: 1 }),
    isDuplicateKeyError
  );

  await expectRejection(
    'Duplicate policy code',
    'rejected by the unique index { code }',
    () =>
      Policy.create({
        title: 'A different policy, same code',
        code: 'ZZ-INDEXCHECK-001',
        category: POLICY_CATEGORY.GENERAL,
        ownerId,
      }),
    isDuplicateKeyError
  );

  // 4. Audience indexes: a version aimed at both roles AND departments must
  //    insert cleanly. It would not under the single compound index the spec
  //    tables, because MongoDB refuses to index parallel arrays - see the note
  //    in PolicyVersion.js.
  await expectSuccess(
    'Version targeting both roles and departments',
    'accepted - split audience indexes avoid the parallel-array restriction',
    () =>
      PolicyVersion.create({
        ...versionFields,
        versionNumber: 3,
        changeNote: 'Narrowed to warehouse supervisors.',
        targetRoles: [ROLES.EMPLOYEE, ROLES.MANAGER],
        targetDepartments: [DEPARTMENTS.WAREHOUSE, DEPARTMENTS.SALES],
      })
  );

  // 5. Published text is frozen. Corrections are a new version, never an edit
  //    to the wording someone has already agreed to.
  const live = await PolicyVersion.findOne({
    policyId: policy._id,
    status: POLICY_VERSION_STATUS.PUBLISHED,
  });

  await expectRejection(
    'Editing the body of a PUBLISHED version',
    'rejected by the immutability hook on the model',
    () => {
      live.body = 'Quietly rewritten after people agreed to it.';
      return live.save();
    },
    (error) => /immutable/i.test(error.message)
  );

  // 6. Acknowledgement idempotency - the reason the acknowledge endpoint needs
  //    no pre-flight findOne and therefore has no race window.
  const acknowledgement = {
    userId,
    policyId: policy._id,
    policyVersionId: live._id,
    versionNumber: live.versionNumber,
    acknowledgedAt: new Date(),
    ipAddress: '203.0.113.7',
  };

  await Acknowledgement.create(acknowledgement);

  await expectRejection(
    'Duplicate acknowledgement by the same user for the same version',
    'rejected by the unique index { userId, policyVersionId }',
    () => Acknowledgement.create(acknowledgement),
    isDuplicateKeyError
  );

  // 7. Evidence is insert-only.
  await expectRejection(
    'Updating an acknowledgement',
    'blocked by the insert-only guard on the model',
    () =>
      Acknowledgement.updateOne(
        { userId, policyVersionId: live._id },
        { $set: { timeSpentSeconds: 9999 } }
      ),
    (error) => /insert-only/i.test(error.message)
  );

  await expectRejection(
    'Deleting an acknowledgement',
    'blocked by the insert-only guard on the model',
    () => Acknowledgement.deleteOne({ userId, policyVersionId: live._id }),
    (error) => /insert-only/i.test(error.message)
  );
};

(async () => {
  let connected = false;
  try {
    // A dedicated database, so nothing here can collide with seeded data.
    const baseName = (env.MONGO_URI.match(/\/([^/?]+)(\?|$)/) || [, 'ispm'])[1];
    await mongoose.connect(env.MONGO_URI, {
      dbName: `${baseName}${VERIFICATION_DB_SUFFIX}`,
      serverSelectionTimeoutMS: 10000,
    });
    connected = true;

    await run();

    const width = Math.max(...results.map((r) => r.label.length));
    console.log('  Results\n');
    results.forEach(({ label, ok, note }) => {
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(width)}  ${note}`);
    });

    const failed = results.filter((r) => !r.ok).length;
    console.log(
      failed
        ? `\n  ${failed} of ${results.length} checks FAILED.\n`
        : `\n  All ${results.length} checks passed. T1 done-when condition met.\n`
    );

    process.exitCode = failed ? 1 : 0;
  } catch (error) {
    console.error(`\n  Verification could not run: ${error.message}\n`);
    console.error('  If this is a connection failure, run: npm run check:db\n');
    process.exitCode = 1;
  } finally {
    if (connected) {
      // Guarded: only ever drop the throwaway database, never the real one.
      if (mongoose.connection.name.endsWith(VERIFICATION_DB_SUFFIX)) {
        await mongoose.connection.dropDatabase();
      }
      await mongoose.disconnect();
    }
  }
})();
