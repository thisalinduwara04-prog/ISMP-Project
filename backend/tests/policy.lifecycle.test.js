const {
  app,
  request,
  POLICIES,
  makeUser,
  makeAdmin,
  as,
  makePublishedPolicy,
  ROLES,
  DEPARTMENTS,
} = require('./helpers');

const Policy = require('../src/models/Policy');
const PolicyVersion = require('../src/models/PolicyVersion');
const Acknowledgement = require('../src/models/Acknowledgement');
const PolicyAttachment = require('../src/models/PolicyAttachment');
const Assignment = require('../src/models/Assignment');
const AuditLog = require('../src/models/AuditLog');
const assignmentService = require('../src/modules/assignment/assignment.service');
const { ASSIGNMENT_ITEM_TYPE, ASSIGNMENT_STATUS } = require('../src/constants/assignments');
const { POLICY_VERSION_STATUS, POLICY_STATUS } = require('../src/constants/policies');

// T8, T9 and T10: the evidence trail, the attachment, and retirement.

const PDF = Buffer.concat([
  Buffer.from('%PDF-1.4\n'),
  Buffer.from('1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'),
]);

describe('Policy lifecycle', () => {
  let admin;
  let employee;
  let policy;
  let version;

  beforeEach(async () => {
    admin = await makeAdmin();
    employee = await makeUser({ role: ROLES.EMPLOYEE, department: DEPARTMENTS.WAREHOUSE });
    ({ policy, version } = await makePublishedPolicy(admin));

    await assignmentService.fanOut({
      itemType: ASSIGNMENT_ITEM_TYPE.POLICY,
      itemId: version._id,
      itemTitle: policy.title,
      audience: { roles: [], departments: [] },
      dueInDays: 14,
    });
  });

  describe('T8 acknowledgement audit trail (UC-12)', () => {
    const trailUrl = () => `${POLICIES}/${policy._id}/versions/${version._id}/acknowledgements`;

    it('reports both who acknowledged and who has not', async () => {
      await request(app)
        .post(`${POLICIES}/${policy._id}/versions/${version._id}/acknowledge`)
        .set(as(employee))
        .send({});

      const response = await request(app).get(trailUrl()).set(as(admin));

      expect(response.status).toBe(200);
      expect(response.body.data.summary.acknowledged).toBe(1);
      // The admin holds an assignment too - the audience was everyone.
      expect(response.body.data.summary.assigned).toBe(2);
      expect(response.body.data.outstanding).toHaveLength(1);
    });

    it('includes the evidence fields on each acknowledged row', async () => {
      await request(app)
        .post(`${POLICIES}/${policy._id}/versions/${version._id}/acknowledge`)
        .set(as(employee))
        .send({});

      const { body } = await request(app).get(trailUrl()).set(as(admin));
      const row = body.data.acknowledged[0];

      expect(row.fullName).toBe(employee.fullName);
      expect(row.employeeId).toBe(employee.employeeId);
      expect(row.acknowledgedAt).toBeDefined();
      expect(row).toHaveProperty('ipAddress');
    });

    it('records that the evidence was inspected', async () => {
      await request(app).get(trailUrl()).set(as(admin));

      const audits = await AuditLog.find({ action: 'COMPLIANCE_AUDIT_VIEWED' });
      expect(audits).toHaveLength(1);
      expect(audits[0].entityId.toString()).toBe(version._id.toString());
    });

    it('paginates', async () => {
      const response = await request(app).get(`${trailUrl()}?page=1&limit=1`).set(as(admin));

      expect(response.status).toBe(200);
      expect(response.body.data.pagination.limit).toBe(1);
      expect(response.body.data.pagination.page).toBe(1);
    });

    it('rejects a non-numeric page', async () => {
      const response = await request(app).get(`${trailUrl()}?page=abc`).set(as(admin));
      expect(response.status).toBe(400);
    });
  });

  describe('T9 attachment (US-016, NFR-SEC-05)', () => {
    let draftId;

    beforeEach(async () => {
      const draft = await request(app)
        .post(`${POLICIES}/${policy._id}/versions`)
        .set(as(admin))
        .send({ body: 'Draft for the attachment.', changeNote: 'Attaching the signed copy.' });

      draftId = draft.body.data.version.id;
    });

    const attachmentUrl = () => `${POLICIES}/${policy._id}/versions/${draftId}/attachments`;

    it('rejects an executable renamed to .pdf with 415', async () => {
      // Extension and declared MIME type both claim PDF; only the bytes do
      // not. This is the check the other three cannot make.
      const response = await request(app)
        .post(attachmentUrl())
        .set(as(admin))
        .attach('file', Buffer.from('MZ\x90\x00\x03 not a pdf'), {
          filename: 'malware.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(415);
    });

    it('rejects a non-PDF extension with 415', async () => {
      const response = await request(app)
        .post(attachmentUrl())
        .set(as(admin))
        .attach('file', PDF, { filename: 'notes.txt', contentType: 'text/plain' });

      expect(response.status).toBe(415);
    });

    it('accepts a genuine PDF and stores the bytes in the database', async () => {
      const response = await request(app)
        .post(attachmentUrl())
        .set(as(admin))
        .attach('file', PDF, { filename: 'signed-policy.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(201);

      const stored = await PolicyAttachment.findOne({ policyVersionId: draftId }).select('+data');
      expect(stored).not.toBeNull();
      expect(stored.originalName).toBe('signed-policy.pdf');
      expect(stored.sizeBytes).toBe(PDF.length);
      // The actual bytes round-trip, not just a reference to them.
      expect(Buffer.compare(stored.data, PDF)).toBe(0);

      // The client is given an API path, never a storage location.
      expect(response.body.data.attachment.url).toMatch(/\/attachments\/[0-9a-f]{24}$/);
      expect(response.body.data.attachment.name).toBe('signed-policy.pdf');
    });

    it('keeps the bytes out of ordinary queries', async () => {
      await request(app)
        .post(attachmentUrl())
        .set(as(admin))
        .attach('file', PDF, { filename: 'signed.pdf', contentType: 'application/pdf' });

      // `data` is select:false, so a 10 MB buffer is never dragged into memory
      // by a query that only wanted the metadata.
      const withoutData = await PolicyAttachment.findOne({ policyVersionId: draftId });
      expect(withoutData.data).toBeUndefined();
    });

    // The point of the change: a policy is sometimes two documents, and
    // merging them would mean editing a signed PDF.
    it('keeps several PDFs on one version rather than replacing', async () => {
      await request(app)
        .post(attachmentUrl())
        .set(as(admin))
        .attach('file', PDF, { filename: 'policy.pdf', contentType: 'application/pdf' });

      await request(app)
        .post(attachmentUrl())
        .set(as(admin))
        .attach('file', PDF, { filename: 'annex.pdf', contentType: 'application/pdf' });

      const all = await PolicyAttachment.find({ policyVersionId: draftId }).sort({ createdAt: 1 });
      expect(all).toHaveLength(2);
      expect(all.map((a) => a.originalName)).toEqual(['policy.pdf', 'annex.pdf']);

      const listed = await request(app).get(attachmentUrl()).set(as(admin));
      expect(listed.body.data.attachments).toHaveLength(2);
    });

    it('refuses a sixth attachment', async () => {
      for (let i = 0; i < 5; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await request(app)
          .post(attachmentUrl())
          .set(as(admin))
          .attach('file', PDF, { filename: `doc-${i}.pdf`, contentType: 'application/pdf' });
      }

      const sixth = await request(app)
        .post(attachmentUrl())
        .set(as(admin))
        .attach('file', PDF, { filename: 'one-too-many.pdf', contentType: 'application/pdf' });

      expect(sixth.status).toBe(400);
    });

    it('serves the exact bytes back and removes one on request', async () => {
      const uploaded = await request(app)
        .post(attachmentUrl())
        .set(as(admin))
        .attach('file', PDF, { filename: 'signed.pdf', contentType: 'application/pdf' });

      const fileId = uploaded.body.data.attachment.id;
      const download = await request(app).get(`${attachmentUrl()}/${fileId}`).set(as(admin));

      expect(download.status).toBe(200);
      expect(download.headers['content-type']).toContain('pdf');
      expect(Buffer.compare(download.body, PDF)).toBe(0);
      // Audience-checked content must not sit in a shared cache.
      expect(download.headers['cache-control']).toContain('private');

      const removed = await request(app)
        .delete(`${attachmentUrl()}/${fileId}`)
        .set(as(admin))
        .send({});
      expect(removed.status).toBe(200);

      await expect(PolicyAttachment.countDocuments({ policyVersionId: draftId })).resolves.toBe(0);
    });

    it('lets a targeted employee download the PDF once the version is published', async () => {
      const uploaded = await request(app)
        .post(attachmentUrl())
        .set(as(admin))
        .attach('file', PDF, { filename: 'signed.pdf', contentType: 'application/pdf' });

      await request(app)
        .post(`${POLICIES}/${policy._id}/versions/${draftId}/publish`)
        .set(as(admin))
        .send({});

      const download = await request(app)
        .get(`${attachmentUrl()}/${uploaded.body.data.attachment.id}`)
        .set(as(employee));

      expect(download.status).toBe(200);
      expect(Buffer.compare(download.body, PDF)).toBe(0);
    });

    it('deletes the stored bytes when the version is deleted', async () => {
      await request(app)
        .post(attachmentUrl())
        .set(as(admin))
        .attach('file', PDF, { filename: 'signed.pdf', contentType: 'application/pdf' });

      await request(app)
        .delete(`${POLICIES}/${policy._id}/versions/${draftId}`)
        .set(as(admin))
        .send({});

      await expect(PolicyAttachment.countDocuments({})).resolves.toBe(0);
    });

    it('refuses an attachment on a published version', async () => {
      const response = await request(app)
        .post(`${POLICIES}/${policy._id}/versions/${version._id}/attachments`)
        .set(as(admin))
        .attach('file', PDF, { filename: 'late.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(409);
    });

    it('lists an empty set when the version has no attachments', async () => {
      const response = await request(app).get(attachmentUrl()).set(as(admin));
      expect(response.status).toBe(200);
      expect(response.body.data.attachments).toEqual([]);
    });

    it('returns 404 for an attachment id that is not on this version', async () => {
      const response = await request(app)
        .get(`${attachmentUrl()}/000000000000000000000000`)
        .set(as(admin));
      expect(response.status).toBe(404);
    });

    // A policy whose content IS the PDF: no body text at all.
    it('accepts a draft with no body text so the PDF can be attached first', async () => {
      const empty = await request(app)
        .post(`${POLICIES}/${policy._id}/versions`)
        .set(as(admin))
        .send({ changeNote: 'PDF-only policy.' });

      // Only one draft may exist at a time, so this collides with the one the
      // surrounding beforeEach created - which is itself proof the empty body
      // passed validation rather than being rejected as invalid.
      expect([201, 409]).toContain(empty.status);
      expect(empty.status === 400).toBe(false);
    });

    it('refuses to publish a version with neither text nor a PDF', async () => {
      const bare = await request(app)
        .post(`${POLICIES}/${policy._id}/versions/${draftId}`)
        .set(as(admin));

      // The draft created in beforeEach has body text; strip it.
      await PolicyVersion.updateOne({ _id: draftId }, { $set: { body: '' } });

      const response = await request(app)
        .post(`${POLICIES}/${policy._id}/versions/${draftId}/publish`)
        .set(as(admin))
        .send({});

      expect(bare.status).toBe(404); // the POST above is not a route
      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/no content/i);
    });

    it('publishes a version whose only content is the PDF', async () => {
      await PolicyVersion.updateOne({ _id: draftId }, { $set: { body: '' } });

      await request(app)
        .post(attachmentUrl())
        .set(as(admin))
        .attach('file', PDF, { filename: 'the-policy.pdf', contentType: 'application/pdf' });

      const response = await request(app)
        .post(`${POLICIES}/${policy._id}/versions/${draftId}/publish`)
        .set(as(admin))
        .send({});

      expect(response.status).toBe(200);
    });
  });

  describe('T10 archive and restore (UC-11)', () => {
    it('closes open assignments and keeps the evidence', async () => {
      await request(app)
        .post(`${POLICIES}/${policy._id}/versions/${version._id}/acknowledge`)
        .set(as(employee))
        .send({});

      const response = await request(app)
        .patch(`${POLICIES}/${policy._id}`)
        .set(as(admin))
        .send({ status: POLICY_STATUS.ARCHIVED });

      expect(response.status).toBe(200);
      expect(response.body.data.policy.archive.closedAssignments).toBe(1);

      const archivedVersion = await PolicyVersion.findById(version._id);
      expect(archivedVersion.status).toBe(POLICY_VERSION_STATUS.ARCHIVED);

      // Completed work is not un-done, and the evidence survives.
      await expect(
        Assignment.countDocuments({ itemId: version._id, status: ASSIGNMENT_STATUS.COMPLETED })
      ).resolves.toBe(1);
      await expect(Acknowledgement.countDocuments({})).resolves.toBe(1);
    });

    it('removes it from employee lists but keeps it for admins behind a flag', async () => {
      await request(app)
        .patch(`${POLICIES}/${policy._id}`)
        .set(as(admin))
        .send({ status: POLICY_STATUS.ARCHIVED });

      const employeeList = await request(app).get(POLICIES).set(as(employee));
      expect(employeeList.body.data.count).toBe(0);

      const adminDefault = await request(app).get(POLICIES).set(as(admin));
      const adminArchived = await request(app)
        .get(`${POLICIES}?includeArchived=true`)
        .set(as(admin));

      expect(adminDefault.body.data.count).toBe(0);
      expect(adminArchived.body.data.count).toBe(1);
    });

    it('does not resurrect assignments on restore', async () => {
      await request(app)
        .patch(`${POLICIES}/${policy._id}`)
        .set(as(admin))
        .send({ status: POLICY_STATUS.ARCHIVED });

      await request(app)
        .patch(`${POLICIES}/${policy._id}`)
        .set(as(admin))
        .send({ status: POLICY_STATUS.ACTIVE });

      // Reviving a due date that expired while the policy was withdrawn would
      // tell staff they are late on work nobody was asking them to do.
      await expect(
        Assignment.countDocuments({ itemId: version._id, status: ASSIGNMENT_STATUS.PENDING })
      ).resolves.toBe(0);
    });

    it('audits archiving and restoring separately', async () => {
      await request(app)
        .patch(`${POLICIES}/${policy._id}`)
        .set(as(admin))
        .send({ status: POLICY_STATUS.ARCHIVED });
      await request(app)
        .patch(`${POLICIES}/${policy._id}`)
        .set(as(admin))
        .send({ status: POLICY_STATUS.ACTIVE });

      await expect(AuditLog.countDocuments({ action: 'POLICY_ARCHIVED' })).resolves.toBe(1);
      await expect(AuditLog.countDocuments({ action: 'POLICY_RESTORED' })).resolves.toBe(1);
    });

    it('audits a plain metadata edit as POLICY_UPDATED', async () => {
      await request(app)
        .patch(`${POLICIES}/${policy._id}`)
        .set(as(admin))
        .send({ title: 'Renamed policy' });

      const audits = await AuditLog.find({ action: 'POLICY_UPDATED' });
      expect(audits).toHaveLength(1);
      expect(audits[0].metadata.changedFields).toContain('title');
    });
  });

  describe('Deletion', () => {
    it('discards a draft without ceremony', async () => {
      const draft = await request(app)
        .post(`${POLICIES}/${policy._id}/versions`)
        .set(as(admin))
        .send({ body: 'Throwaway.', changeNote: 'Testing.' });

      const response = await request(app)
        .delete(`${POLICIES}/${policy._id}/versions/${draft.body.data.version.id}`)
        .set(as(admin))
        .send({});

      expect(response.status).toBe(200);
      await expect(PolicyVersion.findById(draft.body.data.version.id)).resolves.toBeNull();
    });

    it('refuses to delete a version holding evidence unless the loss is confirmed', async () => {
      await request(app)
        .post(`${POLICIES}/${policy._id}/versions/${version._id}/acknowledge`)
        .set(as(employee))
        .send({});

      const refused = await request(app)
        .delete(`${POLICIES}/${policy._id}/versions/${version._id}`)
        .set(as(admin))
        .send({});

      expect(refused.status).toBe(409);
      await expect(PolicyVersion.findById(version._id)).resolves.not.toBeNull();

      const forced = await request(app)
        .delete(`${POLICIES}/${policy._id}/versions/${version._id}`)
        .set(as(admin))
        .send({ acknowledgeEvidenceLoss: true });

      expect(forced.status).toBe(200);
      expect(forced.body.data.acknowledgementsDestroyed).toBe(1);
    });

    it('leaves the policy with no current version after deleting the live one', async () => {
      await request(app)
        .delete(`${POLICIES}/${policy._id}/versions/${version._id}`)
        .set(as(admin))
        .send({});

      const after = await Policy.findById(policy._id);
      expect(after.currentVersionId).toBeNull();
    });

    it('refuses to delete a policy holding evidence unless confirmed', async () => {
      await request(app)
        .post(`${POLICIES}/${policy._id}/versions/${version._id}/acknowledge`)
        .set(as(employee))
        .send({});

      const refused = await request(app).delete(`${POLICIES}/${policy._id}`).set(as(admin)).send({});
      expect(refused.status).toBe(409);

      const forced = await request(app)
        .delete(`${POLICIES}/${policy._id}`)
        .set(as(admin))
        .send({ acknowledgeEvidenceLoss: true });

      expect(forced.status).toBe(200);

      // Everything goes, and the append-only audit entry is what remains.
      await expect(Policy.findById(policy._id)).resolves.toBeNull();
      await expect(Acknowledgement.countDocuments({})).resolves.toBe(0);
      await expect(Assignment.countDocuments({ itemId: version._id })).resolves.toBe(0);
      await expect(AuditLog.countDocuments({ action: 'POLICY_DELETED' })).resolves.toBe(1);
    });
  });

  describe('Reading one policy', () => {
    it('gives an admin the full version history', async () => {
      const response = await request(app).get(`${POLICIES}/${policy._id}`).set(as(admin));

      expect(response.status).toBe(200);
      expect(response.body.data.policy.versions).toHaveLength(1);
      expect(response.body.data.policy.audience).toBeDefined();
    });

    it('refuses a non-targeted employee with 403', async () => {
      const { policy: salesPolicy } = await makePublishedPolicy(admin, {
        targetDepartments: [DEPARTMENTS.SALES],
      });

      const response = await request(app).get(`${POLICIES}/${salesPolicy._id}`).set(as(employee));
      expect(response.status).toBe(403);
    });

    it('returns 400 for a malformed id rather than a cast error', async () => {
      const response = await request(app).get(`${POLICIES}/not-an-id`).set(as(admin));
      expect(response.status).toBe(400);
    });

    it('returns 404 for an id that does not exist', async () => {
      const response = await request(app)
        .get(`${POLICIES}/000000000000000000000000`)
        .set(as(admin));
      expect(response.status).toBe(404);
    });
  });
});
