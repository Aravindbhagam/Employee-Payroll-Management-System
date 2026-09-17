from ..db import query


def employee_id_for_user(user_id):
    """Returns the employees.id linked to a given users.id, or None if none exists."""
    rows = query("SELECT id FROM employees WHERE user_id = %s", (user_id,)).rows
    return rows[0]["id"] if rows else None


def team_employee_ids(manager_user_id):
    """Returns the list of employees.id values a Manager is allowed to see:
    direct reports (users.manager_id === manager's user id) plus themself."""
    rows = query(
        "SELECT e.id FROM employees e JOIN users u ON u.id = e.user_id WHERE u.manager_id = %s",
        (manager_user_id,),
    ).rows
    ids = [r["id"] for r in rows]
    own = employee_id_for_user(manager_user_id)
    if own:
        ids.append(own)
    return ids


def employee_scope_filter(user):
    """Returns the row-level scope for the given user: Super Admin/HR/Payroll
    Admin see everything, Manager sees their team, Employee sees only
    themself. Returns None for "no filter needed" (full access) or a dict
    {"in": [...]} to constrain an employee_id filter to."""
    if user["role"] in ("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN"):
        return None
    if user["role"] == "MANAGER":
        return {"in": team_employee_ids(user["id"])}
    # EMPLOYEE
    own = employee_id_for_user(user["id"])
    return {"in": [own] if own else []}
