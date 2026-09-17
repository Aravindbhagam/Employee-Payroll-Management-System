from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ..db import query
from ..db_columns import DEPARTMENT_COLS
from ..errors import ApiError
from ..param_builder import ParamBuilder
from ..rbac import authorize
from ..utils.audit import record_audit
from ..utils.id import new_id

router = APIRouter()


@router.get("")
def list_departments(user: dict = Depends(authorize("DEPARTMENTS", "VIEW"))):
    rows = query(
        """
        SELECT d.id, d.name, d.description, d.manager_id AS "managerId", d.created_at AS "createdAt",
          m.id AS "m_id", me.first_name AS "me_firstName", me.last_name AS "me_lastName",
          (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id) AS "employeeCount"
        FROM departments d
        LEFT JOIN users m ON m.id = d.manager_id
        LEFT JOIN employees me ON me.user_id = m.id
        ORDER BY d.name ASC
        """
    ).rows
    departments = [
        {
            "id": r["id"],
            "name": r["name"],
            "description": r["description"],
            "managerId": r["managerId"],
            "createdAt": r["createdAt"],
            "manager": (
                {"id": r["m_id"], "employee": {"firstName": r["me_firstName"], "lastName": r["me_lastName"]} if r["me_firstName"] else None}
                if r["m_id"]
                else None
            ),
            "_count": {"employees": int(r["employeeCount"])},
        }
        for r in rows
    ]
    return {"departments": departments}


class DepartmentBody(BaseModel):
    name: str
    description: Optional[str] = None
    managerId: Optional[str] = None


@router.post("", status_code=201)
def create_department(request: Request, body: DepartmentBody, user: dict = Depends(authorize("DEPARTMENTS", "CREATE"))):
    dept_id = new_id()
    query("INSERT INTO departments (id, name, description, manager_id) VALUES (%s, %s, %s, %s)", (dept_id, body.name, body.description, body.managerId))
    dept = query(f"SELECT {DEPARTMENT_COLS} FROM departments WHERE id = %s", (dept_id,)).rows[0]
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="DEPARTMENT_CREATED", entity_type="Department", entity_id=dept["id"], new_value=body.model_dump())
    return {"department": dept}


class UpdateDepartmentBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    managerId: Optional[str] = None


@router.put("/{department_id}")
def update_department(department_id: str, request: Request, body: UpdateDepartmentBody, user: dict = Depends(authorize("DEPARTMENTS", "EDIT"))):
    existing_rows = query(f"SELECT {DEPARTMENT_COLS} FROM departments WHERE id = %s", (department_id,)).rows
    if not existing_rows:
        raise ApiError(404, "Department not found.")
    existing = existing_rows[0]
    data = body.model_dump(exclude_unset=True)

    pb = ParamBuilder()
    set_clauses = []
    if "name" in data:
        set_clauses.append(f"name = {pb.add(data['name'])}")
    if "description" in data:
        set_clauses.append(f"description = {pb.add(data['description'])}")
    if "managerId" in data:
        set_clauses.append(f"manager_id = {pb.add(data['managerId'])}")
    if set_clauses:
        query(f"UPDATE departments SET {', '.join(set_clauses)} WHERE id = {pb.add(department_id)}", pb.params)

    dept = query(f"SELECT {DEPARTMENT_COLS} FROM departments WHERE id = %s", (department_id,)).rows[0]
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="DEPARTMENT_UPDATED", entity_type="Department", entity_id=dept["id"], previous_value=existing, new_value=data)
    return {"department": dept}


@router.delete("/{department_id}")
def delete_department(department_id: str, request: Request, user: dict = Depends(authorize("DEPARTMENTS", "DELETE"))):
    existing_rows = query(f"SELECT {DEPARTMENT_COLS} FROM departments WHERE id = %s", (department_id,)).rows
    if not existing_rows:
        raise ApiError(404, "Department not found.")
    query("DELETE FROM departments WHERE id = %s", (department_id,))
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="DEPARTMENT_DELETED", entity_type="Department", entity_id=department_id, previous_value=existing_rows[0])
    return {"success": True}
