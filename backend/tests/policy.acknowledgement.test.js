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

const Acknowledgement = require('../src/models/Acknowledgement');
const Assignment = require('../src/models/Assignment');
const assignmentService = require('../src/modules/assignment/assignment.service');
const { ASSIGNMENT_ITEM_TYPE, ASSIGNMENT_STATUS } = require('../src/constants/assignments');
const { POLICY_VERSION_STATUS, POLICY_STATUS } = require('../src/constants/policies');
const PolicyVersion = require('../src/models/PolicyVersion');
const Policy = require('../src/models/Policy');

// UC-10, US-014, BR-01, BR-02. An acknowledgement is legal evidence, so these
// tests are about correctness under repetition and race, not happy path.

describe('Acknowledgement', () => {
  let admin;
  let employee;
  let policy;
  let version;

  const acknowledgeUrl = () => `${POLICIES}/${policy._id}/versions/${version._id}/acknowledge`;

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

  it('records the acknowledgement and closes the assignment', async () => {
    const response = await request(app).post(acknowledgeUrl()).set(as(employee)).send({});

    expect(response.status).toBe(201);
    expect(response.body.data.acknowledgement.acknowledgedAt).toBeDefined();

    const assignment = await Assignment.findOne({ userId: employee._id, itemId: version._id });
    expect(assignment.status).toBe(ASSIGNMENT_STATUS.COMPLETED);
    expect(assignment.completionRef.toString()).toBe(response.body.data.acknowledgement.id);
  });

  it('is idempotent: a second submit returns the original record and creates no duplicate', async () => {
    const first = await request(app).post(acknowledgeUrl()).set(as(employee)).send({});
    const second = await request(app).post(acknowledgeUrl()).set(as(employee)).send({});

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.alreadyRecorded).toBe(true);
    expect(second.body.data.acknowledgement.id).toBe(first.body.data.acknowledgement.id);

    const count = await Acknowledgement.countDocuments({
      userId: employee._id,
      policyVersionId: version._id,
    });
    expect(count).toBe(1);
  });

  it('does not move completedAt on the repeat submission', async () => {
    await request(app).post(acknowledgeUrl()).set(as(employee)).send({});
    const before = await Assignment.findOne({ userId: employee._id, itemId: version._id });

    await request(app).post(acknowledgeUrl()).set(as(employee)).send({});
    const after = await Assignment.findOne({ userId: employee._id, itemId: version._id });

    // The record of WHEN the work was done must not drift just because the
    // employee pressed the button twice.
    expect(after.completedAt.toISOString()).toBe(before.completedAt.toISOString());
  });

  it('survives two concurrent submissions with only one document written', async () => {
    // The unique index is what makes this safe. A findOne-then-insert would
    // leave a window in which both requests pass the check.
    const [a, b] = await Promise.all([
      request(app).post(acknowledgeUrl()).set(as(employee)).send({}),
      request(app).post(acknowledgeUrl()).set(as(employee)).send({}),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);

    const count = await Acknowledgement.countDocuments({ policyVersionId: version._id });
    expect(count).toBe(1);
  });

  it('refuses a client-supplied timeSpentSeconds rather than ignoring it', async () => {
    const response = await request(app)
      .post(acknowledgeUrl())
      .set(as(employee))
      .send({ timeSpentSeconds: 9000 });

    expect(response.status).toBe(400);
  });

  it('returns 409 when the version has been superseded', async () => {
    version.status = POLICY_VERSION_STATUS.SUPERSEDED;
    await version.save();

    const response = await request(app).post(acknowledgeUrl()).set(as(employee)).send({});
    expect(response.status).toBe(409);
  });

  it('returns 410 when the policy has been withdrawn', async () => {
    policy.status = POLICY_STATUS.ARCHIVED;
    await policy.save();

    const response = await request(app).post(acknowledgeUrl()).set(as(employee)).send({});
    expect(response.status).toBe(410);
  });

  it('returns 403 when the caller holds no assignment', async () => {
    const stranger = await makeUser({ role: ROLES.EMPLOYEE, department: DEPARTMENTS.SALES });

    const response = await request(app).post(acknowledgeUrl()).set(as(stranger)).send({});
    expect(response.status).toBe(403);
  });

  describe('immutability (BR-01)', () => {
    it('exposes no update or delete route', async () => {
      await request(app).post(acknowledgeUrl()).set(as(employee)).send({});

      const patch = await request(app).patch(acknowledgeUrl()).set(as(employee)).send({});
      const remove = await request(app).delete(acknowledgeUrl()).set(as(employee));

      expect(patch.status).toBe(404);
      expect(remove.status).toBe(404);
    });

    it('rejects an update at the model layer', async () => {
      await request(app).post(acknowledgeUrl()).set(as(employee)).send({});

      await expect(
        Acknowledgement.updateOne(
          { userId: employee._id },
          { $set: { timeSpentSeconds: 9999 } }
        )
      ).rejects.toThrow(/insert-only/i);
    });

    it('rejects a delete at the model layer', async () => {
      await request(app).post(acknowledgeUrl()).set(as(employee)).send({});

      await expect(Acknowledgement.deleteOne({ userId: employee._id })).rejects.toThrow(
        /insert-only/i
      );
    });
  });

  describe('evidence retention (BR-02)', () => {
    it('keeps acknowledgements against a superseded version', async () => {
      await request(app).post(acknowledgeUrl()).set(as(employee)).send({});

      // Publishing v2 supersedes v1. The evidence against v1 must survive.
      version.status = POLICY_VERSION_STATUS.SUPERSEDED;
      await version.save();

      const v2 = await PolicyVersion.create({
        policyId: policy._id,
        versionNumber: 2,
        title: policy.title,
        body: 'Revised text.',
        changeNote: 'Revised.',
        status: POLICY_VERSION_STATUS.PUBLISHED,
        publishedAt: new Date(),
        authoredBy: admin._id,
      });
      await Policy.updateOne({ _id: policy._id }, { $set: { currentVersionId: v2._id } });

      const retained = await Acknowledgement.countDocuments({ policyVersionId: version._id });
      expect(retained).toBe(1);
    });
  });
});
