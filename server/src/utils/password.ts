import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function isPasswordStrong(pw: string): { ok: boolean; message?: string } {
  if (pw.length < 8) return { ok: false, message: 'Password must be at least 8 characters long.' };
  if (!/[A-Z]/.test(pw)) return { ok: false, message: 'Password must include an uppercase letter.' };
  if (!/[a-z]/.test(pw)) return { ok: false, message: 'Password must include a lowercase letter.' };
  if (!/[0-9]/.test(pw)) return { ok: false, message: 'Password must include a number.' };
  return { ok: true };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Masks sensitive strings like bank account numbers / tax IDs, showing only the last 4 characters. */
export function maskSensitive(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  const visible = value.slice(-4);
  return `${'*'.repeat(Math.max(value.length - 4, 4))}${visible}`;
}
