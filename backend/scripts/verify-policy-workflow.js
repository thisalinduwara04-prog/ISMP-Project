/* eslint-disable no-console */
// T2, T3 and T4 proof: the policy authoring and publication workflow, driven
// through the real HTTP API with real tokens.
//
//   npm run verify:workflow
//
// Supertest against the actual Express app, so what is exercised is the whole
// stack - route guards, Zod, controller, service, Mongoose - and not just the
// service functions in isolation. An authorisation check that only holds when
// called from inside the service proves nothing (NFR-SEC-03).
//
// Runs in a throwaway database alongside the real one (<your-db>_workflowcheck),
// dropped at the end, so it is safe against a development or Atlas connection.

const fsp = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const request = require('supertest');

const { directoryFor } = require('../src/middleware/upload');

const env = require('../src/config/env');
const redact = require('../src/utils/redactUri');
const { createApp, API_PREFIX } = require('../src/app');
const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const PolicyVersion = require('../src/models/PolicyVersion');
const Acknowledgement = require('../src/models/Acknowledgement');
const Assignment = require('../src/models/Assignment');
const AuditLog = require('../src/models/AuditLog');
const { signAccessToken } = require('../src/modules/auth/token.service');
const { ROLES, DEPARTMENTS, USER_STATUS } = require('../src/constants/roles');
const { POLICY_CATEGORY, POLICY_VERSION_STATUS } = require('../src/constants/policies');
const { ASSIGNMENT_STATUS, ASSIGNMENT_ITEM_TYPE } = require('../src/constants/assignments');

const VERIFICATION_DB_SUFFIX = '_workflowcheck';
const POLICIES = `${API_PREFIX}/policies`;

// A real bcrypt digest shape, so the User pre-save hook recognises it as
// already hashed and skips 12 rounds of work per seeded user.
const PREHASHED = '$2b$12$abcdefghijklmnopqrstuvCe/9oOQC6dqiVJTPPjBQ0nCPPuIWm2';

const results = [];
const app = createApp();

const check = (label, passed, note = '') => {
  results.push({ label, ok: !!passed, note });
  return !!passed;
};

// A genuine access token, minted the same way login mints one. `authenticate`
// still re-reads the user from the database, so these tokens carry no more
// authority than the account behind them.
const as = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

const makeUser = (n, role, department) =>
  User.create({
    employeeId: `WF${String(n).padStart(3, '0')}`,
    fullName: `Workflow User ${n}`,
    email: `wf${n}@example.test`,
    passwordHash: PREHASHED,
    role,
    department,
    status: USER_STATUS.ACTIVE,
  });

