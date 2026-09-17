from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ..db import query
from ..db_columns import ANNOUNCEMENT_COLS
from ..rbac import authorize
from ..utils.audit import record_audit
from ..utils.id import new_id

router = APIRouter()


@router.get("")
def list_announcements(user: dict = Depends(authorize("ANNOUNCEMENTS", "VIEW"))):
    conditions = ["a.audience = 'ALL'"]
    params = []
    if user.get("departmentId"):
        params.append(user["departmentId"])
        conditions.append(f"(a.audience = 'DEPARTMENT' AND a.department_id = %s)")

    rows = query(
        f"""
        SELECT a.id, a.title, a.body, a.created_by_id AS "createdById", a.audience,
          a.department_id AS "departmentId", a.created_at AS "createdAt",
          u.email AS "cb_email"
        FROM announcements a
        LEFT JOIN users u ON u.id = a.created_by_id
        WHERE {' OR '.join(conditions)}
        ORDER BY a.created_at DESC
        LIMIT 20
        """,
        params,
    ).rows

    announcements = [
        {
            "id": r["id"],
            "title": r["title"],
            "body": r["body"],
            "createdById": r["createdById"],
            "audience": r["audience"],
            "departmentId": r["departmentId"],
            "createdAt": r["createdAt"],
            "createdBy": {"email": r["cb_email"]} if r["cb_email"] else None,
        }
        for r in rows
    ]
    return {"announcements": announcements}


class AnnouncementBody(BaseModel):
    title: str
    body: str
    audience: str = "ALL"
    departmentId: Optional[str] = None


@router.post("", status_code=201)
def create_announcement(request: Request, body: AnnouncementBody, user: dict = Depends(authorize("ANNOUNCEMENTS", "CREATE"))):
    ann_id = new_id()
    query(
        "INSERT INTO announcements (id, title, body, audience, department_id, created_by_id) VALUES (%s, %s, %s, %s, %s, %s)",
        (ann_id, body.title, body.body, body.audience, body.departmentId, user["id"]),
    )
    announcement = query(f"SELECT {ANNOUNCEMENT_COLS} FROM announcements WHERE id = %s", (ann_id,)).rows[0]
    record_audit(request=request, user_id=user["id"], user_name=user["email"], action="ANNOUNCEMENT_CREATED", entity_type="Announcement", entity_id=announcement["id"], new_value=body.model_dump())
    return {"announcement": announcement}
