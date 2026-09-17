const path = require('path');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:localdevpassword@localhost:5432/payrollpro_test';

module.exports = async function globalSetup() {
  // Start every test run from a clean schema. reset() drops and recreates
  // the test database's schema then reapplies every migration, which is
  // the Postgres-native equivalent of the old "delete the SQLite file and
  // let migrate deploy recreate it" approach.
  process.env.DATABASE_URL = DATABASE_URL;
  const { reset } = require(path.join(__dirname, '..', 'db', 'migrate'));
  await reset();
};
