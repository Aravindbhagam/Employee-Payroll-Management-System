const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    // CommonJS test files can't `require('vitest')` (it's ESM-only), so
    // describe/it/expect/vi are injected as globals instead.
    globals: true,
    setupFiles: ['./tests/setup.js'],
    globalSetup: ['./tests/globalSetup.js'],
    // Integration tests share one Postgres database and mutate real rows,
    // so they must not run concurrently against each other.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 20000,
  },
});
