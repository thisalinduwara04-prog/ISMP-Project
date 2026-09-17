/**
 * Reconcile the assignments ledger for accounts that already exist.
 *
 *   node scripts/backfill-assignments.js            report only, writes nothing
 *   node scripts/backfill-assignments.js --apply    create the missing rows
 *
 * Fan-out resolves an item's audience once, at publish time, so anybody created
 * after a policy or module went out holds no ledger row for it - they can see
 * it and cannot complete it. `assignmentService.backfillForUser` closes that
 * gap going forward, on create, transfer, promotion and reactivation. This
 * script is the one-off for accounts that predate it.
 *
 * Safe to run repeatedly: the backfill upserts on the unique key and uses
 * $setOnInsert throughout, so an existing row - including a COMPLETED one -
 * is never rewritten.
 */

const mongoose = require('mongoose');

const env = require('../src/config/env');
const User = require('../src/models/User');
const PolicyVersion = require('../src/models/PolicyVersion');
const TrainingModule = require('../src/models/TrainingModule');
const Assignment = require('../src/models/Assignment');
const assignmentService = require('../src/modules/assignment/assignment.service');
const { matchesAudience } = require('../src/utils/audience');
const { USER_STATUS } = require('../src/constants/roles');
const { POLICY_VERSION_STATUS } = require('../src/constants/policies');
const { MODULE_STATUS } = require('../src/constants/training');
const redactUri = require('../src/utils/redactUri');

const apply = process.argv.includes('--apply');

const run = async () => {
  await mongoose.connect(env.MONGO_URI);
  console.log(`\nConnected: ${redactUri ? redactUri(env.MONGO_URI) : '(configured database)'}`);
  console.log(apply ? 'Mode: APPLY - missing rows will be created.' : 'Mode: DRY RUN - nothing will be written.\n');

  const [versions, modules, users] = await Promise.all([
    PolicyVersion.find({ status: POLICY_VERSION_STATUS.PUBLISHED })
      .select('_id title targetRoles targetDepartments')
      .lean(),
    TrainingModule.find({ status: MODULE_STATUS.PUBLISHED })
      .select('_id title targetRoles targetDepartments')
      .lean(),
    User.find({ status: USER_STATUS.ACTIVE }).sort({ employeeId: 1 }),
  ]);

  console.log(`Published policy versions: ${versions.length}`);
  console.log(`Published training modules: ${modules.length}`);
  console.log(`Active accounts: ${users.length}\n`);

  if (versions.length === 0 && modules.length === 0) {
    console.log('Nothing is published, so there is nothing to assign.\n');
    await mongoose.disconnect();
    return;
  }

  let accountsShort = 0;
  let rowsMissing = 0;
  let rowsCreated = 0;

  for (const user of users) {
    const targeted = [
      ...versions.filter((v) => matchesAudience(v, user)).map((v) => v._id),
      ...modules.filter((m) => matchesAudience(m, user)).map((m) => m._id),
    ];

    // eslint-disable-next-line no-await-in-loop
    const held = await Assignment.countDocuments({
      userId: user._id,
      itemId: { $in: targeted },
    });

    const short = targeted.length - held;
    if (short <= 0) continue;

    accountsShort += 1;
    rowsMissing += short;

    console.log(
      `  ${String(user.employeeId).padEnd(11)} ${String(user.department).padEnd(15)} ${String(user.role).padEnd(9)} holds ${held}/${targeted.length}  missing ${short}`
    );

    if (apply) {
      // eslint-disable-next-line no-await-in-loop
      const result = await assignmentService.backfillForUser(user);
      rowsCreated += result.assignedCount;
    }
  }

  console.log('');
  if (rowsMissing === 0) {
    console.log('Every active account already holds everything it is targeted by.\n');
  } else if (apply) {
    console.log(`Created ${rowsCreated} assignment(s) across ${accountsShort} account(s).\n`);
  } else {
    console.log(
      `${accountsShort} account(s) are short a total of ${rowsMissing} assignment(s).\n` +
        'Re-run with --apply to create them.\n'
    );
  }

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('\nFailed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
