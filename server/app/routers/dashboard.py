from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends

from ..db import query
from ..db_columns import ANNOUNCEMENT_COLS, AUDIT_LOG_COLS, LEAVE_BALANCE_COLS, LEAVE_REQUEST_COLS, PAYROLL_RUN_COLS, PAYSLIP_COLS
from ..rbac import authorize
from ..utils.scope import employee_id_for_user, team_employee_ids

router = APIRouter()


def start_of_month():
    today = datetime.utcnow()
    return datetime(today.year, today.month, 1)


def start_of_today():
    today = datetime.utcnow()
    return datetime(today.year, today.month, today.day)


def end_of_today():
    return start_of_today() + timedelta(hours=23, minutes=59, seconds=59, milliseconds=999)


def super_admin_dashboard():
    total_employees = int(query("SELECT COUNT(*) FROM employees").rows[0]["count"])
    departments = query(
        """
        SELECT d.id, d.name, (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id) AS "employeeCount"
        FROM departments d
        """
    ).rows
    payroll_runs = query(f"SELECT {PAYROLL_RUN_COLS} FROM payroll_runs ORDER BY created_at DESC LIMIT 6").rows
    attendance_today = query("SELECT status FROM attendance WHERE date >= %s AND date <= %s", (start_of_today(), end_of_today())).rows
    pending_leave = int(query("SELECT COUNT(*) FROM leave_requests WHERE status = 'PENDING'").rows[0]["count"])
    recent_audit = query(f"SELECT {AUDIT_LOG_COLS} FROM audit_logs ORDER BY created_at DESC LIMIT 10").rows
    active_employees = int(query("SELECT COUNT(*) FROM employees WHERE status = 'ACTIVE'").rows[0]["count"])

    latest_run = payroll_runs[0] if payroll_runs else None
    latest_completed_run = next((r for r in payroll_runs if r["status"] == "COMPLETED"), latest_run)
    present_today = sum(1 for a in attendance_today if a["status"] == "PRESENT")
    absent_today = sum(1 for a in attendance_today if a["status"] == "ABSENT")
    on_leave_today = sum(1 for a in attendance_today if a["status"] == "ON_LEAVE")

    return {
        "role": "SUPER_ADMIN",
        "totalEmployees": total_employees,
        "activeEmployees": active_employees,
        "totalPayroll": (latest_completed_run or {}).get("totalNet", 0),
        "payrollStatus": (latest_run or {}).get("status", "DRAFT"),
        "departmentStats": [{"name": d["name"], "employees": int(d["employeeCount"])} for d in departments],
        "attendanceOverview": {"present": present_today, "absent": absent_today, "onLeave": on_leave_today, "total": total_employees},
        "leaveOverview": {"pending": pending_leave},
        "payrollTrends": list(reversed([{"period": r["period"], "net": r["totalNet"], "gross": r["totalGross"], "status": r["status"]} for r in payroll_runs])),
        "systemActivity": recent_audit,
    }


