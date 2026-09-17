const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { z } = require('zod');
const { query } = require('../db');
const { USER_COLS, DEPARTMENT_COLS, EMPLOYEE_COLS, COMPANY_SETTINGS_COLS } = require('../dbColumns');
const { env } = require('../config/env');
const { comparePassword, hashPassword, hashToken, isPasswordStrong, randomToken } = require('../utils/password');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { recordAudit } = require('../utils/audit');
const { getEffectivePermissions } = require('../middleware/rbac');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../config/logger');
const { sendPasswordResetEmail } = require('../utils/email');
const { newId } = require('../utils/id');

const REFRESH_COOKIE = 'refreshToken';

function permissionsMapToObject(map) {
  const obj = {};
  for (const [key, allowed] of map.entries()) {
    if (!allowed) continue;
    const [resource, action] = key.split(':');
    if (!obj[resource]) obj[resource] = [];
    obj[resource].push(action);
  }
  return obj;
}

async function findUserByEmailOrCode(identifier) {
  const res = await query(`SELECT ${USER_COLS} FROM users WHERE email = $1 OR employee_code = $2 LIMIT 1`, [identifier.toLowerCase(), identifier]);
  return res.rows[0] || null;
}

async function findUserById(id) {
  const res = await query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function buildUserResponse(userId) {
  const user = await findUserById(userId);
  if (!user) return null;

  const [deptRes, empRes] = await Promise.all([
    user.departmentId ? query(`SELECT ${DEPARTMENT_COLS} FROM departments WHERE id = $1`, [user.departmentId]) : Promise.resolve({ rows: [] }),
    query(`SELECT ${EMPLOYEE_COLS} FROM employees WHERE user_id = $1`, [userId]),
  ]);

  const department = deptRes.rows[0] || null;
  const employee = empRes.rows[0] || null;

  const permissionsMap = await getEffectivePermissions(user.id, user.role);
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    email: user.email,
    role: user.role,
    status: user.status,
    department: department ? { id: department.id, name: department.name } : null,
    managerId: user.managerId,
    twoFactorEnabled: user.twoFactorEnabled,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    profile: employee
      ? { firstName: employee.firstName, lastName: employee.lastName, photoUrl: employee.photoUrl, designationId: employee.designationId }
      : null,
    permissions: permissionsMapToObject(permissionsMap),
  };
}

// In production the frontend (GitHub Pages) and API (Render) are on
// different origins, so the refresh cookie must be SameSite=None; Secure to
// be sent cross-site at all. Locally, both run on http://localhost so Lax
// (and no Secure flag, since there's no TLS) works and is less restrictive.
const REFRESH_COOKIE_OPTIONS = env.isProduction
  ? { httpOnly: true, secure: true, sameSite: 'none', path: '/api/auth' }
  : { httpOnly: true, secure: false, sameSite: 'lax', path: '/api/auth' };

function setRefreshCookie(res, token, days) {
  res.cookie(REFRESH_COOKIE, token, { ...REFRESH_COOKIE_OPTIONS, maxAge: days * 24 * 60 * 60 * 1000 });
}

const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or Employee ID is required.'),
  password: z.string().min(1, 'Password is required.'),
  rememberMe: z.boolean().optional().default(false),
});

const login = asyncHandler(async (req, res) => {
  const { identifier, password, rememberMe } = loginSchema.parse(req.body);

  const user = await findUserByEmailOrCode(identifier);
  const settingsRes = await query(`SELECT ${COMPANY_SETTINGS_COLS} FROM company_settings WHERE id = 'singleton'`);
  const settings = settingsRes.rows[0];
  const maxAttempts = settings?.maxFailedLoginAttempts ?? 5;
  const lockoutMinutes = settings?.lockoutMinutes ?? 15;

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
    return res.status(423).json({ error: `Account locked due to repeated failed attempts. Try again in ${minutesLeft} minute(s).` });
  }

  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'This account is inactive. Please contact your administrator.' });
  }

  const validPassword = await comparePassword(password, user.passwordHash);
  if (!validPassword) {
    const attempts = user.failedLoginAttempts + 1;
    const locked = attempts >= maxAttempts;
    await query('UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3', [
      locked ? 0 : attempts,
      locked ? new Date(Date.now() + lockoutMinutes * 60 * 1000) : null,
      user.id,
    ]);
    await recordAudit({ req, userId: user.id, userName: user.email, action: locked ? 'LOGIN_LOCKED' : 'LOGIN_FAILED', entityType: 'User', entityId: user.id });
    if (locked) {
      return res.status(423).json({ error: `Too many failed attempts. Account locked for ${lockoutMinutes} minutes.` });
    }
    return res.status(401).json({ error: 'Invalid credentials.', attemptsRemaining: Math.max(maxAttempts - attempts, 0) });
  }

  if (user.twoFactorEnabled) {
    const tempToken = jwt.sign({ sub: user.id, purpose: '2fa', rememberMe }, env.jwtAccessSecret, { expiresIn: '5m' });
    return res.json({ requiresTwoFactor: true, tempToken });
  }

  await completeLogin(req, res, user.id, rememberMe);
});

