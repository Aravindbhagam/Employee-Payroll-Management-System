from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ..db import query, with_transaction
from ..deps import get_current_user
from ..enums import ROLE_NAMES
from ..errors import ApiError
from ..param_builder import ParamBuilder
from ..permissions import ROLE_LABELS
from ..rbac import authorize, get_effective_permissions
from ..utils.audit import record_audit
from ..utils.id import new_id
from ..utils.pagination import parse_pagination
from ..utils.password import hash_password, random_token
from ..utils.time import future

router = APIRouter()

USER_JOIN_SELECT = """
  SELECT
    u.id, u.employee_code AS "employeeCode", u.email, u.role, u.status,
    u.two_factor_enabled AS "twoFactorEnabled", u.last_login_at AS "lastLoginAt",
    u.last_login_ip AS "lastLoginIp", u.locked_until AS "lockedUntil", u.created_at AS "createdAt",
    d.id AS "d_id", d.name AS "d_name",
    e.first_name AS "e_firstName", e.last_name AS "e_lastName",
    m.id AS "m_id", me.first_name AS "me_firstName", me.last_name AS "me_lastName"
  FROM users u
  LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN employees e ON e.user_id = u.id
  LEFT JOIN users m ON m.id = u.manager_id
  LEFT JOIN employees me ON me.user_id = m.id
"""


def map_user_row(row):
    return {
        "id": row["id"],
        "employeeCode": row["employeeCode"],
        "email": row["email"],
        "role": row["role"],
        "status": row["status"],
        "department": {"id": row["d_id"], "name": row["d_name"]} if row["d_id"] else None,
        "manager": {"id": row["m_id"], "name": f'{row["me_firstName"]} {row["me_lastName"]}'} if row["m_id"] and row["me_firstName"] else None,
        "twoFactorEnabled": row["twoFactorEnabled"],
        "lastLoginAt": row["lastLoginAt"],
        "lastLoginIp": row["lastLoginIp"],
        "lockedUntil": row["lockedUntil"],
        "createdAt": row["createdAt"],
        "name": f'{row["e_firstName"]} {row["e_lastName"]}' if row["e_firstName"] else row["email"],
    }


@router.get("")
def list_users(
    request: Request,
    role: Optional[str] = None,
    departmentId: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(authorize("USERS", "VIEW")),
):
    pb = ParamBuilder()
    conditions = []
    if role:
        conditions.append(f"u.role = {pb.add(role)}")
    if departmentId:
        conditions.append(f"u.department_id = {pb.add(departmentId)}")
    if status:
        conditions.append(f"u.status = {pb.add(status)}")
    if search:
        like = f"%{search}%"
        conditions.append(
            f"(u.email ILIKE {pb.add(like)} OR u.employee_code ILIKE {pb.add(like)} OR e.first_name ILIKE {pb.add(like)} OR e.last_name ILIKE {pb.add(like)})"
        )

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    pagination = parse_pagination(request, opt_in=True)
    limit_offset_sql = ""
    if pagination:
        limit_offset_sql = f" LIMIT {pb.add(pagination['take'])} OFFSET {pb.add(pagination['skip'])}"

    rows = query(f"{USER_JOIN_SELECT} {where_sql} ORDER BY u.created_at DESC{limit_offset_sql}", pb.params).rows
    result = {"users": [map_user_row(r) for r in rows]}
    if pagination:
        count_params = pb.params[: len(pb.params) - 2]
        count = query(f"SELECT COUNT(*) FROM users u LEFT JOIN employees e ON e.user_id = u.id {where_sql}", count_params).rows[0]["count"]
        result.update({"total": int(count), "page": pagination["page"], "pageSize": pagination["pageSize"]})
    return result


@router.get("/roles/permission-matrix")
def get_role_permission_matrix(user: dict = Depends(authorize("USERS", "MANAGE"))):
    rows = query("SELECT id, role, resource, action, allowed FROM role_permissions").rows
    return {"matrix": rows, "roleLabels": ROLE_LABELS}


class RolePermissionUpdate(BaseModel):
    role: str
    resource: str
    action: str
    allowed: bool


class RolePermissionMatrixBody(BaseModel):
    updates: list[RolePermissionUpdate]


