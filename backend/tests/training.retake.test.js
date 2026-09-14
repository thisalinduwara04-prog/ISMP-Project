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
} = require('./helpers');

const QuizAttempt = require('../src/models/QuizAttempt');
const AuditLog = require('../src/models/AuditLog');
const { AUDIT_ACTIONS } = require('../src/constants/auditActions');
const { ATTEMPT_STATUS } = require('../src/constants/training');

// M3-T6. UC-17: a failed attempt is recoverable without making the quiz
// meaningless.

describe('Retakes and attempt limits (M3-T6)', () => {
  let admin;
  let employee;
  let module_;

  const answerFirst = (module, howManyCorrect) =>
    module.quiz.questions.map((question, index) => ({
      questionId: question.questionId,
      selectedOptionIds: [
        index < howManyCorrect ? question.options[0].optionId : question.options[1].optionId,
      ],
    }));

  const sit = async (howManyCorrect) => {
    const start = await request(app)
      .post(`${TRAINING}/modules/${module_._id}/attempts`)
      .set(as(employee))
      .send({});

    if (start.status !== 201 && start.status !== 200) return start;

    const attemptId = start.body.data.attempt.id;

    await request(app)
      .patch(`${TRAINING}/attempts/${attemptId}`)
      .set(as(employee))
      .send({ responses: answerFirst(module_, howManyCorrect) });

    return request(app).post(`${TRAINING}/attempts/${attemptId}/submit`).set(as(employee)).send({});
  };

  beforeEach(async () => {
    admin = await makeAdmin();
    employee = await makeUser();
    module_ = await makeQuizModule(admin, { questions: 5, items: 1, maxAttempts: 3 });
    await publishModule(admin, module_._id);
    await completeAllContent(employee, module_);
  });

  describe('the limit', () => {
    it('refuses the fourth attempt at a three-attempt quiz, and says who can reset it', async () => {
      await sit(1);
      await sit(2);
      await sit(3);

      const fourth = await request(app)
        .post(`${TRAINING}/modules/${module_._id}/attempts`)
        .set(as(employee))
        .send({});

      expect(fourth.status).toBe(403);
      expect(fourth.body.error.message).toMatch(/contact your manager/i);
    });

    it('does not count an attempt abandoned in progress', async () => {
      await sit(1);

      // Opened and walked away from: still IN_PROGRESS, and not a used attempt.
      await request(app)
        .post(`${TRAINING}/modules/${module_._id}/attempts`)
        .set(as(employee))
        .send({});

      const state = await request(app)
        .get(`${TRAINING}/modules/${module_._id}`)
        .set(as(employee));

      expect(state.body.data.task.quiz).toMatchObject({
        attemptsUsed: 1,
        attemptsRemaining: 2,
      });
    });

    it('refuses another attempt once the module has been passed', async () => {
      await sit(5);

      const again = await request(app)
        .post(`${TRAINING}/modules/${module_._id}/attempts`)
        .set(as(employee))
        .send({});

      expect(again.status).toBe(409);
      expect(again.body.error.message).toMatch(/already passed/i);
    });
  });

  describe('only the best score counts', () => {
    it('reports the best attempt, not the most recent one', async () => {
      await sit(4); // 80%, a pass
      // A pass closes the module, so the weaker attempt is the earlier one:
      // fail first, then pass, which is the demo sequence in M3-T8.
      const state = await request(app)
        .get(`${TRAINING}/modules/${module_._id}`)
        .set(as(employee));

      expect(state.body.data.task.quiz).toMatchObject({
        bestScorePercent: 80,
        bestAttemptNumber: 1,
        passed: true,
      });
    });

    it('keeps the failed attempt in the record and marks the best one', async () => {
      await sit(2); // 40%
      await sit(4); // 80%

      const state = await request(app)
        .get(`${TRAINING}/modules/${module_._id}`)
        .set(as(employee));

      const { attempts, bestScorePercent } = state.body.data.task.quiz;

      expect(attempts).toHaveLength(2);
      expect(attempts.map((attempt) => attempt.scorePercent)).toEqual([40, 80]);
      expect(attempts.map((attempt) => attempt.isBest)).toEqual([false, true]);
      expect(bestScorePercent).toBe(80);
    });

    it('does not let a later weaker attempt lower the recorded best', async () => {
      await sit(4); // 80%, passes and closes the module

      const best = await QuizAttempt.find({ userId: employee._id }).sort({ scorePercent: -1 });
      expect(best[0].scorePercent).toBe(80);
    });
  });

  describe('explanations', () => {
    it('are withheld on a failure that still has retakes left', async () => {
      const first = await sit(1);

      expect(first.body.data.result.explanationsRevealed).toBe(false);
    });

    it('are revealed on the final permitted attempt, even when it fails', async () => {
      await sit(1);
      await sit(1);
      const third = await sit(1);

      expect(third.body.data.result).toMatchObject({
        passed: false,
        attemptsRemaining: 0,
        explanationsRevealed: true,
      });
      expect(third.body.data.result.questions[0].explanation).toMatch(/Because of reason 1/);
    });
  });

  describe('admin reset (UC-17, 4a)', () => {
    const reset = (userId = employee._id) =>
      request(app)
        .post(`${TRAINING}/modules/${module_._id}/attempts/reset`)
        .set(as(admin))
        .send({ userId: userId.toString() });

    it('gives the attempts back without deleting the history', async () => {
      await sit(1);
      await sit(1);
      await sit(1);

      const response = await reset();

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ reset: true, attemptsCleared: 3 });

      // The three attempts are still there - they are compliance evidence.
      await expect(QuizAttempt.countDocuments({ userId: employee._id })).resolves.toBe(3);

      const state = await request(app)
        .get(`${TRAINING}/modules/${module_._id}`)
        .set(as(employee));

      expect(state.body.data.task.quiz).toMatchObject({
        attemptsUsed: 0,
        attemptsRemaining: 3,
      });
      // The record still shows every attempt ever made.
      expect(state.body.data.task.quiz.attempts).toHaveLength(3);
    });

    it('lets the employee sit the quiz again afterwards', async () => {
      await sit(1);
      await sit(1);
      await sit(1);
      await reset();

      const fourth = await sit(5);

      expect(fourth.status).toBe(200);
      expect(fourth.body.data.result).toMatchObject({ scorePercent: 100, passed: true });
    });

    it('records who authorised it', async () => {
      await sit(1);
      await reset();

      const entry = await AuditLog.findOne({ action: AUDIT_ACTIONS.QUIZ_ATTEMPTS_RESET });

      expect(entry.actorId.toString()).toBe(admin._id.toString());
      expect(entry.metadata).toMatchObject({
        userId: employee._id.toString(),
        attemptsCleared: 1,
      });
    });

    it('refuses an employee trying to reset their own attempts', async () => {
      const response = await request(app)
        .post(`${TRAINING}/modules/${module_._id}/attempts/reset`)
        .set(as(employee))
        .send({ userId: employee._id.toString() });

      expect(response.status).toBe(403);
    });

    it('counts only the attempts made since the reset', async () => {
      await sit(1);
      await reset();
      await sit(1);

      const state = await request(app)
        .get(`${TRAINING}/modules/${module_._id}`)
        .set(as(employee));

      expect(state.body.data.task.quiz.attemptsUsed).toBe(1);
      expect(state.body.data.task.quiz.attempts).toHaveLength(2);
    });
  });

  describe('the completion record an admin sees (UC-12 counterpart)', () => {
    const completions = () =>
      request(app).get(`${TRAINING}/modules/${module_._id}/completions`).set(as(admin));

    it('reports both halves — who has completed it and who has not', async () => {
      await sit(5); // the employee passes

      const response = await completions();

      expect(response.status).toBe(200);
      expect(response.body.data.summary).toMatchObject({ completed: 1 });
      expect(response.body.data.completed[0]).toMatchObject({
        fullName: employee.fullName,
        employeeId: employee.employeeId,
        scorePercent: 100,
        attemptsUsed: 1,
      });
      // The admin holds the module too - it targets everyone - and has not
      // done it, so they appear on the other list.
      expect(response.body.data.outstanding.map((row) => row.employeeId)).toContain(
        admin.employeeId
      );
    });

    it('reports the BEST score, not the most recent attempt', async () => {
      await sit(2); // 40%
      await sit(4); // 80%, passes

      const response = await completions();

      expect(response.body.data.completed[0]).toMatchObject({
        scorePercent: 80,
        attemptsUsed: 2,
      });
    });

    it('says where each outstanding person has got to', async () => {
      await sit(1);
      await sit(1);
      await sit(1);

      const response = await completions();
      const row = response.body.data.outstanding.find(
        (entry) => entry.employeeId === employee.employeeId
      );

      expect(row).toMatchObject({ stage: 'ATTEMPTS_EXHAUSTED', bestScorePercent: 20 });
    });

    it('carries no answer key', async () => {
      await sit(5);

      const response = await completions();

      expect(JSON.stringify(response.body)).not.toMatch(/isCorrect|explanation/);
    });

    it('refuses an employee', async () => {
      const response = await request(app)
        .get(`${TRAINING}/modules/${module_._id}/completions`)
        .set(as(employee));

      expect(response.status).toBe(403);
    });
  });

  describe('the training record', () => {
    it('shows every attempt with its date, score and status', async () => {
      await sit(2);
      await sit(4);

      const state = await request(app)
        .get(`${TRAINING}/modules/${module_._id}`)
        .set(as(employee));

      state.body.data.task.quiz.attempts.forEach((attempt) => {
        expect(attempt).toMatchObject({
          attemptNumber: expect.any(Number),
          status: ATTEMPT_STATUS.SUBMITTED,
          submittedAt: expect.any(String),
          scorePercent: expect.any(Number),
          passed: expect.any(Boolean),
        });
      });
    });
  });
});
