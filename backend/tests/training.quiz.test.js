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
const Assignment = require('../src/models/Assignment');
const TrainingModule = require('../src/models/TrainingModule');
const { ASSIGNMENT_STATUS } = require('../src/constants/assignments');
const { ATTEMPT_STATUS } = require('../src/constants/training');

// M3-T5. UC-16 with its exception flows. Five questions, so each is worth 20%
// and US-020's 60% and 80% cases can be hit exactly.

describe('Quiz attempt lifecycle (M3-T5)', () => {
  let admin;
  let employee;
  let module_;

  // The helper builds single-choice questions whose FIRST option is correct.
  const answerFirst = (module, howManyCorrect) =>
    module.quiz.questions.map((question, index) => ({
      questionId: question.questionId,
      selectedOptionIds: [
        index < howManyCorrect ? question.options[0].optionId : question.options[1].optionId,
      ],
    }));

  const startAttempt = (user = employee, moduleId = module_._id) =>
    request(app).post(`${TRAINING}/modules/${moduleId}/attempts`).set(as(user)).send({});

  const sit = async (howManyCorrect, user = employee, module = module_) => {
    const start = await startAttempt(user, module._id);
    const attemptId = start.body.data.attempt.id;

    await request(app)
      .patch(`${TRAINING}/attempts/${attemptId}`)
      .set(as(user))
      .send({ responses: answerFirst(module, howManyCorrect) });

    return request(app)
      .post(`${TRAINING}/attempts/${attemptId}/submit`)
      .set(as(user))
      .send({});
  };

  beforeEach(async () => {
    admin = await makeAdmin();
    employee = await makeUser();
    module_ = await makeQuizModule(admin, { questions: 5, items: 2, passMark: 70 });
    await publishModule(admin, module_._id);
    await completeAllContent(employee, module_);
  });

  describe('US-020 acceptance criterion', () => {
    it('scores 60%, fails, and leaves the assignment open with attempts remaining', async () => {
      const response = await sit(3);

      expect(response.status).toBe(200);
      expect(response.body.data.result).toMatchObject({
        scorePercent: 60,
        correctCount: 3,
        totalQuestions: 5,
        passMark: 70,
        passed: false,
        attemptsRemaining: 2,
      });

      const assignment = await Assignment.findOne({ userId: employee._id });
      expect(assignment.status).not.toBe(ASSIGNMENT_STATUS.COMPLETED);
      expect(assignment.completedAt).toBeNull();
    });

    it('scores 80%, passes, and completes the assignment with a timestamp', async () => {
      const response = await sit(4);

      expect(response.body.data.result).toMatchObject({ scorePercent: 80, passed: true });

      const assignment = await Assignment.findOne({ userId: employee._id });
      expect(assignment.status).toBe(ASSIGNMENT_STATUS.COMPLETED);
      expect(assignment.completedAt).toBeInstanceOf(Date);

      // The evidence, not merely a flag: completionRef points at the attempt
      // that earned the pass.
      expect(assignment.completionRef.toString()).toBe(response.body.data.result.id);
    });
  });

  describe('grading', () => {
    it('requires an exact set match on a MULTI_CHOICE question', async () => {
      const multi = await TrainingModule.create({
        title: 'Multi choice module',
        code: 'TST-MULTI-01',
        category: 'EMAIL_SECURITY',
        createdBy: admin._id,
        contentItems: [{ order: 1, type: 'ARTICLE', title: 'Read', body: 'Text.' }],
        quiz: {
          passMark: 70,
          questions: [
            {
              order: 1,
              text: 'Which of these are phishing signals?',
              type: 'MULTI_CHOICE',
              options: [
                { text: 'Urgency.', isCorrect: true },
                { text: 'Domain mismatch.', isCorrect: true },
                { text: 'A signature block.', isCorrect: false },
              ],
            },
          ],
        },
      });
      await publishModule(admin, multi._id);
      await completeAllContent(employee, multi);

      const [question] = multi.quiz.questions;

      const partial = await startAttempt(employee, multi._id);
      await request(app)
        .patch(`${TRAINING}/attempts/${partial.body.data.attempt.id}`)
        .set(as(employee))
        // One of the two correct options: not two thirds right, just wrong.
        .send({
          responses: [
            { questionId: question.questionId, selectedOptionIds: [question.options[0].optionId] },
          ],
        });

      const partialResult = await request(app)
        .post(`${TRAINING}/attempts/${partial.body.data.attempt.id}/submit`)
        .set(as(employee))
        .send({});

      expect(partialResult.body.data.result.scorePercent).toBe(0);

      const exact = await startAttempt(employee, multi._id);
      await request(app)
        .patch(`${TRAINING}/attempts/${exact.body.data.attempt.id}`)
        .set(as(employee))
        .send({
          responses: [
            {
              questionId: question.questionId,
              selectedOptionIds: [question.options[0].optionId, question.options[1].optionId],
            },
          ],
        });

      const exactResult = await request(app)
        .post(`${TRAINING}/attempts/${exact.body.data.attempt.id}/submit`)
        .set(as(employee))
        .send({});

      expect(exactResult.body.data.result.scorePercent).toBe(100);
    });

    it('grades against passMarkAtAttempt, not the module pass mark of today', async () => {
      const result = await sit(4); // 80%, passes a 70 mark
      expect(result.body.data.result.passed).toBe(true);

      // The admin raises the bar afterwards. The recorded result must not move.
      await request(app)
        .patch(`${TRAINING}/modules/${module_._id}`)
        .set(as(admin))
        .send({ quiz: { passMark: 90 } });

      const reread = await request(app)
        .get(`${TRAINING}/attempts/${result.body.data.result.id}`)
        .set(as(employee));

      expect(reread.body.data.result).toMatchObject({ passMark: 70, passed: true });
    });

    it('refuses to submit with unanswered questions, naming their numbers', async () => {
      const start = await startAttempt();

      await request(app)
        .patch(`${TRAINING}/attempts/${start.body.data.attempt.id}`)
        .set(as(employee))
        .send({ responses: answerFirst(module_, 5).slice(0, 3) });

      const response = await request(app)
        .post(`${TRAINING}/attempts/${start.body.data.attempt.id}/submit`)
        .set(as(employee))
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Questions 4, 5 have not been answered/i);
    });
  });

  describe('what the result does and does not say (US-023, AD-3)', () => {
    it('marks each question right or wrong without naming the correct option', async () => {
      const response = await sit(3);
      const [first, last] = [
        response.body.data.result.questions[0],
        response.body.data.result.questions[4],
      ];

      expect(first.mark).toBe('CORRECT');
      expect(last.mark).toBe('INCORRECT');
      // Their own answer is named. Nothing says what the right one was.
      expect(last.yourAnswer).toEqual(['The wrong answer.']);
      expect(JSON.stringify(response.body)).not.toMatch(/isCorrect/);
    });

    it('withholds the explanation while a retake is still available', async () => {
      const response = await sit(3);

      expect(response.body.data.result.explanationsRevealed).toBe(false);
      expect(JSON.stringify(response.body)).not.toMatch(/Because of reason/);
    });

    it('reveals the explanation once the learner has passed', async () => {
      const response = await sit(5);

      expect(response.body.data.result.explanationsRevealed).toBe(true);
      expect(response.body.data.result.questions[0].explanation).toMatch(/Because of reason 1/);
    });
  });

  describe('ownership and immutability', () => {
    it('refuses to let one employee save answers on another employee attempt', async () => {
      const other = await makeUser();
      const start = await startAttempt();

      const response = await request(app)
        .patch(`${TRAINING}/attempts/${start.body.data.attempt.id}`)
        .set(as(other))
        .send({ responses: answerFirst(module_, 5) });

      expect(response.status).toBe(403);
    });

    it('refuses a second submission of the same attempt', async () => {
      const start = await startAttempt();
      await request(app)
        .patch(`${TRAINING}/attempts/${start.body.data.attempt.id}`)
        .set(as(employee))
        .send({ responses: answerFirst(module_, 5) });

      await request(app)
        .post(`${TRAINING}/attempts/${start.body.data.attempt.id}/submit`)
        .set(as(employee))
        .send({});

      const second = await request(app)
        .post(`${TRAINING}/attempts/${start.body.data.attempt.id}/submit`)
        .set(as(employee))
        .send({});

      expect(second.status).toBe(409);
    });

    it('refuses to save answers onto a submitted attempt', async () => {
      const result = await sit(5);

      const response = await request(app)
        .patch(`${TRAINING}/attempts/${result.body.data.result.id}`)
        .set(as(employee))
        .send({ responses: answerFirst(module_, 5) });

      expect(response.status).toBe(409);
    });

    it('lets an admin read a result but not sit the quiz for somebody', async () => {
      const result = await sit(4);

      const adminRead = await request(app)
        .get(`${TRAINING}/attempts/${result.body.data.result.id}`)
        .set(as(admin));

      expect(adminRead.status).toBe(200);
      expect(adminRead.body.data.result.scorePercent).toBe(80);
    });
  });

  describe('resuming and the server clock (UC-16 5a)', () => {
    it('hands back the same attempt rather than opening a second one', async () => {
      const first = await startAttempt();
      const second = await startAttempt();

      expect(second.status).toBe(200);
      expect(second.body.data.resumed).toBe(true);
      expect(second.body.data.attempt.id).toBe(first.body.data.attempt.id);
      await expect(QuizAttempt.countDocuments({ userId: employee._id })).resolves.toBe(1);
    });

    it('counts the remaining time down from the server, not from the client', async () => {
      const timed = await makeQuizModule(admin, { timeLimitMinutes: 30, code: 'TST-TIMED-01' });
      await publishModule(admin, timed._id);
      await completeAllContent(employee, timed);

      const start = await startAttempt(employee, timed._id);

      expect(start.body.data.attempt.secondsRemaining).toBeGreaterThan(1700);
      expect(start.body.data.attempt.secondsRemaining).toBeLessThanOrEqual(1800);
      expect(start.body.data.attempt.deadline).toEqual(expect.any(String));
    });

    it('auto-submits an attempt whose time ran out, scoring the unanswered as zero', async () => {
      const timed = await makeQuizModule(admin, {
        questions: 5,
        timeLimitMinutes: 10,
        code: 'TST-TIMED-02',
      });
      await publishModule(admin, timed._id);
      await completeAllContent(employee, timed);

      const start = await startAttempt(employee, timed._id);
      const attemptId = start.body.data.attempt.id;

      await request(app)
        .patch(`${TRAINING}/attempts/${attemptId}`)
        .set(as(employee))
        .send({ responses: answerFirst(timed, 2).slice(0, 2) });

      // Wind the clock back past the deadline. The attempt is still
      // IN_PROGRESS, exactly as it would be after a session expired mid-quiz.
      await QuizAttempt.updateOne(
        { _id: attemptId },
        { $set: { startedAt: new Date(Date.now() - 11 * 60 * 1000) } }
      );

      // Simply looking at it is enough: the expiry is settled on the way past.
      const response = await request(app)
        .get(`${TRAINING}/attempts/${attemptId}`)
        .set(as(employee));

      expect(response.body.data.result).toMatchObject({
        status: ATTEMPT_STATUS.EXPIRED,
        timedOut: true,
        // Two answered correctly, three never answered and scored zero.
        scorePercent: 40,
        passed: false,
      });
    });
  });
});
