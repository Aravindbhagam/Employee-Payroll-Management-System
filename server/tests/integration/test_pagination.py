from tests.helpers.api import bearer, login_as
from tests.helpers.fixtures import create_fixture_set

PREFIX = "pagination-it"


class TestPagination:
    """Opt-in via ?page=..."""

    def test_full_list_with_no_metadata_when_omitted(self, client):
        create_fixture_set(f"{PREFIX}-full")
        fixtures = create_fixture_set(f"{PREFIX}-full2")
        hr_token = login_as(client, fixtures["hrAdmin"]["email"])

        res = client.get("/api/employees", headers=bearer(hr_token))
        assert res.status_code == 200
        body = res.json()
        assert "total" not in body
        assert "page" not in body
        assert len(body["employees"]) >= 14

    def test_paginates_into_nonoverlapping_pages(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-slice")
        hr_token = login_as(client, fixtures["hrAdmin"]["email"])

        full = client.get("/api/employees", headers=bearer(hr_token))
        total = len(full.json()["employees"])

        page_one = client.get("/api/employees?page=1&pageSize=2", headers=bearer(hr_token))
        assert page_one.status_code == 200
        assert len(page_one.json()["employees"]) == 2
        assert page_one.json()["page"] == 1
        assert page_one.json()["pageSize"] == 2
        assert page_one.json()["total"] == total

        page_two = client.get("/api/employees?page=2&pageSize=2", headers=bearer(hr_token))
        assert page_two.status_code == 200
        assert len(page_two.json()["employees"]) == 2

        ids_one = {e["id"] for e in page_one.json()["employees"]}
        ids_two = {e["id"] for e in page_two.json()["employees"]}
        assert ids_one.isdisjoint(ids_two)

    def test_paginates_users_list(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-users")
        super_token = login_as(client, fixtures["superAdmin"]["email"])

        unpaginated = client.get("/api/users", headers=bearer(super_token))
        assert "total" not in unpaginated.json()

        paginated = client.get("/api/users?page=1&pageSize=3", headers=bearer(super_token))
        assert paginated.status_code == 200
        assert len(paginated.json()["users"]) == 3
        assert paginated.json()["total"] >= 7

    def test_caps_page_size_at_maximum(self, client):
        fixtures = create_fixture_set(f"{PREFIX}-cap")
        hr_token = login_as(client, fixtures["hrAdmin"]["email"])

        res = client.get("/api/employees?page=1&pageSize=999999", headers=bearer(hr_token))
        assert res.status_code == 200
        assert res.json()["pageSize"] == 200
