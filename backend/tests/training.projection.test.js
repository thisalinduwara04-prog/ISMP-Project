const { makeAdmin, makeTrainingModule } = require('./helpers');
const TrainingModule = require('../src/models/TrainingModule');
const { toAdminView, toLearnerView } = require('../src/modules/training/training.service');

// M3-T1. AD-3: the quiz answer key never leaves the server.
//
// The check is a DEEP RECURSIVE search rather than an assertion about the two
// or three places the key is expected to be. That is the whole point: a nested
// field somebody adds later, at a depth nobody thought about, still has to be
// caught by this test.

// Every path at which `key` appears anywhere in the tree, arrays included.
// Returns paths rather than a boolean so a failure names where the leak is.
const findKeyPaths = (value, key, path = '$') => {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findKeyPaths(entry, key, `${path}[${index}]`));
  }

  if (value === null || typeof value !== 'object' || value instanceof Date) return [];

  return Object.entries(value).flatMap(([name, child]) => [
    ...(name === key ? [`${path}.${name}`] : []),
    ...findKeyPaths(child, key, `${path}.${name}`),
  ]);
};

describe('training projections (M3-T1, AD-3)', () => {
  let module_;

  beforeEach(async () => {
    const admin = await makeAdmin();
    module_ = await makeTrainingModule(admin);
  });

  describe('toLearnerView', () => {
    it('contains no isCorrect key anywhere in the object tree', () => {
      expect(findKeyPaths(toLearnerView(module_), 'isCorrect')).toEqual([]);
    });

    it('contains no explanation key anywhere in the object tree', () => {
      expect(findKeyPaths(toLearnerView(module_), 'explanation')).toEqual([]);
    });

    it('leaks nothing even when the source is a plain object rather than a document', () => {
      const view = toLearnerView(module_.toObject());

      expect(findKeyPaths(view, 'isCorrect')).toEqual([]);
      expect(findKeyPaths(view, 'explanation')).toEqual([]);
    });

    it('still returns every question and option, so the quiz is answerable', () => {
      const view = toLearnerView(module_);

      expect(view.quiz.questions).toHaveLength(3);
      expect(view.quiz.questions[1].options).toHaveLength(3);
      expect(view.quiz.questions[1].options[0]).toEqual({
        optionId: expect.any(String),
        text: 'Urgency and threats.',
      });
    });

    it('keeps the quiz settings a learner needs to see', () => {
      const view = toLearnerView(module_);

      expect(view.quiz.passMark).toBe(70);
      expect(view.quiz.maxAttempts).toBe(3);
      expect(view.quiz.timeLimitMinutes).toBeNull();
      expect(view.quiz.questionCount).toBe(3);
    });

    it('returns content items in order, with their stable ids', () => {
      const view = toLearnerView(module_);

      expect(view.contentItems.map((item) => item.order)).toEqual([1, 2]);
      expect(view.contentItems[0].itemId).toBe(module_.contentItems[0].itemId);
      expect(view.contentItems[0].body).toContain('Hover before you click');
      expect(view.contentItems[1].mediaUrl).toBe('https://example.test/video.mp4');
    });
  });

  describe('toAdminView', () => {
    it('retains the answer key on every option of every question', () => {
      const view = toAdminView(module_);
      const flags = view.quiz.questions.flatMap((q) => q.options.map((o) => o.isCorrect));

      expect(findKeyPaths(view, 'isCorrect')).toHaveLength(7);
      expect(flags.filter(Boolean)).toHaveLength(4);
    });

    it('retains the explanation on every question', () => {
      const view = toAdminView(module_);

      expect(findKeyPaths(view, 'explanation')).toHaveLength(3);
      expect(view.quiz.questions[0].explanation).toContain('Verify out of band');
    });

    it('differs from the learner view ONLY in the answer key', () => {
      const admin = toAdminView(module_);
      const learner = toLearnerView(module_);

      // Strip the two key fields out of the admin view and the two should be
      // indistinguishable - proof the learner projection removes the answer
      // key and nothing else.
      const stripped = {
        ...admin,
        quiz: {
          ...admin.quiz,
          questions: admin.quiz.questions.map(({ explanation, ...question }) => ({
            ...question,
            options: question.options.map(({ isCorrect, ...option }) => option),
          })),
        },
      };

      expect(learner).toEqual(stripped);
    });
  });

  describe('stable identifiers (7.8)', () => {
    it('generates a nanoid for every content item, question and option', () => {
      const ids = [
        ...module_.contentItems.map((item) => item.itemId),
        ...module_.quiz.questions.map((question) => question.questionId),
        ...module_.quiz.questions.flatMap((q) => q.options.map((option) => option.optionId)),
      ];

      expect(ids).toHaveLength(12);
      expect(new Set(ids).size).toBe(12);
      ids.forEach((id) => expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/));
    });

    it('keeps ids unchanged when the admin reorders content', async () => {
      const originalIds = module_.contentItems.map((item) => item.itemId);

      module_.contentItems[0].order = 2;
      module_.contentItems[1].order = 1;
      await module_.save();

      const reloaded = toAdminView(await TrainingModule.findById(module_._id));

      // Reordered in the response, but a progress record holding either id
      // still points at the same item.
      expect(reloaded.contentItems.map((item) => item.itemId)).toEqual([...originalIds].reverse());
    });
  });
});
