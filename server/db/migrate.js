// Minimal migration runner: applies any .sql file in db/migrations/ that
// isn't already recorded in the schema_migrations table, in filename order,
// each inside its own transaction. Replaces Prisma Migrate.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate(pool) {
  const ownPool = !pool;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
    });
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const { rows } = await pool.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      } finally {
        client.release();
      }
    }
  } finally {
    if (ownPool) await pool.end();
  }
}

/** Drops and recreates the public schema, then reapplies every migration. Used by tests and `db:reset`. */
async function reset() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);
  } finally {
    await pool.end();
  }
}

module.exports = { migrate, reset };

if (require.main === module) {
  const shouldReset = process.argv.includes('--reset');
  (shouldReset ? reset() : migrate())
    .then(() => {
      console.log(shouldReset ? '[migrate] reset and reapplied' : '[migrate] up to date');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