const twoFactorSchema = z.object({
  tempToken: z.string(),
  code: z.string().min(6).max(6),
});

const verifyTwoFactor = asyncHandler(async (req, res) => {
  const { tempToken, code } = twoFactorSchema.parse(req.body);
  let payload;
  try {
    payload = jwt.verify(tempToken, env.jwtAccessSecret);
  } catch {
    return res.status(401).json({ error: 'Two-factor session expired. Please log in again.' });
  }
  if (payload.purpose !== '2fa') return res.status(400).json({ error: 'Invalid token.' });

  const user = await findUserById(payload.sub);
  if (!user || !user.twoFactorSecret) return res.status(400).json({ error: 'Two-factor authentication is not set up.' });

  const valid = authenticator.check(code, user.twoFactorSecret);
  if (!valid) {
    await recordAudit({ req, userId: user.id, userName: user.email, action: 'LOGIN_2FA_FAILED', entityType: 'User', entityId: user.id });
    return res.status(401).json({ error: 'Invalid verification code.' });
  }

  await completeLogin(req, res, user.id, !!payload.rememberMe);
});

async function completeLogin(req, res, userId, rememberMe) {
  const user = await findUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const days = rememberMe ? env.refreshTokenTtlDaysRemember : env.refreshTokenTtlDays;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const sessionId = newId();
  await query(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip, remember_me, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [sessionId, user.id, '', req.headers['user-agent'] || null, req.ip, rememberMe, expiresAt]
  );

  const refreshToken = signRefreshToken({ sub: user.id, sessionId }, days);
  await query('UPDATE sessions SET token_hash = $1 WHERE id = $2', [hashToken(refreshToken), sessionId]);

  const accessToken = signAccessToken({ sub: user.id, role: user.role, sessionId });

  await query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = $1, last_login_ip = $2 WHERE id = $3', [
    new Date(),
    req.ip,
    user.id,
  ]);

  await recordAudit({ req, userId: user.id, userName: user.email, action: 'LOGIN_SUCCESS', entityType: 'User', entityId: user.id });

  setRefreshCookie(res, refreshToken, days);
  const userResponse = await buildUserResponse(user.id);
  res.json({ accessToken, user: userResponse });
}

const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) return res.status(401).json({ error: 'No refresh token provided.' });

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    return res.status(401).json({ error: 'Refresh token invalid or expired.' });
  }

  const sessionRes = await query('SELECT id, revoked, expires_at AS "expiresAt", token_hash AS "tokenHash" FROM sessions WHERE id = $1', [payload.sessionId]);
  const session = sessionRes.rows[0];
  if (!session || session.revoked || new Date(session.expiresAt) < new Date() || session.tokenHash !== hashToken(token)) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  const user = await findUserById(payload.sub);
  if (!user || user.status !== 'ACTIVE') return res.status(401).json({ error: 'Account is not active.' });

  const accessToken = signAccessToken({ sub: user.id, role: user.role, sessionId: session.id });
  const userResponse = await buildUserResponse(user.id);
  res.json({ accessToken, user: userResponse });
});

const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await query('UPDATE sessions SET revoked = true WHERE id = $1', [payload.sessionId]);
      if (req.user) {
        await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'LOGOUT', entityType: 'User', entityId: req.user.id });
      }
    } catch {
      /* ignore invalid token on logout */
    }
  }
  res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
  res.json({ success: true });
});

const me = asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userResponse = await buildUserResponse(req.user.id);
  res.json({ user: userResponse });
});

const forgotSchema = z.object({ identifier: z.string().min(1) });

