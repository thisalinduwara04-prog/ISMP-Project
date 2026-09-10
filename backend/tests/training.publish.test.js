const { app, request, TRAINING, makeUser, makeAdmin, as, ROLES, DEPARTMENTS } = require('./helpers');

const Assignment = require('../src/models/Assignment');
const AuditLog = require('../src/models/AuditLog');
const { MODULE_STATUS } = require('../src/constants/training');
const { ASSIGNMENT_STATUS, ASSIGNMENT_ITEM_TYPE } = require('../src/constants/assignments');
const { AUDIT_ACTIONS } = require('../src/constants/auditActions');

// M3-T3. Publication is the act that turns authored material into work assigned
// to named people, so the tests are about what lands in the ledger.

const content = {
  type: 'WALKTHROUGH',
  title: 'Spotting a phishing email',
  body: 'Hover before you click.',
};

const question = {
  text: 'A supplier asks you to change their bank details by email. What do you do?',
  type: 'SINGLE_CHOICE',
  options: [
    { text: 'Call the known contact number to verify.', isCorrect: true },
    { text: 'Reply to the email to confirm.', isCorrect: false },
  ],
};

describe('Training publication and fan-out (M3-T3)', () => {
  let admin;

  beforeEach(async () => {
    admin = await makeAdmin();
  });

  const createModule = (overrides = {}) =>
    request(app)
      .post(`${TRAINING}/modules`)
      .set(as(admin))
      .send({
        title: 'Phishing awareness',
        category: 'EMAIL_SECURITY',
        contentItems: [content],
        quiz: { questions: [question] },
        targetRoles: [ROLES.EMPLOYEE],
        targetDepartments: [DEPARTMENTS.WAREHOUSE],
        ...overrides,
      });

  const publish = (moduleId) =>
    request(app).post(`${TRAINING}/modules/${moduleId}/publish`).set(as(admin)).send({});

  const makeEmployees = async (count) => {
    const users = [];
    for (let i = 0; i < count; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      users.push(await makeUser({ role: ROLES.EMPLOYEE, department: DEPARTMENTS.WAREHOUSE }));
    }
    return users;
  };

  describe('the closing condition: republishing creates no duplicates', () => {
    it('assigns 10, then 15 after five more people join the audience — not 25', async () => {
      await makeEmployees(10);
      const { module: created } = (await createModule()).body.data;

      const first = await publish(created.id);

      expect(first.status).toBe(200);
      expect(first.body.data.publication).toMatchObject({
        republished: false,
        targetCount: 10,
        assignedCount: 10,
        alreadyAssignedCount: 0,
      });

      await makeEmployees(5);
      const second = await publish(created.id);

      expect(second.body.data.publication).toMatchObject({
        republished: true,
        targetCount: 15,
        // The five new joiners only. The unique index on
        // { userId, itemType, itemId } is what guarantees the other ten are
        // skipped rather than duplicated.
        assignedCount: 5,
        alreadyAssignedCount: 10,
      });

      await expect(
        Assignment.countDocuments({ itemType: ASSIGNMENT_ITEM_TYPE.TRAINING, itemId: created.id })
      ).resolves.toBe(15);
    });

    it('leaves the progress of someone who had already started untouched', async () => {
      const [employee] = await makeEmployees(2);
      const { module: created } = (await createModule()).body.data;
      await publish(created.id);

      const assignment = await Assignment.findOne({ userId: employee._id });
      assignment.status = ASSIGNMENT_STATUS.IN_PROGRESS;
      assignment.progress.completedItemIds = ['item-one'];
      assignment.progress.percentComplete = 50;
      await assignment.save();

      await publish(created.id);

      const after = await Assignment.findById(assignment._id);
      expect(after.status).toBe(ASSIGNMENT_STATUS.IN_PROGRESS);
      expect(after.progress.percentComplete).toBe(50);
    });
  });

  describe('what the ledger receives', () => {
    it('creates PENDING assignments with denormalised fields and empty progress', async () => {
      const [employee] = await makeEmployees(1);
      const { module: created } = (await createModule()).body.data;

      await publish(created.id);

      const assignment = await Assignment.findOne({ userId: employee._id });

      expect(assignment).toMatchObject({
        itemType: ASSIGNMENT_ITEM_TYPE.TRAINING,
        itemTitle: 'Phishing awareness',
        status: ASSIGNMENT_STATUS.PENDING,
        department: DEPARTMENTS.WAREHOUSE,
        userRole: ROLES.EMPLOYEE,
      });
      expect(assignment.itemId.toString()).toBe(created.id);
      expect(assignment.progress.completedItemIds).toEqual([]);
      expect(assignment.progress.percentComplete).toBe(0);
    });

    it('sets the due date from the module dueInDays', async () => {
      await makeEmployees(1);
      const { module: created } = (await createModule({ dueInDays: 7 })).body.data;

      await publish(created.id);

      const assignment = await Assignment.findOne({});
      const days = Math.round(
        (assignment.dueDate - assignment.assignedAt) / (1000 * 60 * 60 * 24)
      );
      expect(days).toBe(7);
    });

    it('does not assign an inactive account', async () => {
      await makeEmployees(2);
      await makeUser({
        role: ROLES.EMPLOYEE,
        department: DEPARTMENTS.WAREHOUSE,
        status: 'INACTIVE',
      });

      const { module: created } = (await createModule()).body.data;
      const response = await publish(created.id);

      expect(response.body.data.publication.targetCount).toBe(2);
    });

    it('records a TRAINING_PUBLISHED audit entry', async () => {
      await makeEmployees(1);
      const { module: created } = (await createModule()).body.data;

      await publish(created.id);

      const entry = await AuditLog.findOne({ action: AUDIT_ACTIONS.TRAINING_PUBLISHED });
      expect(entry.entityId.toString()).toBe(created.id);
      expect(entry.metadata.assignedCount).toBe(1);
    });
  });

  describe('what publication refuses', () => {
    it('refuses a module with no quiz questions', async () => {
      await makeEmployees(1);
      const { module: created } = (await createModule({ quiz: { questions: [] } })).body.data;

      const response = await publish(created.id);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/no quiz questions/i);
      await expect(Assignment.countDocuments({})).resolves.toBe(0);
    });

    it('refuses a module with no content items', async () => {
      await makeEmployees(1);
      const { module: created } = (await createModule({ contentItems: [] })).body.data;

      const response = await publish(created.id);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/no content/i);
    });

    it('refuses a module whose content items are still empty', async () => {
      await makeEmployees(1);
      const { module: created } = (
        await createModule({ contentItems: [{ type: 'ARTICLE', title: 'To be written' }] })
      ).body.data;

      const response = await publish(created.id);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/nothing in them/i);
    });

    it('refuses an audience that matches nobody, and leaves the module a DRAFT', async () => {
      const { module: created } = (
        await createModule({ targetDepartments: [DEPARTMENTS.SALES] })
      ).body.data;

      const response = await publish(created.id);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/nobody/i);

      const reread = await request(app).get(`${TRAINING}/modules/${created.id}`).set(as(admin));
      expect(reread.body.data.module.status).toBe(MODULE_STATUS.DRAFT);
    });
  });
});
