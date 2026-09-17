import random
import time

import bcrypt

from app.db import query, with_transaction
from app.permissions import flatten_defaults
from app.utils.id import new_id

PASSWORD = "Password123!"

_permissions_seeded = False


def ensure_role_permissions_seeded():
    """Seeds the default role -> permission matrix (idempotent, safe to call from every test)."""
    global _permissions_seeded
    if _permissions_seeded:
        return
    rows = flatten_defaults()

    def _tx(client):
        for r in rows:
            client.query(
                """
                INSERT INTO role_permissions (id, role, resource, action, allowed)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (role, resource, action) DO UPDATE SET allowed = EXCLUDED.allowed
                """,
                (new_id(), r["role"], r["resource"], r["action"], r["allowed"]),
            )

    with_transaction(_tx)
    _permissions_seeded = True


def _create_user(prefix, name, role, department_id, manager_id=None):
    password_hash = bcrypt.hashpw(PASSWORD.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")
    email = f"{prefix}-{name}@test.local"
    user_id = new_id()
    employee_id = new_id()

    query(
        """
        INSERT INTO users (id, employee_code, email, password_hash, role, status, department_id, manager_id)
        VALUES (%s, %s, %s, %s, %s, 'ACTIVE', %s, %s)
        """,
        (user_id, f"{prefix.upper()}-{name.upper()}", email, password_hash, role, department_id, manager_id),
    )
    query(
        """
        INSERT INTO employees (id, user_id, first_name, last_name, department_id, status)
        VALUES (%s, %s, %s, 'Test', %s, 'ACTIVE')
        """,
        (employee_id, user_id, name, department_id),
    )

    return {"id": user_id, "employeeId": employee_id, "email": email, "role": role}


def create_fixture_set(prefix):
    """Creates a fully independent set of fixture users (one per role, plus
    an unrelated manager/employee pair for cross-team scoping tests) under a
    unique prefix, so multiple tests can share the same test database without
    colliding on unique email/employeeCode/department-name constraints."""
    ensure_role_permissions_seeded()

    unique = f"{prefix}-{int(time.time() * 1000)}-{random.randint(100000, 999999)}"
    department_id = new_id()
    query("INSERT INTO departments (id, name) VALUES (%s, %s)", (department_id, f"{unique}-dept"))

    super_admin = _create_user(unique, "superadmin", "SUPER_ADMIN", department_id)
    hr_admin = _create_user(unique, "hradmin", "HR_ADMIN", department_id)
    payroll_admin = _create_user(unique, "payrolladmin", "PAYROLL_ADMIN", department_id)
    manager = _create_user(unique, "manager", "MANAGER", department_id)
    employee = _create_user(unique, "employee", "EMPLOYEE", department_id, manager["id"])
    other_manager = _create_user(unique, "othermanager", "MANAGER", department_id)
    other_employee = _create_user(unique, "otheremployee", "EMPLOYEE", department_id, other_manager["id"])

    return {
        "departmentId": department_id,
        "superAdmin": super_admin,
        "hrAdmin": hr_admin,
        "payrollAdmin": payroll_admin,
        "manager": manager,
        "employee": employee,
        "otherManager": other_manager,
        "otherEmployee": other_employee,
    }
