from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ..db import query
from ..db_columns import DESIGNATION_COLS
from ..errors import ApiError
from ..param_builder import ParamBuilder
from ..rbac import authorize
from ..utils.audit import record_audit
from ..utils.id import new_id

router = APIRouter()


@router.get("")
def list_designations(user: dict = Depends(authorize("DESIGNATIONS", "VIEW"))):
    rows = query(
        """
        SELECT de.id, de.title, de.department_id AS "departmentId",
          d.id AS "d_id", d.name AS "d_name"
        FROM designations de
        JOIN departments d ON d.id = de.department_id
        ORDER BY de.title ASC
        """
    ).rows
    designations = [{"id": r["id"], "title": r["title"], "departmentId": r["departmentId"], "department": {"id": r["d_id"], "name": r["d_name"]}} for r in rows]
    return {"designations": designations}


class DesignationBody(BaseModel):
    title: str
    departmentId: str


@router.post("", status_code=201)
def create_designation(request: Request, body: DesignationBody, user: dict = Depends(authorize("DESIGNATIONS", "CREATE"))):
    des_id = new_id()
    query("INSERT INTO designations (id, title, department_id) VALUES (%s, %s, %s)", (des_id, body.title, body.departmentId))
    designation = query(f"SELECT {DESIGNATION_COLS} FROM designations WHERE id = %s", (des_id,)).rows[0]
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="DESIGNATION_CREATED", entity_type="Designation", entity_id=designation["id"], new_value=body.model_dump())
    return {"designation": designation}


class UpdateDesignationBody(BaseModel):
    title: Optional[str] = None
    departmentId: Optional[str] = None


@router.put("/{designation_id}")
def update_designation(designation_id: str, request: Request, body: UpdateDesignationBody, user: dict = Depends(authorize("DESIGNATIONS", "EDIT"))):
    existing_rows = query(f"SELECT {DESIGNATION_COLS} FROM designations WHERE id = %s", (designation_id,)).rows
    if not existing_rows:
        raise ApiError(404, "Designation not found.")
    existing = existing_rows[0]
    data = body.model_dump(exclude_unset=True)

    pb = ParamBuilder()
    set_clauses = []
    if "title" in data:
        set_clauses.append(f"title = {pb.add(data['title'])}")
    if "departmentId" in data:
        set_clauses.append(f"department_id = {pb.add(data['departmentId'])}")
    if set_clauses:
        query(f"UPDATE designations SET {', '.join(set_clauses)} WHERE id = {pb.add(designation_id)}", pb.params)

    designation = query(f"SELECT {DESIGNATION_COLS} FROM designations WHERE id = %s", (designation_id,)).rows[0]
    record_audit(
        request=request, user_id=user["id"], user_name=user["email"], action="DESIGNATION_UPDATED", entity_type="Designation", entity_id=designation["id"], previous_value=existing, new_value=data
    )
    return {"designation": designation}


@router.delete("/{designation_id}")
def delete_designation(designation_id: str, request: Request, user: dict = Depends(authorize("DESIGNATIONS", "DELETE"))):
    existing_rows = query(f"SELECT {DESIGNATION_COLS} FROM designations WHERE id = %s", (designation_id,)).rows
    if not existing_rows:
        raise ApiError(404, "Designation not found.")
    query("DELETE FROM designations WHERE id = %s", (designation_id,))
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="DESIGNATION_DELETED", entity_type="Designation", entity_id=designation_id, previous_value=existing_rows[0])
    return {"success": True}
