const { app, request, TRAINING, makeUser, makeAdmin, as, ROLES, DEPARTMENTS } = require('./helpers');

const TrainingModule = require('../src/models/TrainingModule');
const QuizAttempt = require('../src/models/QuizAttempt');
const { MODULE_STATUS } = require('../src/constants/training');

// M3-T2. Authoring a module: the correctness rules the API refuses to bend, and
// the identity guarantee that makes reordering safe.

const walkthrough = {
  type: 'WALKTHROUGH',
  title: 'Spotting a phishing email',
  body: '## Check the sender\n\nHover before you click.',
};

const video = {
  type: 'VIDEO',
  title: 'Reporting a suspicious message',
  mediaUrl: 'https://example.test/video.mp4',
  durationSeconds: 120,
};

const singleChoice = {
  text: 'A supplier asks you to change their bank details by email. What do you do?',
  type: 'SINGLE_CHOICE',
  options: [
    { text: 'Call the known contact number to verify.', isCorrect: true },
    { text: 'Reply to the email to confirm.', isCorrect: false },
  ],
  explanation: 'Verify out of band, never by replying to the message itself.',
};

const draft = (overrides = {}) => ({
  title: 'Phishing awareness',
  category: 'EMAIL_SECURITY',
  description: 'How to recognise and report a phishing attempt.',
  contentItems: [walkthrough, video],
  quiz: { questions: [singleChoice] },
  ...overrides,
});

