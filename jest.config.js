module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: [
    'handlers/**/*.js',
    'client/preview/js/bom.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true
};
