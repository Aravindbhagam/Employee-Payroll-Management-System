import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// With `globals: false` in vitest.config.ts, React Testing Library's
// automatic per-test cleanup (which relies on detecting a global afterEach)
// does not register, so previous tests' rendered DOM leaks into the next
// test in the same file. Registering it explicitly here fixes that for
// every test file.
afterEach(() => {
  cleanup();
});
