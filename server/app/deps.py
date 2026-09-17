from fastapi import Request

from .db import query
from .db_columns import SESSION_COLS, USER_COLS
from .errors import ApiError
from .utils.jwt_utils import verify_access_token
from .utils.time import now_utc


def get_current_user(request: Request):
    header = request.headers.get("authorization")
    if not header or not header.startswith("Bearer "):
        raise ApiError(401, "Authentication required.")
    token = header[len("Bearer ") :]

    try:
        payload = verify_access_token(token)
    except Exception:
        raise ApiError(401, "Invalid or expired token.")

    try:
        session_rows = query(f'SELECT {SESSION_COLS} FROM sessions WHERE id = %s', (payload["sessionId"],)).rows
        session = session_rows[0] if session_rows else None
        if not session or session["revoked"] or session["expiresAt"] < now_utc():
            raise ApiError(401, "Session expired. Please log in again.")

        user_rows = query(f'SELECT {USER_COLS} FROM users WHERE id = %s', (payload["sub"],)).rows
        user = user_rows[0] if user_rows else None
        if not user or user["status"] != "ACTIVE":
            raise ApiError(401, "Account is not active.")
    except ApiError:
        raise
    except Exception:
        raise ApiError(401, "Invalid or expired token.")

    return {
        "id": user["id"],
        "role": user["role"],
        "employeeCode": user["employeeCode"],
        "email": user["email"],
        "departmentId": user["departmentId"],
        "managerId": user["managerId"],
        "sessionId": session["id"],
    }