const run = async () => {
  // --- Cast -----------------------------------------------------------------
  const admin = await makeUser(1, ROLES.ADMIN, DEPARTMENTS.ADMINISTRATION);
  const manager = await makeUser(2, ROLES.MANAGER, DEPARTMENTS.SALES);

  // Twelve warehouse employees: the twelve of the US-011 acceptance criterion.
  const warehouse = [];
  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    warehouse.push(await makeUser(10 + i, ROLES.EMPLOYEE, DEPARTMENTS.WAREHOUSE));
  }
  // One employee outside the audience, to prove the targeting actually targets.
  const salesEmployee = await makeUser(90, ROLES.EMPLOYEE, DEPARTMENTS.SALES);

  // =========================================================================
  // T2 - policy shell CRUD
  // =========================================================================

  const created = await request(app)
    .post(POLICIES)
    .set(as(admin))
    .send({
      title: 'Acceptable Use Policy',
      code: 'wf-aup-001', // lowercase on purpose: it must be normalised
      category: POLICY_CATEGORY.DEVICE_SECURITY,
      description: 'How company devices and networks may be used.',
    });

  check(
    'T2 admin creates a policy shell',
    created.status === 201 && created.body.data.policy.code === 'WF-AUP-001',
    `${created.status}, code ${created.body.data && created.body.data.policy && created.body.data.policy.code}`
  );

  const policyId = created.body.data.policy.id;

  const duplicate = await request(app)
    .post(POLICIES)
    .set(as(admin))
    .send({ title: 'Another policy', code: 'WF-AUP-001', category: POLICY_CATEGORY.GENERAL });

  check(
    'T2 duplicate policy code returns 409',
    duplicate.status === 409 && duplicate.body.error.code === 'DUPLICATE_RESOURCE',
    `${duplicate.status} ${duplicate.body.error && duplicate.body.error.code}`
  );

  // The done-when that matters most: a VALID session with the wrong role is
  // refused by the API itself, not by a hidden button.
  const employeeCreate = await request(app)
    .post(POLICIES)
    .set(as(warehouse[0]))
    .send({ title: 'Employee wrote this', code: 'WF-BAD-001', category: POLICY_CATEGORY.GENERAL });

  check(
    'T2 EMPLOYEE token on POST /policies returns 403',
    employeeCreate.status === 403 &&
      employeeCreate.body.error.code === 'INSUFFICIENT_PERMISSIONS',
    `${employeeCreate.status} ${employeeCreate.body.error && employeeCreate.body.error.code}`
  );

  const managerCreate = await request(app)
    .post(POLICIES)
    .set(as(manager))
    .send({ title: 'Manager wrote this', code: 'WF-BAD-002', category: POLICY_CATEGORY.GENERAL });

  check('T2 MANAGER token on POST /policies returns 403', managerCreate.status === 403, `${managerCreate.status}`);

  // Mass assignment: an unknown key is rejected outright rather than dropped.
  const extraKey = await request(app)
    .post(POLICIES)
    .set(as(admin))
    .send({
      title: 'Sneaky',
      code: 'WF-SNK-001',
      category: POLICY_CATEGORY.GENERAL,
      status: 'ARCHIVED',
    });

  check('T2 unknown key rejected by .strict()', extraKey.status === 400, `${extraKey.status}`);

  const patched = await request(app)
    .patch(`${POLICIES}/${policyId}`)
    .set(as(admin))
    .send({ description: 'Updated summary.' });

  check(
    'T2 admin edits policy metadata',
    patched.status === 200 && patched.body.data.policy.description === 'Updated summary.',
    `${patched.status}`
  );

  const badId = await request(app).get(`${POLICIES}/not-an-id`).set(as(admin));
  check('T2 malformed id returns 400, not a cast error', badId.status === 400, `${badId.status}`);

  // =========================================================================
  // T3 - draft version authoring
  // =========================================================================

  const draftV1 = await request(app)
    .post(`${POLICIES}/${policyId}/versions`)
    .set(as(admin))
    .send({
      body: 'Version 1. Do not plug unknown USB devices into company machines.',
      targetRoles: [ROLES.EMPLOYEE],
      targetDepartments: [DEPARTMENTS.WAREHOUSE],
      dueInDays: 14,
    });

  check(
    'T3 admin creates v1 as a DRAFT',
    draftV1.status === 201 &&
      draftV1.body.data.version.versionNumber === 1 &&
      draftV1.body.data.version.status === POLICY_VERSION_STATUS.DRAFT,
    `${draftV1.status}`
  );

  const v1Id = draftV1.body.data.version.id;

  const editDraft = await request(app)
    .patch(`${POLICIES}/${policyId}/versions/${v1Id}`)
    .set(as(admin))
    .send({ body: 'Version 1, revised while still a draft.' });

  check('T3 a DRAFT can be edited freely', editDraft.status === 200, `${editDraft.status}`);

  const secondDraft = await request(app)
    .post(`${POLICIES}/${policyId}/versions`)
    .set(as(admin))
    .send({ body: 'A competing draft.', changeNote: 'Second draft attempt.' });

  check(
    'T3 second concurrent DRAFT returns 409 naming the existing one',
    secondDraft.status === 409 &&
      JSON.stringify(secondDraft.body.error.details || '').includes(v1Id),
    `${secondDraft.status}`
  );

  // =========================================================================
  // T4 - publish v1, then the full US-011 scenario on v2
  // =========================================================================

  const publishV1 = await request(app)
    .post(`${POLICIES}/${policyId}/versions/${v1Id}/publish`)
    .set(as(admin))
    .send({});

  check(
    'T4 v1 publishes and fans out to the 12 targeted employees',
    publishV1.status === 200 && publishV1.body.data.publication.assignedCount === 12,
    `${publishV1.status}, assigned ${publishV1.body.data.publication && publishV1.body.data.publication.assignedCount}`
  );

  const outsider = await Assignment.countDocuments({ userId: salesEmployee._id });
  check('T4 a non-targeted employee gets no assignment', outsider === 0, `${outsider} assignments`);

  const republish = await request(app)
    .post(`${POLICIES}/${policyId}/versions/${v1Id}/publish`)
    .set(as(admin))
    .send({});

  check(
    'T4 publishing an already-PUBLISHED version returns 409',
    republish.status === 409,
    `${republish.status}`
  );

  const editPublished = await request(app)
    .patch(`${POLICIES}/${policyId}/versions/${v1Id}`)
    .set(as(admin))
    .send({ body: 'Quietly rewritten after publication.' });

  check(
    'T3 editing a PUBLISHED version returns 409',
    editPublished.status === 409,
    `${editPublished.status}`
  );

  // The twelve acknowledgements the US-011 criterion starts from. Written
  // directly because the acknowledge ENDPOINT is T6 - this script is only
  // proving that publishing v2 preserves them.
  await Acknowledgement.insertMany(
    warehouse.map((user) => ({
      userId: user._id,
      policyId,
      policyVersionId: v1Id,
      versionNumber: 1,
      acknowledgedAt: new Date(),
    }))
  );
  await Assignment.updateMany(
    { itemType: ASSIGNMENT_ITEM_TYPE.POLICY, itemId: v1Id },
    { $set: { status: ASSIGNMENT_STATUS.COMPLETED, completedAt: new Date() } }
  );

  // v2 without a change note must be refused before anything is written.
  const draftV2NoNote = await request(app)
    .post(`${POLICIES}/${policyId}/versions`)
    .set(as(admin))
    .send({ body: 'Version 2 body.', targetRoles: [ROLES.EMPLOYEE], targetDepartments: [DEPARTMENTS.WAREHOUSE] });

  check(
    'T3 v2 without a changeNote returns 400',
    draftV2NoNote.status === 400,
    `${draftV2NoNote.status}`
  );

  const draftV2 = await request(app)
    .post(`${POLICIES}/${policyId}/versions`)
    .set(as(admin))
    .send({
      body: 'Version 2. Adds a restriction on personal USB storage.',
      changeNote: 'Added USB storage restriction.',
      targetRoles: [ROLES.EMPLOYEE],
      targetDepartments: [DEPARTMENTS.WAREHOUSE],
    });

  check('T3 v2 with a changeNote is created', draftV2.status === 201, `${draftV2.status}`);
  const v2Id = draftV2.body.data.version.id;

  const publishV2 = await request(app)
    .post(`${POLICIES}/${policyId}/versions/${v2Id}/publish`)
    .set(as(admin))
    .send({});

  check('T4 v2 publishes', publishV2.status === 200, `${publishV2.status}`);

  // --- The US-011 acceptance criterion, asserted piece by piece -------------

  const v1After = await PolicyVersion.findById(v1Id);
  const v2After = await PolicyVersion.findById(v2Id);
  const policyAfter = await Policy.findById(policyId);

  check(
    'US-011 v1 becomes SUPERSEDED',
    v1After.status === POLICY_VERSION_STATUS.SUPERSEDED,
    v1After.status
  );
  check(
    'US-011 v2 becomes PUBLISHED',
    v2After.status === POLICY_VERSION_STATUS.PUBLISHED,
    v2After.status
  );
  check(
    'US-011 the policy points at v2',
    policyAfter.currentVersionId.toString() === v2Id,
    policyAfter.currentVersionId.toString()
  );

  const survivingAcks = await Acknowledgement.countDocuments({ policyVersionId: v1Id });
  check(
    'US-011 all 12 acknowledgements survive against v1',
    survivingAcks === 12,
    `${survivingAcks} retained`
  );

  const v2Assignments = await Assignment.countDocuments({
    itemType: ASSIGNMENT_ITEM_TYPE.POLICY,
    itemId: v2Id,
    status: ASSIGNMENT_STATUS.PENDING,
  });
  check(
    'US-011 every targeted employee holds a fresh PENDING assignment for v2',
    v2Assignments === 12,
    `${v2Assignments} pending`
  );

  // v1's assignments were COMPLETED before v2 was published, so they must be
  // left alone - completed work is not un-done by a new version (BR-02).
  const v1Completed = await Assignment.countDocuments({
    itemId: v1Id,
    status: ASSIGNMENT_STATUS.COMPLETED,
  });
  check(
    'US-011 completed v1 assignments are not superseded',
    v1Completed === 12,
    `${v1Completed} still COMPLETED`
  );

  const livePublished = await PolicyVersion.countDocuments({
    policyId,
    status: POLICY_VERSION_STATUS.PUBLISHED,
  });
  check('T4 exactly one PUBLISHED version remains', livePublished === 1, `${livePublished}`);

  // =========================================================================
  // Audience scoping on the read routes
  // =========================================================================

  const warehouseList = await request(app).get(POLICIES).set(as(warehouse[0]));
  check(
    'Targeted employee sees the policy in their list',
    warehouseList.status === 200 && warehouseList.body.data.count === 1,
    `${warehouseList.status}, ${warehouseList.body.data && warehouseList.body.data.count} rows`
  );

  const salesList = await request(app).get(POLICIES).set(as(salesEmployee));
  check(
    'Non-targeted employee sees an empty list',
    salesList.status === 200 && salesList.body.data.count === 0,
    `${salesList.body.data && salesList.body.data.count} rows`
  );

  const salesDirect = await request(app)
    .get(`${POLICIES}/${policyId}/versions/${v2Id}`)
    .set(as(salesEmployee));

  check(
    'Non-targeted employee requesting the version by ID gets 403, not 404',
    salesDirect.status === 403,
    `${salesDirect.status}`
  );

  const warehouseRead = await request(app)
    .get(`${POLICIES}/${policyId}/versions/${v2Id}`)
    .set(as(warehouse[0]));

  check(
    'Targeted employee can read the version body',
    warehouseRead.status === 200 && warehouseRead.body.data.version.body.includes('Version 2'),
    `${warehouseRead.status}`
  );

  const anonymous = await request(app).get(POLICIES);
  check('Unauthenticated request is refused', anonymous.status === 401, `${anonymous.status}`);

  // =========================================================================
  // T5 - audience-filtered reading, audited
  // =========================================================================

  const viewEvents = await AuditLog.countDocuments({
    actorId: warehouse[0]._id,
    action: 'POLICY_VIEWED',
    entityId: v2Id,
  });
  check('T5 POLICY_VIEWED recorded when an employee opens a version', viewEvents === 1, `${viewEvents} events`);

  const denialEvents = await AuditLog.countDocuments({
    actorId: salesEmployee._id,
    action: 'RBAC_SCOPE_VIEW_DENIED',
  });
  check('T5 the refused read is audited, not just refused', denialEvents === 1, `${denialEvents} events`);

  const listWithState = await request(app).get(POLICIES).set(as(warehouse[1]));
  check(
    'T5 list carries the caller\'s own state from the ledger',
    listWithState.body.data.policies[0].task.state === 'PENDING',
    listWithState.body.data.policies[0].task.state
  );

  // =========================================================================
  // T6 - acknowledgement
  // =========================================================================

  const reader = warehouse[0];
  const ackUrl = `${POLICIES}/${policyId}/versions/${v2Id}/acknowledge`;

  const rejected = await request(app).post(ackUrl).set(as(reader)).send({ timeSpentSeconds: 9000 });
  check(
    'T6 a client-supplied timeSpentSeconds is rejected, not ignored',
    rejected.status === 400,
    `${rejected.status}`
  );

  const acked = await request(app).post(ackUrl).set(as(reader)).send({});
  check(
    'T6 acknowledgement recorded with a server timestamp',
    acked.status === 201 && !!acked.body.data.acknowledgement.acknowledgedAt,
    `${acked.status}`
  );

  // Derived from the POLICY_VIEWED event written when this user read the
  // version earlier in this script - never from the client.
  check(
    'T6 timeSpentSeconds derived from the server-side view event',
    typeof acked.body.data.acknowledgement.timeSpentSeconds === 'number',
    `${acked.body.data.acknowledgement.timeSpentSeconds}s`
  );

  const closed = await Assignment.findOne({ userId: reader._id, itemId: v2Id });
  check(
    'T6 the assignment closes as COMPLETED with a completionRef',
    closed.status === ASSIGNMENT_STATUS.COMPLETED &&
      closed.completionRef.toString() === acked.body.data.acknowledgement.id,
    closed.status
  );

  // The done-when condition: a second submit returns the ORIGINAL record.
  const again = await request(app).post(ackUrl).set(as(reader)).send({});
  const ackCount = await Acknowledgement.countDocuments({
    userId: reader._id,
    policyVersionId: v2Id,
  });

  check(
    'T6 a second submit returns the original record with 200',
    again.status === 200 &&
      again.body.data.alreadyRecorded === true &&
      again.body.data.acknowledgement.id === acked.body.data.acknowledgement.id,
    `${again.status}`
  );
  check('T6 no duplicate document was created', ackCount === 1, `${ackCount} documents`);

  const listAfterAck = await request(app).get(POLICIES).set(as(reader));
  check(
    'T6 the item now reads as acknowledged in the list',
    listAfterAck.body.data.policies[0].task.state === 'ACKNOWLEDGED',
    listAfterAck.body.data.policies[0].task.state
  );

  // Acknowledging the superseded v1 records agreement to wording that is no
  // longer in force, so it is refused (UC-10, 5a).
  const supersededAck = await request(app)
    .post(`${POLICIES}/${policyId}/versions/${v1Id}/acknowledge`)
    .set(as(warehouse[2]))
    .send({});
  check('T6 acknowledging a SUPERSEDED version returns 409', supersededAck.status === 409, `${supersededAck.status}`);

  const unassignedAck = await request(app).post(ackUrl).set(as(salesEmployee)).send({});
  check(
    'T6 acknowledging a policy you were never assigned returns 403',
    unassignedAck.status === 403,
    `${unassignedAck.status}`
  );

  // Immutability, at the API surface rather than only at the model.
  const patchAck = await request(app).patch(ackUrl).set(as(reader)).send({});
  const deleteAck = await request(app).delete(ackUrl).set(as(reader));
  check(
    'T6 no update or delete route exists for an acknowledgement',
    patchAck.status === 404 && deleteAck.status === 404,
    `PATCH ${patchAck.status}, DELETE ${deleteAck.status}`
  );

  // =========================================================================
  // T8 - acknowledgement audit trail
  // =========================================================================

  const trailUrl = `${POLICIES}/${policyId}/versions/${v2Id}/acknowledgements`;

  const employeeTrail = await request(app).get(trailUrl).set(as(warehouse[3]));
  check('T8 audit trail refuses an EMPLOYEE token', employeeTrail.status === 403, `${employeeTrail.status}`);

  const trail = await request(app).get(trailUrl).set(as(admin));
  const summary = trail.body.data ? trail.body.data.summary : {};

  check(
    'T8 summary reads "1 of 12 acknowledged"',
    trail.status === 200 && summary.acknowledged === 1 && summary.assigned === 12,
    `${summary.acknowledged} of ${summary.assigned}`
  );
  check(
    'T8 acknowledged list carries name, timestamp and IP',
    trail.body.data.acknowledged.length === 1 &&
      !!trail.body.data.acknowledged[0].fullName &&
      !!trail.body.data.acknowledged[0].acknowledgedAt &&
      'ipAddress' in trail.body.data.acknowledged[0],
    `${trail.body.data.acknowledged.length} row`
  );
  check(
    'T8 outstanding list is the other 11, from the ledger',
    trail.body.data.outstanding.length === 11,
    `${trail.body.data.outstanding.length} outstanding`
  );

  const auditViews = await AuditLog.countDocuments({
    action: 'COMPLIANCE_AUDIT_VIEWED',
    entityId: v2Id,
  });
  check('T8 inspecting the evidence is itself audited', auditViews === 1, `${auditViews} events`);

  // The sort must be served by { policyVersionId: 1, acknowledgedAt: -1 },
  // not done in memory - which is the difference between a fast page and one
  // that degrades as evidence accumulates.
  const plan = await Acknowledgement.find({ policyVersionId: v2Id })
    .sort({ acknowledgedAt: -1 })
    .explain('queryPlanner');
  const stage = JSON.stringify(plan.queryPlanner.winningPlan);
  check(
    'T8 the sort is index-backed, with no in-memory SORT stage',
    stage.includes('IXSCAN') && !stage.includes('"stage":"SORT"'),
    stage.includes('IXSCAN') ? 'IXSCAN, no SORT stage' : 'collection scan'
  );

  // =========================================================================
  // T9 - PDF attachment
  // =========================================================================

  // A fresh draft, because an attachment may only be added while the version
  // is still editable.
  const draftV3 = await request(app)
    .post(`${POLICIES}/${policyId}/versions`)
    .set(as(admin))
    .send({ body: 'Version 3 body.', changeNote: 'Attached the signed copy.' });
  const v3Id = draftV3.body.data.version.id;
  const attachUrl = `${POLICIES}/${policyId}/versions/${v3Id}/attachment`;

  // The headline test: an executable renamed to .pdf, with a forged
  // Content-Type. Extension and MIME both say PDF; the bytes do not.
  const fakePdf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00PE\x00\x00 not a pdf at all');
  const disguised = await request(app)
    .post(attachUrl)
    .set(as(admin))
    .attach('file', fakePdf, { filename: 'malware.pdf', contentType: 'application/pdf' });

  check(
    'T9 an executable renamed to .pdf is rejected with 415',
    disguised.status === 415,
    `${disguised.status}`
  );

  const realPdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n'),
    Buffer.from('1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'),
  ]);
  const uploaded = await request(app)
    .post(attachUrl)
    .set(as(admin))
    .attach('file', realPdf, { filename: 'acceptable-use-signed.pdf', contentType: 'application/pdf' });

  check('T9 a genuine PDF is accepted', uploaded.status === 201, `${uploaded.status}`);

  // The stored name is a UUID; what the client gets is an API path.
  const storedVersion = await PolicyVersion.findById(v3Id);
  check(
    'T9 stored under a generated name, never the client\'s',
    /^[0-9a-f-]{36}\.pdf$/.test(storedVersion.attachmentUrl) &&
      storedVersion.attachmentName === 'acceptable-use-signed.pdf',
    storedVersion.attachmentUrl
  );
  check(
    'T9 the response exposes a path, not the storage name',
    uploaded.body.data.attachment.attachmentUrl.endsWith('/attachment') &&
      !uploaded.body.data.attachment.attachmentUrl.includes(storedVersion.attachmentUrl),
    uploaded.body.data.attachment.attachmentUrl
  );

  const oversized = await request(app)
    .post(attachUrl)
    .set(as(admin))
    .attach('file', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024)]), {
      filename: 'huge.pdf',
      contentType: 'application/pdf',
    });
  check('T9 a file over 10 MB is rejected with 413', oversized.status === 413, `${oversized.status}`);

  const employeeUpload = await request(app)
    .post(attachUrl)
    .set(as(warehouse[4]))
    .attach('file', realPdf, { filename: 'x.pdf', contentType: 'application/pdf' });
  check('T9 an EMPLOYEE token cannot upload', employeeUpload.status === 403, `${employeeUpload.status}`);

  // Downloading is audience-checked exactly like the body. A draft is not
  // readable by anyone but an admin.
  const adminDownload = await request(app).get(attachUrl).set(as(admin));
  check(
    'T9 an admin can stream the file back',
    adminDownload.status === 200 && adminDownload.headers['content-type'].includes('pdf'),
    `${adminDownload.status}`
  );

  const outsiderDownload = await request(app).get(attachUrl).set(as(salesEmployee));
  check('T9 a non-targeted user cannot download it', outsiderDownload.status === 403, `${outsiderDownload.status}`);

  // =========================================================================
  // T10 - archive
  // =========================================================================

  const beforeArchive = await Acknowledgement.countDocuments({ policyId });
  const archived = await request(app)
    .patch(`${POLICIES}/${policyId}`)
    .set(as(admin))
    .send({ status: 'ARCHIVED' });

  const archiveResult = (archived.body.data && archived.body.data.policy.archive) || {};
  check(
    'T10 archiving closes the open assignments',
    archived.status === 200 && archiveResult.closedAssignments === 11,
    `${archiveResult.closedAssignments} closed`
  );

  const archivedVersion = await PolicyVersion.findById(v2Id);
  check(
    'T10 the live version moves to ARCHIVED',
    archivedVersion.status === POLICY_VERSION_STATUS.ARCHIVED,
    archivedVersion.status
  );

  const afterArchive = await Acknowledgement.countDocuments({ policyId });
  check(
    'T10 every acknowledgement survives archiving',
    afterArchive === beforeArchive && afterArchive === 13,
    `${afterArchive} retained`
  );

  const completedKept = await Assignment.countDocuments({
    itemId: v2Id,
    status: ASSIGNMENT_STATUS.COMPLETED,
  });
  check(
    'T10 an already-completed assignment is not closed as superseded',
    completedKept === 1,
    `${completedKept} still COMPLETED`
  );

  const employeeListAfter = await request(app).get(POLICIES).set(as(warehouse[5]));
  check(
    'T10 the policy leaves every employee list',
    employeeListAfter.body.data.count === 0,
    `${employeeListAfter.body.data.count} rows`
  );

  const adminListDefault = await request(app).get(POLICIES).set(as(admin));
  const adminListArchived = await request(app)
    .get(`${POLICIES}?includeArchived=true`)
    .set(as(admin));
  check(
    'T10 admins see it only behind "Include archived"',
    adminListDefault.body.data.count === 0 && adminListArchived.body.data.count === 1,
    `default ${adminListDefault.body.data.count}, with flag ${adminListArchived.body.data.count}`
  );

  const goneAck = await request(app)
    .post(`${POLICIES}/${policyId}/versions/${v2Id}/acknowledge`)
    .set(as(warehouse[6]))
    .send({});
  check('T10 acknowledging a withdrawn policy returns 410', goneAck.status === 410, `${goneAck.status}`);

  const restored = await request(app)
    .patch(`${POLICIES}/${policyId}`)
    .set(as(admin))
    .send({ status: 'ACTIVE' });
  const resurrected = await Assignment.countDocuments({
    itemId: v2Id,
    status: ASSIGNMENT_STATUS.PENDING,
  });
  check(
    'T10 un-archiving does NOT resurrect the superseded assignments',
    restored.status === 200 && resurrected === 0,
    `${resurrected} pending`
  );
};