@router.put("/roles/permission-matrix")
def update_role_permission_matrix(request: Request, body: RolePermissionMatrixBody, user: dict = Depends(authorize("USERS", "MANAGE"))):
    def _tx(client):
        for u in body.updates:
            client.query(
                """
                INSERT INTO role_permissions (id, role, resource, action, allowed)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (role, resource, action) DO UPDATE SET allowed = EXCLUDED.allowed
                """,
                (new_id(), u.role, u.resource, u.action, u.allowed),
            )

    with_transaction(_tx)
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="PERMISSION_CHANGED", entity_type="RolePermission", new_value=[u.model_dump() for u in body.updates])
    return {"success": True}


@router.get("/{user_id}")
def get_user(user_id: str, user: dict = Depends(authorize("USERS", "VIEW"))):
    rows = query(f"{USER_JOIN_SELECT} WHERE u.id = %s", (user_id,)).rows
    if not rows:
        raise ApiError(404, "User not found.")
    return {"user": map_user_row(rows[0])}


class CreateUserBody(BaseModel):
    email: str
    firstName: str
    lastName: str
    role: str
    departmentId: Optional[str] = None
    managerId: Optional[str] = None


def next_employee_code():
    count = query("SELECT COUNT(*) FROM users").rows[0]["count"]
    return f"EMP{str(int(count) + 1001).zfill(5)}"


@router.post("", status_code=201)
def create_user(request: Request, body: CreateUserBody, user: dict = Depends(authorize("USERS", "CREATE"))):
    if body.role not in ROLE_NAMES:
        raise ApiError(400, "Validation failed.")
    email = body.email.lower()
    if query("SELECT id FROM users WHERE email = %s", (email,)).rows:
        raise ApiError(409, "A user with this email already exists.")

    temp_password = random_token(6)
    password_hash = hash_password(temp_password)
    employee_code = next_employee_code()
    user_id = new_id()

    query(
        """
        INSERT INTO users (id, employee_code, email, password_hash, role, department_id, manager_id, must_change_password)
        VALUES (%s, %s, %s, %s, %s, %s, %s, true)
        """,
        (user_id, employee_code, email, password_hash, body.role, body.departmentId, body.managerId),
    )
    query(
        "INSERT INTO employees (id, user_id, first_name, last_name, department_id) VALUES (%s, %s, %s, %s, %s)",
        (new_id(), user_id, body.firstName, body.lastName, body.departmentId),
    )

    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="USER_CREATED", entity_type="User", entity_id=user_id, new_value={"email": body.email, "role": body.role})

    rows = query(f"{USER_JOIN_SELECT} WHERE u.id = %s", (user_id,)).rows
    return {"user": map_user_row(rows[0]), "temporaryPassword": temp_password, "employeeCode": employee_code}


class UpdateUserBody(BaseModel):
    role: Optional[str] = None
    departmentId: Optional[str] = None
    managerId: Optional[str] = None


@router.put("/{user_id}")
def update_user(user_id: str, request: Request, body: UpdateUserBody, user: dict = Depends(authorize("USERS", "EDIT"))):
    rows = query('SELECT id, role, department_id AS "departmentId", manager_id AS "managerId" FROM users WHERE id = %s', (user_id,)).rows
    if not rows:
        raise ApiError(404, "User not found.")
    existing = rows[0]
    data = body.model_dump(exclude_unset=True)

    if existing["role"] == "SUPER_ADMIN" and data.get("role") and data["role"] != "SUPER_ADMIN" and existing["id"] == user["id"]:
        raise ApiError(400, "You cannot demote your own Super Admin account.")

    pb = ParamBuilder()
    set_clauses = []
    if "role" in data:
        set_clauses.append(f"role = {pb.add(data['role'])}")
    if "departmentId" in data:
        set_clauses.append(f"department_id = {pb.add(data['departmentId'])}")
    if "managerId" in data:
        set_clauses.append(f"manager_id = {pb.add(data['managerId'])}")
    if set_clauses:
        query(f"UPDATE users SET {', '.join(set_clauses)} WHERE id = {pb.add(user_id)}", pb.params)

    record_audit(
        request=request,
        user_id=user["id"],
        user_name=user["email"],
        action="USER_UPDATED",
        entity_type="User",
        entity_id=user_id,
        previous_value={"role": existing["role"], "departmentId": existing["departmentId"], "managerId": existing["managerId"]},
        new_value=data,
    )

    rows = query(f"{USER_JOIN_SELECT} WHERE u.id = %s", (user_id,)).rows
    return {"user": map_user_row(rows[0])}


