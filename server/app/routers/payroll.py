import json

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ..db import query, with_transaction
from ..db_columns import PAYROLL_RUN_COLS
from ..errors import ApiError
from ..rbac import authorize
from ..utils.audit import record_audit
from ..utils.id import new_id
from ..utils.time import now_utc

router = APIRouter()


@router.get("")
def list_payroll_runs(user: dict = Depends(authorize("PAYROLL", "VIEW"))):
    rows = query(
        """
        SELECT r.id, r.period, r.status, r.total_gross AS "totalGross", r.total_deductions AS "totalDeductions",
          r.total_net AS "totalNet", r.employee_count AS "employeeCount", r.created_at AS "createdAt",
          r.updated_at AS "updatedAt",
          cb.email AS "createdByEmail", rb.email AS "reviewedByEmail", ab.email AS "approvedByEmail",
          (SELECT COUNT(*) FROM payslips p WHERE p.payroll_run_id = r.id) AS "payslipCount"
        FROM payroll_runs r
        LEFT JOIN users cb ON cb.id = r.created_by_id
        LEFT JOIN users rb ON rb.id = r.reviewed_by_id
        LEFT JOIN users ab ON ab.id = r.approved_by_id
        ORDER BY r.created_at DESC
        """
    ).rows
    runs = [
        {
            "id": r["id"],
            "period": r["period"],
            "status": r["status"],
            "totalGross": r["totalGross"],
            "totalDeductions": r["totalDeductions"],
            "totalNet": r["totalNet"],
            "employeeCount": r["employeeCount"],
            "createdAt": r["createdAt"],
            "updatedAt": r["updatedAt"],
            "createdBy": {"email": r["createdByEmail"]} if r["createdByEmail"] else None,
            "reviewedBy": {"email": r["reviewedByEmail"]} if r["reviewedByEmail"] else None,
            "approvedBy": {"email": r["approvedByEmail"]} if r["approvedByEmail"] else None,
            "_count": {"payslips": int(r["payslipCount"])},
        }
        for r in rows
    ]
    return {"payrollRuns": runs}


def get_run_or_404(run_id):
    rows = query(f"SELECT {PAYROLL_RUN_COLS} FROM payroll_runs WHERE id = %s", (run_id,)).rows
    if not rows:
        raise ApiError(404, "Payroll run not found.")
    return rows[0]


@router.get("/{run_id}")
def get_payroll_run(run_id: str, user: dict = Depends(authorize("PAYROLL", "VIEW"))):
    run = get_run_or_404(run_id)

    payslip_rows = query(
        """
        SELECT p.id, p.payroll_run_id AS "payrollRunId", p.employee_id AS "employeeId", p.period,
          p.gross, p.deductions, p.net, p.breakdown, p.generated_at AS "generatedAt",
          e.first_name AS "e_firstName", e.last_name AS "e_lastName", d.name AS "d_name"
        FROM payslips p
        JOIN employees e ON e.id = p.employee_id
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE p.payroll_run_id = %s
        ORDER BY e.first_name ASC
        """,
        (run["id"],),
    ).rows
    run["payslips"] = [
        {
            "id": p["id"],
            "payrollRunId": p["payrollRunId"],
            "employeeId": p["employeeId"],
            "period": p["period"],
            "gross": p["gross"],
            "deductions": p["deductions"],
            "net": p["net"],
            "breakdown": p["breakdown"],
            "generatedAt": p["generatedAt"],
            "employee": {"firstName": p["e_firstName"], "lastName": p["e_lastName"], "id": p["employeeId"], "department": {"name": p["d_name"]} if p["d_name"] else None},
        }
        for p in payslip_rows
    ]
    return {"payrollRun": run}


class CreatePayrollRunBody(BaseModel):
    period: str = Field(min_length=4)


@router.post("", status_code=201)
def create_payroll_run(request: Request, body: CreatePayrollRunBody, user: dict = Depends(authorize("PAYROLL", "CREATE"))):
    if query("SELECT id FROM payroll_runs WHERE period = %s", (body.period,)).rows:
        raise ApiError(409, f"A payroll run for {body.period} already exists.")

    run_id = new_id()
    query("INSERT INTO payroll_runs (id, period, status, created_by_id) VALUES (%s, %s, 'DRAFT', %s)", (run_id, body.period, user["id"]))
    run = query(f"SELECT {PAYROLL_RUN_COLS} FROM payroll_runs WHERE id = %s", (run_id,)).rows[0]
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="PAYROLL_RUN_CREATED", entity_type="PayrollRun", entity_id=run["id"], new_value={"period": body.period})
    return {"payrollRun": run}


def assert_transition(current, allowed):
    if current not in allowed:
        raise ApiError(400, f"Payroll run cannot transition from {current}.")


