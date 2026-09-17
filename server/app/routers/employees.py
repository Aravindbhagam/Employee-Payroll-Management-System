from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ..db import query
from ..db_columns import DOCUMENT_COLS
from ..deps import get_current_user
from ..enums import ROLE_NAMES
from ..errors import ApiError
from ..param_builder import ParamBuilder
from ..rbac import authorize
from ..utils.audit import record_audit
from ..utils.id import new_id
from ..utils.pagination import parse_pagination
from ..utils.password import hash_password, mask_sensitive, random_token
from ..utils.scope import employee_scope_filter
from ..utils.time import now_utc

router = APIRouter()


def can_see_unmasked_sensitive(role, is_self):
    return is_self or role in ("SUPER_ADMIN", "PAYROLL_ADMIN", "HR_ADMIN")


# Row shape produced by EMPLOYEE_JOIN_SELECT: flat columns prefixed per table,
# assembled into {**employee, user, department, designation} by map_employee_row.
EMPLOYEE_JOIN_SELECT = """
  SELECT
    e.id, e.user_id AS "userId", e.first_name AS "firstName", e.last_name AS "lastName",
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
"""


def map_employee_row(row):
    return {
        "id": row["id"],
        "userId": row["userId"],
        "firstName": row["firstName"],
        "lastName": row["lastName"],
        "phone": row["phone"],
        "address": row["address"],
        "dateOfBirth": row["dateOfBirth"],
        "dateOfJoining": row["dateOfJoining"],
        "departmentId": row["departmentId"],
        "designationId": row["designationId"],
        "employmentType": row["employmentType"],
        "status": row["status"],
        "photoUrl": row["photoUrl"],
        "bankAccountNumber": row["bankAccountNumber"],
        "bankName": row["bankName"],
        "taxId": row["taxId"],
        "emergencyContactName": row["emergencyContactName"],
        "emergencyContactPhone": row["emergencyContactPhone"],
        "createdAt": row["createdAt"],
        "updatedAt": row["updatedAt"],
        "user": {
            "id": row["u_id"],
            "employeeCode": row["u_employeeCode"],
            "email": row["u_email"],
            "role": row["u_role"],
            "status": row["u_status"],
            "managerId": row["u_managerId"],
        },
        "department": {"id": row["d_id"], "name": row["d_name"]} if row["d_id"] else None,
        "designation": {"id": row["de_id"], "title": row["de_title"]} if row["de_id"] else None,
    }


def serialize_employee(emp, viewer_role, viewer_id):
    is_self = (emp.get("user") or {}).get("id") == viewer_id
    unmasked = can_see_unmasked_sensitive(viewer_role, is_self)
    user = emp.get("user") or {}
    department = emp.get("department")
    designation = emp.get("designation")
    return {
        "id": emp["id"],
        "userId": emp["userId"],
        "employeeCode": user.get("employeeCode"),
        "email": user.get("email"),
        "firstName": emp["firstName"],
        "lastName": emp["lastName"],
        "phone": emp["phone"],
        "address": emp["address"],
        "dateOfBirth": emp["dateOfBirth"],
        "dateOfJoining": emp["dateOfJoining"],
        "department": {"id": department["id"], "name": department["name"]} if department else None,
        "designation": {"id": designation["id"], "title": designation["title"]} if designation else None,
        "employmentType": emp["employmentType"],
        "status": emp["status"],
        "photoUrl": emp["photoUrl"],
        "managerId": user.get("managerId"),
        "role": user.get("role"),
        "userStatus": user.get("status"),
        "bankAccountNumber": emp["bankAccountNumber"] if unmasked else mask_sensitive(emp["bankAccountNumber"]),
        "bankName": emp["bankName"],
        "taxId": emp["taxId"] if unmasked else mask_sensitive(emp["taxId"]),
        "emergencyContactName": emp["emergencyContactName"],
        "emergencyContactPhone": emp["emergencyContactPhone"],
    }


