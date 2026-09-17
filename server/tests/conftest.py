# Runs before any test module is imported, so it must set a hermetic
# environment (DATABASE_URL etc.) before app.config or app.db are imported
# anywhere -- those read process.env at import time.
import os

os.environ["NODE_ENV"] = "test"
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:localdevpassword@localhost:5432/payrollpro_test")
os.environ["PGSSL"] = "false"
os.environ["JWT_ACCESS_SECRET"] = "test-access-secret-do-not-use-in-prod"
os.environ["JWT_REFRESH_SECRET"] = "test-refresh-secret-do-not-use-in-prod"
os.environ["ACCESS_TOKEN_TTL_MIN"] = "15"
os.environ["REFRESH_TOKEN_TTL_DAYS"] = "7"
os.environ["REFRESH_TOKEN_TTL_DAYS_REMEMBER"] = "30"
os.environ["CLIENT_ORIGIN"] = "http://localhost:5173"

import sys  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "db"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from migrate import reset  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _reset_schema():
    """Start every test run from a clean schema -- the Postgres-native
    equivalent of vitest's globalSetup.ts."""
    reset()
    yield


@pytest.fixture()
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c
