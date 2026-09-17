import os

from dotenv import load_dotenv

load_dotenv()


def _required(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


class _Env:
    """Mirrors the old Node config/env.js: nodeEnv/is_production are
    properties (not snapshotted at import time) so behavior stays correct
    if NODE_ENV/ENV changes after this module first loads -- relevant in
    tests, and simply more correct than caching a value that can go stale.
    """

    def __init__(self):
        self.port = int(os.environ.get("PORT", "4000"))
        # CLIENT_ORIGIN accepts a comma-separated list so the same deployment
        # can allow both a local dev origin and a deployed frontend (e.g.
        # GitHub Pages).
        self.client_origins = [
            o.strip()
            for o in os.environ.get("CLIENT_ORIGIN", "http://localhost:5173").split(",")
            if o.strip()
        ]
        self.database_url = _required("DATABASE_URL")
        self.jwt_access_secret = _required("JWT_ACCESS_SECRET")
        self.jwt_refresh_secret = _required("JWT_REFRESH_SECRET")
        self.access_token_ttl_min = int(os.environ.get("ACCESS_TOKEN_TTL_MIN", "15"))
        self.refresh_token_ttl_days = int(os.environ.get("REFRESH_TOKEN_TTL_DAYS", "7"))
        self.refresh_token_ttl_days_remember = int(os.environ.get("REFRESH_TOKEN_TTL_DAYS_REMEMBER", "30"))

    @property
    def node_env(self):
        return os.environ.get("NODE_ENV", "development")

    @property
    def is_production(self):
        return os.environ.get("NODE_ENV") == "production"


env = _Env()