@router.get("")
def list_employees(
    request: Request,
    departmentId: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(authorize("EMPLOYEES", "VIEW")),
):
    scope = employee_scope_filter(user)
    pb = ParamBuilder()
    conditions = []

    if scope is not None:
        if len(scope["in"]) == 0:
            conditions.append("FALSE")
        else:
            conditions.append(f'e.id = ANY({pb.add(scope["in"])})')
    if departmentId:
        conditions.append(f"e.department_id = {pb.add(departmentId)}")
    if status:
        conditions.append(f"e.status = {pb.add(status)}")
    if search and search.strip():
        like = f"%{search.strip()}%"
        p1, p2, p3, p4 = pb.add(like), pb.add(like), pb.add(like), pb.add(like)
        conditions.append(f"(e.first_name ILIKE {p1} OR e.last_name ILIKE {p2} OR u.email ILIKE {p3} OR u.employee_code ILIKE {p4})")

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    pagination = parse_pagination(request, opt_in=True)
    limit_offset_sql = ""
    if pagination:
        limit_offset_sql = f" LIMIT {pb.add(pagination['take'])} OFFSET {pb.add(pagination['skip'])}"

    rows = query(f"{EMPLOYEE_JOIN_SELECT} {where_sql} ORDER BY e.created_at DESC{limit_offset_sql}", pb.params).rows
    employees = [map_employee_row(r) for r in rows]

    result = {"employees": [serialize_employee(e, user["role"], user["id"]) for e in employees]}
    if pagination:
        count_params = pb.params[: len(pb.params) - 2]
        count = query(f"SELECT COUNT(*) FROM employees e JOIN users u ON u.id = e.user_id {where_sql}", count_params).rows[0]["count"]
        result.update({"total": int(count), "page": pagination["page"], "pageSize": pagination["pageSize"]})
    return result


@router.get("/{employee_id}")
def get_employee(employee_id: str, user: dict = Depends(authorize("EMPLOYEES", "VIEW"))):
    rows = query(f"{EMPLOYEE_JOIN_SELECT} WHERE e.id = %s", (employee_id,)).rows
    if not rows:
        raise ApiError(404, "Employee not found.")
    emp = map_employee_row(rows[0])

    scope = employee_scope_filter(user)
    if scope is not None and emp["id"] not in scope["in"]:
        raise ApiError(403, "You don't have permission to view this employee.")
    return {"employee": serialize_employee(emp, user["role"], user["id"])}


class CreateEmployeeBody(BaseModel):
    email: str
    firstName: str
    lastName: str
    phone: Optional[str] = None
    address: Optional[str] = None
    dateOfBirth: Optional[str] = None
    dateOfJoining: Optional[str] = None
    departmentId: Optional[str] = None
    designationId: Optional[str] = None
    managerId: Optional[str] = None
    employmentType: Optional[str] = None
    role: str = "EMPLOYEE"
    bankAccountNumber: Optional[str] = None
    bankName: Optional[str] = None
    taxId: Optional[str] = None


def next_employee_code():
    count = query("SELECT COUNT(*) FROM users").rows[0]["count"]
    return f"EMP{str(int(count) + 1001).zfill(5)}"


