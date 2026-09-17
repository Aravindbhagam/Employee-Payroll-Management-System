"""Thin wrapper around psycopg2. Every query in this app is a parameterized
SQL string built and reviewed by hand (never string-concatenated user input)
rather than a generated query builder."""
import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
import psycopg2.pool

from .config import env

# Render's managed Postgres requires TLS for external connections but uses a
# certificate that isn't in Python's default trust store; local Postgres has
# no TLS at all. PGSSL=false (set for local dev/tests) disables it outright.
_sslmode = "disable" if os.environ.get("PGSSL") == "false" else "require"

_pool = psycopg2.pool.ThreadedConnectionPool(
    1, 20, dsn=env.database_url, sslmode=_sslmode, cursor_factory=psycopg2.extras.RealDictCursor
)


class Result:
    __slots__ = ("rows",)

    def __init__(self, rows):
        self.rows = rows


def query(text, params=None):
    """Runs a single parameterized query against the pool."""
    conn = _pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(text, params)
            if cur.description is None:
                conn.commit()
                return Result([])
            rows = cur.fetchall()
            conn.commit()
            return Result([dict(r) for r in rows])
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


class _TxClient:
    """Passed into with_transaction's fn; every query it makes shares the
    same connection/transaction (mirrors the Node `client` passed to
    withTransaction's callback)."""

    def __init__(self, conn):
        self._conn = conn

    def query(self, text, params=None):
        with self._conn.cursor() as cur:
            cur.execute(text, params)
            if cur.description is None:
                return Result([])
            return Result([dict(r) for r in cur.fetchall()])


@contextmanager
def _borrowed_connection():
    conn = _pool.getconn()
    try:
        yield conn
    finally:
        _pool.putconn(conn)


def with_transaction(fn):
    """Runs fn(client) inside a transaction, rolling back on any raised
    exception and committing otherwise."""
    with _borrowed_connection() as conn:
        try:
            result = fn(_TxClient(conn))
            conn.commit()
            return result
        except Exception:
            conn.rollback()
            raise


def close_pool():
    _pool.closeall()
