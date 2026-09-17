from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ..db import query
from ..db_columns import COMPANY_SETTINGS_COLS
from ..param_builder import ParamBuilder
from ..rbac import authorize
from ..utils.audit import record_audit

router = APIRouter()

SETTINGS_FIELD_TO_COLUMN = {
    "companyName": "company_name",
    "logoUrl": "logo_url",
    "address": "address",
    "currency": "currency",
    "fiscalYearStart": "fiscal_year_start",
    "sessionTimeoutMinutes": "session_timeout_minutes",
    "passwordMinLength": "password_min_length",
    "maxFailedLoginAttempts": "max_failed_login_attempts",
    "lockoutMinutes": "lockout_minutes",
    "twoFactorRequired": "two_factor_required",
}


def get_or_create_settings():
    query("INSERT INTO company_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING")
    return query(f"SELECT {COMPANY_SETTINGS_COLS} FROM company_settings WHERE id = 'singleton'").rows[0]


@router.get("")
def get_settings(user: dict = Depends(authorize("SETTINGS", "VIEW"))):
    return {"settings": get_or_create_settings()}


class UpdateSettingsBody(BaseModel):
    companyName: Optional[str] = Field(default=None, min_length=1)
    logoUrl: Optional[str] = None
    address: Optional[str] = None
    currency: Optional[str] = None
    fiscalYearStart: Optional[str] = None
    sessionTimeoutMinutes: Optional[int] = Field(default=None, ge=5, le=240)
    passwordMinLength: Optional[int] = Field(default=None, ge=6, le=32)
    maxFailedLoginAttempts: Optional[int] = Field(default=None, ge=3, le=10)
    lockoutMinutes: Optional[int] = Field(default=None, ge=5, le=120)
    twoFactorRequired: Optional[bool] = None


@router.put("")
def update_settings(request: Request, body: UpdateSettingsBody, user: dict = Depends(authorize("SETTINGS", "MANAGE"))):
    data = body.model_dump(exclude_unset=True)
    previous = get_or_create_settings()

    pb = ParamBuilder()
    set_clauses = []
    for key, value in data.items():
        column = SETTINGS_FIELD_TO_COLUMN.get(key)
        if not column:
            continue
        set_clauses.append(f"{column} = {pb.add(value)}")

    if set_clauses:
        settings = query(f"UPDATE company_settings SET {', '.join(set_clauses)} WHERE id = 'singleton' RETURNING {COMPANY_SETTINGS_COLS}", pb.params).rows[0]
    else:
        settings = previous

    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="SETTINGS_CHANGED", entity_type="CompanySettings", entity_id="singleton", previous_value=previous, new_value=data)
    return {"settings": settings}