def _set_status(user_id, request, actor, status, action):
    rows = query("SELECT id, status FROM users WHERE id = %s", (user_id,)).rows
    if not rows:
        raise ApiError(404, "User not found.")
    existing = rows[0]
    if existing["id"] == actor["id"]:
        raise ApiError(400, "You cannot change the status of your own account.")

    query("UPDATE users SET status = %s WHERE id = %s", (status, user_id))
    record_audit(request=request, user_id=actor["id"], user_name=actor["email"], action=action, entity_type="User", entity_id=user_id, previous_value={"status": existing["status"]}, new_value={"status": status})
    return {"user": {"id": user_id, "status": status}}


@router.post("/{user_id}/activate")
def activate_user(user_id: str, request: Request, user: dict = Depends(authorize("USERS", "MANAGE"))):
    return _set_status(user_id, request, user, "ACTIVE", "USER_ACTIVATED")


@router.post("/{user_id}/deactivate")
def deactivate_user(user_id: str, request: Request, user: dict = Depends(authorize("USERS", "MANAGE"))):
    return _set_status(user_id, request, user, "INACTIVE", "USER_DEACTIVATED")


@router.post("/{user_id}/lock")
def lock_user(user_id: str, request: Request, user: dict = Depends(authorize("USERS", "MANAGE"))):
    if not query("SELECT id FROM users WHERE id = %s", (user_id,)).rows:
        raise ApiError(404, "User not found.")
    locked_until = future(days=100 * 365)
    query("UPDATE users SET locked_until = %s WHERE id = %s", (locked_until, user_id))
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="USER_LOCKED", entity_type="User", entity_id=user_id)
    return {"user": {"id": user_id, "lockedUntil": locked_until}}


@router.post("/{user_id}/unlock")
def unlock_user(user_id: str, request: Request, user: dict = Depends(authorize("USERS", "MANAGE"))):
    if not query("SELECT id FROM users WHERE id = %s", (user_id,)).rows:
        raise ApiError(404, "User not found.")
    query("UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = %s", (user_id,))
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="USER_UNLOCKED", entity_type="User", entity_id=user_id)
    return {"user": {"id": user_id, "lockedUntil": None}}


@router.post("/{user_id}/reset-password")
def admin_reset_password(user_id: str, request: Request, user: dict = Depends(authorize("USERS", "MANAGE"))):
    rows = query("SELECT id FROM users WHERE id = %s", (user_id,)).rows
    if not rows:
        raise ApiError(404, "User not found.")
    existing = rows[0]

    temp_password = random_token(6)
    password_hash = hash_password(temp_password)
    query("UPDATE users SET password_hash = %s, must_change_password = true, failed_login_attempts = 0, locked_until = NULL WHERE id = %s", (password_hash, user_id))
    query("UPDATE sessions SET revoked = true WHERE user_id = %s", (user_id,))

    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="USER_PASSWORD_RESET_BY_ADMIN", entity_type="User", entity_id=existing["id"])
    return {"success": True, "temporaryPassword": temp_password}


@router.get("/{user_id}/permissions")
def get_user_permissions(user_id: str, user: dict = Depends(authorize("USERS", "MANAGE"))):
    rows = query("SELECT id, role FROM users WHERE id = %s", (user_id,)).rows
    if not rows:
        raise ApiError(404, "User not found.")
    target = rows[0]

    effective = get_effective_permissions(target["id"], target["role"])
    overrides = query('SELECT id, user_id AS "userId", resource, action, allowed FROM user_permissions WHERE user_id = %s', (target["id"],)).rows

    effective_array = []
    for key, allowed in effective.items():
        resource, action = key.split(":")
        effective_array.append({"resource": resource, "action": action, "allowed": allowed})

    return {"role": target["role"], "effective": effective_array, "overrides": overrides}


class PermissionOverride(BaseModel):
    resource: str
    action: str
    allowed: bool


class SetUserPermissionsBody(BaseModel):
    overrides: list[PermissionOverride]


@router.put("/{user_id}/permissions")
def set_user_permissions(user_id: str, request: Request, body: SetUserPermissionsBody, user: dict = Depends(authorize("USERS", "MANAGE"))):
    if not query("SELECT id FROM users WHERE id = %s", (user_id,)).rows:
        raise ApiError(404, "User not found.")

    def _tx(client):
        for o in body.overrides:
            client.query(
                """
                INSERT INTO user_permissions (id, user_id, resource, action, allowed)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (user_id, resource, action) DO UPDATE SET allowed = EXCLUDED.allowed
                """,
                (new_id(), user_id, o.resource, o.action, o.allowed),
            )

    with_transaction(_tx)
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="PERMISSION_CHANGED", entity_type="User", entity_id=user_id, new_value=[o.model_dump() for o in body.overrides])
    return {"success": True}
