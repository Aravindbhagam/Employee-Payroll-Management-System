import base64
import io

import pyotp
import qrcode
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from ..config import env
from ..db import query
from ..db_columns import COMPANY_SETTINGS_COLS, DEPARTMENT_COLS, EMPLOYEE_COLS, USER_COLS
from ..deps import get_current_user
from ..errors import ApiError
from ..logger import logger
from ..rate_limit import AUTH_RATE_LIMIT, limiter
from ..rbac import get_effective_permissions
from ..utils.audit import record_audit
from ..utils.email import send_password_reset_email
from ..utils.id import new_id
from ..utils.jwt_utils import sign_access_token, sign_refresh_token, sign_temp_token, verify_refresh_token, verify_temp_token
from ..utils.password import compare_password, hash_password, hash_token, is_password_strong, random_token
from ..utils.time import future, now_utc

router = APIRouter()

REFRESH_COOKIE = "refreshToken"


def _cookie_kwargs():
    if env.is_production:
        return dict(httponly=True, secure=True, samesite="none", path="/api/auth")
    return dict(httponly=True, secure=False, samesite="lax", path="/api/auth")


def set_refresh_cookie(response: Response, token, days):
    response.set_cookie(REFRESH_COOKIE, token, max_age=days * 24 * 60 * 60, **_cookie_kwargs())


def permissions_map_to_object(perm_map):
    obj = {}
    for key, allowed in perm_map.items():
        if not allowed:
            continue
        resource, action = key.split(":")
        obj.setdefault(resource, []).append(action)
    return obj


def find_user_by_email_or_code(identifier):
    rows = query(
        f'SELECT {USER_COLS} FROM users WHERE email = %s OR employee_code = %s LIMIT 1',
        (identifier.lower(), identifier),
    ).rows
    return rows[0] if rows else None


def find_user_by_id(user_id):
    rows = query(f'SELECT {USER_COLS} FROM users WHERE id = %s', (user_id,)).rows
    return rows[0] if rows else None


def build_user_response(user_id):
    user = find_user_by_id(user_id)
    if not user:
        return None

    department = None
    if user["departmentId"]:
        rows = query(f'SELECT {DEPARTMENT_COLS} FROM departments WHERE id = %s', (user["departmentId"],)).rows
        department = rows[0] if rows else None
    emp_rows = query(f'SELECT {EMPLOYEE_COLS} FROM employees WHERE user_id = %s', (user_id,)).rows
    employee = emp_rows[0] if emp_rows else None

    perm_map = get_effective_permissions(user["id"], user["role"])
    return {
        "id": user["id"],
        "employeeCode": user["employeeCode"],
        "email": user["email"],
        "role": user["role"],
        "status": user["status"],
        "department": {"id": department["id"], "name": department["name"]} if department else None,
        "managerId": user["managerId"],
        "twoFactorEnabled": user["twoFactorEnabled"],
        "mustChangePassword": user["mustChangePassword"],
        "lastLoginAt": user["lastLoginAt"],
        "profile": (
            {
                "firstName": employee["firstName"],
                "lastName": employee["lastName"],
                "photoUrl": employee["photoUrl"],
                "designationId": employee["designationId"],
            }
            if employee
            else None
        ),
        "permissions": permissions_map_to_object(perm_map),
    }


