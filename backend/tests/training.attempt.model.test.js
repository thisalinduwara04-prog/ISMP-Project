const { makeUser, makeAdmin, makeTrainingModule } = require('./helpers');
const QuizAttempt = require('../src/models/QuizAttempt');
const { ATTEMPT_STATUS } = require('../src/constants/training');

// M3-T1. Spec 7.9: an attempt is immutable once it has been graded, because it
// is compliance evidence. The rule is enforced at the MODEL, so no future
// service, script or admin route can bypass it by taking a different path to
// the same document.

describe('quizAttempt immutability (M3-T1, 7.9)', () => {
  let user;
  let module_;

  const makeAttempt = async (overrides = {}) =>
    QuizAttempt.create({
      userId: user._id,
      moduleId: module_._id,
      attemptNumber: 1,
      passMarkAtAttempt: 70,
      totalQuestions: 3,
      ...overrides,
    });

  beforeEach(async () => {
    const admin = await makeAdmin();
    user = await makeUser();
    module_ = await makeTrainingModule(admin);
  });

  it('allows an in-progress attempt to be saved as answers come in', async () => {
    const attempt = await makeAttempt();

    attempt.responses.push({ questionId: 'q1', selectedOptionIds: ['o1'] });
    await expect(attempt.save()).resolves.toBeDefined();
  });

  it('allows the submit transition itself', async () => {
    const attempt = await makeAttempt();

    attempt.status = ATTEMPT_STATUS.SUBMITTED;
    attempt.submittedAt = new Date();
    attempt.scorePercent = 80;
    attempt.passed = true;

    await expect(attempt.save()).resolves.toBeDefined();
  });

  it('rejects a re-save of an already submitted attempt', async () => {
    await makeAttempt({ status: ATTEMPT_STATUS.SUBMITTED, scorePercent: 60, passed: false });

    const reloaded = await QuizAttempt.findOne({ userId: user._id });
    reloaded.scorePercent = 100;
    reloaded.passed = true;

    await expect(reloaded.save()).rejects.toThrow(/immutable/i);
  });

  it('rejects a query-level update of a submitted attempt', async () => {
    const attempt = await makeAttempt({ status: ATTEMPT_STATUS.SUBMITTED, scorePercent: 60 });

    await expect(
      QuizAttempt.updateOne({ _id: attempt._id }, { $set: { scorePercent: 100 } })
    ).rejects.toThrow(/immutable/i);

    const unchanged = await QuizAttempt.findById(attempt._id);
    expect(unchanged.scorePercent).toBe(60);
  });

  it('rejects deleting a graded attempt, so a reset cannot erase history', async () => {
    const attempt = await makeAttempt({ status: ATTEMPT_STATUS.EXPIRED, scorePercent: 20 });

    await expect(QuizAttempt.deleteOne({ _id: attempt._id })).rejects.toThrow(/immutable/i);
    await expect(QuizAttempt.countDocuments({ userId: user._id })).resolves.toBe(1);
  });

  it('still allows an abandoned in-progress attempt to be updated or removed', async () => {
    const attempt = await makeAttempt();

    await expect(
      QuizAttempt.updateOne({ _id: attempt._id }, { $set: { status: ATTEMPT_STATUS.EXPIRED } })
    ).resolves.toMatchObject({ modifiedCount: 1 });
  });
});
