import os

from app.db import query
from tests.helpers.api import bearer, login_as
from tests.helpers.fixtures import PASSWORD, create_fixture_set

PREFIX = "auth-it"


class TestAuth:
    def test_login_success_returns_token_and_cookie(self, client):
        fixtures = create_fixture_set(PREFIX)
        res = client.post("/api/auth/login", json={"identifier": fixtures["employee"]["email"], "password": PASSWORD})

        assert res.status_code == 200
        body = res.json()
        assert body["accessToken"]
        assert body["user"]["email"] == fixtures["employee"]["email"]
        assert body["user"]["role"] == "EMPLOYEE"
        assert "refreshToken=" in res.headers.get("set-cookie", "")

    def test_rejects_unknown_identifier(self, client):
        res = client.post("/api/auth/login", json={"identifier": "nobody@test.local", "password": "whatever"})
        assert res.status_code == 401
        assert res.json()["error"] == "Invalid credentials."

    def test_rejects_wrong_password_reports_attempts(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-wrongpw")
        res = client.post("/api/auth/login", json={"identifier": fixtures["employee"]["email"], "password": "WrongPassword1"})
        assert res.status_code == 401
        body = res.json()
        assert body["error"] == "Invalid credentials."
        assert body["attemptsRemaining"] > 0

    def test_locks_account_after_repeated_failures(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-lockout")
        last = None
        for _ in range(6):
            last = client.post("/api/auth/login", json={"identifier": fixtures["employee"]["email"], "password": "WrongPassword1"})
        assert last.status_code == 423

        with_correct = client.post("/api/auth/login", json={"identifier": fixtures["employee"]["email"], "password": PASSWORD})
        assert with_correct.status_code == 423

    def test_login_by_employee_code(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-empcode")
        row = query("SELECT employee_code AS \"employeeCode\" FROM users WHERE id = %s", (fixtures["employee"]["id"],)).rows[0]
        res = client.post("/api/auth/login", json={"identifier": row["employeeCode"], "password": PASSWORD})
        assert res.status_code == 200

    def test_rejects_protected_route_with_no_token(self, client):
        res = client.get("/api/employees")
        assert res.status_code == 401

    def test_rejects_garbage_bearer_token(self, client):
        res = client.get("/api/employees", headers=bearer("not-a-real-token"))
        assert res.status_code == 401

    def test_me_returns_effective_permissions(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-me")
        token = login_as(client, fixtures["employee"]["email"])
        res = client.get("/api/auth/me", headers=bearer(token))
        assert res.status_code == 200
        body = res.json()
        assert "USERS" not in body["user"]["permissions"]
        assert "CREATE" in body["user"]["permissions"]["LEAVE"]


class TestForgotPassword:
    def test_includes_dev_reset_token_outside_production(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-forgot-dev")
        res = client.post("/api/auth/forgot-password", json={"identifier": fixtures["employee"]["email"]})
        assert res.status_code == 200
        assert res.json()["devResetToken"]

    def test_never_includes_token_in_production(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-forgot-prod")
        original = os.environ.get("NODE_ENV")
        try:
            os.environ["NODE_ENV"] = "production"
            res = client.post("/api/auth/forgot-password", json={"identifier": fixtures["employee"]["email"]})
            assert res.status_code == 200
            assert "devResetToken" not in res.json()
        finally:
            if original is not None:
                os.environ["NODE_ENV"] = original

    def test_resets_password_with_valid_token(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-reset")
        forgot = client.post("/api/auth/forgot-password", json={"identifier": fixtures["employee"]["email"]})
        token = forgot.json()["devResetToken"]

        reset = client.post("/api/auth/reset-password", json={"token": token, "newPassword": "NewPassword456"})
        assert reset.status_code == 200

        old_login = client.post("/api/auth/login", json={"identifier": fixtures["employee"]["email"], "password": PASSWORD})
        assert old_login.status_code == 401

        new_login = client.post("/api/auth/login", json={"identifier": fixtures["employee"]["email"], "password": "NewPassword456"})
        assert new_login.status_code == 200

    def test_does_not_reveal_unknown_identifier(self, client):
        res = client.post("/api/auth/forgot-password", json={"identifier": "nobody-at-all@test.local"})
        assert res.status_code == 200
        body = res.json()
        assert "devResetToken" not in body
        assert "if an account exists" in body["message"].lower()
