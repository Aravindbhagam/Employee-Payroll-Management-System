import { execSync } from 'child_process';
import path from 'path';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:localdevpassword@localhost:5432/payrollpro_test';

export default async function globalSetup() {
  // Start every test run from a clean schema. migrate reset drops and
  // recreates the test database's schema then reapplies every migration,
  // which is the Postgres-native equivalent of the old "delete the SQLite
  // file and let migrate deploy recreate it" approach.
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL },
    stdio: 'inherit',
  });
}
