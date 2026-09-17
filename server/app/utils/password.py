import hashlib
import re
import secrets

import bcrypt

SALT_ROUNDS = 12


def hash_password(plain):
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(SALT_ROUNDS)).decode("utf-8")


def compare_password(plain, hashed):
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def is_password_strong(pw):
    if len(pw) < 8:
        return {"ok": False, "message": "Password must be at least 8 characters long."}
    if not re.search(r"[A-Z]", pw):
        return {"ok": False, "message": "Password must include an uppercase letter."}
    if not re.search(r"[a-z]", pw):
        return {"ok": False, "message": "Password must include a lowercase letter."}
    if not re.search(r"[0-9]", pw):
        return {"ok": False, "message": "Password must include a number."}
    return {"ok": True}


def hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def random_token(nbytes=32):
    return secrets.token_hex(nbytes)


def mask_sensitive(value):
    """Masks sensitive strings like bank account numbers / tax IDs, showing only the last 4 characters."""
    if not value:
        return None
    visible = value[-4:]
    return ("*" * max(len(value) - 4, 4)) + visible
