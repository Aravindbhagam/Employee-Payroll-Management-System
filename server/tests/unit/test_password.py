from app.utils.password import compare_password, hash_password, is_password_strong, mask_sensitive


class TestPasswordUtils:
    def test_hashes_and_verifies_round_trip(self):
        h = hash_password("Password123!")
        assert h != "Password123!"
        assert compare_password("Password123!", h) is True
        assert compare_password("WrongPassword1", h) is False

    def test_different_hash_each_time_salted(self):
        a = hash_password("Password123!")
        b = hash_password("Password123!")
        assert a != b

    def test_rejects_short_passwords(self):
        assert is_password_strong("Ab1")["ok"] is False

    def test_rejects_missing_uppercase(self):
        assert is_password_strong("password123")["ok"] is False

    def test_rejects_missing_lowercase(self):
        assert is_password_strong("PASSWORD123")["ok"] is False

    def test_rejects_missing_number(self):
        assert is_password_strong("PasswordOnly")["ok"] is False

    def test_accepts_strong_password(self):
        assert is_password_strong("Password123")["ok"] is True

    def test_masks_all_but_last_4(self):
        assert mask_sensitive("000123456789") == "********6789"

    def test_passes_through_none(self):
        assert mask_sensitive(None) is None
        assert mask_sensitive("") is None
