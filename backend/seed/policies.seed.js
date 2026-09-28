/* eslint-disable no-console */
/**
 * Replace every policy in the database with the four Savikro policies held as
 * Markdown in `seed/policies/`.
 *
 * Run with:  npm run seed:policies
 *
 * The Markdown files are the source of truth. Each carries YAML front matter
 * (code, title, category, targetRoles, targetDepartments, dueInDays,
 * description) and the body below it becomes `policyVersions.body`, so editing
 * a policy means editing its .md file and re-running this script.
 *
 * WHAT IT DELETES, AND WHY IT HAS TO
 * ----------------------------------
 * Removing a policy cannot mean removing only the `policies` row. The version,
 * the ledger rows pointing at that version, and the acknowledgements recorded
 * against it all reference it by id, and an assignment pointing at a version
 * that no longer exists shows up on every dashboard as a task nobody can ever
 * complete. So this clears, for policies only:
 *
 *   policies · policyversions · policyattachments
 *   acknowledgements           (they reference a policyVersion)
 *   assignments WHERE itemType = 'POLICY'   (training rows are left alone)
 *   notifications about policies
 *
 * `auditlogs` is NEVER touched. It is append-only by design (AD-4), and the
 * record that those policies once existed and were acknowledged is exactly the
 * kind of evidence the collection is for.
 *
 * Everything deleted is written to a timestamped JSON file first, so the
 * previous state can be restored if this turns out to have been a mistake.
 */

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const env = require('../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const redactUri = require('../src/utils/redactUri');

const Policy = require('../src/models/Policy');
const PolicyVersion = require('../src/models/PolicyVersion');
const User = require('../src/models/User');
const assignments = require('../src/modules/assignment/assignment.service');

const { POLICY_STATUS, POLICY_VERSION_STATUS } = require('../src/constants/policies');
const { ROLES, USER_STATUS } = require('../src/constants/roles');
const { ASSIGNMENT_ITEM_TYPE } = require('../src/constants/assignments');

const POLICY_DIR = path.join(__dirname, 'policies');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// ---------------------------------------------------------------------------
// Front matter
// ---------------------------------------------------------------------------
//
// Deliberately hand-rolled rather than pulling in `gray-matter`. The shape here
// is fixed and tiny - scalars, and inline arrays that are always empty or a
// list of enum values - so a dependency would buy nothing.

const parseScalar = (raw) => {
  const value = raw.replace(/\s+#.*$/, '').trim(); // strip trailing comment
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  if (/^\d+$/.test(value)) return Number(value);
  return value.replace(/^["']|["']$/g, '');
};

const parseFrontMatter = (source, file) => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${file} has no front matter block.`);

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    meta[line.slice(0, separator).trim()] = parseScalar(line.slice(separator + 1));
  }

  return { meta, body: match[2].trim() };
};

const loadPolicyFiles = () => {
  const files = fs.readdirSync(POLICY_DIR).filter((name) => name.endsWith('.md')).sort();
  if (files.length === 0) throw new Error(`No .md policy files found in ${POLICY_DIR}`);

  return files.map((file) => {
    const { meta, body } = parseFrontMatter(fs.readFileSync(path.join(POLICY_DIR, file), 'utf8'), file);

    for (const field of ['code', 'title', 'category']) {
      if (!meta[field]) throw new Error(`${file} is missing "${field}" in its front matter.`);
    }
    if (!body) throw new Error(`${file} has front matter but no body text.`);

    return {
      file,
      code: meta.code,
      title: meta.title,
      category: meta.category,
      description: meta.description || '',
      targetRoles: Array.isArray(meta.targetRoles) ? meta.targetRoles : [],
      targetDepartments: Array.isArray(meta.targetDepartments) ? meta.targetDepartments : [],
      dueInDays: Number(meta.dueInDays) || 14,
      body,
    };
  });
};

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

const backup = async (db) => {
  const policyIds = (await db.collection('policies').find({}).project({ _id: 1 }).toArray())
    .map((row) => row._id);

  const snapshot = {
    takenAt: new Date().toISOString(),
    database: redactUri(env.MONGO_URI),
    policies: await db.collection('policies').find({}).toArray(),
    policyversions: await db.collection('policyversions').find({}).toArray(),
    policyattachments: await db.collection('policyattachments').find({}).toArray(),
    acknowledgements: await db.collection('acknowledgements').find({}).toArray(),
    assignments: await db
      .collection('assignments')
      .find({ itemType: ASSIGNMENT_ITEM_TYPE.POLICY })
      .toArray(),
    policyIds,
  };

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const target = path.join(
    BACKUP_DIR,
    `policies-before-reseed-${snapshot.takenAt.replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(target, JSON.stringify(snapshot, null, 2), 'utf8');

  return { target, snapshot };
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const run = async () => {
  const definitions = loadPolicyFiles();

  await connectDatabase();
  console.log(`[seed] Connected to ${redactUri(env.MONGO_URI)}\n`);

  const db = mongoose.connection.db;

  // An owner is required on every policy, and the audit trail should name a
  // real person rather than a synthetic "system" id.
  const owner = await User.findOne({ role: ROLES.ADMIN, status: USER_STATUS.ACTIVE }).lean();
  if (!owner) throw new Error('No active ADMIN user found to own these policies. Run `npm run seed` first.');

  console.log('[seed] Backing up current policy data...');
  const { target, snapshot } = await backup(db);
  console.log(`[seed] Wrote ${path.relative(process.cwd(), target)}`);
  console.log(
    `       ${snapshot.policies.length} policies, ${snapshot.policyversions.length} versions, ` +
      `${snapshot.acknowledgements.length} acknowledgements, ${snapshot.assignments.length} policy assignments\n`
  );

  console.log('[seed] Removing existing policy data (auditLogs untouched)...');
  const removed = {
    policies: (await db.collection('policies').deleteMany({})).deletedCount,
    policyversions: (await db.collection('policyversions').deleteMany({})).deletedCount,
    policyattachments: (await db.collection('policyattachments').deleteMany({})).deletedCount,
    acknowledgements: (await db.collection('acknowledgements').deleteMany({})).deletedCount,
    assignments: (
      await db.collection('assignments').deleteMany({ itemType: ASSIGNMENT_ITEM_TYPE.POLICY })
    ).deletedCount,
    // Reminder notices deep-linking to a policy that no longer exists would
    // open a dead page. Reminders pointing at /my-tasks are left alone.
    notifications: (
      await db.collection('notifications').deleteMany({ linkPath: { $regex: '^/policies' } })
    ).deletedCount,
  };
  for (const [collection, count] of Object.entries(removed)) {
    console.log(`       ${String(count).padStart(4)} ${collection}`);
  }

  console.log('\n[seed] Creating policies...');
  const publishedAt = new Date();
  const results = [];

  for (const definition of definitions) {
    const policy = await Policy.create({
      title: definition.title,
      code: definition.code,
      category: definition.category,
      description: definition.description,
      ownerId: owner._id,
      status: POLICY_STATUS.ACTIVE,
    });

    const version = await PolicyVersion.create({
      policyId: policy._id,
      versionNumber: 1,
      title: definition.title,
      body: definition.body,
      // Version 1 has no predecessor, so a change note would have nothing to
      // describe - the model only requires one from v2 onward.
      changeNote: '',
      targetRoles: definition.targetRoles,
      targetDepartments: definition.targetDepartments,
      status: POLICY_VERSION_STATUS.PUBLISHED,
      effectiveFrom: publishedAt,
      dueInDays: definition.dueInDays,
      authoredBy: owner._id,
      publishedBy: owner._id,
      publishedAt,
    });

    policy.currentVersionId = version._id;
    await policy.save();

    // Through the assignment service, not the model: M2 is not allowed to
    // write M4's ledger directly, and this is the same call the real publish
    // endpoint makes.
    const fanOut = await assignments.fanOut({
      itemType: ASSIGNMENT_ITEM_TYPE.POLICY,
      itemId: version._id,
      itemTitle: version.title,
      audience: { roles: definition.targetRoles, departments: definition.targetDepartments },
      dueInDays: definition.dueInDays,
    });

    results.push({ definition, policy, version, fanOut });
    console.log(
      `       ${definition.code.padEnd(14)} ${definition.title.slice(0, 44).padEnd(45)} ` +
        `v1 PUBLISHED → ${fanOut.assignedCount} staff`
    );
  }

  const dueDate = new Date(publishedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
  console.log(`\n[seed] Done. ${results.length} policies published, due ${dueDate.toDateString()}.`);
  console.log(`[seed] Restore point: ${path.relative(process.cwd(), target)}\n`);

  await disconnectDatabase();
};

run().catch(async (error) => {
  console.error('\n[seed] Failed:', error.message);
  console.error(error);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
