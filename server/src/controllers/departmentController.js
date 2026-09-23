import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { recordAudit } from '../utils/audit.js';

export const listDepartments = asyncHandler(async (req, res) => {
  const departments = await prisma.department.findMany({
    include: { manager: { select: { id: true, employee: { select: { firstName: true, lastName: true } } } }, _count: { select: { employees: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ departments });
});

const upsertSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  managerId: z.string().optional().nullable(),
});

export const createDepartment = asyncHandler(async (req, res) => {
  const data = upsertSchema.parse(req.body);
  const dept = await prisma.department.create({ data });
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DEPARTMENT_CREATED', entityType: 'Department', entityId: dept.id, newValue: data });
  res.status(201).json({ department: dept });
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Department not found.' });
  const data = upsertSchema.partial().parse(req.body);
  const dept = await prisma.department.update({ where: { id: req.params.id }, data });
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DEPARTMENT_UPDATED', entityType: 'Department', entityId: dept.id, previousValue: existing, newValue: data });
  res.json({ department: dept });
});

export const deleteDepartment = asyncHandler(async (req, res) => {
  const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Department not found.' });
  await prisma.department.delete({ where: { id: req.params.id } });
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DEPARTMENT_DELETED', entityType: 'Department', entityId: req.params.id, previousValue: existing });
  res.json({ success: true });
});
