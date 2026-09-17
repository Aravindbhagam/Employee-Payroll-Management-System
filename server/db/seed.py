import os
import random
import sys
from datetime import datetime, timedelta

import bcrypt

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _THIS_DIR)  # for `import migrate` (sibling module)
sys.path.insert(0, os.path.dirname(_THIS_DIR))  # for `import app` (server/app package)

from migrate import _connect  # noqa: E402

from app.permissions import flatten_defaults  # noqa: E402


def new_id():
    import uuid

    return str(uuid.uuid4())


def hash_password(pw):
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")


def main():
    conn = _connect()
    conn.autocommit = False
    cur = conn.cursor()

    # The role -> permission matrix is always (re)synced from code on every
    # boot, before the "already seeded" early return below -- it's a cheap,
    # idempotent set of upserts, and it must run even on a long-lived database
    # so that permission-matrix fixes shipped in code actually take effect
    # without requiring a full data wipe. A Super Admin's own customizations
    # (made via the Users & Roles UI) live in the same table and will be
    # overwritten back to these defaults on deploy -- that's an accepted
    # tradeoff for this demo deployment, not something a real multi-tenant
    # system should do.
    for d in flatten_defaults():
        cur.execute(
            """
            INSERT INTO role_permissions (id, role, resource, action, allowed)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (role, resource, action) DO UPDATE SET allowed = EXCLUDED.allowed
            """,
            (new_id(), d["role"], d["resource"], d["action"], d["allowed"]),
        )
    conn.commit()

    # Safe to invoke on every boot (see server/package.json-equivalent
    # start:prod): this is a no-op once the demo superadmin exists, so
    # restarts and redeploys never re-run (and crash on) the one-time-only
    # inserts below. If real data already exists, skip straight through instead.
    cur.execute("SELECT id FROM users WHERE email = %s", ("superadmin@nimbuscorp.com",))
    if cur.fetchone():
        print("Database already seeded (role permission matrix re-synced).")
        cur.close()
        conn.close()
        return

    print("Seeding database...")

    # ---- Company settings ----
    cur.execute(
        """
        INSERT INTO company_settings (id, company_name, address, currency)
        VALUES ('singleton', %s, %s, %s)
        ON CONFLICT (id) DO NOTHING
        """,
        ("Nimbus Corporation", "500 Market Street, Suite 900, San Francisco, CA", "USD"),
    )

    # ---- Departments ----
    department_names = [
        {"name": "Executive", "description": "Company leadership"},
        {"name": "Human Resources", "description": "People operations & HR"},
        {"name": "Finance", "description": "Finance & payroll operations"},
        {"name": "Engineering", "description": "Product engineering"},
        {"name": "Sales", "description": "Sales & business development"},
        {"name": "Marketing", "description": "Marketing & communications"},
    ]
    departments = {}
    for d in department_names:
        cur.execute("INSERT INTO departments (id, name, description) VALUES (%s, %s, %s) ON CONFLICT (name) DO NOTHING", (new_id(), d["name"], d["description"]))
        cur.execute("SELECT id FROM departments WHERE name = %s", (d["name"],))
        departments[d["name"]] = cur.fetchone()[0]

    # ---- Designations ----
    designation_defs = [
        ("Chief Executive Officer", "Executive"),
        ("HR Director", "Human Resources"),
        ("HR Generalist", "Human Resources"),
        ("Payroll Manager", "Finance"),
        ("Financial Analyst", "Finance"),
        ("Engineering Manager", "Engineering"),
        ("Senior Software Engineer", "Engineering"),
        ("Software Engineer", "Engineering"),
        ("Sales Manager", "Sales"),
        ("Account Executive", "Sales"),
        ("Marketing Specialist", "Marketing"),
    ]
    designations = {}
    for title, dept_name in designation_defs:
        cur.execute("INSERT INTO designations (id, title, department_id) VALUES (%s, %s, %s) ON CONFLICT (title, department_id) DO NOTHING", (new_id(), title, departments[dept_name]))
        cur.execute("SELECT id FROM designations WHERE title = %s AND department_id = %s", (title, departments[dept_name]))
        designations[title] = cur.fetchone()[0]

    password = hash_password("Password123!")

    users = [
        {
            "employeeCode": "EMP10001", "email": "superadmin@nimbuscorp.com", "role": "SUPER_ADMIN",
            "firstName": "Ava", "lastName": "Sterling", "department": "Executive", "designation": "Chief Executive Officer",
            "dateOfBirth": "1978-04-12", "dateOfJoining": "2015-01-05",
            "basic": 12000, "hra": 4800, "conveyance": 800, "medical": 1000, "specialAllowance": 3000,
            "providentFund": 1440, "professionalTax": 200, "incomeTax": 2500,
            "bankAccountNumber": "000123456789", "bankName": "First National Bank", "taxId": "TAX-9001-A",
        },
        {
            "employeeCode": "EMP10002", "email": "hradmin@nimbuscorp.com", "role": "HR_ADMIN",
            "firstName": "Priya", "lastName": "Nair", "department": "Human Resources", "designation": "HR Director",
            "managerEmail": "superadmin@nimbuscorp.com", "dateOfBirth": "1985-09-22", "dateOfJoining": "2017-03-14",
            "basic": 7500, "hra": 3000, "conveyance": 600, "medical": 700, "specialAllowance": 1500,
            "providentFund": 900, "professionalTax": 200, "incomeTax": 1200,
            "bankAccountNumber": "000223456789", "bankName": "First National Bank", "taxId": "TAX-9002-B",
        },
        {
            "employeeCode": "EMP10003", "email": "payrolladmin@nimbuscorp.com", "role": "PAYROLL_ADMIN",
            "firstName": "Marcus", "lastName": "Chen", "department": "Finance", "designation": "Payroll Manager",
            "managerEmail": "superadmin@nimbuscorp.com", "dateOfBirth": "1988-01-30", "dateOfJoining": "2018-06-01",
            "basic": 7000, "hra": 2800, "conveyance": 600, "medical": 700, "specialAllowance": 1400,
            "providentFund": 840, "professionalTax": 200, "incomeTax": 1100,
            "bankAccountNumber": "000323456789", "bankName": "First National Bank", "taxId": "TAX-9003-C",
        },
        {
            "employeeCode": "EMP10004", "email": "manager@nimbuscorp.com", "role": "MANAGER",
            "firstName": "Diego", "lastName": "Alvarez", "department": "Engineering", "designation": "Engineering Manager",
            "managerEmail": "superadmin@nimbuscorp.com", "dateOfBirth": "1983-11-08", "dateOfJoining": "2016-08-19",
            "basic": 8200, "hra": 3280, "conveyance": 600, "medical": 700, "specialAllowance": 1600,
            "providentFund": 984, "professionalTax": 200, "incomeTax": 1300,
            "bankAccountNumber": "000423456789", "bankName": "First National Bank", "taxId": "TAX-9004-D",
        },
        {
            "employeeCode": "EMP10005", "email": "employee@nimbuscorp.com", "role": "EMPLOYEE",
            "firstName": "Sofia", "lastName": "Martins", "department": "Engineering", "designation": "Software Engineer",
            "managerEmail": "manager@nimbuscorp.com", "dateOfBirth": "1996-06-17", "dateOfJoining": "2022-02-21",
            "basic": 5200, "hra": 2080, "conveyance": 500, "medical": 500, "specialAllowance": 900,
            "providentFund": 624, "professionalTax": 200, "incomeTax": 650,
            "bankAccountNumber": "000523456789", "bankName": "First National Bank", "taxId": "TAX-9005-E",
        },
        # Extra employees for realistic dashboard data
        {
            "employeeCode": "EMP10006", "email": "noah.kim@nimbuscorp.com", "role": "EMPLOYEE",
            "firstName": "Noah", "lastName": "Kim", "department": "Engineering", "designation": "Senior Software Engineer",
            "managerEmail": "manager@nimbuscorp.com", "dateOfBirth": "1991-03-03", "dateOfJoining": "2020-05-11",
            "basic": 6800, "hra": 2720, "conveyance": 500, "medical": 600, "specialAllowance": 1200,
            "providentFund": 816, "professionalTax": 200, "incomeTax": 900,
            "bankAccountNumber": "000623456789", "bankName": "First National Bank", "taxId": "TAX-9006-F",
        },
        {
            "employeeCode": "EMP10007", "email": "linda.osei@nimbuscorp.com", "role": "EMPLOYEE",
            "firstName": "Linda", "lastName": "Osei", "department": "Sales", "designation": "Account Executive",
            "managerEmail": "manager@nimbuscorp.com", "dateOfBirth": "1994-12-25", "dateOfJoining": "2021-09-01",
            "basic": 4800, "hra": 1920, "conveyance": 450, "medical": 450, "specialAllowance": 800,
            "providentFund": 576, "professionalTax": 200, "incomeTax": 550,
            "bankAccountNumber": "000723456789", "bankName": "First National Bank", "taxId": "TAX-9007-G",
        },
        {
            "employeeCode": "EMP10008", "email": "james.wu@nimbuscorp.com", "role": "EMPLOYEE",
            "firstName": "James", "lastName": "Wu", "department": "Marketing", "designation": "Marketing Specialist",
            "managerEmail": "manager@nimbuscorp.com", "dateOfBirth": "1990-07-14", "dateOfJoining": "2019-11-04",
            "basic": 4600, "hra": 1840, "conveyance": 450, "medical": 450, "specialAllowance": 750,
            "providentFund": 552, "professionalTax": 200, "incomeTax": 520,
            "bankAccountNumber": "000823456789", "bankName": "First National Bank", "taxId": "TAX-9008-H",
        },
    ]

    created_user_ids = {}
    for u in users:
        user_id = new_id()
        cur.execute(
            """
            INSERT INTO users (id, employee_code, email, password_hash, role, status, department_id)
            VALUES (%s, %s, %s, %s, %s, 'ACTIVE', %s)
            ON CONFLICT (email) DO NOTHING
            """,
            (user_id, u["employeeCode"], u["email"], password, u["role"], departments[u["department"]]),
        )
        cur.execute("SELECT id FROM users WHERE email = %s", (u["email"],))
        created_user_ids[u["email"]] = cur.fetchone()[0]

        cur.execute(
            """
            INSERT INTO employees (id, user_id, first_name, last_name, phone, address, date_of_birth, date_of_joining, department_id, designation_id, employment_type, status, bank_account_number, bank_name, tax_id, emergency_contact_name, emergency_contact_phone)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Full-Time', 'ACTIVE', %s, %s, %s, %s, %s)
            ON CONFLICT (user_id) DO NOTHING
            """,
            (
                new_id(),
                created_user_ids[u["email"]],
                u["firstName"],
                u["lastName"],
                "+1-555-0100",
                "123 Main Street, San Francisco, CA",
                u.get("dateOfBirth"),
                u["dateOfJoining"],
                departments[u["department"]],
                designations[u["designation"]],
                u["bankAccountNumber"],
                u["bankName"],
                u["taxId"],
                "Jordan Rivera",
                "+1-555-0199",
            ),
        )

    # Wire up managers now that all users exist.
    for u in users:
        if u.get("managerEmail"):
            cur.execute("UPDATE users SET manager_id = %s WHERE id = %s", (created_user_ids[u["managerEmail"]], created_user_ids[u["email"]]))

    # Department heads
    cur.execute("UPDATE departments SET manager_id = %s WHERE id = %s", (created_user_ids["hradmin@nimbuscorp.com"], departments["Human Resources"]))
    cur.execute("UPDATE departments SET manager_id = %s WHERE id = %s", (created_user_ids["payrolladmin@nimbuscorp.com"], departments["Finance"]))
    cur.execute("UPDATE departments SET manager_id = %s WHERE id = %s", (created_user_ids["manager@nimbuscorp.com"], departments["Engineering"]))

    # ---- Salary structures ----
    employee_id_by_email = {}
    for u in users:
        cur.execute("SELECT id FROM employees WHERE user_id = %s", (created_user_ids[u["email"]],))
        employee_id = cur.fetchone()[0]
        employee_id_by_email[u["email"]] = employee_id
        ctc = u["basic"] + u["hra"] + u["conveyance"] + u["medical"] + u["specialAllowance"]
        cur.execute(
            """
            INSERT INTO salary_structures (id, employee_id, basic, hra, conveyance, medical, special_allowance, provident_fund, professional_tax, income_tax, ctc, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, true)
            """,
            (new_id(), employee_id, u["basic"], u["hra"], u["conveyance"], u["medical"], u["specialAllowance"], u["providentFund"], u["professionalTax"], u["incomeTax"], ctc),
        )

    # ---- Leave balances (current year) ----
    year = datetime.utcnow().year
    leave_types = [{"type": "ANNUAL", "allocated": 20}, {"type": "SICK", "allocated": 10}, {"type": "CASUAL", "allocated": 6}]
    for u in users:
        for lt in leave_types:
            cur.execute(
                "INSERT INTO leave_balances (id, employee_id, leave_type, year, allocated, used) VALUES (%s, %s, %s, %s, %s, 0)",
                (new_id(), employee_id_by_email[u["email"]], lt["type"], year, lt["allocated"]),
            )

    # Sample leave requests
    today = datetime.utcnow()
    cur.execute(
        "INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, days, reason, status) VALUES (%s, %s, 'ANNUAL', %s, %s, 3, 'Family trip', 'PENDING')",
        (new_id(), employee_id_by_email["employee@nimbuscorp.com"], today + timedelta(days=10), today + timedelta(days=12)),
    )
    cur.execute(
        "INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, days, reason, status, approver_id, approved_at) VALUES (%s, %s, 'SICK', %s, %s, 2, 'Flu', 'APPROVED', %s, %s)",
        (new_id(), employee_id_by_email["noah.kim@nimbuscorp.com"], today - timedelta(days=3), today - timedelta(days=2), created_user_ids["manager@nimbuscorp.com"], today),
    )
    cur.execute(
        "INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, days, reason, status) VALUES (%s, %s, 'CASUAL', %s, %s, 1, 'Personal errand', 'PENDING')",
        (new_id(), employee_id_by_email["linda.osei@nimbuscorp.com"], today + timedelta(days=3), today + timedelta(days=3)),
    )

    # ---- Attendance for the last 10 days ----
    all_employee_ids = list(employee_id_by_email.values())
    for day_offset in range(10):
        date = (today - timedelta(days=day_offset)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_of_week = date.weekday()  # Monday=0 .. Sunday=6
        for employee_id in all_employee_ids:
            status = "PRESENT"
            if day_of_week in (5, 6):  # Saturday, Sunday
                status = "WEEKEND"
            elif random.random() < 0.06:
                status = "ABSENT"
            elif random.random() < 0.05:
                status = "HALF_DAY"

            check_in_time = date.replace(hour=9, minute=random.randint(0, 8))
            check_out_time = date.replace(hour=13 if status == "HALF_DAY" else 18, minute=30 if status == "HALF_DAY" else random.randint(0, 8))

            cur.execute(
                """
                INSERT INTO attendance (id, employee_id, date, status, check_in, check_out, hours_worked)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (employee_id, date) DO NOTHING
                """,
                (
                    new_id(),
                    employee_id,
                    date,
                    status,
                    check_in_time.isoformat(timespec="milliseconds") + "Z" if status in ("PRESENT", "HALF_DAY") else None,
                    check_out_time.isoformat(timespec="milliseconds") + "Z" if status in ("PRESENT", "HALF_DAY") else None,
                    8 if status == "PRESENT" else 4 if status == "HALF_DAY" else 0,
                ),
            )

    # ---- A completed payroll run (last month) + one in-flight run (this month) ----
    last_month = today.replace(day=1) - timedelta(days=1)
    last_period = f"{last_month.year}-{last_month.month:02d}"

    cur.execute(
        """
        SELECT employee_id AS employeeid, basic, hra, conveyance, medical, special_allowance AS specialallowance,
          other_allowances AS otherallowances, provident_fund AS providentfund, professional_tax AS professionaltax,
          income_tax AS incometax, other_deductions AS otherdeductions
        FROM salary_structures WHERE is_active = true
        """
    )
    columns = [desc[0] for desc in cur.description]
    structures = [dict(zip(columns, row)) for row in cur.fetchall()]

    total_gross = total_deductions = total_net = 0
    completed_run_id = new_id()
    cur.execute(
        """
        INSERT INTO payroll_runs (id, period, status, created_by_id, reviewed_by_id, reviewed_at, approved_by_id, approved_at, submitted_at, processed_at, employee_count)
        VALUES (%s, %s, 'COMPLETED', %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            completed_run_id,
            last_period,
            created_user_ids["payrolladmin@nimbuscorp.com"],
            created_user_ids["payrolladmin@nimbuscorp.com"],
            today,
            created_user_ids["superadmin@nimbuscorp.com"],
            today,
            today,
            today,
            len(structures),
        ),
    )

    import json

    for s in structures:
        gross = s["basic"] + s["hra"] + s["conveyance"] + s["medical"] + s["specialallowance"] + s["otherallowances"]
        deductions = s["providentfund"] + s["professionaltax"] + s["incometax"] + s["otherdeductions"]
        net = gross - deductions
        total_gross += gross
        total_deductions += deductions
        total_net += net
        breakdown = json.dumps(
            {
                "earnings": {"basic": s["basic"], "hra": s["hra"], "conveyance": s["conveyance"], "medical": s["medical"], "specialAllowance": s["specialallowance"], "otherAllowances": s["otherallowances"]},
                "deductions": {"providentFund": s["providentfund"], "professionalTax": s["professionaltax"], "incomeTax": s["incometax"], "otherDeductions": s["otherdeductions"]},
            }
        )
        cur.execute(
            "INSERT INTO payslips (id, payroll_run_id, employee_id, period, gross, deductions, net, breakdown) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (new_id(), completed_run_id, s["employeeid"], last_period, gross, deductions, net, breakdown),
        )
    cur.execute("UPDATE payroll_runs SET total_gross = %s, total_deductions = %s, total_net = %s WHERE id = %s", (total_gross, total_deductions, total_net, completed_run_id))

    current_period = f"{today.year}-{today.month:02d}"
    cur.execute("INSERT INTO payroll_runs (id, period, status, created_by_id) VALUES (%s, %s, 'DRAFT', %s)", (new_id(), current_period, created_user_ids["payrolladmin@nimbuscorp.com"]))

    # ---- Announcements ----
    cur.execute(
        "INSERT INTO announcements (id, title, body, created_by_id, audience) VALUES (%s, %s, %s, %s, 'ALL')",
        (new_id(), "Welcome to PayrollPro", "Our new Employee Payroll Management System is now live. Explore your dashboard, payslips, and self-service tools.", created_user_ids["superadmin@nimbuscorp.com"]),
    )
    cur.execute(
        "INSERT INTO announcements (id, title, body, created_by_id, audience) VALUES (%s, %s, %s, %s, 'ALL')",
        (new_id(), "Quarterly All-Hands Meeting", "Join us this Friday at 10:00 AM for the quarterly company all-hands meeting in the main auditorium.", created_user_ids["hradmin@nimbuscorp.com"]),
    )

    # ---- Sample audit log entries (system bootstrap) ----
    cur.execute(
        "INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, new_value) VALUES (%s, %s, %s, 'SYSTEM_SEEDED', 'System', %s)",
        (new_id(), created_user_ids["superadmin@nimbuscorp.com"], "superadmin@nimbuscorp.com", json.dumps({"note": "Initial demo data seeded."})),
    )

    conn.commit()
    cur.close()
    conn.close()

    print("Seed complete.")
    print("---------------------------------------------")
    print("Demo accounts (all use password: Password123!)")
    print("  Super Admin    superadmin@nimbuscorp.com")
    print("  HR Admin       hradmin@nimbuscorp.com")
    print("  Payroll Admin  payrolladmin@nimbuscorp.com")
    print("  Manager        manager@nimbuscorp.com")
    print("  Employee       employee@nimbuscorp.com")
    print("---------------------------------------------")


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(err, file=sys.stderr)
        sys.exit(1)
