/* eslint-disable no-console */
// Publishes a small set of policies against the seeded accounts, so the M2
// employee loop can be walked through in a browser.
//
//   npm run seed          (accounts first - this script needs them)
//   npm run demo:policies
//
// A stopgap, not T18. The full demo dataset - training modules, quiz attempts,
// a realistic spread of COMPLETED / PENDING / OVERDUE assignments - is T18's
// job and will supersede this file. What this gives you is the minimum needed
// to see a policy, read it and acknowledge it.
//
// Safe to re-run: it removes only the policies it created, by code prefix.

const mongoose = require('mongoose');

const env = require('../src/config/env');
const redact = require('../src/utils/redactUri');
const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const PolicyVersion = require('../src/models/PolicyVersion');
const Acknowledgement = require('../src/models/Acknowledgement');
const Assignment = require('../src/models/Assignment');
const policyService = require('../src/modules/policy/policy.service');
const versionService = require('../src/modules/policy/version.service');
const { ROLES, DEPARTMENTS } = require('../src/constants/roles');
const { POLICY_CATEGORY } = require('../src/constants/policies');
const { ASSIGNMENT_ITEM_TYPE } = require('../src/constants/assignments');

const DEMO_PREFIX = 'DEMO-';

const AUP_BODY = `## Purpose

Savikro provides laptops, phones and network access so that you can do your job.
This policy explains what acceptable use of that equipment looks like, and what
to do when something goes wrong.

## Your responsibilities

- Lock your screen whenever you step away from a shared terminal.
- Use your own account. Never sign in as a colleague, and never let a colleague
  use a session you opened.
- Report a lost or stolen device the same day, however embarrassing the
  circumstances. A device reported late is far worse than one reported quickly.

## Passwords

Choose a passphrase you can remember and nobody can guess. Three unrelated
words beat one clever substitution. Never reuse your work password anywhere
else, and never write it on anything that lives near the machine.

## Personal use

Reasonable personal use is fine. Installing unapproved software, disabling
security tools, or connecting personal storage to a company machine is not.

## If something goes wrong

Tell IT. Nobody is disciplined for reporting a mistake promptly. The only
serious failure is a problem that stays hidden.`;

const USB_BODY = `## Why this changed

Two USB drives of unknown origin were found in the warehouse in the same month.
Either could have carried malware onto the stock system, so the rules on
removable storage are now explicit rather than implied.

## The rule

Do not connect any USB storage device to a Savikro machine unless it was issued
by IT and is on the approved list.

This includes drives found on site, drives given away at trade shows, and your
own drive from home - however convenient it would be.

## What to do with a drive you find

Hand it to your supervisor. Do not plug it in "just to see whose it is": that is
precisely the behaviour the technique relies on.

## Approved alternatives

- Shared network folders for anything that stays inside the business.
- The IT-issued encrypted drives, signed out at the warehouse office, for
  anything that has to travel.`;

const PHONE_BODY = `## Reporting a suspicious message

If an email or text asks you to log in, pay something urgently, or open an
unexpected attachment, treat it as suspicious - especially if it presses you to
act quickly.

## What to do

1. Do not click the link or open the attachment.
2. Forward it to security@savikro.example, or use the Report button.
3. Delete it once you have reported it.

## What not to worry about

You will never be blamed for reporting something that turns out to be genuine.
Reporting ten harmless emails costs the business nothing. Missing one real
attack costs a great deal.`;

const publishPolicy = async (admin, { code, title, category, description, body, audience, changeNote }) => {
  const policy = await policyService.createPolicy(
    { title, code, category, description },
    admin
  );

  const draft = await versionService.createDraft(
    policy.id,
    { body, changeNote, ...audience },
    admin
  );

  const published = await versionService.publish(policy.id, draft.id, {}, admin, null);

  return { policy, version: published.version, publication: published.publication };
};

