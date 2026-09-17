"""Computes the effective permission set for a user: role defaults from
role_permissions, overridden per-user by any rows in user_permissions.
This is the single source of truth used by both the `authorize` dependency
below and the /auth/me endpoint (which feeds the frontend nav/UI). Every
protected route MUST depend on `authorize` -- hiding UI elements alone is
never sufficient, per the security requirements of this system."""
from fastapi import Depends

from .db import query
from .deps import get_current_user
from .errors import ApiError


def get_effective_permissions(user_id, role):
    role_rows = query("SELECT resource, action, allowed FROM role_permissions WHERE role = %s", (role,)).rows
    override_rows = query("SELECT resource, action, allowed FROM user_permissions WHERE user_id = %s", (user_id,)).rows

    m = {}
    for row in role_rows:
        m[f'{row["resource"]}:{row["action"]}'] = row["allowed"]
    for row in override_rows:
        m[f'{row["resource"]}:{row["action"]}'] = row["allowed"]
    return m


def user_has_permission(user_id, role, resource, action):
    m = get_effective_permissions(user_id, role)
    return m.get(f"{resource}:{action}") is True


def authorize(resource, action):
    """Dependency factory enforcing that the authenticated user has the given
    (resource, action) permission. Super Admin is still subject to the
    matrix (seeded with full access) so that a Super Admin's own permissions
    can be inspected/audited like anyone else's. Returns the current user so
    route handlers can depend on this alone to get both auth + authz."""

    def _dep(user: dict = Depends(get_current_user)):
        if not user_has_permission(user["id"], user["role"], resource, action):
            raise ApiError(
                403,
                "Access denied.",
                extra={
                    "message": "You don't have permission to access this resource. Please contact your administrator if you believe you need access.",
                    "resource": resource,
                    "action": action,
                },
            )
        return user

    return _dep
