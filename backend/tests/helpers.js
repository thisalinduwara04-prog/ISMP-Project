const request = require('supertest');

const { createApp, API_PREFIX } = require('../src/app');
const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const PolicyVersion = require('../src/models/PolicyVersion');
const TrainingModule = require('../src/models/TrainingModule');
const { signAccessToken } = require('../src/modules/auth/token.service');
const { ROLES, DEPARTMENTS, USER_STATUS } = require('../src/constants/roles');
const { POLICY_CATEGORY, POLICY_VERSION_STATUS } = require('../src/constants/policies');
const {
  CONTENT_ITEM_TYPE,
  QUESTION_TYPE,
  MODULE_STATUS,
} = require('../src/constants/training');

const app = createApp();
const POLICIES = `${API_PREFIX}/policies`;
const TRAINING = `${API_PREFIX}/training`;

// A real bcrypt digest shape. The User pre-save hook recognises it as already
// hashed and skips the rounds, which keeps a suite that creates dozens of
// users fast without weakening the hashing the application actually does.
const PREHASHED = '$2b$12$abcdefghijklmnopqrstuvCe/9oOQC6dqiVJTPPjBQ0nCPPuIWm2';

let sequence = 0;

const makeUser = async (overrides = {}) => {
  sequence += 1;

  return User.create({
    employeeId: `TST-${String(sequence).padStart(4, '0')}`,
    fullName: `Test User ${sequence}`,
    email: `test${sequence}@example.test`,
    passwordHash: PREHASHED,
    role: ROLES.EMPLOYEE,
    department: DEPARTMENTS.WAREHOUSE,
    status: USER_STATUS.ACTIVE,
    ...overrides,
  });
};

const makeAdmin = () =>
  makeUser({ role: ROLES.ADMIN, department: DEPARTMENTS.ADMINISTRATION });

// Tokens are minted exactly as login mints them. `authenticate` still re-reads
// the user from the database on every request, so these carry no more
// authority than the account behind them.
const as = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

// A policy with one PUBLISHED version, which is the starting state most tests
// need. Written through the models rather than the API so a test of the
// acknowledge endpoint is not also a test of the publish endpoint.
const makePublishedPolicy = async (
  author,
  { targetRoles = [], targetDepartments = [], code, body = 'Policy text.' } = {}
) => {
  sequence += 1;

  const policy = await Policy.create({
    title: `Test Policy ${sequence}`,
    code: code || `TST-POL-${String(sequence).padStart(3, '0')}`,
    category: POLICY_CATEGORY.GENERAL,
    ownerId: author._id,
  });

  const version = await PolicyVersion.create({
    policyId: policy._id,
    versionNumber: 1,
    title: policy.title,
    body,
    targetRoles,
    targetDepartments,
    status: POLICY_VERSION_STATUS.PUBLISHED,
    publishedAt: new Date(),
    publishedBy: author._id,
    effectiveFrom: new Date(),
    authoredBy: author._id,
  });

  policy.currentVersionId = version._id;
  await policy.save();

  return { policy, version };
};

// A training module with one walkthrough, one video and a three-question quiz
// covering all three question types - the shape Deliverable 4 asks for, and
// enough variety that a projection test has something to strip on every path.
// Written through the model, so a test of the projection is not also a test of
// the authoring endpoint.
const makeTrainingModule = async (
  author,
  { targetRoles = [], targetDepartments = [], code, status = MODULE_STATUS.DRAFT } = {}
) => {
  sequence += 1;

  return TrainingModule.create({
    title: `Test Module ${sequence}`,
    code: code || `TST-TRN-${String(sequence).padStart(3, '0')}`,
    description: 'A short awareness module.',
    category: POLICY_CATEGORY.EMAIL_SECURITY,
    estimatedMinutes: 10,
    targetRoles,
    targetDepartments,
    status,
    publishedAt: status === MODULE_STATUS.PUBLISHED ? new Date() : null,
    publishedBy: status === MODULE_STATUS.PUBLISHED ? author._id : null,
    createdBy: author._id,
    contentItems: [
      {
        order: 1,
        type: CONTENT_ITEM_TYPE.WALKTHROUGH,
        title: 'Spotting a phishing email',
        body: '## Check the sender\n\nHover before you click.',
      },
      {
        order: 2,
        type: CONTENT_ITEM_TYPE.VIDEO,
        title: 'Reporting a suspicious message',
        mediaUrl: 'https://example.test/video.mp4',
        durationSeconds: 120,
      },
    ],
    quiz: {
      questions: [
        {
          order: 1,
          text: 'A supplier email asks you to change their bank details. What do you do?',
          type: QUESTION_TYPE.SINGLE_CHOICE,
          options: [
            { text: 'Call the known contact number to verify.', isCorrect: true },
            { text: 'Reply to the email to confirm.', isCorrect: false },
          ],
          explanation: 'Verify out of band, never by replying to the message itself.',
        },
        {
          order: 2,
          text: 'Which of these are phishing signals?',
          type: QUESTION_TYPE.MULTI_CHOICE,
          options: [
            { text: 'Urgency and threats.', isCorrect: true },
            { text: 'A mismatched sender domain.', isCorrect: true },
            { text: 'A signature block.', isCorrect: false },
          ],
          explanation: 'Urgency and domain mismatches travel together.',
        },
        {
          order: 3,
          text: 'Forwarding a suspicious email to a colleague is a safe way to check it.',
          type: QUESTION_TYPE.TRUE_FALSE,
          options: [
            { text: 'True', isCorrect: false },
            { text: 'False', isCorrect: true },
          ],
          explanation: 'Report it instead; forwarding spreads the click.',
        },
      ],
    },
  });
};

module.exports = {
  app,
  request,
  API_PREFIX,
  POLICIES,
  TRAINING,
  makeUser,
  makeAdmin,
  as,
  makePublishedPolicy,
  makeTrainingModule,
  ROLES,
  DEPARTMENTS,
};
