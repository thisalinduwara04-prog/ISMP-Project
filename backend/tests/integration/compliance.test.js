const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const { createApp } = require('../../src/app');
const User = require('../../src/models/User');
const Assignment = require('../../src/models/Assignment');
const Notification = require('../../src/models/Notification');
const AuditLog = require('../../src/models/AuditLog');
const { signAccessToken } = require('../../src/modules/auth/token.service');
const { ROLES, DEPARTMENTS } = require('../../src/constants/roles');
const { clearDashboardCache } = require('../../src/modules/compliance/compliance.service');

describe('M4 compliance tracking and reporting', () => {
  let mongo;
  let app;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    app = createApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    clearDashboardCache();
    await Promise.all([
      User.deleteMany({}), Assignment.deleteMany({}), Notification.deleteMany({}), AuditLog.collection.deleteMany({}),
    ]);
  });

  const createUser = (overrides = {}) => User.create({
    employeeId: overrides.employeeId || `SVK-${Math.floor(Math.random() * 9000 + 1000)}`,
    fullName: overrides.fullName || 'Test User',
    email: overrides.email || `user-${Math.random()}@savikro.test`,
    role: overrides.role || ROLES.EMPLOYEE,
    department: overrides.department || DEPARTMENTS.WAREHOUSE,
    passwordHash: 'Savikro#2026',
  });

  const auth = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

  const addAssignment = (user, overrides = {}) => Assignment.create({
    userId: user._id,
    department: user.department,
    userRole: user.role,
    itemType: overrides.itemType || 'POLICY',
    itemId: new mongoose.Types.ObjectId(),
    itemTitle: overrides.itemTitle || 'Acceptable Use Policy',
    status: overrides.status || 'PENDING',
    assignedAt: overrides.assignedAt || new Date('2026-08-01T00:00:00Z'),
    dueDate: overrides.dueDate || new Date('2026-09-01T00:00:00Z'),
    completedAt: overrides.status === 'COMPLETED' ? new Date('2026-08-15T00:00:00Z') : null,
  });

  test('personal endpoint reports assignment completion accurately', async () => {
    const employee = await createUser();
    await addAssignment(employee, { status: 'COMPLETED' });
    await addAssignment(employee, { status: 'OVERDUE', itemType: 'TRAINING' });

    const response = await request(app).get('/api/v1/compliance/me').set(auth(employee));

    expect(response.status).toBe(200);
    expect(response.body.data.summary).toMatchObject({ total: 2, completed: 1, overdue: 1, compliancePercent: 50 });
    expect(response.body.data.assignments).toHaveLength(2);
  });

  test('manager dashboard is forced to their own department', async () => {
    const manager = await createUser({ role: ROLES.MANAGER, employeeId: 'SVK-1001', email: 'manager@savikro.test' });
    const warehouseEmployee = await createUser({ employeeId: 'SVK-1002', email: 'warehouse@savikro.test' });
    const salesEmployee = await createUser({ employeeId: 'SVK-1003', email: 'sales@savikro.test', department: DEPARTMENTS.SALES });
    await addAssignment(warehouseEmployee, { status: 'COMPLETED' });
    await addAssignment(salesEmployee, { status: 'OVERDUE' });

    const own = await request(app).get('/api/v1/compliance/dashboard').set(auth(manager));
    expect(own.status).toBe(200);
    expect(own.body.data.summary).toMatchObject({ total: 1, completed: 1, compliancePercent: 100 });

    const crossDepartment = await request(app)
      .get('/api/v1/compliance/dashboard?department=SALES')
      .set(auth(manager));
    expect(crossDepartment.status).toBe(403);
    expect(crossDepartment.body.error.code).toBe('SCOPE_VIOLATION');
    expect(await AuditLog.countDocuments({ action: 'RBAC_SCOPE_VIOLATION' })).toBe(1);
  });

  test('organisation dashboard produces the specified 75 percent aggregate', async () => {
    const admin = await createUser({ role: ROLES.ADMIN, employeeId: 'SVK-1501', email: 'admin15@savikro.test' });
    const warehouse = await createUser({ employeeId: 'SVK-1502', email: 'warehouse15@savikro.test' });
    const sales = await createUser({ employeeId: 'SVK-1503', email: 'sales15@savikro.test', department: DEPARTMENTS.SALES });
    await addAssignment(warehouse, { status: 'COMPLETED' });
    await addAssignment(warehouse, { status: 'COMPLETED', itemType: 'TRAINING' });
    await addAssignment(sales, { status: 'COMPLETED' });
    await addAssignment(sales, { status: 'OVERDUE', itemType: 'TRAINING' });

    const response = await request(app).get('/api/v1/compliance/dashboard').set(auth(admin));
    expect(response.status).toBe(200);
    expect(response.body.data.summary).toMatchObject({ total: 4, completed: 3, overdue: 1, compliancePercent: 75 });
    expect(response.body.data.departments.reduce((sum, row) => sum + row.total, 0)).toBe(4);
  });

  test('employee cannot open privileged dashboard', async () => {
    const employee = await createUser();
    const response = await request(app).get('/api/v1/compliance/dashboard').set(auth(employee));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  test('manual reminders create one in-app notification per 24 hours', async () => {
    const manager = await createUser({ role: ROLES.MANAGER, employeeId: 'SVK-2001', email: 'manager2@savikro.test' });
    const employee = await createUser({ employeeId: 'SVK-2002', email: 'employee2@savikro.test' });
    await addAssignment(employee, { status: 'PENDING', dueDate: new Date(Date.now() + 10 * 86400000) });

    const first = await request(app)
      .post('/api/v1/compliance/reminders')
      .set(auth(manager))
      .send({ userIds: [employee._id.toString()], assignmentIds: [] });
    const second = await request(app)
      .post('/api/v1/compliance/reminders')
      .set(auth(manager))
      .send({ userIds: [employee._id.toString()], assignmentIds: [] });

    expect(first.status).toBe(200);
    expect(first.body.data.notificationsCreated).toBe(1);
    expect(second.body.data.notificationsCreated).toBe(0);
    expect(await Notification.countDocuments({ userId: employee._id })).toBe(1);
  });

  test('admin can download scoped XLSX and PDF reports', async () => {
    const admin = await createUser({ role: ROLES.ADMIN, employeeId: 'SVK-3001', email: 'admin2@savikro.test' });
    const employee = await createUser({ employeeId: 'SVK-3002', email: 'employee3@savikro.test' });
    await addAssignment(employee, { status: 'COMPLETED' });

    const xlsx = await request(app)
      .post('/api/v1/compliance/reports/export')
      .set(auth(admin))
      .send({ format: 'XLSX', department: DEPARTMENTS.WAREHOUSE });
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect(xlsx.headers['content-disposition']).toContain('compliance-warehouse');

    const pdf = await request(app)
      .post('/api/v1/compliance/reports/export')
      .set(auth(admin))
      .send({ format: 'PDF', department: DEPARTMENTS.WAREHOUSE });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });

  test('old admin authentication requires password step-up', async () => {
    const admin = await createUser({ role: ROLES.ADMIN, employeeId: 'SVK-4001', email: 'admin4@savikro.test' });
    const staleToken = signAccessToken(admin, Math.floor(Date.now() / 1000) - 31 * 60);

    const blocked = await request(app)
      .get('/api/v1/compliance/dashboard')
      .set('Authorization', `Bearer ${staleToken}`);
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe('STEP_UP_REQUIRED');

    const verified = await request(app)
      .post('/api/v1/auth/step-up')
      .set('Authorization', `Bearer ${staleToken}`)
      .send({ password: 'Savikro#2026' });
    expect(verified.status).toBe(200);
    expect(verified.headers['set-cookie'].join(';')).toContain('accessToken=');
  });
});
