const {
  app,
  request,
  POLICIES,
  makeUser,
  makeAdmin,
  as,
  ROLES,
  DEPARTMENTS,
} = require('./helpers');

const Policy = require('../src/models/Policy');
const PolicyVersion = require('../src/models/PolicyVersion');
const Acknowledgement = require('../src/models/Acknowledgement');
const Assignment = require('../src/models/Assignment');
const { POLICY_VERSION_STATUS } = require('../src/constants/policies');
const { ASSIGNMENT_STATUS } = require('../src/constants/assignments');

// US-011 end to end, plus the integrity rules the publish workflow rests on.

describe('Publish workflow', () => {
  let admin;

  beforeEach(async () => {
    admin = await makeAdmin();
  });

  const createPolicy = () =>
    request(app)
      .post(POLICIES)
      .set(as(admin))
      .send({ title: 'Acceptable Use Policy', category: 'DEVICE_SECURITY' });

  describe('US-011 acceptance criterion', () => {
    it('supersedes v1, retains its 12 acknowledgements, and assigns 12 people to v2', async () => {
      const employees = [];
      for (let i = 0; i < 12; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        employees.push(
          await makeUser({ role: ROLES.EMPLOYEE, department: DEPARTMENTS.WAREHOUSE })
        );
      }

      const policy = (await createPolicy()).body.data.policy;

      const v1 = (
        await request(app)
          .post(`${POLICIES}/${policy.id}/versions`)
          .set(as(admin))
          .send({
            body: 'Version 1.',
            targetRoles: [ROLES.EMPLOYEE],
            targetDepartments: [DEPARTMENTS.WAREHOUSE],
          })
      ).body.data.version;

      const firstPublish = await request(app)
        .post(`${POLICIES}/${policy.id}/versions/${v1.id}/publish`)
        .set(as(admin))
        .send({});

      expect(firstPublish.body.data.publication.assignedCount).toBe(12);

      // Twelve acknowledgements against v1, written directly: this test is
      // about what publishing v2 does to them, not about the acknowledge
      // endpoint, which has its own suite.
      await Acknowledgement.insertMany(
        employees.map((user) => ({
          userId: user._id,
          policyId: policy.id,
          policyVersionId: v1.id,
          versionNumber: 1,
          acknowledgedAt: new Date(),
        }))
      );

      const v2 = (
        await request(app)
          .post(`${POLICIES}/${policy.id}/versions`)
          .set(as(admin))
          .send({
            body: 'Version 2.',
            changeNote: 'Added the USB restriction.',
            targetRoles: [ROLES.EMPLOYEE],
            targetDepartments: [DEPARTMENTS.WAREHOUSE],
          })
      ).body.data.version;

      await request(app)
        .post(`${POLICIES}/${policy.id}/versions/${v2.id}/publish`)
        .set(as(admin))
        .send({});

      const [v1After, v2After, policyAfter] = await Promise.all([
        PolicyVersion.findById(v1.id),
        PolicyVersion.findById(v2.id),
        Policy.findById(policy.id),
      ]);

      expect(v1After.status).toBe(POLICY_VERSION_STATUS.SUPERSEDED);
      expect(v2After.status).toBe(POLICY_VERSION_STATUS.PUBLISHED);
      expect(policyAfter.currentVersionId.toString()).toBe(v2.id);

      await expect(
        Acknowledgement.countDocuments({ policyVersionId: v1.id })
      ).resolves.toBe(12);

      await expect(
        Assignment.countDocuments({ itemId: v2.id, status: ASSIGNMENT_STATUS.PENDING })
      ).resolves.toBe(12);
    });
  });

  describe('integrity', () => {
    it('is impossible to have two PUBLISHED versions of one policy', async () => {
      const policy = await Policy.create({
        title: 'Two live versions?',
        code: 'TST-DUP-001',
        category: 'GENERAL',
        ownerId: admin._id,
      });

      await PolicyVersion.create({
        policyId: policy._id,
        versionNumber: 1,
        title: policy.title,
        body: 'One.',
        status: POLICY_VERSION_STATUS.PUBLISHED,
        authoredBy: admin._id,
      });

      // Rejected by the partial unique index in the DATABASE, not by a service
      // check that a future code path could bypass.
      await expect(
        PolicyVersion.create({
          policyId: policy._id,
          versionNumber: 2,
          title: policy.title,
          body: 'Two.',
          changeNote: 'Second live version.',
          status: POLICY_VERSION_STATUS.PUBLISHED,
          authoredBy: admin._id,
        })
      ).rejects.toMatchObject({ code: 11000 });
    });

    it('refuses to publish to an audience matching nobody', async () => {
      const policy = (await createPolicy()).body.data.policy;
      const version = (
        await request(app)
          .post(`${POLICIES}/${policy.id}/versions`)
          .set(as(admin))
          .send({ body: 'Text.', targetDepartments: [DEPARTMENTS.SALES] })
      ).body.data.version;

      // Only the admin exists, and they are in ADMINISTRATION.
      const response = await request(app)
        .post(`${POLICIES}/${policy.id}/versions/${version.id}/publish`)
        .set(as(admin))
        .send({});

      expect(response.status).toBe(400);

      // The draft must survive so it can be corrected.
      const stillDraft = await PolicyVersion.findById(version.id);
      expect(stillDraft.status).toBe(POLICY_VERSION_STATUS.DRAFT);
    });

    it('requires a change note from version 2 onward', async () => {
      await makeUser({ role: ROLES.EMPLOYEE, department: DEPARTMENTS.WAREHOUSE });
      const policy = (await createPolicy()).body.data.policy;

      const v1 = (
        await request(app)
          .post(`${POLICIES}/${policy.id}/versions`)
          .set(as(admin))
          .send({ body: 'Version 1 needs no note.' })
      ).body.data.version;

      expect(v1.versionNumber).toBe(1);

      await request(app)
        .post(`${POLICIES}/${policy.id}/versions/${v1.id}/publish`)
        .set(as(admin))
        .send({});

      const withoutNote = await request(app)
        .post(`${POLICIES}/${policy.id}/versions`)
        .set(as(admin))
        .send({ body: 'Version 2 without a note.' });

      expect(withoutNote.status).toBe(400);
    });

    it('refuses a second concurrent draft and names the existing one', async () => {
      const policy = (await createPolicy()).body.data.policy;

      const first = await request(app)
        .post(`${POLICIES}/${policy.id}/versions`)
        .set(as(admin))
        .send({ body: 'First draft.' });

      const second = await request(app)
        .post(`${POLICIES}/${policy.id}/versions`)
        .set(as(admin))
        .send({ body: 'Competing draft.' });

      expect(second.status).toBe(409);
      expect(JSON.stringify(second.body.error.details)).toContain(first.body.data.version.id);
    });

    it('refuses to edit a published version', async () => {
      await makeUser({ role: ROLES.EMPLOYEE, department: DEPARTMENTS.WAREHOUSE });
      const policy = (await createPolicy()).body.data.policy;
      const version = (
        await request(app)
          .post(`${POLICIES}/${policy.id}/versions`)
          .set(as(admin))
          .send({ body: 'Original wording.' })
      ).body.data.version;

      await request(app)
        .post(`${POLICIES}/${policy.id}/versions/${version.id}/publish`)
        .set(as(admin))
        .send({});

      const response = await request(app)
        .patch(`${POLICIES}/${policy.id}/versions/${version.id}`)
        .set(as(admin))
        .send({ body: 'Quietly rewritten.' });

      expect(response.status).toBe(409);
    });

    it('rejects a duplicate policy code with 409', async () => {
      await request(app)
        .post(POLICIES)
        .set(as(admin))
        .send({ title: 'First', code: 'TST-SAME-001', category: 'GENERAL' });

      const duplicate = await request(app)
        .post(POLICIES)
        .set(as(admin))
        .send({ title: 'Second', code: 'TST-SAME-001', category: 'GENERAL' });

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('DUPLICATE_RESOURCE');
    });

    it('generates a code from the category when none is given', async () => {
      const response = await request(app)
        .post(POLICIES)
        .set(as(admin))
        .send({ title: 'Auto coded', category: 'DATA_HANDLING' });

      expect(response.body.data.policy.code).toMatch(/^POL-DAT-\d{3}$/);
    });

    it('rejects unknown keys rather than dropping them', async () => {
      const response = await request(app)
        .post(POLICIES)
        .set(as(admin))
        .send({ title: 'Mass assignment', category: 'GENERAL', status: 'ARCHIVED' });

      expect(response.status).toBe(400);
    });
  });
});
