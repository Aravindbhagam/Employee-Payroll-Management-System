import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { comparePassword, hashPassword, hashToken, isPasswordStrong, randomToken } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { recordAudit } from '../utils/audit';
import { getEffectivePermissions } from '../middleware/rbac';
import { asyncHandler } from '../middleware/errorHandler';

const REFRESH_COOKIE = 'refreshToken';

function permissionsMapToObject(map: Map<string, boolean>) {
  const obj: Record<string, string[]> = {};
  for (const [key, allowed] of map.entries()) {
    if (!allowed) continue;
    const [resource, action] = key.split(':');
    if (!obj[resource]) obj[resource] = [];
    obj[resource].push(action);
  }
  return obj;
}

async function buildUserResponse(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { department: true, employee: true, manager: { select: { id: true, employee: { select: { firstName: true, lastName: true } } } } },
  });
  if (!user) return null;
  const permissionsMap = await getEffectivePermissions(user.id, user.role);
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    email: user.email,
    role: user.role,
    status: user.status,
    department: user.department ? { id: user.department.id, name: user.department.name } : null,
    managerId: user.managerId,
    twoFactorEnabled: user.twoFactorEnabled,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    profile: user.employee
      ? {
          firstName: user.employee.firstName,
          lastName: user.employee.lastName,
          photoUrl: user.employee.photoUrl,
          designationId: user.employee.designationId,
        }
      : null,
    permissions: permissionsMapToObject(permissionsMap),
  };
}

// In production the frontend (GitHub Pages) and API (Render) are on
// different origins, so the refresh cookie must be SameSite=None; Secure to
// be sent cross-site at all. Locally, both run on http://localhost so Lax
// (and no Secure flag, since there's no TLS) works and is less restrictive.
const REFRESH_COOKIE_OPTIONS = env.isProduction
  ? ({ httpOnly: true, secure: true, sameSite: 'none' as const, path: '/api/auth' })
  : ({ httpOnly: true, secure: false, sameSite: 'lax' as const, path: '/api/auth' });

function setRefreshCookie(res: Response, token: string, days: number) {
  res.cookie(REFRESH_COOKIE, token, { ...REFRESH_COOKIE_OPTIONS, maxAge: days * 24 * 60 * 60 * 1000 });
}

const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or Employee ID is required.'),
  password: z.string().min(1, 'Password is required.'),
  rememberMe: z.boolean().optional().default(false),
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password, rememberMe } = loginSchema.parse(req.body);

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier.toLowerCase() }, { employeeCode: identifier }] },
  });

  const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } });
  const maxAttempts = settings?.maxFailedLoginAttempts ?? 5;
  const lockoutMinutes = settings?.lockoutMinutes ?? 15;

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return res.status(423).json({ error: `Account locked due to repeated failed attempts. Try again in ${minutesLeft} minute(s).` });
  }

  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'This account is inactive. Please contact your administrator.' });
  }

  const validPassword = await comparePassword(password, user.passwordHash);
  if (!validPassword) {
    const attempts = user.failedLoginAttempts + 1;
    const locked = attempts >= maxAttempts;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: locked ? 0 : attempts,
        lockedUntil: locked ? new Date(Date.now() + lockoutMinutes * 60 * 1000) : null,
      },
    });
    await recordAudit({
      req,
      userId: user.id,
      userName: user.email,
      action: locked ? 'LOGIN_LOCKED' : 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
    });
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

export const verifyTwoFactor = asyncHandler(async (req: Request, res: Response) => {
  const { tempToken, code } = twoFactorSchema.parse(req.body);
  let payload: any;
  try {
    payload = jwt.verify(tempToken, env.jwtAccessSecret);
  } catch {
    return res.status(401).json({ error: 'Two-factor session expired. Please log in again.' });
  }
  if (payload.purpose !== '2fa') return res.status(400).json({ error: 'Invalid token.' });

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.twoFactorSecret) return res.status(400).json({ error: 'Two-factor authentication is not set up.' });

  const valid = authenticator.check(code, user.twoFactorSecret);
  if (!valid) {
    await recordAudit({ req, userId: user.id, userName: user.email, action: 'LOGIN_2FA_FAILED', entityType: 'User', entityId: user.id });
    return res.status(401).json({ error: 'Invalid verification code.' });
  }

  await completeLogin(req, res, user.id, !!payload.rememberMe);
});

