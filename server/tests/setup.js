// Runs once per test file, before its imports are evaluated. Sets a
// hermetic environment so the test suite never depends on a developer's
// local .env file (and CI doesn't need one either) -- this must set
// DATABASE_URL etc. before any test file imports server/src/config/env.js
// or db.js, since those read process.env at module-load time.
process.env.NODE_ENV = 'test';
// Overridable so CI can point at its own Postgres service container while
// local runs default to the payrollpro_test database created alongside
// payrollpro_dev.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:localdevpassword@localhost:5432/payrollpro_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.ACCESS_TOKEN_TTL_MIN = '15';
process.env.REFRESH_TOKEN_TTL_DAYS = '7';
process.env.REFRESH_TOKEN_TTL_DAYS_REMEMBER = '30';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
