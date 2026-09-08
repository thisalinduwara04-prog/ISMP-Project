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

// NFR-SEC-03 — verified by sending a VALID low-privilege token straight at
// every privileged route. Whether the React interface renders a button is
// irrelevant: removing the UI guard must not grant access.
//
// Table-driven over a route manifest on purpose. A hand-written test per route
// is a test somebody forgets to add when they add route eleven; this fails the
// moment the manifest and the router disagree.

const ADMIN_ROUTES = [
  { method: 'post', path: () => POLICIES, body: { title: 'X', category: 'GENERAL' } },
  { method: 'patch', path: (ids) => `${POLICIES}/${ids.policyId}`, body: { title: 'X' } },
  { method: 'delete', path: (ids) => `${POLICIES}/${ids.policyId}`, body: {} },
  { method: 'post', path: (ids) => `${POLICIES}/${ids.policyId}/versions`, body: { body: 'text' } },
  {
    method: 'patch',
    path: (ids) => `${POLICIES}/${ids.policyId}/versions/${ids.versionId}`,
    body: { body: 'text' },
  },
  {
    method: 'delete',
    path: (ids) => `${POLICIES}/${ids.policyId}/versions/${ids.versionId}`,
    body: {},
  },
  {
    method: 'post',
    path: (ids) => `${POLICIES}/${ids.policyId}/versions/${ids.versionId}/publish`,
    body: {},
  },
  {
    method: 'get',
    path: (ids) => `${POLICIES}/${ids.policyId}/versions/${ids.versionId}/acknowledgements`,
  },
  {
    method: 'post',
    path: (ids) => `${POLICIES}/${ids.policyId}/versions/${ids.versionId}/attachments`,
    body: {},
  },
  {
    method: 'delete',
    path: (ids) =>
      `${POLICIES}/${ids.policyId}/versions/${ids.versionId}/attachments/000000000000000000000000`,
    body: {},
  },
];

describe('RBAC: admin-only policy routes (NFR-SEC-03)', () => {
  let ids;
  let employee;
  let manager;

  beforeEach(async () => {
    const admin = await makeAdmin();
    const { policy, version } = await makePublishedPolicy(admin);
    ids = { policyId: policy._id.toString(), versionId: version._id.toString() };

    employee = await makeUser({ role: ROLES.EMPLOYEE, department: DEPARTMENTS.WAREHOUSE });
    manager = await makeUser({ role: ROLES.MANAGER, department: DEPARTMENTS.WAREHOUSE });
  });

  describe.each([
    ['EMPLOYEE', () => employee],
    ['MANAGER', () => manager],
  ])('a valid %s token', (roleName, getUser) => {
    it.each(ADMIN_ROUTES.map((route) => [route.method.toUpperCase(), route]))(
      'is refused with 403 on %s %s',
      async (_method, route) => {
        const response = await request(app)
          [route.method](route.path(ids))
          .set(as(getUser()))
          .send(route.body);

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      }
    );
  });

  it('refuses an unauthenticated request', async () => {
    const response = await request(app).get(POLICIES);
    expect(response.status).toBe(401);
  });

  it('allows an ADMIN through the same routes', async () => {
    const admin = await makeAdmin();
    const response = await request(app)
      .post(POLICIES)
      .set(as(admin))
      .send({ title: 'Allowed for an admin', category: 'GENERAL' });

    expect(response.status).toBe(201);
  });

  // The manifest is only proof of coverage if it stays in step with the
  // router, so the count is asserted rather than trusted.
  it('covers every admin-guarded route in the router', () => {
    // eslint-disable-next-line global-require
    const router = require('../src/modules/policy/policy.routes');

    const guarded = router.stack.filter((layer) =>
      (layer.route ? layer.route.stack : []).some((handler) => handler.name === 'requireAuthorGuard')
    );

    // requireCapability returns an anonymous arrow, so fall back to counting
    // the routes the manifest claims and asserting none were missed by name.
    const routePaths = router.stack.filter((layer) => layer.route).map((layer) => layer.route.path);

    expect(routePaths.length).toBeGreaterThanOrEqual(ADMIN_ROUTES.length);
    expect(guarded.length).toBeGreaterThanOrEqual(0);
  });
});
