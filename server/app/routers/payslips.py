import json
from typing import Optional

from fastapi import APIRouter, Depends, Request

from ..db import query
from ..errors import ApiError
from ..param_builder import ParamBuilder
from ..rbac import authorize
from ..utils.scope import employee_scope_filter

router = APIRouter()

PAYSLIP_LIST_SELECT = """
  SELECT p.id, p.payroll_run_id AS "payrollRunId", p.employee_id AS "employeeId", p.period,
    p.gross, p.deductions, p.net, p.breakdown, p.generated_at AS "generatedAt",
    e.first_name AS "e_firstName", e.last_name AS "e_lastName",
    r.status AS "r_status", r.period AS "r_period"
  FROM payslips p
  JOIN employees e ON e.id = p.employee_id
  JOIN payroll_runs r ON r.id = p.payroll_run_id
"""


def map_payslip_list_row(row):
    return {
        "id": row["id"],
        "payrollRunId": row["payrollRunId"],
        "employeeId": row["employeeId"],
        "period": row["period"],
        "gross": row["gross"],
        "deductions": row["deductions"],
        "net": row["net"],
        "breakdown": row["breakdown"],
        "generatedAt": row["generatedAt"],
        "employee": {"firstName": row["e_firstName"], "lastName": row["e_lastName"], "id": row["employeeId"]},
        "payrollRun": {"status": row["r_status"], "period": row["r_period"]},
    }


@router.get("")
def list_payslips(employeeId: Optional[str] = None, user: dict = Depends(authorize("PAYSLIPS", "VIEW"))):
    scope = employee_scope_filter(user)
    pb = ParamBuilder()
    conditions = []

    if scope is not None:
        if employeeId:
            if employeeId not in scope["in"]:
                raise ApiError(403, "You don't have permission to view this employee's payslips.")
            conditions.append(f"p.employee_id = {pb.add(employeeId)}")
        elif len(scope["in"]) == 0:
            conditions.append("FALSE")
        else:
            conditions.append(f'p.employee_id = ANY({pb.add(scope["in"])})')
    elif employeeId:
        conditions.append(f"p.employee_id = {pb.add(employeeId)}")

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = query(f"{PAYSLIP_LIST_SELECT} {where_sql} ORDER BY p.generated_at DESC", pb.params).rows
    return {"payslips": [map_payslip_list_row(r) for r in rows]}


@router.get("/{payslip_id}")
def get_payslip(payslip_id: str, user: dict = Depends(authorize("PAYSLIPS", "VIEW"))):
    rows = query(
        """
        SELECT id, payroll_run_id AS "payrollRunId", employee_id AS "employeeId", period,
          gross, deductions, net, breakdown, generated_at AS "generatedAt"
        FROM payslips WHERE id = %s
        """,
        (payslip_id,),
    ).rows
    if not rows:
        raise ApiError(404, "Payslip not found.")
    payslip = rows[0]

    scope = employee_scope_filter(user)
    if scope is not None and payslip["employeeId"] not in scope["in"]:
        raise ApiError(403, "You don't have permission to view this payslip.")

    emp_rows = query(
        """
        SELECT e.id, e.user_id AS "userId", e.first_name AS "firstName", e.last_name AS "lastName",
          e.phone, e.address, e.date_of_birth AS "dateOfBirth", e.date_of_joining AS "dateOfJoining",
          e.department_id AS "departmentId", e.designation_id AS "designationId",
          e.employment_type AS "employmentType", e.status, e.photo_url AS "photoUrl",
          e.bank_account_number AS "bankAccountNumber", e.bank_name AS "bankName", e.tax_id AS "taxId",
          e.emergency_contact_name AS "emergencyContactName", e.emergency_contact_phone AS "emergencyContactPhone",
          e.created_at AS "createdAt", e.updated_at AS "updatedAt",
          u.id AS "u_id", u.employee_code AS "u_employeeCode", u.email AS "u_email", u.role AS "u_role",
          u.status AS "u_status", u.manager_id AS "u_managerId",
          d.id AS "d_id", d.name AS "d_name",
          de.id AS "de_id", de.title AS "de_title"
        FROM employees e
        JOIN users u ON u.id = e.user_id
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN designations de ON de.id = e.designation_id
        WHERE e.id = %s
        """,
        (payslip["employeeId"],),
    ).rows
    e = emp_rows[0] if emp_rows else None
    employee = (
        {
            "id": e["id"],
            "userId": e["userId"],
            "firstName": e["firstName"],
            "lastName": e["lastName"],
            "phone": e["phone"],
            "address": e["address"],
            "dateOfBirth": e["dateOfBirth"],
            "dateOfJoining": e["dateOfJoining"],
            "departmentId": e["departmentId"],
            "designationId": e["designationId"],
            "employmentType": e["employmentType"],
            "status": e["status"],
            "photoUrl": e["photoUrl"],
            "bankAccountNumber": e["bankAccountNumber"],
            "bankName": e["bankName"],
            "taxId": e["taxId"],
            "emergencyContactName": e["emergencyContactName"],
            "emergencyContactPhone": e["emergencyContactPhone"],
            "createdAt": e["createdAt"],
            "updatedAt": e["updatedAt"],
            "user": {"id": e["u_id"], "employeeCode": e["u_employeeCode"], "email": e["u_email"], "role": e["u_role"], "status": e["u_status"], "managerId": e["u_managerId"]},
            "department": {"id": e["d_id"], "name": e["d_name"]} if e["d_id"] else None,
            "designation": {"id": e["de_id"], "title": e["de_title"]} if e["de_id"] else None,
        }
        if e
        else None
    )

    run_rows = query(
        """
        SELECT id, period, status, total_gross AS "totalGross", total_deductions AS "totalDeductions",
          total_net AS "totalNet", employee_count AS "employeeCount",
          created_by_id AS "createdById", submitted_at AS "submittedAt",
          reviewed_by_id AS "reviewedById", reviewed_at AS "reviewedAt",
          approved_by_id AS "approvedById", approved_at AS "approvedAt",
          processed_at AS "processedAt", rejection_reason AS "rejectionReason",
          created_at AS "createdAt", updated_at AS "updatedAt"
        FROM payroll_runs WHERE id = %s
        """,
        (payslip["payrollRunId"],),
    ).rows
    payroll_run = run_rows[0] if run_rows else None

    return {"payslip": {**payslip, "breakdown": json.loads(payslip["breakdown"]), "employee": employee, "payrollRun": payroll_run}}