def hr_dashboard():
    month_ago = datetime.utcnow() - timedelta(days=30)

    total_employees = int(query("SELECT COUNT(*) FROM employees").rows[0]["count"])
    new_employees = int(query("SELECT COUNT(*) FROM employees WHERE date_of_joining >= %s", (month_ago,)).rows[0]["count"])
    on_leave_today = int(
        query("SELECT COUNT(*) FROM leave_requests WHERE status = 'APPROVED' AND start_date <= %s AND end_date >= %s", (end_of_today(), start_of_today())).rows[0]["count"]
    )
    attendance_today = query("SELECT status FROM attendance WHERE date >= %s AND date <= %s", (start_of_today(), end_of_today())).rows
    pending_leave_rows = query(
        """
        SELECT l.id, l.employee_id AS "employeeId", l.leave_type AS "leaveType", l.start_date AS "startDate",
          l.end_date AS "endDate", l.days, l.reason, l.status, l.approver_id AS "approverId",
          l.approved_at AS "approvedAt", l.reject_reason AS "rejectReason", l.created_at AS "createdAt",
          e.first_name AS "e_firstName", e.last_name AS "e_lastName"
        FROM leave_requests l
        JOIN employees e ON e.id = l.employee_id
        WHERE l.status = 'PENDING'
        ORDER BY l.created_at DESC
        LIMIT 10
        """
    ).rows
    employees = query('SELECT first_name AS "firstName", last_name AS "lastName", date_of_birth AS "dateOfBirth", date_of_joining AS "dateOfJoining" FROM employees').rows
    status_groups = query("SELECT status, COUNT(*) AS count FROM employees GROUP BY status").rows

    pending_leave = [
        {
            "id": l["id"],
            "employeeId": l["employeeId"],
            "leaveType": l["leaveType"],
            "startDate": l["startDate"],
            "endDate": l["endDate"],
            "days": l["days"],
            "reason": l["reason"],
            "status": l["status"],
            "approverId": l["approverId"],
            "approvedAt": l["approvedAt"],
            "rejectReason": l["rejectReason"],
            "createdAt": l["createdAt"],
            "employee": {"firstName": l["e_firstName"], "lastName": l["e_lastName"]},
        }
        for l in pending_leave_rows
    ]

    today = datetime.utcnow()
    upcoming = []
    for e in employees:
        if e["dateOfBirth"]:
            bday = e["dateOfBirth"].replace(year=today.year)
            if bday < today:
                bday = bday.replace(year=today.year + 1)
            upcoming.append({"name": f'{e["firstName"]} {e["lastName"]}', "type": "birthday", "date": bday})
        anniv = e["dateOfJoining"].replace(year=today.year)
        if anniv < today:
            anniv = anniv.replace(year=today.year + 1)
        upcoming.append({"name": f'{e["firstName"]} {e["lastName"]}', "type": "anniversary", "date": anniv})
    upcoming.sort(key=lambda x: x["date"])
    upcoming = upcoming[:8]

    present_today = sum(1 for a in attendance_today if a["status"] == "PRESENT")

    return {
        "role": "HR_ADMIN",
        "totalEmployees": total_employees,
        "newEmployees": new_employees,
        "employeesOnLeave": on_leave_today,
        "attendanceSummary": {"present": present_today, "total": total_employees},
        "pendingLeaveRequests": pending_leave,
        "upcomingEvents": upcoming,
        "employeeStatusOverview": [{"status": g["status"], "count": int(g["count"])} for g in status_groups],
    }


def payroll_dashboard():
    latest_run_rows = query(f"SELECT {PAYROLL_RUN_COLS} FROM payroll_runs ORDER BY created_at DESC LIMIT 1").rows
    latest_run = latest_run_rows[0] if latest_run_rows else None
    runs = query(f"SELECT {PAYROLL_RUN_COLS} FROM payroll_runs ORDER BY created_at DESC LIMIT 6").rows
    pending_approval = int(query("SELECT COUNT(*) FROM payroll_runs WHERE status = 'PENDING_APPROVAL'").rows[0]["count"])

    return {
        "role": "PAYROLL_ADMIN",
        "currentPeriod": (latest_run or {}).get("period"),
        "totalGross": (latest_run or {}).get("totalGross", 0),
        "totalDeductions": (latest_run or {}).get("totalDeductions", 0),
        "totalNet": (latest_run or {}).get("totalNet", 0),
        "processingStatus": (latest_run or {}).get("status", "DRAFT"),
        "pendingApprovals": pending_approval,
        "paymentStatus": "PAID" if latest_run and latest_run["status"] == "COMPLETED" else "UNPAID",
        "payrollCostTrends": list(reversed([{"period": r["period"], "net": r["totalNet"], "gross": r["totalGross"], "status": r["status"]} for r in runs])),
    }


