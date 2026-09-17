// Thin wrapper around node-postgres. Replaces the Prisma client: every
// query in this app is a parameterized SQL string built and reviewed by
// hand (never string-concatenated user input) rather than a generated
// query builder.
const { Pool } = require('pg');
const { env } = require('./config/env');

const pool = new Pool({
  connectionString: env.databaseUrl,
  // Render's managed Postgres requires TLS for external connections but
  // uses a certificate that isn't in Node's default trust store; local
  // Postgres has no TLS at all. PGSSL=false (set for local dev/tests)
  // disables it outright.
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  // Emitted for errors on idle clients in the pool (e.g. a connection
  // dropped by the server) -- must be handled or Node crashes the process.
  // eslint-disable-next-line no-console
  console.error('[db] unexpected error on idle client', err);
});

/** Runs a single parameterized query against the pool. */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Runs `fn(client)` inside a BEGIN/COMMIT transaction, rolling back on any
 * thrown error. `fn` must use the passed client for every query it makes
 * (not the shared pool), so all its statements share the transaction.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, withTransaction, closePool };
