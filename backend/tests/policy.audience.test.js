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

const AuditLog = require('../src/models/AuditLog');

// US-013 / NFR-SEC-03. Audience scoping is enforced by the API, not by the
// list the interface happens to render.

describe('Audience scoping', () => {
  let admin;
  let warehouseEmployee;
  let salesEmployee;

  beforeEach(async () => {
    admin = await makeAdmin();
    warehouseEmployee = await makeUser({
      role: ROLES.EMPLOYEE,
      department: DEPARTMENTS.WAREHOUSE,
    });
    salesEmployee = await makeUser({ role: ROLES.EMPLOYEE, department: DEPARTMENTS.SALES });
  });

  it('returns a SALES-only version to a warehouse employee as 403, not 404', async () => {
    // 403 is required by the spec: a 404 would be a different claim - that the
    // version does not exist - and the acceptance criterion is explicit.
    const { policy, version } = await makePublishedPolicy(admin, {
      targetRoles: [ROLES.EMPLOYEE],
      targetDepartments: [DEPARTMENTS.SALES],
    });

    const response = await request(app)
      .get(`${POLICIES}/${policy._id}/versions/${version._id}`)
      .set(as(warehouseEmployee));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('SCOPE_VIOLATION');
  });

  it('audits the refused read rather than only refusing it', async () => {
    const { policy, version } = await makePublishedPolicy(admin, {
      targetDepartments: [DEPARTMENTS.SALES],
    });

    await request(app)
      .get(`${POLICIES}/${policy._id}/versions/${version._id}`)
      .set(as(warehouseEmployee));

    const denials = await AuditLog.find({
      actorId: warehouseEmployee._id,
      action: 'RBAC_SCOPE_VIEW_DENIED',
    });

    expect(denials).toHaveLength(1);
    expect(denials[0].metadata.reason).toBe('OUTSIDE_AUDIENCE');
  });

  it('lets the targeted employee read the same version', async () => {
    const { policy, version } = await makePublishedPolicy(admin, {
      targetDepartments: [DEPARTMENTS.SALES],
    });

    const response = await request(app)
      .get(`${POLICIES}/${policy._id}/versions/${version._id}`)
      .set(as(salesEmployee));

    expect(response.status).toBe(200);
    expect(response.body.data.version.body).toBeDefined();
  });

  it('treats empty target arrays as everyone, not nobody', async () => {
    await makePublishedPolicy(admin, { targetRoles: [], targetDepartments: [] });

    const warehouse = await request(app).get(POLICIES).set(as(warehouseEmployee));
    const sales = await request(app).get(POLICIES).set(as(salesEmployee));

    expect(warehouse.body.data.count).toBe(1);
    expect(sales.body.data.count).toBe(1);
  });

  it('requires BOTH role and department to match when both are set', async () => {
    await makePublishedPolicy(admin, {
      targetRoles: [ROLES.MANAGER],
      targetDepartments: [DEPARTMENTS.WAREHOUSE],
    });

    // Right department, wrong role.
    const response = await request(app).get(POLICIES).set(as(warehouseEmployee));
    expect(response.body.data.count).toBe(0);

    const manager = await makeUser({
      role: ROLES.MANAGER,
      department: DEPARTMENTS.WAREHOUSE,
    });
    const managerResponse = await request(app).get(POLICIES).set(as(manager));
    expect(managerResponse.body.data.count).toBe(1);
  });

  it('records a POLICY_VIEWED event when a targeted employee opens a version', async () => {
    const { policy, version } = await makePublishedPolicy(admin);

    await request(app)
      .get(`${POLICIES}/${policy._id}/versions/${version._id}`)
      .set(as(warehouseEmployee));

    const views = await AuditLog.find({
      actorId: warehouseEmployee._id,
      action: 'POLICY_VIEWED',
    });

    // T6 derives time-spent-reading from this event rather than trusting the
    // client, so its existence is load-bearing, not just informational.
    expect(views).toHaveLength(1);
  });

  it('shows an admin every policy regardless of audience', async () => {
    await makePublishedPolicy(admin, { targetDepartments: [DEPARTMENTS.SALES] });
    await makePublishedPolicy(admin, { targetDepartments: [DEPARTMENTS.WAREHOUSE] });

    const response = await request(app).get(POLICIES).set(as(admin));
    expect(response.body.data.count).toBe(2);
  });
});