@router.post("", status_code=201)
def create_employee(request: Request, body: CreateEmployeeBody, user: dict = Depends(authorize("EMPLOYEES", "CREATE"))):
    if body.role not in ROLE_NAMES:
        raise ApiError(400, "Validation failed.")
    email = body.email.lower()
    if query("SELECT id FROM users WHERE email = %s", (email,)).rows:
        raise ApiError(409, "A user with this email already exists.")

    temp_password = random_token(6)
    password_hash = hash_password(temp_password)
    employee_code = next_employee_code()
    user_id = new_id()
    employee_id = new_id()

    query(
        """
        INSERT INTO users (id, employee_code, email, password_hash, role, department_id, manager_id, must_change_password)
        VALUES (%s, %s, %s, %s, %s, %s, %s, true)
        """,
        (user_id, employee_code, email, password_hash, body.role, body.departmentId, body.managerId),
    )

    query(
        """
        INSERT INTO employees (id, user_id, first_name, last_name, phone, address, date_of_birth, date_of_joining, department_id, designation_id, employment_type, bank_account_number, bank_name, tax_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            employee_id,
            user_id,
            body.firstName,
            body.lastName,
            body.phone,
            body.address,
            body.dateOfBirth,
            body.dateOfJoining or now_utc(),
            body.departmentId,
            body.designationId,
            body.employmentType or "Full-Time",
            body.bankAccountNumber,
            body.bankName,
            body.taxId,
        ),
    )

    record_audit(
        request=request,
        user_id=user["id"],
        user_name=user["email"],
        action="EMPLOYEE_CREATED",
        entity_type="Employee",
        entity_id=employee_id,
        new_value={"email": body.email, "firstName": body.firstName, "lastName": body.lastName, "role": body.role},
    )

    rows = query(f"{EMPLOYEE_JOIN_SELECT} WHERE e.id = %s", (employee_id,)).rows
    emp = map_employee_row(rows[0])
    return {
        "employee": serialize_employee(emp, user["role"], user["id"]),
        "temporaryPassword": temp_password,
        "employeeCode": employee_code,
    }


class UpdateEmployeeBody(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    dateOfBirth: Optional[str] = None
    departmentId: Optional[str] = None
    designationId: Optional[str] = None
    managerId: Optional[str] = None
    employmentType: Optional[str] = None
    status: Optional[str] = None
    bankAccountNumber: Optional[str] = None
    bankName: Optional[str] = None
    taxId: Optional[str] = None
    emergencyContactName: Optional[str] = None
    emergencyContactPhone: Optional[str] = None


# Fields an EMPLOYEE is permitted to self-update (limited personal info only).
SELF_EDITABLE_FIELDS = {"phone", "address", "emergencyContactName", "emergencyContactPhone"}

EMPLOYEE_FIELD_TO_COLUMN = {
    "firstName": "first_name",
    "lastName": "last_name",
    "phone": "phone",
    "address": "address",
    "dateOfBirth": "date_of_birth",
    "departmentId": "department_id",
    "designationId": "designation_id",
    "employmentType": "employment_type",
    "status": "status",
    "bankAccountNumber": "bank_account_number",
    "bankName": "bank_name",
    "taxId": "tax_id",
    "emergencyContactName": "emergency_contact_name",
    "emergencyContactPhone": "emergency_contact_phone",
}


def authorize_employee_edit(employee_id: str, request: Request, user: dict = Depends(get_current_user)):
    if user["role"] in ("SUPER_ADMIN", "HR_ADMIN"):
        return user
    rows = query("SELECT user_id AS \"userId\" FROM employees WHERE id = %s", (employee_id,)).rows
    if rows and rows[0]["userId"] == user["id"]:
        return user
    raise ApiError(403, "You don't have permission to edit this employee.")


@router.put("/{employee_id}")
def update_employee(employee_id: str, request: Request, body: UpdateEmployeeBody, user: dict = Depends(authorize_employee_edit)):
    existing_rows = query(f"{EMPLOYEE_JOIN_SELECT} WHERE e.id = %s", (employee_id,)).rows
    if not existing_rows:
        raise ApiError(404, "Employee not found.")
    existing = map_employee_row(existing_rows[0])

    is_self = existing["userId"] == user["id"]
    data = body.model_dump(exclude_unset=True)

    if is_self and user["role"] == "EMPLOYEE":
        data = {k: v for k, v in data.items() if k in SELF_EDITABLE_FIELDS}
    elif not is_self:
        scope = employee_scope_filter(user)
        if scope is not None and existing["id"] not in scope["in"]:
            raise ApiError(403, "You don't have permission to edit this employee.")
        if user["role"] == "MANAGER":
            raise ApiError(403, "Managers cannot edit employee profiles.")

    department_id_set = "departmentId" in data
    manager_id_set = "managerId" in data
    department_id = data.get("departmentId")
    manager_id = data.get("managerId")

    pb = ParamBuilder()
    set_clauses = []
    for key, value in data.items():
        column = EMPLOYEE_FIELD_TO_COLUMN.get(key)
        if not column:
            continue
        set_clauses.append(f"{column} = {pb.add(value)}")
    if set_clauses:
        set_clauses.append(f"updated_at = {pb.add(now_utc())}")
        query(f"UPDATE employees SET {', '.join(set_clauses)} WHERE id = {pb.add(employee_id)}", pb.params)

    if department_id_set or manager_id_set:
        upb = ParamBuilder()
        user_set_clauses = []
        if department_id_set:
            user_set_clauses.append(f"department_id = {upb.add(department_id)}")
        if manager_id_set:
            user_set_clauses.append(f"manager_id = {upb.add(manager_id)}")
        query(f"UPDATE users SET {', '.join(user_set_clauses)} WHERE id = {upb.add(existing['userId'])}", upb.params)

    record_audit(
        request=request,
        user_id=user["id"],
        user_name=user["email"],
        action="EMPLOYEE_UPDATED",
        entity_type="Employee",
        entity_id=existing["id"],
        previous_value={"firstName": existing["firstName"], "lastName": existing["lastName"], "status": existing["status"]},
        new_value=data,
    )

    refreshed_rows = query(f"{EMPLOYEE_JOIN_SELECT} WHERE e.id = %s", (existing["id"],)).rows
    refreshed = map_employee_row(refreshed_rows[0])
    return {"employee": serialize_employee(refreshed, user["role"], user["id"])}


@router.delete("/{employee_id}")
def delete_employee(employee_id: str, request: Request, user: dict = Depends(authorize("EMPLOYEES", "DELETE"))):
    rows = query('SELECT id, user_id AS "userId", status FROM employees WHERE id = %s', (employee_id,)).rows
    if not rows:
        raise ApiError(404, "Employee not found.")
    existing = rows[0]

    query("UPDATE users SET status = %s WHERE id = %s", ("INACTIVE", existing["userId"]))

    record_audit(
        request=request,
        user_id=user["id"],
        user_name=user["email"],
        action="EMPLOYEE_OFFBOARDED",
        entity_type="Employee",
        entity_id=existing["id"],
        previous_value={"status": existing["status"]},
    )
    return {"success": True, "message": "Employee has been deactivated (offboarded)."}


# ---- Documents ----


@router.get("/{employee_id}/documents")
def list_documents(employee_id: str, user: dict = Depends(authorize("DOCUMENTS", "VIEW"))):
    emp_rows = query("SELECT id FROM employees WHERE id = %s", (employee_id,)).rows
    if not emp_rows:
        raise ApiError(404, "Employee not found.")
    scope = employee_scope_filter(user)
    if scope is not None and employee_id not in scope["in"]:
        raise ApiError(403, "You don't have permission to view these documents.")

    rows = query(f'SELECT {DOCUMENT_COLS} FROM documents WHERE employee_id = %s ORDER BY uploaded_at DESC', (employee_id,)).rows
    return {"documents": rows}


class DocumentBody(BaseModel):
    name: str
    type: str
    fileName: str


@router.post("/{employee_id}/documents", status_code=201)
def add_document(employee_id: str, request: Request, body: DocumentBody, user: dict = Depends(authorize("DOCUMENTS", "CREATE"))):
    if not query("SELECT id FROM employees WHERE id = %s", (employee_id,)).rows:
        raise ApiError(404, "Employee not found.")
    doc_id = new_id()
    query(
        "INSERT INTO documents (id, employee_id, name, type, file_name) VALUES (%s, %s, %s, %s, %s)",
        (doc_id, employee_id, body.name, body.type, body.fileName),
    )
    document = query(f"SELECT {DOCUMENT_COLS} FROM documents WHERE id = %s", (doc_id,)).rows[0]
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="DOCUMENT_UPLOADED", entity_type="Document", entity_id=document["id"], new_value=body.model_dump())
    return {"document": document}


@router.delete("/{employee_id}/documents/{doc_id}")
def delete_document(employee_id: str, doc_id: str, request: Request, user: dict = Depends(authorize("DOCUMENTS", "DELETE"))):
    rows = query(f"SELECT {DOCUMENT_COLS} FROM documents WHERE id = %s", (doc_id,)).rows
    if not rows:
        raise ApiError(404, "Document not found.")
    document = rows[0]
    query("DELETE FROM documents WHERE id = %s", (doc_id,))
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="DOCUMENT_DELETED", entity_type="Document", entity_id=document["id"], previous_value=document)
    return {"success": True}
