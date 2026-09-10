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
  ROLES,
  DEPARTMENTS,
} = require('./helpers');

const trainingRouter = require('../src/modules/training/training.routes');

// M3-T9. The NFRs, verified rather than asserted.
//
// Both suites here are TABLE-DRIVEN over a route manifest, and both check the
// manifest against the router itself. A per-route test is a test somebody
// forgets to write when they add route twelve; these fail the moment the
// manifest and the router disagree, which is the only way "every route" means
// anything.

// --- The router, as data ----------------------------------------------------

// Every route the module actually exposes, as "METHOD path".
const routesInRouter = trainingRouter.stack
  .filter((layer) => layer.route)
  .flatMap((layer) =>
    Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route.path}`)
  );

// The capability guard is created ONCE in the router and reused, so it is the
// only handler function shared between routes - which is how it can be found
// without exporting anything for the sake of the test.
const authorGuard = (() => {
  const seen = new Map();

  trainingRouter.stack
    .filter((layer) => layer.route)
    .forEach((layer) =>
      layer.route.stack.forEach((handler) =>
        seen.set(handler.handle, (seen.get(handler.handle) || 0) + 1)
      )
    );

  const [shared] = [...seen.entries()].find(([, count]) => count > 1) || [];
  return shared;
})();

const adminRoutesInRouter = trainingRouter.stack
  .filter((layer) => layer.route && layer.route.stack.some((h) => h.handle === authorGuard))
  .flatMap((layer) =>
    Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route.path}`)
  );

// --- Manifests --------------------------------------------------------------

const ADMIN_ROUTES = [
  { label: 'POST /modules', method: 'post', path: () => `${TRAINING}/modules`, body: { title: 'Mine now', category: 'GENERAL' } },
  { label: 'PATCH /modules/:id', method: 'patch', path: (ids) => `${TRAINING}/modules/${ids.moduleId}`, body: { title: 'Mine now' } },
  { label: 'DELETE /modules/:id', method: 'delete', path: (ids) => `${TRAINING}/modules/${ids.moduleId}`, body: {} },
  { label: 'GET /modules/:id/completions', method: 'get', path: (ids) => `${TRAINING}/modules/${ids.moduleId}/completions` },
  { label: 'POST /modules/:id/publish', method: 'post', path: (ids) => `${TRAINING}/modules/${ids.moduleId}/publish`, body: {} },
  {
    label: 'POST /modules/:id/attempts/reset',
    method: 'post',
    path: (ids) => `${TRAINING}/modules/${ids.moduleId}/attempts/reset`,
    body: { userId: '000000000000000000000000' },
  },
];

// Their router paths, for the coverage assertion below.
const ADMIN_ROUTE_PATHS = [
  'POST /modules',
  'PATCH /modules/:id',
  'DELETE /modules/:id',
  'GET /modules/:id/completions',
  'POST /modules/:id/publish',
  'POST /modules/:id/attempts/reset',
];

// Every route an employee can reach. The leakage suite drives this list; the
// coverage assertion proves it is the complement of the admin list, so a new
// route lands in one or the other and cannot escape both.
const EMPLOYEE_ROUTE_PATHS = [
  'GET /modules',
  'GET /modules/:id',
  'POST /modules/:id/progress',
  'POST /modules/:id/attempts',
  'PATCH /attempts/:aid',
  'POST /attempts/:aid/submit',
  'GET /attempts/:aid',
];

// --- The deep search --------------------------------------------------------

// Every path at which `key` appears anywhere in the tree, arrays included.
// Paths rather than a boolean, so a failure names where the leak is.
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

