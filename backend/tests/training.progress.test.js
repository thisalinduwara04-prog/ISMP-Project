const {
  app,
  request,
  TRAINING,
  makeUser,
  makeAdmin,
  as,
  makeQuizModule,
  publishModule,
  completeAllContent,
  DEPARTMENTS,
} = require('./helpers');

const Assignment = require('../src/models/Assignment');
const { ASSIGNMENT_STATUS } = require('../src/constants/assignments');

// M3-T4. Working through a module: per-item progress on the server, the quiz
// locked until the content is finished, and no answer key anywhere.

// The same deep search the projection test uses. Repeated here rather than
// shared, because this file is about RESPONSES - what actually goes over the
// wire from the employee-facing routes - not about the projection function.
const findKeyPaths = (value, key, path = '$') => {
  if (Array.isArray(value)) {
    return value.flatMap((entry, i) => findKeyPaths(entry, key, `${path}[${i}]`));
  }
  if (value === null || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([name, child]) => [
    ...(name === key ? [`${path}.${name}`] : []),
    ...findKeyPaths(child, key, `${path}.${name}`),
  ]);
};

describe('Module consumption and progress (M3-T4)', () => {
  let admin;
  let employee;
  let module_;

  beforeEach(async () => {
    admin = await makeAdmin();
    employee = await makeUser({ department: DEPARTMENTS.WAREHOUSE });
    module_ = await makeQuizModule(admin, { items: 4 });
    await publishModule(admin, module_._id);
  });

  const markComplete = (itemId, user = employee) =>
    request(app)
      .post(`${TRAINING}/modules/${module_._id}/progress`)
      .set(as(user))
      .send({ itemId });

  describe('marking an item complete', () => {
    it('records it on the assignment and recomputes the percentage', async () => {
      const response = await markComplete(module_.contentItems[0].itemId);

      expect(response.status).toBe(200);
      expect(response.body.data.task).toMatchObject({
        itemsCompleted: 1,
        itemsTotal: 4,
        percentComplete: 25,
        quizUnlocked: false,
        itemsRemaining: 3,
      });
    });

    it('moves the assignment from PENDING to IN_PROGRESS and sets startedAt', async () => {
      await markComplete(module_.contentItems[0].itemId);

      const assignment = await Assignment.findOne({ userId: employee._id });
      expect(assignment.status).toBe(ASSIGNMENT_STATUS.IN_PROGRESS);
      expect(assignment.startedAt).toBeInstanceOf(Date);
    });

    it('is idempotent: marking the same item twice leaves one entry', async () => {
      await markComplete(module_.contentItems[0].itemId);
      const second = await markComplete(module_.contentItems[0].itemId);

      expect(second.body.data.task.percentComplete).toBe(25);

      const assignment = await Assignment.findOne({ userId: employee._id });
      expect(assignment.progress.completedItemIds).toHaveLength(1);
    });

    it('unlocks the quiz once every item is complete', async () => {
      const last = await completeAllContent(employee, module_);

      expect(last.body.data.task).toMatchObject({
        percentComplete: 100,
        quizUnlocked: true,
        itemsRemaining: 0,
      });
    });

    it('refuses an itemId that is not part of the module', async () => {
      const response = await markComplete('not-a-real-item');

      expect(response.status).toBe(404);
      const assignment = await Assignment.findOne({ userId: employee._id });
      expect(assignment.progress.completedItemIds).toHaveLength(0);
    });

    it('refuses someone the module was never assigned to', async () => {
      const outsider = await makeUser({ department: DEPARTMENTS.SALES });
      const salesOnly = await makeQuizModule(admin, {
        targetDepartments: [DEPARTMENTS.WAREHOUSE],
        code: 'TST-QUIZ-WH',
      });
      await publishModule(admin, salesOnly._id);

      const response = await request(app)
        .post(`${TRAINING}/modules/${salesOnly._id}/progress`)
        .set(as(outsider))
        .send({ itemId: salesOnly.contentItems[0].itemId });

      expect(response.status).toBe(403);
    });

    it('rejects a client-supplied percentComplete rather than trusting it', async () => {
      const response = await request(app)
        .post(`${TRAINING}/modules/${module_._id}/progress`)
        .set(as(employee))
        .send({ itemId: module_.contentItems[0].itemId, percentComplete: 100 });

      expect(response.status).toBe(400);
    });
  });

  describe('progress lives on the server (US-022)', () => {
    it('resumes where it stopped, on a fresh request with no client state', async () => {
      await markComplete(module_.contentItems[0].itemId);
      await markComplete(module_.contentItems[1].itemId);

      // A different device is nothing more than another request with the same
      // token: everything the screen needs comes back from the API.
      const response = await request(app)
        .get(`${TRAINING}/modules/${module_._id}`)
        .set(as(employee));

      expect(response.body.data.task.percentComplete).toBe(50);
      expect(response.body.data.task.completedItemIds).toHaveLength(2);
    });

    it('reports progress on the list as well as the module', async () => {
      await markComplete(module_.contentItems[0].itemId);

      const response = await request(app).get(`${TRAINING}/modules`).set(as(employee));

      expect(response.body.data.modules[0].task).toMatchObject({
        percentComplete: 25,
        status: ASSIGNMENT_STATUS.IN_PROGRESS,
      });
    });
  });

  describe('the quiz gate is in the API, not the interface (NFR-SEC-03)', () => {
    it('refuses an attempt started before the content is finished, naming what is left', async () => {
      await markComplete(module_.contentItems[0].itemId);

      const response = await request(app)
        .post(`${TRAINING}/modules/${module_._id}/attempts`)
        .set(as(employee))
        .send({});

      expect(response.status).toBe(403);
      expect(response.body.error.message).toMatch(/3 items still to complete/i);
    });

    it('allows it once every item is complete', async () => {
      await completeAllContent(employee, module_);

      const response = await request(app)
        .post(`${TRAINING}/modules/${module_._id}/attempts`)
        .set(as(employee))
        .send({});

      expect(response.status).toBe(201);
    });
  });

  describe('answer-key leakage (AD-3)', () => {
    it('finds no isCorrect and no explanation in any employee-facing response', async () => {
      await completeAllContent(employee, module_);

      const start = await request(app)
        .post(`${TRAINING}/modules/${module_._id}/attempts`)
        .set(as(employee))
        .send({});

      const bodies = [
        (await request(app).get(`${TRAINING}/modules`).set(as(employee))).body,
        (await request(app).get(`${TRAINING}/modules/${module_._id}`).set(as(employee))).body,
        (await markComplete(module_.contentItems[0].itemId)).body,
        start.body,
        (
          await request(app)
            .get(`${TRAINING}/attempts/${start.body.data.attempt.id}`)
            .set(as(employee))
        ).body,
      ];

      bodies.forEach((body) => {
        expect(findKeyPaths(body, 'isCorrect')).toEqual([]);
        expect(findKeyPaths(body, 'explanation')).toEqual([]);
      });
    });
  });
});
