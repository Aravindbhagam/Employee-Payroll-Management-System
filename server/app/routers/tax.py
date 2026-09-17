from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ..db import query
from ..db_columns import COMPANY_SETTINGS_COLS, PAYROLL_RUN_COLS
from ..rbac import authorize
from ..utils.audit import record_audit
from ..param_builder import ParamBuilder

router = APIRouter()


def get_or_create_settings():
    query("INSERT INTO company_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING")
    return query(f"SELECT {COMPANY_SETTINGS_COLS} FROM company_settings WHERE id = 'singleton'").rows[0]


@router.get("")
def get_tax_settings(user: dict = Depends(authorize("TAX_COMPLIANCE", "VIEW"))):
    settings = get_or_create_settings()
    rows = query(f"SELECT {PAYROLL_RUN_COLS} FROM payroll_runs WHERE status = 'COMPLETED' ORDER BY created_at DESC LIMIT 12").rows
    return {
        "rates": {
            "providentFundRate": settings["defaultProvidentFundRate"],
            "professionalTax": settings["defaultProfessionalTax"],
            "incomeTaxRate": settings["defaultIncomeTaxRate"],
        },
        "statutoryDeductionHistory": [{"period": r["period"], "totalDeductions": r["totalDeductions"]} for r in rows],
    }


class UpdateTaxSettingsBody(BaseModel):
    providentFundRate: Optional[float] = Field(default=None, ge=0, le=100)
    professionalTax: Optional[float] = Field(default=None, ge=0)
    incomeTaxRate: Optional[float] = Field(default=None, ge=0, le=100)


@router.put("")
def update_tax_settings(request: Request, body: UpdateTaxSettingsBody, user: dict = Depends(authorize("TAX_COMPLIANCE", "EDIT"))):
    data = body.model_dump(exclude_unset=True)
    get_or_create_settings()

    pb = ParamBuilder()
    set_clauses = []
    if data.get("providentFundRate") is not None:
        set_clauses.append(f"default_provident_fund_rate = {pb.add(data['providentFundRate'])}")
    if data.get("professionalTax") is not None:
        set_clauses.append(f"default_professional_tax = {pb.add(data['professionalTax'])}")
    if data.get("incomeTaxRate") is not None:
        set_clauses.append(f"default_income_tax_rate = {pb.add(data['incomeTaxRate'])}")

    if set_clauses:
        settings = query(f"UPDATE company_settings SET {', '.join(set_clauses)} WHERE id = 'singleton' RETURNING {COMPANY_SETTINGS_COLS}", pb.params).rows[0]
    else:
        settings = get_or_create_settings()

    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="SETTINGS_CHANGED", entity_type="TaxCompliance", new_value=data)
    return {"settings": settings}
