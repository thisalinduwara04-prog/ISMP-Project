const { makeUser, makeAdmin, ROLES, DEPARTMENTS } = require('./helpers');

const { seedTraining } = require('../seed/training.seed');
const TrainingModule = require('../src/models/TrainingModule');
const QuizAttempt = require('../src/models/QuizAttempt');
const Assignment = require('../src/models/Assignment');
const { ASSIGNMENT_STATUS, ASSIGNMENT_ITEM_TYPE } = require('../src/constants/assignments');
const { MODULE_STATUS } = require('../src/constants/training');

// M3-T8, verified against the in-memory database rather than by running the
// seed script at somebody's real one. The script itself connects and wipes, so
// what is tested here is the function it calls - which is where all the
// content and every state it sets up actually lives.

describe('Training seed data (M3-T8)', () => {
  let admin;
  let users;

  beforeEach(async () => {
    admin = await makeAdmin();

    // The accounts the seed expects to find, by employee id and department.
    users = [
      admin,
      await makeUser({ employeeId: 'SVK-020', department: DEPARTMENTS.SALES }),
      await makeUser({ employeeId: 'SVK-021', department: DEPARTMENTS.SALES }),
      await makeUser({ employeeId: 'SVK-022', department: DEPARTMENTS.WAREHOUSE }),
      await makeUser({ employeeId: 'SVK-024', department: DEPARTMENTS.ADMINISTRATION }),
    ];
  });

  const run = () => seedTraining({ admin, users, reset: false });

  it('creates two published modules with real content and a quiz each', async () => {
    await run();

    const modules = await TrainingModule.find().sort({ code: 1 });

    expect(modules).toHaveLength(2);
    modules.forEach((module) => {
      expect(module.status).toBe(MODULE_STATUS.PUBLISHED);
      expect(module.publishedAt).toBeInstanceOf(Date);
      expect(module.contentItems.length).toBeGreaterThan(0);
      expect(module.quiz.questions.length).toBeGreaterThan(0);
      expect(module.quiz.passMark).toBe(70);
      expect(module.quiz.maxAttempts).toBe(3);
    });
  });

  it('includes a walkthrough with a quiz and a video with a quiz', async () => {
    await run();

    const types = (await TrainingModule.find()).flatMap((module) =>
      module.contentItems.map((item) => item.type)
    );

    expect(types).toContain('WALKTHROUGH');
    expect(types).toContain('VIDEO');
  });

  it('covers all three question types across the seeded quizzes', async () => {
    await run();

    const questionTypes = (await TrainingModule.find()).flatMap((module) =>
      module.quiz.questions.map((question) => question.type)
    );

    expect(new Set(questionTypes)).toEqual(
      new Set(['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE'])
    );
  });

  it('targets one module at SALES only, so audience filtering is visible', async () => {
    await run();

    const salesOnly = await TrainingModule.findOne({ code: 'TRN-DAT-001' });
    expect(salesOnly.targetDepartments).toEqual([DEPARTMENTS.SALES]);

    // Nobody outside Sales holds it.
    const assignments = await Assignment.find({ itemId: salesOnly._id }).populate(
      'userId',
      'department'
    );
    assignments.forEach((assignment) => expect(assignment.department).toBe(DEPARTMENTS.SALES));
  });

  it('leaves assignments in a spread of states for the dashboard', async () => {
    await run();

    const phishing = await TrainingModule.findOne({ code: 'TRN-EML-001' });
    const assignments = await Assignment.find({ itemId: phishing._id });
    const statuses = new Set(assignments.map((assignment) => assignment.status));

    expect(statuses).toContain(ASSIGNMENT_STATUS.COMPLETED);
    expect(statuses).toContain(ASSIGNMENT_STATUS.OVERDUE);
    expect(statuses).toContain(ASSIGNMENT_STATUS.IN_PROGRESS);
    expect(statuses).toContain(ASSIGNMENT_STATUS.PENDING);
  });

  it('leaves somebody part-way through, so the progress bar shows something', async () => {
    await run();

    const partial = await Assignment.findOne({
      itemType: ASSIGNMENT_ITEM_TYPE.TRAINING,
      status: ASSIGNMENT_STATUS.IN_PROGRESS,
    });

    expect(partial.progress.percentComplete).toBeGreaterThan(0);
    expect(partial.progress.percentComplete).toBeLessThan(100);
  });

  it('records a failure followed by a passing retake', async () => {
    await run();

    const nimal = users.find((user) => user.employeeId === 'SVK-020');
    const attempts = await QuizAttempt.find({ userId: nimal._id }).sort({ attemptNumber: 1 });

    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ attemptNumber: 1, scorePercent: 40, passed: false });
    expect(attempts[1]).toMatchObject({ attemptNumber: 2, scorePercent: 80, passed: true });

    // And the passing attempt is what closed the assignment.
    const assignment = await Assignment.findOne({
      userId: nimal._id,
      itemId: attempts[1].moduleId,
    });
    expect(assignment.status).toBe(ASSIGNMENT_STATUS.COMPLETED);
    expect(assignment.completionRef.toString()).toBe(attempts[1]._id.toString());
  });

  it('grades its own seeded attempts consistently with the answer key', async () => {
    await run();

    const phishing = await TrainingModule.findOne({ code: 'TRN-EML-001' });
    const attempts = await QuizAttempt.find({ moduleId: phishing._id });

    // The responses it wrote must agree with the module's key, or the demo
    // would show a score the application itself would never have produced.
    attempts.forEach((attempt) => {
      attempt.responses.forEach((response) => {
        const question = phishing.quiz.questions.find(
          (q) => q.questionId === response.questionId
        );
        const correctIds = question.options
          .filter((option) => option.isCorrect)
          .map((option) => option.optionId);

        const selected = [...response.selectedOptionIds].sort();
        const matches =
          correctIds.length === selected.length &&
          [...correctIds].sort().every((id, i) => id === selected[i]);

        expect(matches).toBe(response.isCorrect);
      });
    });
  });

  it('is safe to run twice, leaving the same data rather than doubling it', async () => {
    await run();
    await run();

    await expect(TrainingModule.countDocuments({})).resolves.toBe(2);

    const phishing = await TrainingModule.findOne({ code: 'TRN-EML-001' });
    const nimal = users.find((user) => user.employeeId === 'SVK-020');

    await expect(QuizAttempt.countDocuments({ userId: nimal._id })).resolves.toBe(2);
    await expect(
      Assignment.countDocuments({ itemType: ASSIGNMENT_ITEM_TYPE.TRAINING, itemId: phishing._id })
    ).resolves.toBe(users.length);
  });
});
