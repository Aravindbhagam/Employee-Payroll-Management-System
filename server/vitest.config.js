import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup.js'],
    globalSetup: ['./tests/globalSetup.js'],
    // Integration tests share one Postgres database and mutate real rows,
    // so they must not run concurrently against each other.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 20000,
  },
});
