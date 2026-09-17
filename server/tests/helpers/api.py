from .fixtures import PASSWORD


def login_as(client, email, password=PASSWORD):
    """Logs in as the given user and returns the access token (raises with a readable message on failure)."""
    res = client.post("/api/auth/login", json={"identifier": email, "password": password})
    body = res.json()
    if res.status_code != 200 or not body.get("accessToken"):
        raise AssertionError(f"Login failed for {email}: {res.status_code} {body}")
    return body["accessToken"]


def bearer(token):
    return {"Authorization": f"Bearer {token}"}
