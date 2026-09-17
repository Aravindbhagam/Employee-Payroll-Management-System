from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ..db import query
from ..db_columns import SALARY_STRUCTURE_COLS
from ..errors import ApiError
from ..param_builder import ParamBuilder
from ..rbac import authorize
from ..utils.audit import record_audit
from ..utils.id import new_id
from ..utils.scope import employee_scope_filter
from ..utils.time import now_utc

router = APIRouter()

SALARY_JOIN_SELECT = """
  SELECT s.id, s.employee_id AS "employeeId", s.basic, s.hra, s.conveyance, s.medical,
    s.special_allowance AS "specialAllowance", s.other_allowances AS "otherAllowances",
    s.provident_fund AS "providentFund", s.professional_tax AS "professionalTax",
    s.income_tax AS "incomeTax", s.other_deductions AS "otherDeductions", s.ctc,
    s.effective_from AS "effectiveFrom", s.is_active AS "isActive", s.created_at AS "createdAt",
    e.first_name AS "e_firstName", e.last_name AS "e_lastName"
  FROM salary_structures s
  JOIN employees e ON e.id = s.employee_id
"""


def map_salary_row(row):
    return {
        "id": row["id"],
        "employeeId": row["employeeId"],
        "basic": row["basic"],
        "hra": row["hra"],
        "conveyance": row["conveyance"],
        "medical": row["medical"],
        "specialAllowance": row["specialAllowance"],
        "otherAllowances": row["otherAllowances"],
        "providentFund": row["providentFund"],
        "professionalTax": row["professionalTax"],
        "incomeTax": row["incomeTax"],
        "otherDeductions": row["otherDeductions"],
        "ctc": row["ctc"],
        "effectiveFrom": row["effectiveFrom"],
        "isActive": row["isActive"],
        "createdAt": row["createdAt"],
        "employee": {"firstName": row["e_firstName"], "lastName": row["e_lastName"], "id": row["employeeId"]},
    }


@router.get("")
def list_salary_structures(request: Request, employeeId: Optional[str] = None, user: dict = Depends(authorize("SALARY_STRUCTURE", "VIEW"))):
    scope = employee_scope_filter(user)
    pb = ParamBuilder()
    conditions = []

    if scope is not None:
        if employeeId:
            if employeeId not in scope["in"]:
                raise ApiError(403, "You don't have permission to view this employee's salary.")
            conditions.append(f"s.employee_id = {pb.add(employeeId)}")
        elif len(scope["in"]) == 0:
            conditions.append("FALSE")
        else:
            conditions.append(f's.employee_id = ANY({pb.add(scope["in"])})')
    elif employeeId:
        conditions.append(f"s.employee_id = {pb.add(employeeId)}")

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = query(f"{SALARY_JOIN_SELECT} {where_sql} ORDER BY s.effective_from DESC", pb.params).rows
    return {"salaryStructures": [map_salary_row(r) for r in rows]}


class SalaryStructureBody(BaseModel):
    employeeId: str
    basic: float = Field(ge=0)
    hra: float = Field(default=0, ge=0)
    conveyance: float = Field(default=0, ge=0)
    medical: float = Field(default=0, ge=0)
    specialAllowance: float = Field(default=0, ge=0)
    otherAllowances: float = Field(default=0, ge=0)
    providentFund: float = Field(default=0, ge=0)
    professionalTax: float = Field(default=0, ge=0)
    incomeTax: float = Field(default=0, ge=0)
    otherDeductions: float = Field(default=0, ge=0)
    effectiveFrom: Optional[str] = None


def compute_ctc(d):
    return d["basic"] + d["hra"] + d["conveyance"] + d["medical"] + d["specialAllowance"] + d["otherAllowances"]


@router.post("", status_code=201)
def create_salary_structure(request: Request, body: SalaryStructureBody, user: dict = Depends(authorize("SALARY_STRUCTURE", "CREATE"))):
    data = body.model_dump()
    ctc = compute_ctc(data)

    query("UPDATE salary_structures SET is_active = false WHERE employee_id = %s AND is_active = true", (data["employeeId"],))

    struct_id = new_id()
    query(
        """
        INSERT INTO salary_structures (id, employee_id, basic, hra, conveyance, medical, special_allowance, other_allowances, provident_fund, professional_tax, income_tax, other_deductions, ctc, effective_from, is_active)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, true)
        """,
        (
            struct_id,
            data["employeeId"],
            data["basic"],
            data["hra"],
            data["conveyance"],
            data["medical"],
            data["specialAllowance"],
            data["otherAllowances"],
            data["providentFund"],
            data["professionalTax"],
            data["incomeTax"],
            data["otherDeductions"],
            ctc,
            data["effectiveFrom"] or now_utc(),
        ),
    )

    structure = query(f"SELECT {SALARY_STRUCTURE_COLS} FROM salary_structures WHERE id = %s", (struct_id,)).rows[0]
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="SALARY_STRUCTURE_CREATED", entity_type="SalaryStructure", entity_id=structure["id"], new_value=data)
    return {"salaryStructure": structure}


SALARY_FIELD_TO_COLUMN = {
    "basic": "basic",
    "hra": "hra",
    "conveyance": "conveyance",
    "medical": "medical",
    "specialAllowance": "special_allowance",
    "otherAllowances": "other_allowances",
    "providentFund": "provident_fund",
    "professionalTax": "professional_tax",
    "incomeTax": "income_tax",
    "otherDeductions": "other_deductions",
}


class UpdateSalaryStructureBody(BaseModel):
    employeeId: Optional[str] = None
    basic: Optional[float] = Field(default=None, ge=0)
    hra: Optional[float] = Field(default=None, ge=0)
    conveyance: Optional[float] = Field(default=None, ge=0)
    medical: Optional[float] = Field(default=None, ge=0)
    specialAllowance: Optional[float] = Field(default=None, ge=0)
    otherAllowances: Optional[float] = Field(default=None, ge=0)
    providentFund: Optional[float] = Field(default=None, ge=0)
    professionalTax: Optional[float] = Field(default=None, ge=0)
    incomeTax: Optional[float] = Field(default=None, ge=0)
    otherDeductions: Optional[float] = Field(default=None, ge=0)
    effectiveFrom: Optional[str] = None


@router.put("/{structure_id}")
def update_salary_structure(structure_id: str, request: Request, body: UpdateSalaryStructureBody, user: dict = Depends(authorize("SALARY_STRUCTURE", "EDIT"))):
    existing_rows = query(f"SELECT {SALARY_STRUCTURE_COLS} FROM salary_structures WHERE id = %s", (structure_id,)).rows
    if not existing_rows:
        raise ApiError(404, "Salary structure not found.")
    existing = existing_rows[0]
    data = body.model_dump(exclude_unset=True)
    merged = {**existing, **data}
    ctc = compute_ctc(merged)

    pb = ParamBuilder()
    set_clauses = []
    for key, value in data.items():
        column = SALARY_FIELD_TO_COLUMN.get(key)
        if not column:
            continue
        set_clauses.append(f"{column} = {pb.add(value)}")
    set_clauses.append(f"ctc = {pb.add(ctc)}")

    structure = query(f"UPDATE salary_structures SET {', '.join(set_clauses)} WHERE id = {pb.add(structure_id)} RETURNING {SALARY_STRUCTURE_COLS}", pb.params).rows[0]
    record_audit(
        request=request,
        user_id=user["id"],
        user_name=user["email"],
        action="SALARY_STRUCTURE_UPDATED",
        entity_type="SalaryStructure",
        entity_id=structure["id"],
        previous_value=existing,
        new_value=data,
    )
    return {"salaryStructure": structure}
