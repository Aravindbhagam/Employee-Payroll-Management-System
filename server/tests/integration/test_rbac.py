from app.db import query
from tests.helpers.api import bearer, login_as
from tests.helpers.fixtures import create_fixture_set

PREFIX = "rbac-it"


class TestRbacEnforcement:
    """Server-side RBAC enforcement, independent of any frontend hiding."""

    def test_blocks_employee_listing_all_users(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-users")
        token = login_as(client, fixtures["employee"]["email"])
        res = client.get("/api/users", headers=bearer(token))
        assert res.status_code == 403
        body = res.json()
        assert body["error"]
        assert "don't have permission" in body["message"].lower()

    def test_blocks_employee_creating_employee(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-create")
        token = login_as(client, fixtures["employee"]["email"])
        res = client.post("/api/employees", headers=bearer(token), json={"email": "nope@test.local", "firstName": "No", "lastName": "Body"})
        assert res.status_code == 403

    def test_blocks_manager_processing_payroll(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-payroll")
        token = login_as(client, fixtures["manager"]["email"])
        res = client.get("/api/payroll", headers=bearer(token))
        assert res.status_code == 403

    def test_blocks_employee_approving_own_leave(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-leave-approve")
        employee_token = login_as(client, fixtures["employee"]["email"])
        apply_res = client.post("/api/leave", headers=bearer(employee_token), json={"leaveType": "ANNUAL", "startDate": "2027-01-10", "endDate": "2027-01-11", "reason": "trip"})
        assert apply_res.status_code == 201

        res = client.post(f"/api/leave/{apply_res.json()['leaveRequest']['id']}/approve", headers=bearer(employee_token))
        assert res.status_code == 403

    def test_scopes_employee_list_to_self(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-scope-emp")
        token = login_as(client, fixtures["employee"]["email"])
        res = client.get("/api/employees", headers=bearer(token))
        assert res.status_code == 200
        employees = res.json()["employees"]
        assert len(employees) == 1
        assert employees[0]["userId"] == fixtures["employee"]["id"]

    def test_scopes_manager_list_to_team(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-scope-mgr")
        token = login_as(client, fixtures["manager"]["email"])
        res = client.get("/api/employees", headers=bearer(token))
        assert res.status_code == 200
        ids = [e["userId"] for e in res.json()["employees"]]
        assert fixtures["manager"]["id"] in ids
        assert fixtures["employee"]["id"] in ids
        assert fixtures["otherEmployee"]["id"] not in ids
        assert fixtures["otherManager"]["id"] not in ids

    def test_hr_admin_sees_all_employees(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-scope-hr")
        token = login_as(client, fixtures["hrAdmin"]["email"])
        res = client.get("/api/employees", headers=bearer(token))
        assert res.status_code == 200
        ids = [e["userId"] for e in res.json()["employees"]]
        assert fixtures["employee"]["id"] in ids
        assert fixtures["otherEmployee"]["id"] in ids

    def test_blocks_manager_approving_leave_outside_team(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-cross-team")
        other_employee_token = login_as(client, fixtures["otherEmployee"]["email"])
        apply_res = client.post("/api/leave", headers=bearer(other_employee_token), json={"leaveType": "SICK", "startDate": "2027-02-01", "endDate": "2027-02-01", "reason": "flu"})
        assert apply_res.status_code == 201

        manager_token = login_as(client, fixtures["manager"]["email"])
        res = client.post(f"/api/leave/{apply_res.json()['leaveRequest']['id']}/approve", headers=bearer(manager_token))
        assert res.status_code == 403
        assert "own team" in res.json()["error"].lower()

    def test_manager_approves_own_team_leave(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-same-team")
        employee_token = login_as(client, fixtures["employee"]["email"])
        apply_res = client.post("/api/leave", headers=bearer(employee_token), json={"leaveType": "CASUAL", "startDate": "2027-03-01", "endDate": "2027-03-01", "reason": "errand"})
        assert apply_res.status_code == 201

        manager_token = login_as(client, fixtures["manager"]["email"])
        res = client.post(f"/api/leave/{apply_res.json()['leaveRequest']['id']}/approve", headers=bearer(manager_token))
        assert res.status_code == 200
        assert res.json()["leaveRequest"]["status"] == "APPROVED"

    def test_masks_bank_details_for_manager_not_hr(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-mask")
        query("UPDATE employees SET bank_account_number = %s WHERE id = %s", ("000123456789", fixtures["employee"]["employeeId"]))

        manager_token = login_as(client, fixtures["manager"]["email"])
        as_manager = client.get(f"/api/employees/{fixtures['employee']['employeeId']}", headers=bearer(manager_token))
        assert as_manager.status_code == 200
        assert as_manager.json()["employee"]["bankAccountNumber"] != "000123456789"
        assert as_manager.json()["employee"]["bankAccountNumber"].endswith("6789")

        hr_token = login_as(client, fixtures["hrAdmin"]["email"])
        as_hr = client.get(f"/api/employees/{fixtures['employee']['employeeId']}", headers=bearer(hr_token))
        assert as_hr.status_code == 200
        assert as_hr.json()["employee"]["bankAccountNumber"] == "000123456789"