describe('Training module authoring (M3-T2)', () => {
  let admin;

  beforeEach(async () => {
    admin = await makeAdmin();
  });

  const create = (payload = draft()) =>
    request(app).post(`${TRAINING}/modules`).set(as(admin)).send(payload);

  describe('creating a module', () => {
    it('creates it as a DRAFT with a generated code, so nobody is assigned anything yet', async () => {
      const response = await create();

      expect(response.status).toBe(201);
      expect(response.body.data.module).toMatchObject({
        title: 'Phishing awareness',
        code: 'TRN-EML-001',
        status: MODULE_STATUS.DRAFT,
        dueInDays: 21,
      });
      expect(response.body.data.module.quiz).toMatchObject({ passMark: 70, maxAttempts: 3 });
    });

    it('gives every content item, question and option a stable id', async () => {
      const { module: created } = (await create()).body.data;

      expect(created.contentItems.map((item) => item.itemId)).toEqual([
        expect.any(String),
        expect.any(String),
      ]);
      expect(created.quiz.questions[0].questionId).toEqual(expect.any(String));
      expect(created.quiz.questions[0].options[0].optionId).toEqual(expect.any(String));
    });

    it('numbers content items from their position, so the client never sends an order', async () => {
      const { module: created } = (await create()).body.data;

      expect(created.contentItems.map((item) => item.order)).toEqual([1, 2]);
    });

    it('refuses a second module with the same code', async () => {
      await create(draft({ code: 'TRN-DUP-001' }));
      const second = await create(draft({ code: 'TRN-DUP-001', title: 'Another module' }));

      expect(second.status).toBe(409);
      expect(second.body.error.details[0].field).toBe('code');
    });

    it('rejects a client-supplied status rather than ignoring it', async () => {
      const response = await create(draft({ status: 'PUBLISHED' }));

      expect(response.status).toBe(400);
    });
  });

  describe('quiz validation (US-020)', () => {
    const withQuestion = (question) => create(draft({ quiz: { questions: [question] } }));

    it('refuses a SINGLE_CHOICE question with two correct options', async () => {
      const response = await withQuestion({
        ...singleChoice,
        options: [
          { text: 'Verify by phone.', isCorrect: true },
          { text: 'Reply to the email.', isCorrect: true },
        ],
      });

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body.error.details)).toMatch(/exactly one correct option/i);
    });

    it('refuses a MULTI_CHOICE question with no correct option', async () => {
      const response = await withQuestion({
        text: 'Which of these are phishing signals?',
        type: 'MULTI_CHOICE',
        options: [
          { text: 'Urgency.', isCorrect: false },
          { text: 'A signature block.', isCorrect: false },
        ],
      });

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body.error.details)).toMatch(/at least one correct option/i);
    });

    it('refuses a TRUE_FALSE question with three options', async () => {
      const response = await withQuestion({
        text: 'Forwarding a suspicious email to a colleague is a safe way to check it.',
        type: 'TRUE_FALSE',
        options: [
          { text: 'True', isCorrect: false },
          { text: 'False', isCorrect: true },
          { text: 'Sometimes', isCorrect: false },
        ],
      });

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body.error.details)).toMatch(/exactly two options/i);
    });

    it('accepts a MULTI_CHOICE question with two correct options', async () => {
      const response = await withQuestion({
        text: 'Which of these are phishing signals?',
        type: 'MULTI_CHOICE',
        options: [
          { text: 'Urgency and threats.', isCorrect: true },
          { text: 'A mismatched sender domain.', isCorrect: true },
          { text: 'A signature block.', isCorrect: false },
        ],
      });

      expect(response.status).toBe(201);
    });
  });

  describe('bounded embedding (7.8)', () => {
    it('refuses an eleventh content item', async () => {
      const items = Array.from({ length: 11 }, (unused, index) => ({
        ...walkthrough,
        title: `Item ${index + 1}`,
      }));

      const response = await create(draft({ contentItems: items }));

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body.error.details)).toMatch(/10 content items/i);
    });

    it('refuses a sixteenth question', async () => {
      const questions = Array.from({ length: 16 }, (unused, index) => ({
        ...singleChoice,
        text: `Question number ${index + 1}?`,
      }));

      const response = await create(draft({ quiz: { questions } }));

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body.error.details)).toMatch(/15 questions/i);
    });
  });

  describe('editing', () => {
    it('keeps itemIds when the admin reorders content, so progress records survive', async () => {
      const { module: created } = (await create()).body.data;
      const [first, second] = created.contentItems;

      const response = await request(app)
        .patch(`${TRAINING}/modules/${created.id}`)
        .set(as(admin))
        .send({
          contentItems: [
            { itemId: second.itemId, type: second.type, title: second.title, mediaUrl: second.mediaUrl },
            { itemId: first.itemId, type: first.type, title: first.title, body: first.body },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.module.contentItems.map((item) => item.itemId)).toEqual([
        second.itemId,
        first.itemId,
      ]);
      expect(response.body.data.module.contentItems.map((item) => item.order)).toEqual([1, 2]);
    });

    it('keeps question and option ids through an edit of the question text', async () => {
      const { module: created } = (await create()).body.data;
      const question = created.quiz.questions[0];

      const response = await request(app)
        .patch(`${TRAINING}/modules/${created.id}`)
        .set(as(admin))
        .send({
          quiz: {
            questions: [
              {
                questionId: question.questionId,
                text: 'A supplier emails asking to change their bank details. What now?',
                type: question.type,
                options: question.options.map((option) => ({
                  optionId: option.optionId,
                  text: option.text,
                  isCorrect: option.isCorrect,
                })),
              },
            ],
          },
        });

      const edited = response.body.data.module.quiz.questions[0];
      expect(edited.questionId).toBe(question.questionId);
      expect(edited.options.map((o) => o.optionId)).toEqual(question.options.map((o) => o.optionId));
    });

    it('leaves the pass mark alone when only the questions are sent', async () => {
      const { module: created } = (await create(draft({ quiz: { passMark: 80, questions: [singleChoice] } }))).body.data;

      const response = await request(app)
        .patch(`${TRAINING}/modules/${created.id}`)
        .set(as(admin))
        .send({ quiz: { questions: [singleChoice] } });

      expect(response.body.data.module.quiz.passMark).toBe(80);
    });

    it('warns rather than refuses when a published quiz is edited with attempts on record', async () => {
      const employee = await makeUser({ role: ROLES.EMPLOYEE, department: DEPARTMENTS.WAREHOUSE });
      const { module: created } = (await create()).body.data;

      await request(app).post(`${TRAINING}/modules/${created.id}/publish`).set(as(admin)).send({});

      // Written directly: the attempt lifecycle itself is M3-T5. All this test
      // needs is one attempt on record for the warning to have something to
      // count.
      await QuizAttempt.create({
        userId: employee._id,
        moduleId: created.id,
        attemptNumber: 1,
        passMarkAtAttempt: 70,
      });

      const response = await request(app)
        .patch(`${TRAINING}/modules/${created.id}`)
        .set(as(admin))
        .send({ quiz: { questions: [{ ...singleChoice, text: 'A reworded question?' }] } });

      expect(response.status).toBe(200);
      expect(response.body.data.warnings[0]).toMatch(/already been recorded/i);
    });
  });

  describe('reading (AD-3, NFR-SEC-03)', () => {
    it('gives an admin the answer key', async () => {
      const { module: created } = (await create()).body.data;

      const response = await request(app).get(`${TRAINING}/modules/${created.id}`).set(as(admin));

      expect(response.body.data.module.quiz.questions[0].options[0]).toHaveProperty('isCorrect');
      expect(response.body.data.module.quiz.questions[0]).toHaveProperty('explanation');
    });

    it('refuses an employee a module aimed at another department, with 403 not 404', async () => {
      const warehouse = await makeUser({ department: DEPARTMENTS.WAREHOUSE });
      const salesModule = await TrainingModule.create({
        title: 'Handling customer quotations',
        code: 'TRN-SALES-ONLY',
        category: 'DATA_HANDLING',
        status: MODULE_STATUS.PUBLISHED,
        publishedAt: new Date(),
        targetDepartments: [DEPARTMENTS.SALES],
        createdBy: admin._id,
        contentItems: [{ order: 1, ...walkthrough }],
        quiz: { questions: [{ order: 1, ...singleChoice }] },
      });

      const response = await request(app)
        .get(`${TRAINING}/modules/${salesModule._id}`)
        .set(as(warehouse));

      expect(response.status).toBe(403);
    });

    it('refuses an employee a module that has not been published', async () => {
      const employee = await makeUser();
      const { module: created } = (await create()).body.data;

      const response = await request(app)
        .get(`${TRAINING}/modules/${created.id}`)
        .set(as(employee));

      expect(response.status).toBe(403);
    });

    it('lists drafts for an admin and only published modules for an employee', async () => {
      const employee = await makeUser();
      await create();

      const adminList = await request(app).get(`${TRAINING}/modules`).set(as(admin));
      const employeeList = await request(app).get(`${TRAINING}/modules`).set(as(employee));

      expect(adminList.body.data.count).toBe(1);
      expect(employeeList.body.data.count).toBe(0);
    });
  });

  describe('authorisation (NFR-SEC-03)', () => {
    it('refuses an EMPLOYEE token on every authoring route', async () => {
      const employee = await makeUser();
      const { module: created } = (await create()).body.data;

      const responses = await Promise.all([
        request(app).post(`${TRAINING}/modules`).set(as(employee)).send(draft()),
        request(app).patch(`${TRAINING}/modules/${created.id}`).set(as(employee)).send({ title: 'Mine now' }),
        request(app).post(`${TRAINING}/modules/${created.id}/publish`).set(as(employee)).send({}),
      ]);

      responses.forEach((response) => expect(response.status).toBe(403));
    });
  });
});
