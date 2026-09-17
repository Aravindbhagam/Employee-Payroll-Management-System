import os

import pytest

from app.utils.email import send_password_reset_email


class TestSendPasswordResetEmail:
    def setup_method(self):
        self._original_api_key = os.environ.get("RESEND_API_KEY")

    def teardown_method(self):
        if self._original_api_key is None:
            os.environ.pop("RESEND_API_KEY", None)
        else:
            os.environ["RESEND_API_KEY"] = self._original_api_key

    def test_does_not_call_requests_when_no_api_key(self, monkeypatch):
        os.environ.pop("RESEND_API_KEY", None)
        calls = []
        monkeypatch.setattr("app.utils.email.requests.post", lambda *a, **k: calls.append((a, k)))

        send_password_reset_email("someone@test.local", "a-token")

        assert calls == []

    def test_calls_resend_api_when_configured(self, monkeypatch):
        os.environ["RESEND_API_KEY"] = "re_test_key"
        calls = []

        class FakeResponse:
            ok = True

        def fake_post(url, headers=None, json=None):
            calls.append((url, headers, json))
            return FakeResponse()

        monkeypatch.setattr("app.utils.email.requests.post", fake_post)

        send_password_reset_email("someone@test.local", "a-token")

        assert len(calls) == 1
        url, headers, body = calls[0]
        assert url == "https://api.resend.com/emails"
        assert headers["Authorization"] == "Bearer re_test_key"
        assert body["to"] == "someone@test.local"
        assert "a-token" in body["text"]

    def test_raises_on_non_2xx(self, monkeypatch):
        os.environ["RESEND_API_KEY"] = "re_test_key"

        class FakeResponse:
            ok = False
            status_code = 422
            text = "Invalid recipient"

        monkeypatch.setattr("app.utils.email.requests.post", lambda *a, **k: FakeResponse())

        with pytest.raises(RuntimeError, match="422"):
            send_password_reset_email("bad@test.local", "a-token")