async function completeLogin(req: Request, res: Response, userId: string, rememberMe: boolean) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const days = rememberMe ? env.refreshTokenTtlDaysRemember : env.refreshTokenTtlDays;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: '',
      userAgent: req.headers['user-agent'] || null,
      ip: req.ip,
      rememberMe,
      expiresAt,
    },
  });

  const refreshToken = signRefreshToken({ sub: user.id, sessionId: session.id }, days);
  await prisma.session.update({ where: { id: session.id }, data: { tokenHash: hashToken(refreshToken) } });

  const accessToken = signAccessToken({ sub: user.id, role: user.role as any, sessionId: session.id });

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: req.ip },
  });

  await recordAudit({ req, userId: user.id, userName: user.email, action: 'LOGIN_SUCCESS', entityType: 'User', entityId: user.id });

  setRefreshCookie(res, refreshToken, days);
  const userResponse = await buildUserResponse(user.id);
  res.json({ accessToken, user: userResponse });
}

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) return res.status(401).json({ error: 'No refresh token provided.' });

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    return res.status(401).json({ error: 'Refresh token invalid or expired.' });
  }

  const session = await prisma.session.findUnique({ where: { id: payload.sessionId } });
  if (!session || session.revoked || session.expiresAt < new Date() || session.tokenHash !== hashToken(token)) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== 'ACTIVE') return res.status(401).json({ error: 'Account is not active.' });

  const accessToken = signAccessToken({ sub: user.id, role: user.role as any, sessionId: session.id });
  const userResponse = await buildUserResponse(user.id);
  res.json({ accessToken, user: userResponse });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await prisma.session.updateMany({ where: { id: payload.sessionId }, data: { revoked: true } });
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

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userResponse = await buildUserResponse(req.user.id);
  res.json({ user: userResponse });
});

const forgotSchema = z.object({ identifier: z.string().min(1) });

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { identifier } = forgotSchema.parse(req.body);
  const user = await prisma.user.findFirst({ where: { OR: [{ email: identifier.toLowerCase() }, { employeeCode: identifier }] } });

  // Always respond with success to avoid leaking which accounts exist.
  if (!user) {
    return res.json({ success: true, message: 'If an account exists, password reset instructions have been sent.' });
  }

  const token = randomToken(24);
  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: hashToken(token), resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000) },
  });

  await recordAudit({ req, userId: user.id, userName: user.email, action: 'PASSWORD_RESET_REQUESTED', entityType: 'User', entityId: user.id });

  // In production this would be emailed. For this demo environment we log it
  // server-side and return it in the response so the flow is testable end-to-end.
  console.log(`[password reset] token for ${user.email}: ${token}`);
  res.json({
    success: true,
    message: 'If an account exists, password reset instructions have been sent.',
    devResetToken: token,
  });
});

const resetSchema = z.object({ token: z.string(), newPassword: z.string() });

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword } = resetSchema.parse(req.body);
  const strength = isPasswordStrong(newPassword);
  if (!strength.ok) return res.status(400).json({ error: strength.message });

  const tokenHash = hashToken(token);
  const user = await prisma.user.findFirst({ where: { resetToken: tokenHash, resetTokenExpires: { gt: new Date() } } });
  if (!user) return res.status(400).json({ error: 'Reset link is invalid or has expired.' });

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetTokenExpires: null, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null },
  });
  await prisma.session.updateMany({ where: { userId: user.id }, data: { revoked: true } });

  await recordAudit({ req, userId: user.id, userName: user.email, action: 'PASSWORD_RESET_COMPLETED', entityType: 'User', entityId: user.id });
  res.json({ success: true, message: 'Password has been reset. Please log in with your new password.' });
});

const changePasswordSchema = z.object({ currentPassword: z.string(), newPassword: z.string() });

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const strength = isPasswordStrong(newPassword);
  if (!strength.ok) return res.status(400).json({ error: strength.message });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
  await recordAudit({ req, userId: user.id, userName: user.email, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: user.id });
  res.json({ success: true, message: 'Password updated successfully.' });
});

export const setupTwoFactor = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(req.user.email, 'PayrollPro', secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  await prisma.user.update({ where: { id: req.user.id }, data: { twoFactorSecret: secret } });
  res.json({ secret, qrCodeDataUrl });
});

const enableTwoFactorSchema = z.object({ code: z.string().min(6).max(6) });

export const enableTwoFactor = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  const { code } = enableTwoFactorSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user?.twoFactorSecret) return res.status(400).json({ error: 'Two-factor setup has not been initiated.' });

  const valid = authenticator.check(code, user.twoFactorSecret);
  if (!valid) return res.status(400).json({ error: 'Invalid verification code.' });

  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
  await recordAudit({ req, userId: user.id, userName: user.email, action: 'TWO_FACTOR_ENABLED', entityType: 'User', entityId: user.id });
  res.json({ success: true, message: 'Two-factor authentication enabled.' });
});

export const disableTwoFactor = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
  await prisma.user.update({ where: { id: req.user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'TWO_FACTOR_DISABLED', entityType: 'User', entityId: req.user.id });
  res.json({ success: true, message: 'Two-factor authentication disabled.' });
});
