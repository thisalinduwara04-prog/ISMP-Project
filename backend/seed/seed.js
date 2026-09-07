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
const Incident = require('../src/models/Incident');
const { ROLES, DEPARTMENTS } = require('../src/constants/roles');
const {
  INCIDENT_TYPE,
  INCIDENT_STATUS,
  SEVERITY_SET_BY,
  DEFAULT_SEVERITY_BY_TYPE,
} = require('../src/constants/incidents');
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

// M5 sample incidents (spec section 7.11). Enough spread across type, severity
// and status to demonstrate the triage queue ordering, the HIGH/CRITICAL alert
// banner and a reporter's closed report with its resolution note.
//
// `reportedBy` and `assignedTo` are employee IDs, resolved to _ids at seed time.
const INCIDENTS = [
  {
    reportedBy: 'SVK-020',
    type: INCIDENT_TYPE.SUSPICIOUS_EMAIL,
    title: 'Invoice email from an unfamiliar supplier address',
    description:
      'Received an email claiming to be from LS Electric accounts asking me to confirm new bank details for an outstanding invoice. The reply-to address is a gmail account and the message has a PDF attachment I did not open.',
    daysAgo: 1,
    status: INCIDENT_STATUS.OPEN,
  },
  {
    reportedBy: 'SVK-022',
    type: INCIDENT_TYPE.LOST_DEVICE,
    title: 'Warehouse scanner tablet missing since Friday',
    description:
      'The shared stock-count tablet was not in its charging dock this morning. It was last used on Friday afternoon for the aisle 4 count. It is signed in to the inventory system.',
    daysAgo: 2,
    status: INCIDENT_STATUS.IN_REVIEW,
    assignedTo: 'SVK-001',
    historyNote: 'Confirmed with the Friday late shift. Checking CCTV and remote-wipe options.',
  },
  {
    reportedBy: 'SVK-024',
    type: INCIDENT_TYPE.DATA_LOSS,
    title: 'Customer pricing sheet emailed to the wrong recipient',
    description:
      'A quotation workbook containing 2026 distributor pricing was sent to an external address that autocompleted incorrectly. The recipient has not replied.',
    daysAgo: 3,
    status: INCIDENT_STATUS.OPEN,
  },
  {
    reportedBy: 'SVK-021',
    type: INCIDENT_TYPE.MALWARE,
    title: 'Antivirus warning after opening a shared drive file',
    description:
      'Endpoint protection blocked something while I was opening a spreadsheet from the shared sales drive. The file will not open now and the machine feels slow.',
    daysAgo: 9,
    status: INCIDENT_STATUS.RESOLVED,
    assignedTo: 'SVK-001',
    resolutionNote:
      'Detection was a macro-enabled workbook from an external source. File quarantined and removed, workstation scanned clean, and the sales share now blocks macro documents.',
  },
  {
    reportedBy: 'SVK-023',
    type: INCIDENT_TYPE.UNAUTHORISED_ACCESS,
    title: 'Someone else was signed in on the warehouse terminal',
    description:
      'Came back from a delivery and the shared warehouse terminal was still signed in as another member of staff, with the stock system open.',
    daysAgo: 20,
    status: INCIDENT_STATUS.CLOSED,
    assignedTo: 'SVK-001',
    resolutionNote:
      'No data was changed under the other account. Session timeout on shared terminals reduced to 5 minutes and the shift briefing covered signing out.',
  },
  {
    reportedBy: 'SVK-020',
    type: INCIDENT_TYPE.OTHER,
    title: 'Visitor left unaccompanied near the sales desks',
    description:
      'A delivery visitor waited by the sales desks for about ten minutes with nobody with them. Screens were unlocked at the time.',
    daysAgo: 5,
    status: INCIDENT_STATUS.OPEN,
  },
];

