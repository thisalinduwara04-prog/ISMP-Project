/* eslint-disable no-console */
// Creates the M1 account set: one admin, a manager per department, and
// employees across all four departments. Until admin user management (UC-01)
// lands, this is how accounts come into existence.
//
// Safe to re-run: it clears only the collections it owns.

const mongoose = require('mongoose');

const env = require('../src/config/env');
const User = require('../src/models/User');
const RefreshToken = require('../src/models/RefreshToken');
const Assignment = require('../src/models/Assignment');
const Notification = require('../src/models/Notification');
const { ROLES, DEPARTMENTS } = require('../src/constants/roles');
const redactUri = require('../src/utils/redactUri');

const DEMO_PASSWORD = 'Savikro#2026';

const ACCOUNTS = [
  // --- Administrator ---
  {
    employeeId: 'SVK-001',
    fullName: 'Dilhan Wickramasinghe',
    email: 'admin@savikro.lk',
    role: ROLES.ADMIN,
    department: DEPARTMENTS.ADMINISTRATION,
    jobTitle: 'IT & Security Administrator',
  },

  // --- Managers, one per department ---
  {
    employeeId: 'SVK-010',
    fullName: 'Ruwan Jayasuriya',
    email: 'ruwan.jayasuriya@savikro.lk',
    role: ROLES.MANAGER,
    department: DEPARTMENTS.MANAGEMENT,
    jobTitle: 'General Manager',
  },
  {
    employeeId: 'SVK-011',
    fullName: 'Chamari Gunasekara',
    email: 'chamari.gunasekara@savikro.lk',
    role: ROLES.MANAGER,
    department: DEPARTMENTS.SALES,
    jobTitle: 'Sales Manager',
  },
  {
    employeeId: 'SVK-012',
    fullName: 'Sunil Rathnayake',
    email: 'sunil.rathnayake@savikro.lk',
    role: ROLES.MANAGER,
    department: DEPARTMENTS.WAREHOUSE,
    jobTitle: 'Warehouse Supervisor',
  },
  {
    employeeId: 'SVK-013',
    fullName: 'Priyanka de Silva',
    email: 'priyanka.desilva@savikro.lk',
    role: ROLES.MANAGER,
    department: DEPARTMENTS.ADMINISTRATION,
    jobTitle: 'Administration Manager',
  },

  // --- Employees ---
  {
    employeeId: 'SVK-020',
    fullName: 'Nimal Perera',
    email: 'nimal.perera@savikro.lk',
    role: ROLES.EMPLOYEE,
    department: DEPARTMENTS.SALES,
    jobTitle: 'Sales Executive',
  },
  {
    employeeId: 'SVK-021',
    fullName: 'Ishara Fernando',
    email: 'ishara.fernando@savikro.lk',
    role: ROLES.EMPLOYEE,
    department: DEPARTMENTS.SALES,
    jobTitle: 'Sales Coordinator',
  },
  {
    employeeId: 'SVK-022',
    fullName: 'Kamal Silva',
    email: 'kamal.silva@savikro.lk',
    role: ROLES.EMPLOYEE,
    department: DEPARTMENTS.WAREHOUSE,
    jobTitle: 'Stores Assistant',
  },
  {
    employeeId: 'SVK-023',
    fullName: 'Tharindu Bandara',
    email: 'tharindu.bandara@savikro.lk',
    role: ROLES.EMPLOYEE,
    department: DEPARTMENTS.WAREHOUSE,
    jobTitle: 'Inventory Clerk',
  },
  {
    employeeId: 'SVK-024',
    fullName: 'Anusha Fernando',
    email: 'anusha.fernando@savikro.lk',
    role: ROLES.EMPLOYEE,
    department: DEPARTMENTS.ADMINISTRATION,
    jobTitle: 'Accounts Assistant',
  },

  // Demonstrates the forced-change flow (US-003): this account must replace
  // its temporary password before it can use anything else.
  {
    employeeId: 'SVK-025',
    fullName: 'Sanduni Rajapaksa',
    email: 'sanduni.rajapaksa@savikro.lk',
    role: ROLES.EMPLOYEE,
    department: DEPARTMENTS.ADMINISTRATION,
    jobTitle: 'Office Assistant',
    mustChangePassword: true,
  },

  // Demonstrates that a deactivated account cannot log in (UC-02, 3b).
  {
    employeeId: 'SVK-030',
    fullName: 'Former Employee',
    email: 'former.employee@savikro.lk',
    role: ROLES.EMPLOYEE,
    department: DEPARTMENTS.SALES,
    jobTitle: 'Sales Executive (left)',
    status: 'INACTIVE',
  },
];

