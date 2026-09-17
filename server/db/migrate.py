"""Minimal migration runner: applies any .sql file in db/migrations/ that
isn't already recorded in the schema_migrations table, in filename order,
each inside its own transaction."""
import os
import sys

import psycopg2

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "migrations")


def _connect(dsn=None):
    dsn = dsn or os.environ["DATABASE_URL"]
    sslmode = "disable" if os.environ.get("PGSSL") == "false" else "require"
    return psycopg2.connect(dsn, sslmode=sslmode)


def migrate(conn=None):
    own_conn = conn is None
    conn = conn or _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    name TEXT PRIMARY KEY,
                    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.commit()
            cur.execute("SELECT name FROM schema_migrations")
            applied = {row[0] for row in cur.fetchall()}

        files = sorted(f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql"))
        for file in files:
            if file in applied:
                continue
            with open(os.path.join(MIGRATIONS_DIR, file)) as fh:
                sql = fh.read()
            try:
                with conn.cursor() as cur:
                    cur.execute(sql)
                    cur.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (file,))
                conn.commit()
                print(f"[migrate] applied {file}")
            except Exception as err:
                conn.rollback()
                raise RuntimeError(f"Migration {file} failed: {err}") from err
    finally:
        if own_conn:
            conn.close()


def reset():
    """Drops and recreates the public schema, then reapplies every migration."""
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        conn.commit()
        migrate(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    should_reset = "--reset" in sys.argv
    try:
        reset() if should_reset else migrate()
        print("[migrate] reset and reapplied" if should_reset else "[migrate] up to date")
    except Exception as err:
        print(err, file=sys.stderr)
        sys.exit(1)
