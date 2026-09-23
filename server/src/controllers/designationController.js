import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { recordAudit } from '../utils/audit.js';

export const listDesignations = asyncHandler(async (req, res) => {
  const designations = await prisma.designation.findMany({ include: { department: true }, orderBy: { title: 'asc' } });
  res.json({ designations });
});

const upsertSchema = z.object({ title: z.string().min(1), departmentId: z.string().min(1) });

export const createDesignation = asyncHandler(async (req, res) => {
  const data = upsertSchema.parse(req.body);
  const designation = await prisma.designation.create({ data });
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DESIGNATION_CREATED', entityType: 'Designation', entityId: designation.id, newValue: data });
  res.status(201).json({ designation });
});

export const updateDesignation = asyncHandler(async (req, res) => {
  const existing = await prisma.designation.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Designation not found.' });
  const data = upsertSchema.partial().parse(req.body);
  const designation = await prisma.designation.update({ where: { id: req.params.id }, data });
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DESIGNATION_UPDATED', entityType: 'Designation', entityId: designation.id, previousValue: existing, newValue: data });
  res.json({ designation });
});

export const deleteDesignation = asyncHandler(async (req, res) => {
  const existing = await prisma.designation.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Designation not found.' });
  await prisma.designation.delete({ where: { id: req.params.id } });
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'DESIGNATION_DELETED', entityType: 'Designation', entityId: req.params.id, previousValue: existing });
  res.json({ success: true });
});
