import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { recordAudit } from '../utils/audit';

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await prisma.companySettings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });
  res.json({ settings });
});

const updateSchema = z.object({
  companyName: z.string().min(1).optional(),
  logoUrl: z.string().optional().nullable(),
  address: z.string().optional(),
  currency: z.string().optional(),
  fiscalYearStart: z.string().optional(),
  sessionTimeoutMinutes: z.number().int().min(5).max(240).optional(),
  passwordMinLength: z.number().int().min(6).max(32).optional(),
  maxFailedLoginAttempts: z.number().int().min(3).max(10).optional(),
  lockoutMinutes: z.number().int().min(5).max(120).optional(),
  twoFactorRequired: z.boolean().optional(),
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const data = updateSchema.parse(req.body);
  const previous = await prisma.companySettings.findUnique({ where: { id: 'singleton' } });
  const settings = await prisma.companySettings.upsert({ where: { id: 'singleton' }, update: data, create: { id: 'singleton', ...data } });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'SETTINGS_CHANGED', entityType: 'CompanySettings', entityId: 'singleton', previousValue: previous, newValue: data });
  res.json({ settings });
});
