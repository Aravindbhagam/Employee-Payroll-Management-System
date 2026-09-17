import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(__dirname, '..', 'prisma', 'test.db');
const DATABASE_URL = 'file:./prisma/test.db';

export default async function globalSetup() {
  // Start every test run from a clean schema -- globalSetup runs once,
  // before any test file's per-worker setup, and in its own process, so
  // env vars here are passed explicitly to the child process rather than
  // relying on tests/setup.ts (which only affects the vitest worker itself).
  // SQLite in WAL mode can leave -wal/-shm sidecar files alongside the main
  // db file and the rollback-journal suffix; all are removed so a stale
  // sidecar can't resurrect old data into the fresh file below.
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const p = TEST_DB_PATH + suffix;
    if (fs.existsSync(p)) {
      fs.rmSync(p);
      console.log(`[test setup] removed stale ${p}`);
    }
  }

  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL },
    stdio: 'inherit',
  });

  return async () => {
    for (const suffix of ['', '-journal']) {
      const p = TEST_DB_PATH + suffix;
      if (fs.existsSync(p)) fs.rmSync(p);
    }
  };
}
