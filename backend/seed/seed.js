/* eslint-disable no-console */
// Populates a fresh database with a demo admin account, one employee per
// department, a couple of published policies, a training module with a
// quiz, and a sample incident - enough to explore every module immediately
// after setup. Safe to re-run: it wipes and recreates the collections it
// touches.
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');

const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const TrainingModule = require('../src/models/TrainingModule');
const Incident = require('../src/models/Incident');
const PolicyAcknowledgment = require('../src/models/PolicyAcknowledgment');
const TrainingCompletion = require('../src/models/TrainingCompletion');
const { DEFAULT_SEVERITY_BY_TYPE, INCIDENT_STATUS } = require('../src/config/constants');

async function seed() {
  await mongoose.connect(env.mongoUri);
  console.log('[seed] Connected to', env.mongoUri);

  await Promise.all([
    User.deleteMany({}),
    Policy.deleteMany({}),
    TrainingModule.deleteMany({}),
    Incident.deleteMany({}),
    PolicyAcknowledgment.deleteMany({}),
    TrainingCompletion.deleteMany({}),
  ]);
  console.log('[seed] Cleared existing data');

  const password = await User.hashPassword('Passw0rd!');

  const [admin, sales, warehouse, admin2, mgmt] = await User.create([
    {
      name: 'IT Administrator',
      employeeId: 'ADM001',
      email: 'admin@savikro.lk',
      department: 'administration',
      role: 'admin',
      passwordHash: password,
    },
    {
      name: 'Nimal Perera',
      employeeId: 'SAL001',
      email: 'nimal.perera@savikro.lk',
      department: 'sales',
      role: 'sales',
      passwordHash: password,
    },
    {
      name: 'Kamal Silva',
      employeeId: 'WHS001',
      email: 'kamal.silva@savikro.lk',
      department: 'warehouse',
      role: 'warehouse',
      passwordHash: password,
    },
    {
      name: 'Anusha Fernando',
      employeeId: 'ADN001',
      email: 'anusha.fernando@savikro.lk',
      department: 'administration',
      role: 'administration',
      passwordHash: password,
    },
    {
      name: 'Ruwan Jayasuriya',
      employeeId: 'MGT001',
      email: 'ruwan.jayasuriya@savikro.lk',
      department: 'management',
      role: 'management',
      passwordHash: password,
    },
  ]);
  console.log('[seed] Users created:', [admin, sales, warehouse, admin2, mgmt].map((u) => u.employeeId).join(', '));

  const policies = await Policy.create([
    {
      title: 'Acceptable Use Policy',
      category: 'General',
      description: 'Governs acceptable use of company IT assets and the ISPM application.',
      targetRoles: [],
      status: 'published',
      createdBy: admin._id,
      versions: [
        {
          versionNumber: 1,
          content:
            'All employees must use company IT assets, including this application, solely for authorised business purposes. ' +
            'Company credentials must not be shared. Customer, supplier and pricing data accessed through this system must ' +
            'not be copied to personal devices or shared outside the organisation without management approval.',
          changeNotes: 'Initial version',
          publishedBy: admin._id,
        },
      ],
    },
    {
      title: 'Customer & Supplier Data Handling Policy',
      category: 'Data Protection',
      description: 'How sales and administrative staff must handle customer contracts and supplier pricing data.',
      targetRoles: ['sales', 'administration', 'management'],
      status: 'published',
      createdBy: admin._id,
      versions: [
        {
          versionNumber: 1,
          content:
            'Customer contracts, quotations, and LS Electric supplier pricing data are commercially sensitive. ' +
            'Do not forward pricing sheets to personal email. Verify the identity of anyone requesting quotation ' +
            'or contract details before sharing. Store documents only in approved company systems.',
          changeNotes: 'Initial version',
          publishedBy: admin._id,
        },
      ],
    },
    {
      title: 'Warehouse Device & Stock Security Policy',
      category: 'Physical Security',
      description: 'Security expectations for handheld scanners, stock records and warehouse devices.',
      targetRoles: ['warehouse'],
      status: 'published',
      createdBy: admin._id,
      versions: [
        {
          versionNumber: 1,
          content:
            'Handheld scanners and stock-record devices must be logged out and secured at the end of each shift. ' +
            'Report a lost or damaged device to IT/admin immediately via the Incident Reporting module.',
          changeNotes: 'Initial version',
          publishedBy: admin._id,
        },
      ],
    },
  ]);
  console.log('[seed] Policies created:', policies.map((p) => p.title).join(', '));

  await PolicyAcknowledgment.create({
    policy: policies[0]._id,
    versionNumber: 1,
    user: sales._id,
  });

  const trainingModules = await TrainingModule.create([
    {
      title: 'Password Security Essentials',
      description: 'Why strong, unique passwords matter and how to manage them safely.',
      content:
        'Use a unique password for every system. Prefer a passphrase of 12+ characters. Never write passwords on ' +
        'paper left at your desk or share them with colleagues, even temporarily. Report any suspected password ' +
        'compromise immediately.',
      mediaUrl: '',
      estimatedMinutes: 5,
      targetRoles: [],
      passingScorePercent: 70,
      createdBy: admin._id,
      quiz: [
        {
          questionText: 'What is the minimum recommended passphrase length?',
          options: ['4 characters', '6 characters', '12+ characters', 'No minimum'],
          correctOptionIndex: 2,
        },
        {
          questionText: 'Is it acceptable to share your password with a trusted colleague temporarily?',
          options: ['Yes, always', 'Only with management', 'No, never', 'Only over the phone'],
          correctOptionIndex: 2,
        },
      ],
    },
    {
      title: 'Handling Customer Quotations Securely',
      description: 'Role-specific guidance for sales staff on protecting quotation and pricing data.',
      content:
        'Quotation and pricing data must only be sent to verified customer contacts. Double-check recipient email ' +
        'addresses before sending. Do not discuss pricing over unsecured public channels.',
      estimatedMinutes: 6,
      targetRoles: ['sales'],
      passingScorePercent: 70,
      createdBy: admin._id,
      quiz: [
        {
          questionText: 'Before sending a quotation, you should:',
          options: [
            'Send it immediately to save time',
            'Verify the recipient email address',
            'CC your personal email as backup',
            'Post it in a public group chat',
          ],
          correctOptionIndex: 1,
        },
      ],
    },
  ]);
  console.log('[seed] Training modules created:', trainingModules.map((m) => m.title).join(', '));

  await TrainingCompletion.create({
    user: sales._id,
    trainingModule: trainingModules[0]._id,
    score: 100,
    totalQuestions: 2,
    correctAnswers: 2,
    passed: true,
  });

  const incident = await Incident.create({
    reporter: warehouse._id,
    type: 'lost_device',
    description: 'Handheld barcode scanner from Bay 3 is missing after the evening shift changeover.',
    severity: DEFAULT_SEVERITY_BY_TYPE.lost_device,
    status: INCIDENT_STATUS.OPEN,
    timeline: [{ status: INCIDENT_STATUS.OPEN, note: 'Reported by employee.', changedBy: warehouse._id }],
  });
  console.log('[seed] Sample incident created:', incident._id.toString());

  console.log('\n[seed] Done. Demo accounts (password for all: Passw0rd!):');
  console.log('  Admin:          ADM001');
  console.log('  Sales:          SAL001');
  console.log('  Warehouse:      WHS001');
  console.log('  Administration: ADN001');
  console.log('  Management:     MGT001');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