const run = async () => {
  const admin = await User.findOne({ role: ROLES.ADMIN });

  if (!admin) {
    throw new Error('No ADMIN account found. Run `npm run seed` first.');
  }

  // Clear anything a previous run created, so this is safe to repeat. The
  // acknowledgements collection is insert-only at the model layer, which is
  // exactly the point - so demo evidence is cleared through the driver, and
  // that bypass is only ever acceptable in a throwaway demo script.
  const existing = await Policy.find({ code: { $regex: `^${DEMO_PREFIX}` } }).select('_id');
  if (existing.length) {
    const policyIds = existing.map((p) => p._id);
    const versions = await PolicyVersion.find({ policyId: { $in: policyIds } }).select('_id');
    const versionIds = versions.map((v) => v._id);

    await mongoose.connection
      .collection('acknowledgements')
      .deleteMany({ policyVersionId: { $in: versionIds } });
    await Assignment.deleteMany({ itemType: ASSIGNMENT_ITEM_TYPE.POLICY, itemId: { $in: versionIds } });
    await PolicyVersion.deleteMany({ policyId: { $in: policyIds } });
    await Policy.deleteMany({ _id: { $in: policyIds } });

    console.log(`  Cleared ${existing.length} policies from a previous run.\n`);
  }

  const created = [];

  // 1. Everyone, every department. The row every account will see.
  created.push(
    await publishPolicy(admin, {
      code: `${DEMO_PREFIX}AUP-001`,
      title: 'Acceptable Use Policy',
      category: POLICY_CATEGORY.DEVICE_SECURITY,
      description: 'How Savikro devices, accounts and network access may be used.',
      body: AUP_BODY,
      audience: { targetRoles: [], targetDepartments: [] },
    })
  );

  // 2. Warehouse only. Sign in as a Sales employee to see this one correctly
  //    absent, and get a 403 if you request it by ID.
  created.push(
    await publishPolicy(admin, {
      code: `${DEMO_PREFIX}USB-002`,
      title: 'Removable Storage Policy',
      category: POLICY_CATEGORY.DATA_HANDLING,
      description: 'Rules for USB drives and other removable media.',
      body: USB_BODY,
      audience: { targetRoles: [ROLES.EMPLOYEE], targetDepartments: [DEPARTMENTS.WAREHOUSE] },
    })
  );

  // 3. Everyone, with a short due window so the overdue badge has something to
  //    show once the due date passes.
  created.push(
    await publishPolicy(admin, {
      code: `${DEMO_PREFIX}PHISH-003`,
      title: 'Reporting Suspicious Messages',
      category: POLICY_CATEGORY.EMAIL_SECURITY,
      description: 'What to do when an email or text does not look right.',
      body: PHONE_BODY,
      audience: { targetRoles: [], targetDepartments: [], dueInDays: 7 },
    })
  );

  // A second version of the Acceptable Use Policy, so the version history and
  // the supersede behaviour are visible in a demo rather than only in a test.
  const aup = created[0];
  const v2Draft = await versionService.createDraft(
    aup.policy.id,
    {
      body: `${AUP_BODY}\n\n## Multi-factor authentication\n\nFrom this version, multi-factor authentication is required on every account that can reach customer data. IT will contact you to enrol.`,
      changeNote: 'Added the multi-factor authentication requirement.',
      targetRoles: [],
      targetDepartments: [],
    },
    admin
  );
  const v2 = await versionService.publish(aup.policy.id, v2Draft.id, {}, admin, null);

  console.log('  Published:\n');
  created.forEach(({ policy, publication }) => {
    console.log(`    ${policy.code.padEnd(18)} ${policy.title.padEnd(34)} → ${publication.assignedCount} staff`);
  });
  console.log(
    `    ${'(v2)'.padEnd(18)} ${'Acceptable Use Policy, version 2'.padEnd(34)} → ${v2.publication.assignedCount} staff, v1 superseded`
  );

  const totals = await Assignment.countDocuments({ itemType: ASSIGNMENT_ITEM_TYPE.POLICY });
  const acks = await Acknowledgement.countDocuments();
  console.log(`\n  ${totals} policy assignments now outstanding, ${acks} acknowledgements on record.`);

  const employee = await User.findOne({ role: ROLES.EMPLOYEE, department: DEPARTMENTS.WAREHOUSE });
  console.log('\n  Sign in and look at Policies:');
  console.log(`    warehouse employee : ${employee ? employee.employeeId : '(none seeded)'}`);
  console.log(`    administrator      : ${admin.employeeId}`);
  console.log('    password           : the one printed by `npm run seed`\n');
};

(async () => {
  try {
    await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log(`\n  Database : ${mongoose.connection.name}`);
    console.log(`  URI      : ${redact(env.MONGO_URI)}\n`);

    await run();
    process.exitCode = 0;
  } catch (error) {
    console.error(`\n  Failed: ${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
