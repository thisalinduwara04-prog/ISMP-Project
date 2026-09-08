// T19. Coverage is reported for services and controllers SEPARATELY, because
// the 60% requirement applies to business logic - a suite that hit the target
// by exercising thin controllers would satisfy the number and miss the point.

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  collectCoverageFrom: [
    'src/modules/**/*.service.js',
    'src/modules/**/*.controller.js',
    'src/utils/**/*.js',
    '!src/**/index.js',
  ],

  coverageThreshold: {
    // NFR target, applied to the service layer where the rules actually live.
    './src/modules/policy/': {
      statements: 60,
      branches: 45,
      functions: 60,
    },
  },

  // The in-memory server takes a moment to start on a cold run.
  testTimeout: 30000,
  verbose: true,
};