const POLICY_UPLOADS = directoryFor('policies');
const listUploads = async () => {
  try {
    return await fsp.readdir(POLICY_UPLOADS);
  } catch {
    return [];
  }
};

(async () => {
  const uploadsBefore = new Set(await listUploads());
  let connected = false;
  try {
    const baseName = (env.MONGO_URI.match(/\/([^/?]+)(\?|$)/) || [, 'ispm'])[1];
    await mongoose.connect(env.MONGO_URI, {
      dbName: `${baseName}${VERIFICATION_DB_SUFFIX}`,
      serverSelectionTimeoutMS: 10000,
    });
    connected = true;

    console.log(`\n  Database : ${mongoose.connection.name}`);
    console.log(`  URI      : ${redact(env.MONGO_URI)}\n`);

    await Promise.all([
      User.syncIndexes(),
      Policy.syncIndexes(),
      PolicyVersion.syncIndexes(),
      Acknowledgement.syncIndexes(),
      Assignment.syncIndexes(),
    ]);

    await run();

    const width = Math.max(...results.map((r) => r.label.length));
    results.forEach(({ label, ok, note }) => {
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(width)}  ${note}`);
    });

    const failed = results.filter((r) => !r.ok).length;
    console.log(
      failed
        ? `\n  ${failed} of ${results.length} checks FAILED.\n`
        : `\n  All ${results.length} checks passed. T2-T10 done-when conditions met.\n`
    );

    process.exitCode = failed ? 1 : 0;
  } catch (error) {
    console.error(`\n  Verification could not run: ${error.message}`);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    // The T9 checks write real files to disk. Dropping the database would
    // otherwise leave them behind as orphans on every run - exactly the
    // failure mode the upload service is written to avoid.
    const uploadsAfter = new Set(await listUploads());
    const strays = [...uploadsAfter].filter((name) => !uploadsBefore.has(name));
    await Promise.all(strays.map((name) => fsp.unlink(path.join(POLICY_UPLOADS, name))));
    if (strays.length) console.log(`  Cleaned up ${strays.length} uploaded test file(s).`);

    if (connected) {
      if (mongoose.connection.name.endsWith(VERIFICATION_DB_SUFFIX)) {
        await mongoose.connection.dropDatabase();
      }
      await mongoose.disconnect();
    }
  }
})();
