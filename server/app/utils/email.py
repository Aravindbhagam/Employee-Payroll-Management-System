import os

import requests

from ..config import env
from ..logger import logger


def send_email(to, subject, text, html):
    """Sends an email via Resend when RESEND_API_KEY is configured; otherwise
    logs it server-side so the flow stays usable without an email provider
    (e.g. local development, or a deploy that hasn't set one up yet). Reads
    the env var per call (not snapshotted at import time) so it can be
    toggled in tests and reflects config changes without a process restart.
    """
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        logger.info(f"[email] RESEND_API_KEY not set; logging email instead of sending it to={to} subject={subject}")
        logger.info(text)
        return

    from_addr = os.environ.get("EMAIL_FROM", "PayrollPro <onboarding@resend.dev>")
    res = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"from": from_addr, "to": to, "subject": subject, "html": html, "text": text},
    )
    if not res.ok:
        raise RuntimeError(f"Resend API responded with {res.status_code}: {res.text}")


def send_password_reset_email(to, token):
    reset_url = f"{env.client_origins[0] if env.client_origins else ''}/reset-password?token={token}"
    text = (
        f"Use this link to reset your PayrollPro password: {reset_url}\n\n"
        "This link expires in 1 hour. If you didn't request this, you can ignore this email."
    )
    html = (
        f"<p>Use the link below to reset your PayrollPro password:</p>"
        f'<p><a href="{reset_url}">{reset_url}</a></p>'
        "<p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>"
    )
    send_email(to, "Reset your PayrollPro password", text, html)
