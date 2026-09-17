from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ..db import query
from ..db_columns import LEAVE_REQUEST_COLS
from ..deps import get_current_user
from ..enums import LEAVE_TYPES
from ..errors import ApiError
from ..param_builder import ParamBuilder
from ..rbac import authorize
from ..utils.audit import record_audit
from ..utils.id import new_id
from ..utils.pagination import parse_pagination
from ..utils.scope import employee_id_for_user, employee_scope_filter, team_employee_ids
from ..utils.time import now_utc

router = APIRouter()

LEAVE_JOIN_SELECT = """
  SELECT l.id, l.employee_id AS "employeeId", l.leave_type AS "leaveType", l.start_date AS "startDate",
    l.end_date AS "endDate", l.days, l.reason, l.status, l.approver_id AS "approverId",
    l.approved_at AS "approvedAt", l.reject_reason AS "rejectReason", l.created_at AS "createdAt",
    e.first_name AS "e_firstName", e.last_name AS "e_lastName", d.name AS "d_name"
  FROM leave_requests l
  JOIN employees e ON e.id = l.employee_id
  LEFT JOIN departments d ON d.id = e.department_id
"""


def map_leave_row(row):
    return {
        "id": row["id"],
        "employeeId": row["employeeId"],
        "leaveType": row["leaveType"],
        "startDate": row["startDate"],
        "endDate": row["endDate"],
        "days": row["days"],
        "reason": row["reason"],
        "status": row["status"],
        "approverId": row["approverId"],
        "approvedAt": row["approvedAt"],
        "rejectReason": row["rejectReason"],
        "createdAt": row["createdAt"],
        "employee": {"firstName": row["e_firstName"], "lastName": row["e_lastName"], "id": row["employeeId"], "department": {"name": row["d_name"]} if row["d_name"] else None},
    }


@router.get("/balances")
def list_leave_balances(request: Request, employeeId: Optional[str] = None, user: dict = Depends(authorize("LEAVE", "VIEW"))):
    employee_id = employeeId or employee_id_for_user(user["id"])
    if not employee_id:
        return {"balances": []}

    scope = employee_scope_filter(user)
    if scope is not None and employee_id not in scope["in"]:
        raise ApiError(403, "You don't have permission to view this employee's leave balance.")

    year = now_utc().year
    rows = query(
        'SELECT id, employee_id AS "employeeId", leave_type AS "leaveType", year, allocated, used FROM leave_balances WHERE employee_id = %s AND year = %s',
        (employee_id, year),
    ).rows
    return {"balances": rows}


@router.get("")
def list_leave_requests(
    request: Request,
    status: Optional[str] = None,
    employeeId: Optional[str] = None,
    user: dict = Depends(authorize("LEAVE", "VIEW")),
):
    scope = employee_scope_filter(user)
    pb = ParamBuilder()
    conditions = []

    if scope is not None:
        if employeeId:
            if employeeId not in scope["in"]:
                raise ApiError(403, "You don't have permission to view this employee's leave.")
            conditions.append(f"l.employee_id = {pb.add(employeeId)}")
        elif len(scope["in"]) == 0:
            conditions.append("FALSE")
        else:
            conditions.append(f'l.employee_id = ANY({pb.add(scope["in"])})')
    elif employeeId:
        conditions.append(f"l.employee_id = {pb.add(employeeId)}")
    if status:
        conditions.append(f"l.status = {pb.add(status)}")

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    pagination = parse_pagination(request, opt_in=True)
    limit_offset_sql = ""
    if pagination:
        limit_offset_sql = f" LIMIT {pb.add(pagination['take'])} OFFSET {pb.add(pagination['skip'])}"

    rows = query(f"{LEAVE_JOIN_SELECT} {where_sql} ORDER BY l.created_at DESC{limit_offset_sql}", pb.params).rows
    result = {"leaveRequests": [map_leave_row(r) for r in rows]}
    if pagination:
        count_params = pb.params[: len(pb.params) - 2]
        count = query(f"SELECT COUNT(*) FROM leave_requests l {where_sql}", count_params).rows[0]["count"]
        result.update({"total": int(count), "page": pagination["page"], "pageSize": pagination["pageSize"]})
    return result


class ApplyLeaveBody(BaseModel):
    leaveType: str
    startDate: str
    endDate: str
    reason: Optional[str] = None


def days_between(start, end):
    return round((end - start).total_seconds() / 86400) + 1


