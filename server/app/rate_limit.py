from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from .config import env

# Disabled under pytest: the test suite reuses one FastAPI app (and so one
# limiter store) across hundreds of logins from many unrelated test cases,
# which would trip the limiter on test order/count rather than on any real
# abuse pattern being tested.
limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"], enabled=env.node_env != "test")

# Applied via @auth_rate_limit on individual auth routes (login, 2fa/verify,
# forgot-password, reset-password) -- stricter than the 300/minute default.
AUTH_RATE_LIMIT = "30/15minutes"


def setup_rate_limiting(app):
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
