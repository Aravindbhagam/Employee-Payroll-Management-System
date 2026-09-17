import json

from ..db import query
from ..logger import logger
from .id import new_id


def record_audit(request=None, user_id=None, user_name=None, action=None, entity_type=None, entity_id=None, previous_value=..., new_value=...):
    try:
        query(
            """
            INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, previous_value, new_value, ip_address, user_agent)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                new_id(),
                user_id,
                user_name,
                action,
                entity_type,
                entity_id,
                json.dumps(previous_value) if previous_value is not ... else None,
                json.dumps(new_value) if new_value is not ... else None,
                request.client.host if request is not None and request.client else None,
                request.headers.get("user-agent") if request is not None else None,
            ),
        )
    except Exception as err:  # Auditing must never break the primary request flow.
        logger.error(f"Failed to write audit log: action={action} entityType={entity_type} err={err}")
