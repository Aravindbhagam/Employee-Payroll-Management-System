import { Request, Response } from 'express';
import { z } from 'zod';
import { ROLE_NAMES, RoleName } from '../types/enums';
import { prisma } from '../config/prisma';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { recordAudit } from '../utils/audit';
import { hashPassword, randomToken } from '../utils/password';
import { getEffectivePermissions } from '../middleware/rbac';
import { parsePagination } from '../utils/pagination';

function serializeUser(user: any) {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    email: user.email,
    role: user.role,
    status: user.status,
    department: user.department ? { id: user.department.id, name: user.department.name } : null,
    manager: user.manager?.employee ? { id: user.manager.id, name: `${user.manager.employee.firstName} ${user.manager.employee.lastName}` } : null,
    twoFactorEnabled: user.twoFactorEnabled,
    lastLoginAt: user.lastLoginAt,
    lastLoginIp: user.lastLoginIp,
    lockedUntil: user.lockedUntil,
    createdAt: user.createdAt,
    name: user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user.email,
  };
}

const userInclude = {
  department: true,
  employee: true,
  manager: { include: { employee: true } },
};

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { role, departmentId, status, search } = req.query as Record<string, string | undefined>;
  const where: any = {};
  if (role) where.role = role;
  if (departmentId) where.departmentId = departmentId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { email: { contains: search } },
      { employeeCode: { contains: search } },
      { employee: { firstName: { contains: search } } },
      { employee: { lastName: { contains: search } } },
    ];
  }
  const pagination = parsePagination(req, { optIn: true });
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: { createdAt: 'desc' },
      ...(pagination ? { take: pagination.take, skip: pagination.skip } : {}),
    }),
    pagination ? prisma.user.count({ where }) : Promise.resolve(undefined),
  ]);
  res.json({
    users: users.map(serializeUser),
    ...(pagination ? { total, page: pagination.page, pageSize: pagination.pageSize } : {}),
  });
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: userInclude });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: serializeUser(user) });
});

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(ROLE_NAMES),
  departmentId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
});

async function nextEmployeeCode() {
  const count = await prisma.user.count();
  return `EMP${String(count + 1001).padStart(5, '0')}`;
}

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const data = createSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) throw new ApiError(409, 'A user with this email already exists.');

  const tempPassword = randomToken(6);
  const passwordHash = await hashPassword(tempPassword);
  const employeeCode = await nextEmployeeCode();

  const user = await prisma.user.create({
    data: {
      employeeCode,
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role,
      departmentId: data.departmentId || null,
      managerId: data.managerId || null,
      mustChangePassword: true,
      employee: { create: { firstName: data.firstName, lastName: data.lastName, departmentId: data.departmentId || null } },
    },
    include: userInclude,
  });

  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'USER_CREATED', entityType: 'User', entityId: user.id, newValue: { email: data.email, role: data.role } });
  res.status(201).json({ user: serializeUser(user), temporaryPassword: tempPassword, employeeCode });
});

const updateSchema = z.object({
  role: z.enum(ROLE_NAMES).optional(),
  departmentId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'User not found.' });
  const data = updateSchema.parse(req.body);

  if (existing.role === 'SUPER_ADMIN' && data.role && data.role !== 'SUPER_ADMIN' && existing.id === req.user!.id) {
    throw new ApiError(400, 'You cannot demote your own Super Admin account.');
  }

  const user = await prisma.user.update({ where: { id: req.params.id }, data, include: userInclude });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'USER_UPDATED', entityType: 'User', entityId: user.id, previousValue: { role: existing.role, departmentId: existing.departmentId, managerId: existing.managerId }, newValue: data });
  res.json({ user: serializeUser(user) });
});

async function setStatus(req: Request, res: Response, status: 'ACTIVE' | 'INACTIVE', action: string) {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'User not found.' });
  if (existing.id === req.user!.id) throw new ApiError(400, 'You cannot change the status of your own account.');

  const user = await prisma.user.update({ where: { id: req.params.id }, data: { status } });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action, entityType: 'User', entityId: user.id, previousValue: { status: existing.status }, newValue: { status } });
  res.json({ user: { id: user.id, status: user.status } });
}

export const activateUser = asyncHandler((req, res) => setStatus(req, res, 'ACTIVE', 'USER_ACTIVATED'));
export const deactivateUser = asyncHandler((req, res) => setStatus(req, res, 'INACTIVE', 'USER_DEACTIVATED'));

export const lockUser = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'User not found.' });
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { lockedUntil: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000) } });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'USER_LOCKED', entityType: 'User', entityId: user.id });
  res.json({ user: { id: user.id, lockedUntil: user.lockedUntil } });
});

export const unlockUser = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'User not found.' });
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { lockedUntil: null, failedLoginAttempts: 0 } });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'USER_UNLOCKED', entityType: 'User', entityId: user.id });
  res.json({ user: { id: user.id, lockedUntil: user.lockedUntil } });
});

export const adminResetPassword = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'User not found.' });

  const tempPassword = randomToken(6);
  const passwordHash = await hashPassword(tempPassword);
  await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash, mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null } });
  await prisma.session.updateMany({ where: { userId: req.params.id }, data: { revoked: true } });

  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'USER_PASSWORD_RESET_BY_ADMIN', entityType: 'User', entityId: existing.id });
  res.json({ success: true, temporaryPassword: tempPassword });
});

export const getUserPermissions = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const effective = await getEffectivePermissions(user.id, user.role);
  const overrides = await prisma.userPermission.findMany({ where: { userId: user.id } });

  const effectiveArray = Array.from(effective.entries()).map(([key, allowed]) => {
    const [resource, action] = key.split(':');
    return { resource, action, allowed };
  });

  res.json({ role: user.role, effective: effectiveArray, overrides });
});

const overrideSchema = z.object({
  overrides: z.array(z.object({ resource: z.string(), action: z.string(), allowed: z.boolean() })),
});

export const setUserPermissions = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const { overrides } = overrideSchema.parse(req.body);

  await prisma.$transaction(
    overrides.map((o) =>
      prisma.userPermission.upsert({
        where: { userId_resource_action: { userId: user.id, resource: o.resource as any, action: o.action as any } },
        update: { allowed: o.allowed },
        create: { userId: user.id, resource: o.resource as any, action: o.action as any, allowed: o.allowed },
      })
    )
  );

  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'PERMISSION_CHANGED', entityType: 'User', entityId: user.id, newValue: overrides });
  res.json({ success: true });
});