const forgotPassword = asyncHandler(async (req, res) => {
  const { identifier } = forgotSchema.parse(req.body);
  const user = await findUserByEmailOrCode(identifier);

  // Always respond with success to avoid leaking which accounts exist.
  if (!user) {
    return res.json({ success: true, message: 'If an account exists, password reset instructions have been sent.' });
  }

  const token = randomToken(24);
  await query('UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3', [hashToken(token), new Date(Date.now() + 60 * 60 * 1000), user.id]);

  await recordAudit({ req, userId: user.id, userName: user.email, action: 'PASSWORD_RESET_REQUESTED', entityType: 'User', entityId: user.id });

  // The token must never be returned in the API response in production,
  // since that would let anyone who can call this endpoint reset any
  // account's password without proving ownership of the email address.
  // sendPasswordResetEmail sends it via Resend when RESEND_API_KEY is
  // configured, or logs it server-side otherwise; a failure here must not
  // break this response or reveal whether the email send succeeded.
  try {
    await sendPasswordResetEmail(user.email, token);
  } catch (err) {
    logger.error({ err, userId: user.id }, 'Failed to send password reset email');
  }
  res.json({
    success: true,
    message: 'If an account exists, password reset instructions have been sent.',
    ...(env.isProduction ? {} : { devResetToken: token }),
  });
});

const resetSchema = z.object({ token: z.string(), newPassword: z.string() });

const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = resetSchema.parse(req.body);
  const strength = isPasswordStrong(newPassword);
  if (!strength.ok) return res.status(400).json({ error: strength.message });

  const tokenHash = hashToken(token);
  const userRes = await query(`SELECT ${USER_COLS} FROM users WHERE reset_token = $1 AND reset_token_expires > $2`, [tokenHash, new Date()]);
  const user = userRes.rows[0];
  if (!user) return res.status(400).json({ error: 'Reset link is invalid or has expired.' });

  const passwordHash = await hashPassword(newPassword);
  await query(
    `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, must_change_password = false, failed_login_attempts = 0, locked_until = NULL WHERE id = $2`,
    [passwordHash, user.id]
  );
  await query('UPDATE sessions SET revoked = true WHERE user_id = $1', [user.id]);

  await recordAudit({ req, userId: user.id, userName: user.email, action: 'PASSWORD_RESET_COMPLETED', entityType: 'User', entityId: user.id });
  res.json({ success: true, message: 'Password has been reset. Please log in with your new password.' });
});

const changePasswordSchema = z.object({ currentPassword: z.string(), newPassword: z.string() });

const changePassword = asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const strength = isPasswordStrong(newPassword);
  if (!strength.ok) return res.status(400).json({ error: strength.message });

  const user = await findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

  const passwordHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [passwordHash, user.id]);
  await recordAudit({ req, userId: user.id, userName: user.email, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: user.id });
  res.json({ success: true, message: 'Password updated successfully.' });
});

const setupTwoFactor = asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(req.user.email, 'PayrollPro', secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  await query('UPDATE users SET two_factor_secret = $1 WHERE id = $2', [secret, req.user.id]);
  res.json({ secret, qrCodeDataUrl });
});

const enableTwoFactorSchema = z.object({ code: z.string().min(6).max(6) });

const enableTwoFactor = asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { code } = enableTwoFactorSchema.parse(req.body);
  const user = await findUserById(req.user.id);
  if (!user?.twoFactorSecret) return res.status(400).json({ error: 'Two-factor setup has not been initiated.' });

  const valid = authenticator.check(code, user.twoFactorSecret);
  if (!valid) return res.status(400).json({ error: 'Invalid verification code.' });

  await query('UPDATE users SET two_factor_enabled = true WHERE id = $1', [user.id]);
  await recordAudit({ req, userId: user.id, userName: user.email, action: 'TWO_FACTOR_ENABLED', entityType: 'User', entityId: user.id });
  res.json({ success: true, message: 'Two-factor authentication enabled.' });
});

const disableTwoFactor = asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  await query('UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL WHERE id = $1', [req.user.id]);
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'TWO_FACTOR_DISABLED', entityType: 'User', entityId: req.user.id });
  res.json({ success: true, message: 'Two-factor authentication disabled.' });
});

module.exports = {
  login,
  verifyTwoFactor,
  refresh,
  logout,
  me,
  forgotPassword,
  resetPassword,
  changePassword,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
};
