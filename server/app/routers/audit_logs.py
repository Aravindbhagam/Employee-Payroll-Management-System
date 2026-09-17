import json
from typing import Optional

from fastapi import APIRouter, Depends, Request

from ..db import query
from ..db_columns import AUDIT_LOG_COLS
from ..param_builder import ParamBuilder
from ..rbac import authorize
from ..utils.pagination import parse_pagination

router = APIRouter()


@router.get("")
def list_audit_logs(
    request: Request,
    action: Optional[str] = None,
    entityType: Optional[str] = None,
    userId: Optional[str] = None,
    from_: Optional[str] = None,
    to: Optional[str] = None,
    user: dict = Depends(authorize("AUDIT_LOGS", "VIEW")),
):
    from_ = request.query_params.get("from")
    pb = ParamBuilder()
    conditions = []
    if action:
        conditions.append(f"action ILIKE {pb.add(f'%{action}%')}")
    if entityType:
        conditions.append(f"entity_type = {pb.add(entityType)}")
    if userId:
        conditions.append(f"user_id = {pb.add(userId)}")
    if from_:
        conditions.append(f"created_at >= {pb.add(from_)}")
    if to:
        conditions.append(f"created_at <= {pb.add(to)}")

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    pagination = parse_pagination(request, default_page_size=50)
    limit_offset_sql = f" LIMIT {pb.add(pagination['take'])} OFFSET {pb.add(pagination['skip'])}"

    logs = query(f"SELECT {AUDIT_LOG_COLS} FROM audit_logs {where_sql} ORDER BY created_at DESC{limit_offset_sql}", pb.params).rows
    count_params = pb.params[: len(pb.params) - 2]
    total = int(query(f"SELECT COUNT(*) FROM audit_logs {where_sql}", count_params).rows[0]["count"])

    parsed = [
        {**log, "previousValue": json.loads(log["previousValue"]) if log["previousValue"] else None, "newValue": json.loads(log["newValue"]) if log["newValue"] else None} for log in logs
    ]
    return {"logs": parsed, "total": total, "page": pagination["page"], "pageSize": pagination["pageSize"]}