const seed = async () => {
  if (env.isProduction) {
    throw new Error('Refusing to run the seed script against a production database.');
  }

  await mongoose.connect(env.MONGO_URI);
  // Redacted: the connection string carries the database password, and this
  // output routinely gets pasted into chats, tickets and screenshots.
  console.log(`[seed] Connected to ${redactUri(env.MONGO_URI)}`);

  await Promise.all([
    User.deleteMany({}),
    RefreshToken.deleteMany({}),
    Assignment.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  console.log('[seed] Cleared users, sessions and compliance demo data');

  // Created one at a time rather than with insertMany, because the password
  // hashing hook lives on `save` and insertMany bypasses it - which would
  // store the demo password in plaintext.
  const created = [];
  for (const account of ACCOUNTS) {
    // eslint-disable-next-line no-await-in-loop
    created.push(await User.create({ ...account, passwordHash: DEMO_PASSWORD }));
  }

  const activeUsers = created.filter((user) => user.status === 'ACTIVE');
  const now = new Date();
  const daysFromNow = (days) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const catalogue = [
    { itemId: new mongoose.Types.ObjectId(), itemType: 'POLICY', itemTitle: 'Acceptable Use Policy', dueIn: -10 },
    { itemId: new mongoose.Types.ObjectId(), itemType: 'POLICY', itemTitle: 'Password and Access Control Policy', dueIn: 3 },
    { itemId: new mongoose.Types.ObjectId(), itemType: 'TRAINING', itemTitle: 'Recognising Phishing Emails', dueIn: -2 },
    { itemId: new mongoose.Types.ObjectId(), itemType: 'TRAINING', itemTitle: 'Safe Handling of Company Information', dueIn: 14 },
  ];
  const assignments = [];
  activeUsers.forEach((user, userIndex) => {
    catalogue.forEach((item, itemIndex) => {
      const completed = (userIndex + itemIndex) % 4 !== 0;
      const dueDate = daysFromNow(item.dueIn);
      assignments.push({
        userId: user._id,
        department: user.department,
        userRole: user.role,
        itemType: item.itemType,
        itemId: item.itemId,
        itemTitle: item.itemTitle,
        status: completed ? 'COMPLETED' : (dueDate < now ? 'OVERDUE' : 'PENDING'),
        assignedAt: daysFromNow(-30),
        dueDate,
        completedAt: completed ? daysFromNow(-5) : null,
        progress: item.itemType === 'TRAINING'
          ? { completedItemIds: completed ? ['intro', 'quiz'] : ['intro'], percentComplete: completed ? 100 : 50 }
          : undefined,
      });
    });
  });
  await Assignment.insertMany(assignments);
  console.log(`[seed] Created ${assignments.length} compliance assignments`);

  await User.syncIndexes();
  await RefreshToken.syncIndexes();
  await Assignment.syncIndexes();
  await Notification.syncIndexes();
  console.log('[seed] Indexes synchronised');

  console.log(`\n[seed] Created ${created.length} accounts. Password for all: ${DEMO_PASSWORD}\n`);
  console.log('  Employee ID  Role      Department       Name');
  console.log('  -----------  --------  ---------------  ----------------------');
  created.forEach((u) => {
    const notes = [];
    if (u.mustChangePassword) notes.push('must change password');
    if (u.status !== 'ACTIVE') notes.push('DEACTIVATED');
    console.log(
      `  ${u.employeeId.padEnd(11)}  ${u.role.padEnd(8)}  ${u.department.padEnd(15)}  ${u.fullName}` +
        (notes.length ? `  <- ${notes.join(', ')}` : '')
    );
  });

  console.log('\n[seed] Suggested logins:');
  console.log('  Admin console       SVK-001');
  console.log('  Department manager  SVK-012  (Warehouse)');
  console.log('  Employee            SVK-020  (Sales)');
  console.log('  Forced change       SVK-025');

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
