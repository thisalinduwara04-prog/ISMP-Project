/* eslint-disable no-console */
// Removes ledger rows that point at a policy version which no longer exists.
//
//   npm run clean:orphans          (report only)
//   npm run clean:orphans -- --fix (delete them)
//
// How they arise: a policy deleted before the delete path cascaded to the
// assignments ledger. The delete route now removes them itself, so this is a
// one-off repair rather than something that should ever need running again.
//
// Why they matter: an assignment is invisible on the policy list, because that
// screen only lists policies that exist. But M4's dashboards aggregate the
// LEDGER directly, so an orphan is counted as an outstanding task that can
// never be completed - permanently depressing the compliance figure with work
// nobody can do.

const mongoose = require('mongoose');

const env = require('../src/config/env');
const redact = require('../src/utils/redactUri');
const Assignment = require('../src/models/Assignment');
const PolicyVersion = require('../src/models/PolicyVersion');
const { ASSIGNMENT_ITEM_TYPE } = require('../src/constants/assignments');

const fix = process.argv.includes('--fix');

(async () => {
  try {
    await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

    console.log(`\n  Database : ${mongoose.connection.name}`);
    console.log(`  URI      : ${redact(env.MONGO_URI)}`);
    console.log(`  Mode     : ${fix ? 'FIX - orphans will be deleted' : 'report only'}\n`);

    const assignments = await Assignment.find({
      itemType: ASSIGNMENT_ITEM_TYPE.POLICY,
    }).lean();

    const liveVersionIds = new Set(
      (await PolicyVersion.find({}).select('_id').lean()).map((v) => v._id.toString())
    );

    const orphans = assignments.filter((a) => !liveVersionIds.has(a.itemId.toString()));

    if (orphans.length === 0) {
      console.log(`  ${assignments.length} policy assignments checked. No orphans.\n`);
      await mongoose.disconnect();
      return;
    }

    // Grouped by the denormalised title, which is the only trace left of the
    // policy once its versions are gone - and the reason itemTitle is worth
    // carrying on the ledger at all.
    const byTitle = orphans.reduce((groups, orphan) => {
      const key = orphan.itemTitle || '(untitled)';
      groups[key] = (groups[key] || 0) + 1;
      return groups;
    }, {});

    console.log(`  ${orphans.length} orphaned assignment(s) of ${assignments.length}:\n`);
    Object.entries(byTitle)
      .sort((a, b) => b[1] - a[1])
      .forEach(([title, count]) => console.log(`    ${String(count).padStart(3)}  ${title}`));

    if (!fix) {
      console.log('\n  Nothing changed. Re-run with --fix to delete them.\n');
      await mongoose.disconnect();
      return;
    }

    const result = await Assignment.deleteMany({
      _id: { $in: orphans.map((orphan) => orphan._id) },
    });

    console.log(`\n  Deleted ${result.deletedCount} orphaned assignment(s).`);
    console.log('  Acknowledgements are untouched: this only removes ledger rows.\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error(`\n  Failed: ${error.message}\n`);
    process.exitCode = 1;
    await mongoose.disconnect().catch(() => {});
  }
})();