def manager_dashboard(user_id):
    ids = team_employee_ids(user_id)
    team = query("SELECT id FROM employees WHERE id = ANY(%s)", (ids,)).rows
    attendance_today = query('SELECT employee_id AS "employeeId", status FROM attendance WHERE employee_id = ANY(%s) AND date >= %s AND date <= %s', (ids, start_of_today(), end_of_today())).rows

    def _leave_query(extra_sql, extra_params, limit_sql=""):
        rows = query(
            f"""
            SELECT l.id, l.employee_id AS "employeeId", l.leave_type AS "leaveType", l.start_date AS "startDate",
              l.end_date AS "endDate", l.days, l.reason, l.status, l.approver_id AS "approverId",
              l.approved_at AS "approvedAt", l.reject_reason AS "rejectReason", l.created_at AS "createdAt",
              e.first_name AS "e_firstName", e.last_name AS "e_lastName"
            FROM leave_requests l
            JOIN employees e ON e.id = l.employee_id
            WHERE l.employee_id = ANY(%s) {extra_sql}{limit_sql}
            """,
            (ids, *extra_params),
        ).rows
        return [
            {
                "id": l["id"],
                "employeeId": l["employeeId"],
                "leaveType": l["leaveType"],
                "startDate": l["startDate"],
                "endDate": l["endDate"],
                "days": l["days"],
                "reason": l["reason"],
                "status": l["status"],
                "approverId": l["approverId"],
                "approvedAt": l["approvedAt"],
                "rejectReason": l["rejectReason"],
                "createdAt": l["createdAt"],
                "employee": {"firstName": l["e_firstName"], "lastName": l["e_lastName"]},
            }
            for l in rows
        ]

    pending_leave = _leave_query("AND l.status = 'PENDING'", ())
    upcoming_leave = _leave_query("AND l.status = 'APPROVED' AND l.start_date >= %s ORDER BY l.start_date ASC", (datetime.utcnow(),), " LIMIT 5")

    present = sum(1 for a in attendance_today if a["status"] == "PRESENT")
    absent = sum(1 for a in attendance_today if a["status"] == "ABSENT")

    return {
        "role": "MANAGER",
        "teamSize": len(team),
        "presentToday": present,
        "absentToday": absent,
        "pendingLeaveRequests": pending_leave,
        "teamAttendance": [{"employeeId": a["employeeId"], "status": a["status"]} for a in attendance_today],
        "upcomingTeamLeave": upcoming_leave,
    }


def next_pay_date():
    d = datetime.utcnow()
    if d.month == 12:
        return datetime(d.year + 1, 1, 1)
    return datetime(d.year, d.month + 1, 1)


def employee_dashboard(user_id):
    employee_id = employee_id_for_user(user_id)
    if not employee_id:
        return {"role": "EMPLOYEE"}

    salary_rows = query("SELECT ctc, basic FROM salary_structures WHERE employee_id = %s AND is_active = true LIMIT 1", (employee_id,)).rows
    latest_payslip_rows = query(f"SELECT {PAYSLIP_COLS} FROM payslips WHERE employee_id = %s ORDER BY generated_at DESC LIMIT 1", (employee_id,)).rows
    leave_balances = query(f"SELECT {LEAVE_BALANCE_COLS} FROM leave_balances WHERE employee_id = %s AND year = %s", (employee_id, datetime.utcnow().year)).rows
    attendance_this_month = query("SELECT status FROM attendance WHERE employee_id = %s AND date >= %s", (employee_id, start_of_month())).rows
    pending_leave = query(f"SELECT {LEAVE_REQUEST_COLS} FROM leave_requests WHERE employee_id = %s AND status = 'PENDING'", (employee_id,)).rows
    payroll_history = query(f"SELECT {PAYSLIP_COLS} FROM payslips WHERE employee_id = %s ORDER BY generated_at DESC LIMIT 6", (employee_id,)).rows
    announcements = query(f"SELECT {ANNOUNCEMENT_COLS} FROM announcements WHERE audience = 'ALL' ORDER BY created_at DESC LIMIT 5").rows

    salary_structure = salary_rows[0] if salary_rows else None
    present = sum(1 for a in attendance_this_month if a["status"] == "PRESENT")

    return {
        "role": "EMPLOYEE",
        "currentSalary": {"ctc": salary_structure["ctc"], "basic": salary_structure["basic"]} if salary_structure else None,
        "latestPayslip": latest_payslip_rows[0] if latest_payslip_rows else None,
        "nextPaymentDate": next_pay_date(),
        "leaveBalances": leave_balances,
        "attendanceSummary": {"present": present, "total": len(attendance_this_month)},
        "payrollHistory": payroll_history,
        "pendingLeaveRequests": pending_leave,
        "announcements": announcements,
    }


@router.get("")
def get_dashboard(user: dict = Depends(authorize("DASHBOARD", "VIEW"))):
    role = user["role"]
    if role == "SUPER_ADMIN":
        data = super_admin_dashboard()
    elif role == "HR_ADMIN":
        data = hr_dashboard()
    elif role == "PAYROLL_ADMIN":
        data = payroll_dashboard()
    elif role == "MANAGER":
        data = manager_dashboard(user["id"])
    else:
        data = employee_dashboard(user["id"])
    return {"dashboard": data}
