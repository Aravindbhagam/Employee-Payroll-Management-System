import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/globalSetup.ts'],
    // Integration tests share one SQLite file and mutate real rows, so they
    // must not run concurrently against each other.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 20000,
  },
});
