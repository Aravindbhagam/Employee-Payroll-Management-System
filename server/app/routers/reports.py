import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from ..db import query
from ..errors import ApiError
from ..rbac import authorize
from ..utils.scope import employee_scope_filter

router = APIRouter()


def to_csv(rows):
    if not rows:
        return ""
    headers = list(rows[0].keys())
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for row in rows:
        writer.writerow([row.get(h) if row.get(h) is not None else "" for h in headers])
    return buf.getvalue()


def iso_date(d):
    return d.strftime("%Y-%m-%d") if d else None


@router.get("")
def run_report(type: str = "employees", format: str = "json", user: dict = Depends(authorize("REPORTS", "VIEW"))):
    scope = employee_scope_filter(user)
    rows = []

    if type == "employees":
        conditions = []
        params = []
        if scope is not None:
            if len(scope["in"]) == 0:
                conditions.append("FALSE")
            else:
                conditions.append("e.id = ANY(%s)")
                params.append(scope["in"])
        where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        employees = query(
            f"""
            SELECT e.first_name AS "firstName", e.last_name AS "lastName", e.date_of_joining AS "dateOfJoining", e.status,
              d.name AS "departmentName", de.title AS "designationTitle",
              u.email AS "userEmail", u.role AS "userRole"
            FROM employees e
            JOIN users u ON u.id = e.user_id
            LEFT JOIN departments d ON d.id = e.department_id
            LEFT JOIN designations de ON de.id = e.designation_id
            {where_sql}
            """,
            params,
        ).rows
        rows = [
            {
                "employee": f'{e["firstName"]} {e["lastName"]}',
                "email": e["userEmail"],
                "department": e["departmentName"] or "",
                "designation": e["designationTitle"] or "",
                "role": e["userRole"],
                "status": e["status"],
                "dateOfJoining": iso_date(e["dateOfJoining"]),
            }
            for e in employees
        ]
    elif type == "attendance":
        if user["role"] == "PAYROLL_ADMIN":
            raise ApiError(403, "You don't have permission to run attendance reports.")
        conditions = []
        params = []
        if scope is not None:
            if len(scope["in"]) == 0:
                conditions.append("FALSE")
            else:
                conditions.append("a.employee_id = ANY(%s)")
                params.append(scope["in"])
        where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        records = query(
            f"""
            SELECT a.date, a.status, a.hours_worked AS "hoursWorked", e.first_name AS "firstName", e.last_name AS "lastName"
            FROM attendance a
            JOIN employees e ON e.id = a.employee_id
            {where_sql}
            ORDER BY a.date DESC
            LIMIT 500
            """,
            params,
        ).rows
        rows = [{"employee": f'{r["firstName"]} {r["lastName"]}', "date": iso_date(r["date"]), "status": r["status"], "hoursWorked": r["hoursWorked"]} for r in records]
    elif type == "leave":
        conditions = []
        params = []
        if scope is not None:
            if len(scope["in"]) == 0:
                conditions.append("FALSE")
            else:
                conditions.append("l.employee_id = ANY(%s)")
                params.append(scope["in"])
        where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        records = query(
            f"""
            SELECT l.leave_type AS "leaveType", l.start_date AS "startDate", l.end_date AS "endDate", l.days, l.status,
              e.first_name AS "firstName", e.last_name AS "lastName"
            FROM leave_requests l
            JOIN employees e ON e.id = l.employee_id
            {where_sql}
            ORDER BY l.created_at DESC
            LIMIT 500
            """,
            params,
        ).rows
        rows = [
            {"employee": f'{r["firstName"]} {r["lastName"]}', "type": r["leaveType"], "from": iso_date(r["startDate"]), "to": iso_date(r["endDate"]), "days": r["days"], "status": r["status"]}
            for r in records
        ]
    elif type == "payroll":
        if user["role"] in ("HR_ADMIN", "MANAGER", "EMPLOYEE"):
            raise ApiError(403, "You don't have permission to run payroll reports.")
        runs = query(
            """
            SELECT period, status, total_gross AS "totalGross", total_deductions AS "totalDeductions",
              total_net AS "totalNet", employee_count AS "employeeCount"
            FROM payroll_runs ORDER BY created_at DESC LIMIT 24
            """
        ).rows
        rows = [{"period": r["period"], "status": r["status"], "gross": r["totalGross"], "deductions": r["totalDeductions"], "net": r["totalNet"], "employees": r["employeeCount"]} for r in runs]
    else:
        raise ApiError(400, f"Unknown report type: {type}")

    if format == "csv":
        return Response(
            content=to_csv(rows),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{type}-report.csv"'},
        )

    return {"type": type, "rows": rows}