def complete_login(request: Request, response: Response, user_id, remember_me):
    user = find_user_by_id(user_id)
    if not user:
        raise ApiError(404, "User not found.")

    days = env.refresh_token_ttl_days_remember if remember_me else env.refresh_token_ttl_days
    expires_at = future(days=days)

    session_id = new_id()
    query(
        """
        INSERT INTO sessions (id, user_id, token_hash, user_agent, ip, remember_me, expires_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (session_id, user["id"], "", request.headers.get("user-agent"), request.client.host if request.client else None, remember_me, expires_at),
    )

    refresh_token = sign_refresh_token({"sub": user["id"], "sessionId": session_id}, days)
    query("UPDATE sessions SET token_hash = %s WHERE id = %s", (hash_token(refresh_token), session_id))

    access_token = sign_access_token({"sub": user["id"], "role": user["role"], "sessionId": session_id})

    query(
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = %s, last_login_ip = %s WHERE id = %s",
        (now_utc(), request.client.host if request.client else None, user["id"]),
    )

    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="LOGIN_SUCCESS", entity_type="User", entity_id=user["id"])

    set_refresh_cookie(response, refresh_token, days)
    return {"accessToken": access_token, "user": build_user_response(user["id"])}


class LoginBody(BaseModel):
    identifier: str = Field(min_length=1)
    password: str = Field(min_length=1)
    rememberMe: bool = False


@router.post("/login")
@limiter.limit(AUTH_RATE_LIMIT)
def login(request: Request, response: Response, body: LoginBody):
    user = find_user_by_email_or_code(body.identifier)
    settings_rows = query(f"SELECT {COMPANY_SETTINGS_COLS} FROM company_settings WHERE id = 'singleton'").rows
    settings = settings_rows[0] if settings_rows else None
    max_attempts = (settings or {}).get("maxFailedLoginAttempts", 5) or 5
    lockout_minutes = (settings or {}).get("lockoutMinutes", 15) or 15

    if not user:
        raise ApiError(401, "Invalid credentials.")

    if user["lockedUntil"] and user["lockedUntil"] > now_utc():
        minutes_left = max(1, int((user["lockedUntil"] - now_utc()).total_seconds() // 60) + 1)
        raise ApiError(423, f"Account locked due to repeated failed attempts. Try again in {minutes_left} minute(s).")

    if user["status"] != "ACTIVE":
        raise ApiError(403, "This account is inactive. Please contact your administrator.")

    if not compare_password(body.password, user["passwordHash"]):
        attempts = user["failedLoginAttempts"] + 1
        locked = attempts >= max_attempts
        query(
            "UPDATE users SET failed_login_attempts = %s, locked_until = %s WHERE id = %s",
            (0 if locked else attempts, future(minutes=lockout_minutes) if locked else None, user["id"]),
        )
        record_audit(
            request=request,
            user_id=user["id"],
            user_name=user["email"],
            action="LOGIN_LOCKED" if locked else "LOGIN_FAILED",
            entity_type="User",
            entity_id=user["id"],
        )
        if locked:
            raise ApiError(423, f"Too many failed attempts. Account locked for {lockout_minutes} minutes.")
        raise ApiError(401, "Invalid credentials.", extra={"attemptsRemaining": max(max_attempts - attempts, 0)})

    if user["twoFactorEnabled"]:
        temp_token = sign_temp_token({"sub": user["id"], "purpose": "2fa", "rememberMe": body.rememberMe}, minutes=5)
        return {"requiresTwoFactor": True, "tempToken": temp_token}

    return complete_login(request, response, user["id"], body.rememberMe)


class TwoFactorBody(BaseModel):
    tempToken: str
    code: str = Field(min_length=6, max_length=6)


@router.post("/2fa/verify")
@limiter.limit(AUTH_RATE_LIMIT)
def verify_two_factor(request: Request, response: Response, body: TwoFactorBody):
    try:
        payload = verify_temp_token(body.tempToken)
    except Exception:
        raise ApiError(401, "Two-factor session expired. Please log in again.")
    if payload.get("purpose") != "2fa":
        raise ApiError(400, "Invalid token.")

    user = find_user_by_id(payload["sub"])
    if not user or not user["twoFactorSecret"]:
        raise ApiError(400, "Two-factor authentication is not set up.")

    valid = pyotp.TOTP(user["twoFactorSecret"]).verify(body.code, valid_window=1)
    if not valid:
        record_audit(request=request, user_id=user["id"], user_name=user["email"], action="LOGIN_2FA_FAILED", entity_type="User", entity_id=user["id"])
        raise ApiError(401, "Invalid verification code.")

    return complete_login(request, response, user["id"], bool(payload.get("rememberMe")))


@router.post("/refresh")
def refresh(request: Request, response: Response):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise ApiError(401, "No refresh token provided.")

    try:
        payload = verify_refresh_token(token)
    except Exception:
        raise ApiError(401, "Refresh token invalid or expired.")

    rows = query('SELECT id, revoked, expires_at AS "expiresAt", token_hash AS "tokenHash" FROM sessions WHERE id = %s', (payload["sessionId"],)).rows
    session = rows[0] if rows else None
    if not session or session["revoked"] or session["expiresAt"] < now_utc() or session["tokenHash"] != hash_token(token):
        raise ApiError(401, "Session expired. Please log in again.")

    user = find_user_by_id(payload["sub"])
    if not user or user["status"] != "ACTIVE":
        raise ApiError(401, "Account is not active.")

    access_token = sign_access_token({"sub": user["id"], "role": user["role"], "sessionId": session["id"]})
    return {"accessToken": access_token, "user": build_user_response(user["id"])}


@router.post("/logout")
def logout(request: Request, response: Response, user: dict = Depends(get_current_user)):
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        try:
            payload = verify_refresh_token(token)
            query("UPDATE sessions SET revoked = true WHERE id = %s", (payload["sessionId"],))
            record_audit(request=request, user_id=user["id"], user_name=user["email"], action="LOGOUT", entity_type="User", entity_id=user["id"])
        except Exception:
            pass  # ignore invalid token on logout
    response.delete_cookie(REFRESH_COOKIE, **_cookie_kwargs())
    return {"success": True}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return {"user": build_user_response(user["id"])}


class ForgotBody(BaseModel):
    identifier: str = Field(min_length=1)


@router.post("/forgot-password")
@limiter.limit(AUTH_RATE_LIMIT)
def forgot_password(request: Request, body: ForgotBody):
    user = find_user_by_email_or_code(body.identifier)

    # Always respond with success to avoid leaking which accounts exist.
    if not user:
        return {"success": True, "message": "If an account exists, password reset instructions have been sent."}

    token = random_token(24)
    query("UPDATE users SET reset_token = %s, reset_token_expires = %s WHERE id = %s", (hash_token(token), future(hours=1), user["id"]))

    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="PASSWORD_RESET_REQUESTED", entity_type="User", entity_id=user["id"])

    # The token must never be returned in the API response in production,
    # since that would let anyone who can call this endpoint reset any
    # account's password without proving ownership of the email address.
    # send_password_reset_email sends it via Resend when RESEND_API_KEY is
    # configured, or logs it server-side otherwise; a failure here must not
    # break this response or reveal whether the email send succeeded.
    try:
        send_password_reset_email(user["email"], token)
    except Exception as err:
        logger.error(f"Failed to send password reset email userId={user['id']}: {err}")

    body_out = {"success": True, "message": "If an account exists, password reset instructions have been sent."}
    if not env.is_production:
        body_out["devResetToken"] = token
    return body_out


class ResetBody(BaseModel):
    token: str
    newPassword: str


@router.post("/reset-password")
@limiter.limit(AUTH_RATE_LIMIT)
def reset_password(request: Request, body: ResetBody):
    strength = is_password_strong(body.newPassword)
    if not strength["ok"]:
        raise ApiError(400, strength["message"])

    token_hash = hash_token(body.token)
    rows = query(f'SELECT {USER_COLS} FROM users WHERE reset_token = %s AND reset_token_expires > %s', (token_hash, now_utc())).rows
    user = rows[0] if rows else None
    if not user:
        raise ApiError(400, "Reset link is invalid or has expired.")

    password_hash = hash_password(body.newPassword)
    query(
        """
        UPDATE users SET password_hash = %s, reset_token = NULL, reset_token_expires = NULL,
          must_change_password = false, failed_login_attempts = 0, locked_until = NULL WHERE id = %s
        """,
        (password_hash, user["id"]),
    )
    query("UPDATE sessions SET revoked = true WHERE user_id = %s", (user["id"],))

    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="PASSWORD_RESET_COMPLETED", entity_type="User", entity_id=user["id"])
    return {"success": True, "message": "Password has been reset. Please log in with your new password."}


class ChangePasswordBody(BaseModel):
    currentPassword: str
    newPassword: str


@router.post("/change-password")
def change_password(request: Request, body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    strength = is_password_strong(body.newPassword)
    if not strength["ok"]:
        raise ApiError(400, strength["message"])

    db_user = find_user_by_id(user["id"])
    if not db_user:
        raise ApiError(404, "User not found.")

    if not compare_password(body.currentPassword, db_user["passwordHash"]):
        raise ApiError(401, "Current password is incorrect.")

    password_hash = hash_password(body.newPassword)
    query("UPDATE users SET password_hash = %s, must_change_password = false WHERE id = %s", (password_hash, db_user["id"]))
    record_audit(request=request, user_id=db_user["id"], user_name=db_user["email"], action="PASSWORD_CHANGED", entity_type="User", entity_id=db_user["id"])
    return {"success": True, "message": "Password updated successfully."}


@router.post("/2fa/setup")
def setup_two_factor(user: dict = Depends(get_current_user)):
    secret = pyotp.random_base32()
    otpauth = pyotp.totp.TOTP(secret).provisioning_uri(name=user["email"], issuer_name="PayrollPro")

    img = qrcode.make(otpauth)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_code_data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

    query("UPDATE users SET two_factor_secret = %s WHERE id = %s", (secret, user["id"]))
    return {"secret": secret, "qrCodeDataUrl": qr_code_data_url}


class EnableTwoFactorBody(BaseModel):
    code: str = Field(min_length=6, max_length=6)


@router.post("/2fa/enable")
def enable_two_factor(request: Request, body: EnableTwoFactorBody, user: dict = Depends(get_current_user)):
    db_user = find_user_by_id(user["id"])
    if not db_user or not db_user["twoFactorSecret"]:
        raise ApiError(400, "Two-factor setup has not been initiated.")

    valid = pyotp.TOTP(db_user["twoFactorSecret"]).verify(body.code, valid_window=1)
    if not valid:
        raise ApiError(400, "Invalid verification code.")

    query("UPDATE users SET two_factor_enabled = true WHERE id = %s", (db_user["id"],))
    record_audit(request=request, user_id=db_user["id"], user_name=db_user["email"], action="TWO_FACTOR_ENABLED", entity_type="User", entity_id=db_user["id"])
    return {"success": True, "message": "Two-factor authentication enabled."}


@router.post("/2fa/disable")
def disable_two_factor(request: Request, user: dict = Depends(get_current_user)):
    query("UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL WHERE id = %s", (user["id"],))
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="TWO_FACTOR_DISABLED", entity_type="User", entity_id=user["id"])
    return {"success": True, "message": "Two-factor authentication disabled."}
