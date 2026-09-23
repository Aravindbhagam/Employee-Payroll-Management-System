import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Sends an email via Resend when RESEND_API_KEY is configured; otherwise
 * logs it server-side so the flow stays usable without an email provider
 * (e.g. local development, or a deploy that hasn't set one up yet). Reads
 * the env var per call (not snapshotted at module load) so it can be
 * toggled in tests and reflects config changes without a process restart.
 */
async function sendEmail(params) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.info({ to: params.to, subject: params.subject }, '[email] RESEND_API_KEY not set; logging email instead of sending it');
    logger.info(params.text);
    return;
  }

  const from = process.env.EMAIL_FROM || 'PayrollPro <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html, text: params.text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API responded with ${res.status}: ${body}`);
  }
}

export async function sendPasswordResetEmail(to, token) {
  const resetUrl = `${env.clientOrigins[0] ?? ''}/reset-password?token=${token}`;
  const text = `Use this link to reset your PayrollPro password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`;
  const html = `<p>Use the link below to reset your PayrollPro password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`;

  await sendEmail({ to, subject: 'Reset your PayrollPro password', text, html });
}
