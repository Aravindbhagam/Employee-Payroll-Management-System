import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { recordAudit } from '../utils/audit';
import { employeeScopeFilter } from '../utils/scope';

export const listSalaryStructures = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const scope = await employeeScopeFilter(user);
  const employeeId = req.query.employeeId as string | undefined;

  const where: any = {};
  if (scope) where.employeeId = scope;
  if (employeeId) {
    if (scope && !scope.in.includes(employeeId)) throw new ApiError(403, "You don't have permission to view this employee's salary.");
    where.employeeId = employeeId;
  }

  const structures = await prisma.salaryStructure.findMany({
    where,
    include: { employee: { select: { firstName: true, lastName: true, id: true } } },
    orderBy: { effectiveFrom: 'desc' },
  });
  res.json({ salaryStructures: structures });
});

const upsertSchema = z.object({
  employeeId: z.string(),
  basic: z.number().nonnegative(),
  hra: z.number().nonnegative().default(0),
  conveyance: z.number().nonnegative().default(0),
  medical: z.number().nonnegative().default(0),
  specialAllowance: z.number().nonnegative().default(0),
  otherAllowances: z.number().nonnegative().default(0),
  providentFund: z.number().nonnegative().default(0),
  professionalTax: z.number().nonnegative().default(0),
  incomeTax: z.number().nonnegative().default(0),
  otherDeductions: z.number().nonnegative().default(0),
  effectiveFrom: z.string().optional(),
});

function computeCtc(d: z.infer<typeof upsertSchema>) {
  return d.basic + d.hra + d.conveyance + d.medical + d.specialAllowance + d.otherAllowances;
}

export const createSalaryStructure = asyncHandler(async (req: Request, res: Response) => {
  const data = upsertSchema.parse(req.body);
  const ctc = computeCtc(data);

  await prisma.salaryStructure.updateMany({ where: { employeeId: data.employeeId, isActive: true }, data: { isActive: false } });

  const structure = await prisma.salaryStructure.create({
    data: { ...data, ctc, effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(), isActive: true },
  });

  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'SALARY_STRUCTURE_CREATED', entityType: 'SalaryStructure', entityId: structure.id, newValue: data });
  res.status(201).json({ salaryStructure: structure });
});

export const updateSalaryStructure = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.salaryStructure.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Salary structure not found.' });
  const data = upsertSchema.partial().parse(req.body);
  const merged = { ...existing, ...data } as any;
  const ctc = computeCtc(merged);

  const structure = await prisma.salaryStructure.update({ where: { id: req.params.id }, data: { ...data, ctc } });
  await recordAudit({
    req,
    userId: req.user!.id,
    userName: req.user!.email,
    action: 'SALARY_STRUCTURE_UPDATED',
    entityType: 'SalaryStructure',
    entityId: structure.id,
    previousValue: existing,
    newValue: data,
  });
  res.json({ salaryStructure: structure });
});
