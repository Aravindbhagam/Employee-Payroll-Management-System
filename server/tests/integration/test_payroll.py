import random
import time

from tests.helpers.api import bearer, login_as
from tests.helpers.fixtures import create_fixture_set

PREFIX = "payroll-it"


def setup_salary(client, fixtures, payroll_admin_token):
    res = client.post(
        "/api/salary-structures",
        headers=bearer(payroll_admin_token),
        json={
            "employeeId": fixtures["employee"]["employeeId"],
            "basic": 5000,
            "hra": 2000,
            "conveyance": 500,
            "medical": 500,
            "specialAllowance": 500,
            "providentFund": 600,
            "professionalTax": 200,
            "incomeTax": 400,
        },
    )
    assert res.status_code == 201


def unique_period():
    """PayrollRun.period is globally unique. The API only requires it to be
    a non-empty string (no YYYY-MM format enforced), so a random token per
    call is the simplest way to guarantee no collision with other tests or
    stale data left in a shared test database."""
    return f"test-period-{int(time.time() * 1000)}-{random.randint(100000, 999999)}"


class TestPayrollWorkflow:
    def test_full_lifecycle(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-full")
        payroll_admin_token = login_as(client, fixtures["payrollAdmin"]["email"])
        super_admin_token = login_as(client, fixtures["superAdmin"]["email"])
        setup_salary(client, fixtures, payroll_admin_token)

        create = client.post("/api/payroll", headers=bearer(payroll_admin_token), json={"period": unique_period()})
        assert create.status_code == 201
        assert create.json()["payrollRun"]["status"] == "DRAFT"
        run_id = create.json()["payrollRun"]["id"]

        calculate = client.post(f"/api/payroll/{run_id}/calculate", headers=bearer(payroll_admin_token))
        assert calculate.status_code == 200
        assert calculate.json()["payrollRun"]["status"] == "PENDING_REVIEW"
        # Calculation is company-wide by design; this shared test database may
        # have other active salaried employees from concurrent tests, so
        # assert a floor rather than an exact total.
        assert calculate.json()["payrollRun"]["totalNet"] >= 7300

        submit = client.post(f"/api/payroll/{run_id}/submit", headers=bearer(payroll_admin_token))
        assert submit.status_code == 200
        assert submit.json()["payrollRun"]["status"] == "PENDING_APPROVAL"

        # Payroll Admin does not have PAYROLL:APPROVE by default -- only an
        # explicitly granted approver (Super Admin, by default) can approve.
        denied = client.post(f"/api/payroll/{run_id}/approve", headers=bearer(payroll_admin_token))
        assert denied.status_code == 403

        approve = client.post(f"/api/payroll/{run_id}/approve", headers=bearer(super_admin_token))
        assert approve.status_code == 200
        assert approve.json()["payrollRun"]["status"] == "APPROVED"

        process = client.post(f"/api/payroll/{run_id}/process", headers=bearer(payroll_admin_token))
        assert process.status_code == 200
        assert process.json()["payrollRun"]["status"] == "COMPLETED"

        detail = client.get(f"/api/payroll/{run_id}", headers=bearer(super_admin_token))
        own_payslip = next((p for p in detail.json()["payrollRun"]["payslips"] if p["employeeId"] == fixtures["employee"]["employeeId"]), None)
        assert own_payslip is not None
        assert own_payslip["net"] == 5000 + 2000 + 500 + 500 + 500 - 600 - 200 - 400

    def test_rejects_invalid_transitions(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-invalid")
        payroll_admin_token = login_as(client, fixtures["payrollAdmin"]["email"])
        super_admin_token = login_as(client, fixtures["superAdmin"]["email"])

        create = client.post("/api/payroll", headers=bearer(payroll_admin_token), json={"period": unique_period()})
        run_id = create.json()["payrollRun"]["id"]

        approve = client.post(f"/api/payroll/{run_id}/approve", headers=bearer(super_admin_token))
        assert approve.status_code == 400

        process = client.post(f"/api/payroll/{run_id}/process", headers=bearer(payroll_admin_token))
        assert process.status_code == 400

    def test_refuses_duplicate_period(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-dup")
        token = login_as(client, fixtures["payrollAdmin"]["email"])
        period = unique_period()
        first = client.post("/api/payroll", headers=bearer(token), json={"period": period})
        assert first.status_code == 201
        second = client.post("/api/payroll", headers=bearer(token), json={"period": period})
        assert second.status_code == 409

    def test_rejection_with_reason(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-reject")
        payroll_admin_token = login_as(client, fixtures["payrollAdmin"]["email"])
        super_admin_token = login_as(client, fixtures["superAdmin"]["email"])
        setup_salary(client, fixtures, payroll_admin_token)

        create = client.post("/api/payroll", headers=bearer(payroll_admin_token), json={"period": unique_period()})
        run_id = create.json()["payrollRun"]["id"]
        client.post(f"/api/payroll/{run_id}/calculate", headers=bearer(payroll_admin_token))
        client.post(f"/api/payroll/{run_id}/submit", headers=bearer(payroll_admin_token))

        reject = client.post(f"/api/payroll/{run_id}/reject", headers=bearer(super_admin_token), json={"reason": "Numbers look off, please recheck deductions."})
        assert reject.status_code == 200
        assert reject.json()["payrollRun"]["status"] == "REJECTED"
        assert "recheck deductions" in reject.json()["payrollRun"]["rejectionReason"]

        approve_after_reject = client.post(f"/api/payroll/{run_id}/approve", headers=bearer(super_admin_token))
        assert approve_after_reject.status_code == 400

    def test_employees_cannot_view_payroll_list(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-employee-block")
        token = login_as(client, fixtures["employee"]["email"])
        res = client.get("/api/payroll", headers=bearer(token))
        assert res.status_code == 403