const daysAgoDate = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const seedIncidents = async (usersByEmployeeId) => {
  const created = [];

  for (const sample of INCIDENTS) {
    const reporter = usersByEmployeeId.get(sample.reportedBy);
    const assignee = sample.assignedTo ? usersByEmployeeId.get(sample.assignedTo) : null;
    const reportedAt = daysAgoDate(sample.daysAgo);

    // Severity is derived exactly as the service derives it (US-037), so the
    // seed cannot drift from the rule the application applies.
    const severity = DEFAULT_SEVERITY_BY_TYPE[sample.type];

    // The trail is built to match the path the incident actually took, so the
    // detail screen shows a believable history rather than one bulk entry.
    const statusHistory = [
      {
        fromStatus: null,
        toStatus: INCIDENT_STATUS.OPEN,
        changedBy: reporter._id,
        changedAt: reportedAt,
        note: 'Reported by employee.',
      },
    ];

    const path = {
      [INCIDENT_STATUS.OPEN]: [],
      [INCIDENT_STATUS.IN_REVIEW]: [INCIDENT_STATUS.IN_REVIEW],
      [INCIDENT_STATUS.RESOLVED]: [INCIDENT_STATUS.IN_REVIEW, INCIDENT_STATUS.RESOLVED],
      [INCIDENT_STATUS.CLOSED]: [
        INCIDENT_STATUS.IN_REVIEW,
        INCIDENT_STATUS.RESOLVED,
        INCIDENT_STATUS.CLOSED,
      ],
    }[sample.status];

    let cursor = INCIDENT_STATUS.OPEN;
    let stepAt = reportedAt;
    let resolvedAt = null;
    let closedAt = null;

    path.forEach((toStatus, index) => {
      stepAt = new Date(stepAt.getTime() + (index + 1) * 60 * 60 * 1000);
      const note =
        toStatus === INCIDENT_STATUS.IN_REVIEW
          ? sample.historyNote || 'Picked up for review.'
          : sample.resolutionNote;

      statusHistory.push({
        fromStatus: cursor,
        toStatus,
        changedBy: (assignee || reporter)._id,
        changedAt: stepAt,
        note: note || null,
      });

      if (toStatus === INCIDENT_STATUS.RESOLVED) resolvedAt = stepAt;
      if (toStatus === INCIDENT_STATUS.CLOSED) closedAt = stepAt;
      cursor = toStatus;
    });

    // eslint-disable-next-line no-await-in-loop
    const incident = await Incident.create({
      reference: `INC-${reportedAt.getFullYear()}-${String(created.length + 1).padStart(4, '0')}`,
      reportedBy: reporter._id,
      reporterDepartment: reporter.department,
      type: sample.type,
      title: sample.title,
      description: sample.description,
      occurredAt: reportedAt,
      severity,
      severitySetBy: SEVERITY_SET_BY.SYSTEM_DEFAULT,
      status: sample.status,
      assignedTo: assignee ? assignee._id : null,
      statusHistory,
      resolutionNote: sample.resolutionNote || null,
      resolvedAt,
      closedAt,
      createdAt: reportedAt,
    });

    created.push(incident);
  }

  return created;
};

const seed = async () => {
  if (env.isProduction) {
    throw new Error('Refusing to run the seed script against a production database.');
  }

  await mongoose.connect(env.MONGO_URI);
  // Redacted: the connection string carries the database password, and this
  // output routinely gets pasted into chats, tickets and screenshots.
  console.log(`[seed] Connected to ${redactUri(env.MONGO_URI)}`);

  await Promise.all([User.deleteMany({}), RefreshToken.deleteMany({}), Incident.deleteMany({})]);
  console.log('[seed] Cleared users, sessions and incidents');

  // Created one at a time rather than with insertMany, because the password
  // hashing hook lives on `save` and insertMany bypasses it - which would
  // store the demo password in plaintext.
  const created = [];
  for (const account of ACCOUNTS) {
    // eslint-disable-next-line no-await-in-loop
    created.push(await User.create({ ...account, passwordHash: DEMO_PASSWORD }));
  }

  const usersByEmployeeId = new Map(created.map((u) => [u.employeeId, u]));
  const incidents = await seedIncidents(usersByEmployeeId);

  await User.syncIndexes();
  await RefreshToken.syncIndexes();
  await Incident.syncIndexes();
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

  console.log(`\n[seed] Created ${incidents.length} incidents (M5):`);
  console.log('  Reference       Severity  Status     Type');
  console.log('  --------------  --------  ---------  --------------------');
  incidents.forEach((i) => {
    console.log(
      `  ${i.reference.padEnd(14)}  ${i.severity.padEnd(8)}  ${i.status.padEnd(9)}  ${i.type}`
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