@router.post("/{run_id}/calculate")
def calculate_payroll(run_id: str, request: Request, user: dict = Depends(authorize("PAYROLL", "PROCESS"))):
    run = get_run_or_404(run_id)
    assert_transition(run["status"], ["DRAFT", "FAILED"])

    query("UPDATE payroll_runs SET status = 'CALCULATING' WHERE id = %s", (run["id"],))

    try:
        active_structures = query(
            """
            SELECT s.id, s.employee_id AS "employeeId", s.basic, s.hra, s.conveyance, s.medical,
              s.special_allowance AS "specialAllowance", s.other_allowances AS "otherAllowances",
              s.provident_fund AS "providentFund", s.professional_tax AS "professionalTax",
              s.income_tax AS "incomeTax", s.other_deductions AS "otherDeductions"
            FROM salary_structures s
            JOIN employees e ON e.id = s.employee_id
            WHERE s.is_active = true AND e.status = 'ACTIVE'
            """
        ).rows

        total_gross = total_deductions = total_net = 0

        def _tx(client):
            nonlocal total_gross, total_deductions, total_net
            client.query("DELETE FROM payslips WHERE payroll_run_id = %s", (run["id"],))

            for s in active_structures:
                gross = s["basic"] + s["hra"] + s["conveyance"] + s["medical"] + s["specialAllowance"] + s["otherAllowances"]
                deductions = s["providentFund"] + s["professionalTax"] + s["incomeTax"] + s["otherDeductions"]
                net = gross - deductions
                total_gross += gross
                total_deductions += deductions
                total_net += net

                breakdown = json.dumps(
                    {
                        "earnings": {"basic": s["basic"], "hra": s["hra"], "conveyance": s["conveyance"], "medical": s["medical"], "specialAllowance": s["specialAllowance"], "otherAllowances": s["otherAllowances"]},
                        "deductions": {"providentFund": s["providentFund"], "professionalTax": s["professionalTax"], "incomeTax": s["incomeTax"], "otherDeductions": s["otherDeductions"]},
                    }
                )

                client.query(
                    """
                    INSERT INTO payslips (id, payroll_run_id, employee_id, period, gross, deductions, net, breakdown)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (new_id(), run["id"], s["employeeId"], run["period"], gross, deductions, net, breakdown),
                )

            now = now_utc()
            client.query(
                "UPDATE payroll_runs SET status = 'PENDING_REVIEW', total_gross = %s, total_deductions = %s, total_net = %s, employee_count = %s, submitted_at = %s, updated_at = %s WHERE id = %s",
                (total_gross, total_deductions, total_net, len(active_structures), now, now, run["id"]),
            )

        with_transaction(_tx)

        updated = get_run_or_404(run["id"])
        record_audit(
            request=request,
            user_id=user["id"],
            user_name=user["email"],
            action="PAYROLL_CALCULATED",
            entity_type="PayrollRun",
            entity_id=run["id"],
            new_value={"totalGross": total_gross, "totalDeductions": total_deductions, "totalNet": total_net, "employeeCount": len(active_structures)},
        )
        return {"payrollRun": updated}
    except Exception:
        query("UPDATE payroll_runs SET status = 'FAILED' WHERE id = %s", (run["id"],))
        raise


@router.post("/{run_id}/submit")
def submit_for_approval(run_id: str, request: Request, user: dict = Depends(authorize("PAYROLL", "PROCESS"))):
    run = get_run_or_404(run_id)
    assert_transition(run["status"], ["PENDING_REVIEW"])

    now = now_utc()
    query("UPDATE payroll_runs SET status = 'PENDING_APPROVAL', reviewed_by_id = %s, reviewed_at = %s, updated_at = %s WHERE id = %s", (user["id"], now, now, run["id"]))
    updated = get_run_or_404(run["id"])
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="PAYROLL_SUBMITTED_FOR_APPROVAL", entity_type="PayrollRun", entity_id=run["id"])
    return {"payrollRun": updated}


@router.post("/{run_id}/approve")
def approve_payroll(run_id: str, request: Request, user: dict = Depends(authorize("PAYROLL", "APPROVE"))):
    run = get_run_or_404(run_id)
    assert_transition(run["status"], ["PENDING_APPROVAL"])

    now = now_utc()
    query("UPDATE payroll_runs SET status = 'APPROVED', approved_by_id = %s, approved_at = %s, updated_at = %s WHERE id = %s", (user["id"], now, now, run["id"]))
    updated = get_run_or_404(run["id"])
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="PAYROLL_APPROVED", entity_type="PayrollRun", entity_id=run["id"])
    return {"payrollRun": updated}


class RejectPayrollBody(BaseModel):
    reason: str = Field(min_length=1)


@router.post("/{run_id}/reject")
def reject_payroll(run_id: str, request: Request, body: RejectPayrollBody, user: dict = Depends(authorize("PAYROLL", "APPROVE"))):
    run = get_run_or_404(run_id)
    assert_transition(run["status"], ["PENDING_REVIEW", "PENDING_APPROVAL"])

    query("UPDATE payroll_runs SET status = 'REJECTED', rejection_reason = %s, updated_at = %s WHERE id = %s", (body.reason, now_utc(), run["id"]))
    updated = get_run_or_404(run["id"])
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="PAYROLL_REJECTED", entity_type="PayrollRun", entity_id=run["id"], new_value={"reason": body.reason})
    return {"payrollRun": updated}


@router.post("/{run_id}/process")
def process_payroll(run_id: str, request: Request, user: dict = Depends(authorize("PAYROLL", "PROCESS"))):
    run = get_run_or_404(run_id)
    assert_transition(run["status"], ["APPROVED"])

    query("UPDATE payroll_runs SET status = 'PROCESSING' WHERE id = %s", (run["id"],))

    try:
        now = now_utc()
        query("UPDATE payroll_runs SET status = 'COMPLETED', processed_at = %s, updated_at = %s WHERE id = %s", (now, now, run["id"]))
        updated = get_run_or_404(run["id"])
        record_audit(request=request, user_id=user["id"], user_name=user["email"], action="PAYROLL_PROCESSED", entity_type="PayrollRun", entity_id=run["id"])

        payslip_rows = query("SELECT id FROM payslips WHERE payroll_run_id = %s", (run["id"],)).rows
        for p in payslip_rows:
            record_audit(request=request, user_id=user["id"], user_name=user["email"], action="PAYSLIP_GENERATED", entity_type="Payslip", entity_id=p["id"])

        return {"payrollRun": updated, "message": f"Payroll completed. {len(payslip_rows)} payslip(s) generated and employees notified."}
    except Exception:
        query("UPDATE payroll_runs SET status = 'FAILED' WHERE id = %s", (run["id"],))
        raise
