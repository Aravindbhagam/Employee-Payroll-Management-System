import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { recordAudit } from '../utils/audit';

export const getTaxSettings = asyncHandler(async (req: Request, res: Response) => {
  const settings = await prisma.companySettings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });
  const runs = await prisma.payrollRun.findMany({ where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 12 });
  res.json({
    rates: {
      providentFundRate: settings.defaultProvidentFundRate,
      professionalTax: settings.defaultProfessionalTax,
      incomeTaxRate: settings.defaultIncomeTaxRate,
    },
    statutoryDeductionHistory: runs.map((r) => ({ period: r.period, totalDeductions: r.totalDeductions })),
  });
});

const updateSchema = z.object({
  providentFundRate: z.number().min(0).max(100).optional(),
  professionalTax: z.number().min(0).optional(),
  incomeTaxRate: z.number().min(0).max(100).optional(),
});

export const updateTaxSettings = asyncHandler(async (req: Request, res: Response) => {
  const data = updateSchema.parse(req.body);
  const settings = await prisma.companySettings.upsert({
    where: { id: 'singleton' },
    update: {
      defaultProvidentFundRate: data.providentFundRate,
      defaultProfessionalTax: data.professionalTax,
      defaultIncomeTaxRate: data.incomeTaxRate,
    },
    create: { id: 'singleton' },
  });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'SETTINGS_CHANGED', entityType: 'TaxCompliance', newValue: data });
  res.json({ settings });
});
