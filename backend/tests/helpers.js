const request = require('supertest');

const { createApp, API_PREFIX } = require('../src/app');
const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const PolicyVersion = require('../src/models/PolicyVersion');
const { signAccessToken } = require('../src/modules/auth/token.service');
const { ROLES, DEPARTMENTS, USER_STATUS } = require('../src/constants/roles');
const { POLICY_CATEGORY, POLICY_VERSION_STATUS } = require('../src/constants/policies');

const app = createApp();
const POLICIES = `${API_PREFIX}/policies`;

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

module.exports = {
  app,
  request,
  API_PREFIX,
  POLICIES,
  makeUser,
  makeAdmin,
  as,
  makePublishedPolicy,
  ROLES,
  DEPARTMENTS,
};