describe('M3 NFR verification (T9)', () => {
  describe('the manifests match the router', () => {
    it('claims every ADMIN-guarded route the router declares', () => {
      expect([...adminRoutesInRouter].sort()).toEqual([...ADMIN_ROUTE_PATHS].sort());
    });

    it('accounts for every route in the module, admin or employee', () => {
      expect([...routesInRouter].sort()).toEqual(
        [...ADMIN_ROUTE_PATHS, ...EMPLOYEE_ROUTE_PATHS].sort()
      );
    });
  });

  // --- NFR-SEC-03 ---------------------------------------------------------

  describe('authorisation: a valid low-privilege token at an ADMIN route', () => {
    let ids;
    let employee;
    let manager;

    beforeEach(async () => {
      const admin = await makeAdmin();
      const module = await makeQuizModule(admin);
      ids = { moduleId: module._id.toString() };

      employee = await makeUser({ role: ROLES.EMPLOYEE, department: DEPARTMENTS.WAREHOUSE });
      manager = await makeUser({ role: ROLES.MANAGER, department: DEPARTMENTS.WAREHOUSE });
    });

    describe.each([
      ['EMPLOYEE', () => employee],
      ['MANAGER', () => manager],
    ])('as %s', (roleName, getUser) => {
      it.each(ADMIN_ROUTES.map((route) => [route.label, route]))(
        'is refused with 403 on %s',
        async (label, route) => {
          const response = await request(app)
            [route.method](route.path(ids))
            .set(as(getUser()))
            .send(route.body);

          expect(response.status).toBe(403);
          expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        }
      );
    });

    it('refuses an unauthenticated request outright', async () => {
      const response = await request(app).get(`${TRAINING}/modules`);
      expect(response.status).toBe(401);
    });
  });

  // --- AD-3 / NFR-SEC-04 --------------------------------------------------

  describe('answer-key leakage across every employee-facing route', () => {
    let bodies;

    beforeEach(async () => {
      const admin = await makeAdmin();
      const employee = await makeUser({ department: DEPARTMENTS.WAREHOUSE });
      const module = await makeQuizModule(admin, { questions: 5, items: 2 });
      await publishModule(admin, module._id);

      const [first] = module.contentItems;

      // One pass through the whole employee loop, collecting what each route
      // actually sent back. The attempt is deliberately FAILED with retakes
      // left, which is the state in which nothing may be revealed.
      const progress = await request(app)
        .post(`${TRAINING}/modules/${module._id}/progress`)
        .set(as(employee))
        .send({ itemId: first.itemId });

      await completeAllContent(employee, module);

      const start = await request(app)
        .post(`${TRAINING}/modules/${module._id}/attempts`)
        .set(as(employee))
        .send({});

      const attemptId = start.body.data.attempt.id;

      const save = await request(app)
        .patch(`${TRAINING}/attempts/${attemptId}`)
        .set(as(employee))
        .send({
          responses: module.quiz.questions.map((question, index) => ({
            questionId: question.questionId,
            // Two right, three wrong: 40%, a fail with attempts left.
            selectedOptionIds: [
              index < 2 ? question.options[0].optionId : question.options[1].optionId,
            ],
          })),
        });

      const submit = await request(app)
        .post(`${TRAINING}/attempts/${attemptId}/submit`)
        .set(as(employee))
        .send({});

      bodies = [
        ['GET /modules', (await request(app).get(`${TRAINING}/modules`).set(as(employee))).body],
        [
          'GET /modules/:id',
          (await request(app).get(`${TRAINING}/modules/${module._id}`).set(as(employee))).body,
        ],
        ['POST /modules/:id/progress', progress.body],
        ['POST /modules/:id/attempts', start.body],
        ['PATCH /attempts/:aid', save.body],
        ['POST /attempts/:aid/submit', submit.body],
        [
          'GET /attempts/:aid',
          (await request(app).get(`${TRAINING}/attempts/${attemptId}`).set(as(employee))).body,
        ],
      ];
    });

    it('covers every employee-facing route in the manifest', () => {
      expect(bodies.map(([label]) => label).sort()).toEqual([...EMPLOYEE_ROUTE_PATHS].sort());
    });

    it('finds no key named isCorrect at any depth, on any route', () => {
      bodies.forEach(([label, body]) => {
        expect({ route: label, leaks: findKeyPaths(body, 'isCorrect') }).toEqual({
          route: label,
          leaks: [],
        });
      });
    });

    it('finds no key named explanation at any depth, on any route', () => {
      bodies.forEach(([label, body]) => {
        expect({ route: label, leaks: findKeyPaths(body, 'explanation') }).toEqual({
          route: label,
          leaks: [],
        });
      });
    });

    it('never sends the text of a correct option the learner did not choose', () => {
      // The stronger statement: not merely that the FLAG is absent, but that
      // the right answer itself is not in the body of a failed attempt.
      const [, submitBody] = bodies.find(([label]) => label === 'POST /attempts/:aid/submit');
      const wrongAnswers = submitBody.data.result.questions.filter((q) => q.mark === 'INCORRECT');

      expect(wrongAnswers.length).toBeGreaterThan(0);
      wrongAnswers.forEach((question) => {
        expect(question.yourAnswer).toEqual(['The wrong answer.']);
        expect(JSON.stringify(question)).not.toMatch(/The right answer/);
      });
    });
  });

  // The single documented exception, tested explicitly so it is a decision
  // rather than a gap: an explanation is part of the result once there is
  // nothing left to protect (US-023, US-024).
  describe('the one place an explanation is allowed out', () => {
    it('appears only after a pass, and never before', async () => {
      const admin = await makeAdmin();
      const employee = await makeUser();
      const module = await makeQuizModule(admin, { questions: 5, items: 1, maxAttempts: 3 });
      await publishModule(admin, module._id);
      await completeAllContent(employee, module);

      const sit = async (correct) => {
        const start = await request(app)
          .post(`${TRAINING}/modules/${module._id}/attempts`)
          .set(as(employee))
          .send({});

        const attemptId = start.body.data.attempt.id;

        await request(app)
          .patch(`${TRAINING}/attempts/${attemptId}`)
          .set(as(employee))
          .send({
            responses: module.quiz.questions.map((question, index) => ({
              questionId: question.questionId,
              selectedOptionIds: [
                index < correct ? question.options[0].optionId : question.options[1].optionId,
              ],
            })),
          });

        return request(app)
          .post(`${TRAINING}/attempts/${attemptId}/submit`)
          .set(as(employee))
          .send({});
      };

      const failed = await sit(2);
      expect(findKeyPaths(failed.body, 'explanation')).toEqual([]);

      const passed = await sit(5);
      expect(findKeyPaths(passed.body, 'explanation').length).toBeGreaterThan(0);
    });
  });

  // --- Audience scoping ---------------------------------------------------

  describe('audience scoping (NFR-SEC-03)', () => {
    it('refuses a WAREHOUSE employee a SALES-only module by direct id, with 403', async () => {
      const admin = await makeAdmin();
      await makeUser({ department: DEPARTMENTS.SALES });
      const warehouse = await makeUser({ department: DEPARTMENTS.WAREHOUSE });

      const salesOnly = await makeQuizModule(admin, {
        targetDepartments: [DEPARTMENTS.SALES],
        code: 'TST-NFR-SALES',
      });
      await publishModule(admin, salesOnly._id);

      const direct = await request(app)
        .get(`${TRAINING}/modules/${salesOnly._id}`)
        .set(as(warehouse));

      expect(direct.status).toBe(403);
      expect(direct.body.error.code).toBe('SCOPE_VIOLATION');

      // And it is absent from their list, not merely refused on the way in.
      const list = await request(app).get(`${TRAINING}/modules`).set(as(warehouse));
      expect(list.body.data.modules).toHaveLength(0);
    });
  });
});