@router.post("", status_code=201)
def apply_leave(request: Request, body: ApplyLeaveBody, user: dict = Depends(authorize("LEAVE", "CREATE"))):
    employee_id = employee_id_for_user(user["id"])
    if not employee_id:
        raise ApiError(400, "No employee profile linked to this account.")
    if body.leaveType not in LEAVE_TYPES:
        raise ApiError(400, "Validation failed.")

    start_date = datetime.fromisoformat(body.startDate)
    end_date = datetime.fromisoformat(body.endDate)
    if end_date < start_date:
        raise ApiError(400, "End date cannot be before start date.")
    days = days_between(start_date, end_date)

    req_id = new_id()
    query(
        """
        INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, days, reason, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'PENDING')
        """,
        (req_id, employee_id, body.leaveType, start_date, end_date, days, body.reason),
    )
    leave_request = query(f"SELECT {LEAVE_REQUEST_COLS} FROM leave_requests WHERE id = %s", (req_id,)).rows[0]
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="LEAVE_APPLIED", entity_type="LeaveRequest", entity_id=leave_request["id"], new_value=body.model_dump())
    return {"leaveRequest": leave_request}


@router.post("/{leave_id}/cancel")
def cancel_leave(leave_id: str, request: Request, user: dict = Depends(get_current_user)):
    employee_id = employee_id_for_user(user["id"])
    rows = query(f"SELECT {LEAVE_REQUEST_COLS} FROM leave_requests WHERE id = %s", (leave_id,)).rows
    if not rows:
        raise ApiError(404, "Leave request not found.")
    leave_request = rows[0]
    if leave_request["employeeId"] != employee_id:
        raise ApiError(403, "You can only cancel your own leave requests.")
    if leave_request["status"] != "PENDING":
        raise ApiError(400, "Only pending requests can be cancelled.")

    updated = query(f"UPDATE leave_requests SET status = 'CANCELLED' WHERE id = %s RETURNING {LEAVE_REQUEST_COLS}", (leave_request["id"],)).rows[0]
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="LEAVE_CANCELLED", entity_type="LeaveRequest", entity_id=leave_request["id"])
    return {"leaveRequest": updated}


def assert_approver_scope(user, leave_request):
    if user["role"] in ("SUPER_ADMIN", "HR_ADMIN"):
        return
    if user["role"] == "MANAGER":
        ids = team_employee_ids(user["id"])
        if leave_request["employeeId"] not in ids:
            raise ApiError(403, "You can only approve leave for your own team.")
        return
    raise ApiError(403, "You don't have permission to approve leave requests.")


@router.post("/{leave_id}/approve")
def approve_leave(leave_id: str, request: Request, user: dict = Depends(authorize("LEAVE", "APPROVE"))):
    rows = query(f"SELECT {LEAVE_REQUEST_COLS} FROM leave_requests WHERE id = %s", (leave_id,)).rows
    if not rows:
        raise ApiError(404, "Leave request not found.")
    leave_request = rows[0]
    assert_approver_scope(user, leave_request)
    if leave_request["status"] != "PENDING":
        raise ApiError(400, "Only pending requests can be approved.")

    updated = query(
        f"UPDATE leave_requests SET status = 'APPROVED', approver_id = %s, approved_at = %s WHERE id = %s RETURNING {LEAVE_REQUEST_COLS}",
        (user["id"], now_utc(), leave_request["id"]),
    ).rows[0]

    year = leave_request["startDate"].year
    query(
        """
        INSERT INTO leave_balances (id, employee_id, leave_type, year, allocated, used)
        VALUES (%s, %s, %s, %s, 0, %s)
        ON CONFLICT (employee_id, leave_type, year) DO UPDATE SET used = leave_balances.used + EXCLUDED.used
        """,
        (new_id(), leave_request["employeeId"], leave_request["leaveType"], year, leave_request["days"]),
    )

    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="LEAVE_APPROVED", entity_type="LeaveRequest", entity_id=leave_request["id"])
    return {"leaveRequest": updated}


class RejectLeaveBody(BaseModel):
    reason: Optional[str] = None


@router.post("/{leave_id}/reject")
def reject_leave(leave_id: str, request: Request, body: RejectLeaveBody = RejectLeaveBody(), user: dict = Depends(authorize("LEAVE", "APPROVE"))):
    rows = query(f"SELECT {LEAVE_REQUEST_COLS} FROM leave_requests WHERE id = %s", (leave_id,)).rows
    if not rows:
        raise ApiError(404, "Leave request not found.")
    leave_request = rows[0]
    assert_approver_scope(user, leave_request)
    if leave_request["status"] != "PENDING":
        raise ApiError(400, "Only pending requests can be rejected.")

    updated = query(
        f"UPDATE leave_requests SET status = 'REJECTED', approver_id = %s, approved_at = %s, reject_reason = %s WHERE id = %s RETURNING {LEAVE_REQUEST_COLS}",
        (user["id"], now_utc(), body.reason, leave_request["id"]),
    ).rows[0]
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="LEAVE_REJECTED", entity_type="LeaveRequest", entity_id=leave_request["id"], new_value={"reason": body.reason})
    return {"leaveRequest": updated}
