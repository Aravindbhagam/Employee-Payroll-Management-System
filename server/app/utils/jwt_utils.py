from datetime import timedelta

import jwt

from ..config import env


def sign_access_token(payload):
    return jwt.encode(
        {**payload, "exp": _expiry(minutes=env.access_token_ttl_min)},
        env.jwt_access_secret,
        algorithm="HS256",
    )


def verify_access_token(token):
    return jwt.decode(token, env.jwt_access_secret, algorithms=["HS256"])


def sign_refresh_token(payload, days):
    return jwt.encode({**payload, "exp": _expiry(days=days)}, env.jwt_refresh_secret, algorithm="HS256")


def verify_refresh_token(token):
    return jwt.decode(token, env.jwt_refresh_secret, algorithms=["HS256"])


def sign_temp_token(payload, minutes):
    return jwt.encode({**payload, "exp": _expiry(minutes=minutes)}, env.jwt_access_secret, algorithm="HS256")


def verify_temp_token(token):
    return jwt.decode(token, env.jwt_access_secret, algorithms=["HS256"])


def _expiry(**kwargs):
    from datetime import datetime, timezone

    return datetime.now(timezone.utc) + timedelta(**kwargs)
