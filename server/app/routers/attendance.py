from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ..db import query
from ..deps import get_current_user
from ..errors import ApiError
from ..param_builder import ParamBuilder
from ..rbac import authorize
from ..utils.audit import record_audit
from ..utils.id import new_id
from ..utils.pagination import parse_pagination
from ..utils.scope import employee_id_for_user, employee_scope_filter
from ..utils.time import iso_now, start_of_day

router = APIRouter()

ATTENDANCE_JOIN_SELECT = """
  SELECT a.id, a.employee_id AS "employeeId", a.date, a.check_in AS "checkIn", a.check_out AS "checkOut",
    a.status, a.hours_worked AS "hoursWorked",
    e.first_name AS "e_firstName", e.last_name AS "e_lastName",
    d.name AS "d_name"
  FROM attendance a
  JOIN employees e ON e.id = a.employee_id
  LEFT JOIN departments d ON d.id = e.department_id
"""


def map_attendance_row(row):
    return {
        "id": row["id"],
        "employeeId": row["employeeId"],
        "date": row["date"],
        "checkIn": row["checkIn"],
        "checkOut": row["checkOut"],
        "status": row["status"],
        "hoursWorked": row["hoursWorked"],
        "employee": {"firstName": row["e_firstName"], "lastName": row["e_lastName"], "id": row["employeeId"], "department": {"name": row["d_name"]} if row["d_name"] else None},
    }


@router.get("")
def list_attendance(
    request: Request,
    employeeId: Optional[str] = None,
    to: Optional[str] = None,
    month: Optional[str] = None,
    user: dict = Depends(authorize("ATTENDANCE", "VIEW")),
):
    # "from" is a Python keyword, so it can't be a function parameter name --
    # read it directly off the query string instead.
    from_ = request.query_params.get("from")
    scope = employee_scope_filter(user)
    pb = ParamBuilder()
    conditions = []

    if scope is not None:
        if employeeId:
            if employeeId not in scope["in"]:
                raise ApiError(403, "You don't have permission to view this employee's attendance.")
            conditions.append(f"a.employee_id = {pb.add(employeeId)}")
        elif len(scope["in"]) == 0:
            conditions.append("FALSE")
        else:
            conditions.append(f'a.employee_id = ANY({pb.add(scope["in"])})')
    elif employeeId:
        conditions.append(f"a.employee_id = {pb.add(employeeId)}")

    if from_ or to:
        if from_:
            conditions.append(f"a.date >= {pb.add(datetime.fromisoformat(from_))}")
        if to:
            conditions.append(f"a.date <= {pb.add(datetime.fromisoformat(to))}")
    if month:
        y, m = (int(x) for x in month.split("-"))
        start = datetime(y, m, 1)
        end = datetime(y + 1, 1, 1) if m == 12 else datetime(y, m + 1, 1)
        conditions.append(f"a.date >= {pb.add(start)} AND a.date < {pb.add(end)}")

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    pagination = parse_pagination(request, opt_in=True)
    limit_offset_sql = ""
    if pagination:
        limit_offset_sql = f" LIMIT {pb.add(pagination['take'])} OFFSET {pb.add(pagination['skip'])}"

    rows = query(f"{ATTENDANCE_JOIN_SELECT} {where_sql} ORDER BY a.date DESC{limit_offset_sql}", pb.params).rows
    result = {"attendance": [map_attendance_row(r) for r in rows]}
    if pagination:
        count_params = pb.params[: len(pb.params) - 2]
        count = query(f"SELECT COUNT(*) FROM attendance a {where_sql}", count_params).rows[0]["count"]
        result.update({"total": int(count), "page": pagination["page"], "pageSize": pagination["pageSize"]})
    return result


@router.post("/check-in")
def check_in(request: Request, user: dict = Depends(get_current_user)):
    employee_id = employee_id_for_user(user["id"])
    if not employee_id:
        raise ApiError(400, "No employee profile linked to this account.")
    today = start_of_day()
    rows = query(
        """
        INSERT INTO attendance (id, employee_id, date, check_in, status)
        VALUES (%s, %s, %s, %s, 'PRESENT')
        ON CONFLICT (employee_id, date) DO UPDATE SET check_in = EXCLUDED.check_in, status = 'PRESENT'
        RETURNING id, employee_id AS "employeeId", date, check_in AS "checkIn", check_out AS "checkOut", status, hours_worked AS "hoursWorked"
        """,
        (new_id(), employee_id, today, iso_now()),
    ).rows
    record = rows[0]
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="ATTENDANCE_CHECK_IN", entity_type="Attendance", entity_id=record["id"])
    return {"attendance": record}


@router.post("/check-out")
def check_out(request: Request, user: dict = Depends(get_current_user)):
    employee_id = employee_id_for_user(user["id"])
    if not employee_id:
        raise ApiError(400, "No employee profile linked to this account.")
    today = start_of_day()
    existing_rows = query('SELECT id, check_in AS "checkIn" FROM attendance WHERE employee_id = %s AND date = %s', (employee_id, today)).rows
    existing = existing_rows[0] if existing_rows else None
    if not existing or not existing["checkIn"]:
        raise ApiError(400, "You must check in before checking out.")

    check_out_time = datetime.utcnow()
    check_in_time = datetime.fromisoformat(existing["checkIn"].replace("Z", "+00:00")).replace(tzinfo=None)
    hours_worked = max(0.0, (check_out_time - check_in_time).total_seconds() / 3600)
    rows = query(
        """
        UPDATE attendance SET check_out = %s, hours_worked = %s WHERE id = %s
        RETURNING id, employee_id AS "employeeId", date, check_in AS "checkIn", check_out AS "checkOut", status, hours_worked AS "hoursWorked"
        """,
        (check_out_time.isoformat(timespec="milliseconds") + "Z", round(hours_worked, 2), existing["id"]),
    ).rows
    record = rows[0]
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="ATTENDANCE_CHECK_OUT", entity_type="Attendance", entity_id=record["id"])
    return {"attendance": record}


class ManualAttendanceBody(BaseModel):
    employeeId: str
    date: str
    status: str
    checkIn: Optional[str] = None
    checkOut: Optional[str] = None
    hoursWorked: Optional[float] = None


@router.post("/manual")
def upsert_manual_attendance(request: Request, body: ManualAttendanceBody, user: dict = Depends(authorize("ATTENDANCE", "EDIT"))):
    date = start_of_day(datetime.fromisoformat(body.date))
    rows = query(
        """
        INSERT INTO attendance (id, employee_id, date, status, check_in, check_out, hours_worked)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (employee_id, date) DO UPDATE SET status = EXCLUDED.status, check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, hours_worked = EXCLUDED.hours_worked
        RETURNING id, employee_id AS "employeeId", date, check_in AS "checkIn", check_out AS "checkOut", status, hours_worked AS "hoursWorked"
        """,
        (new_id(), body.employeeId, date, body.status, body.checkIn, body.checkOut, body.hoursWorked or 0),
    ).rows
    record = rows[0]
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="ATTENDANCE_UPDATED", entity_type="Attendance", entity_id=record["id"], new_value=body.model_dump())
    return {"attendance": record}
