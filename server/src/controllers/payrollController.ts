import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { recordAudit } from '../utils/audit';
import { PayrollStatus } from '../types/enums';

export const listPayrollRuns = asyncHandler(async (req: Request, res: Response) => {
  const runs = await prisma.payrollRun.findMany({
    include: {
      createdBy: { select: { email: true } },
      reviewedBy: { select: { email: true } },
      approvedBy: { select: { email: true } },
      _count: { select: { payslips: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ payrollRuns: runs });
});

export const getPayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const run = await prisma.payrollRun.findUnique({
    where: { id: req.params.id },
    include: {
      payslips: { include: { employee: { select: { firstName: true, lastName: true, id: true, department: { select: { name: true } } } } } },
    },
  });
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
  res.json({ payrollRun: run });
});

const createSchema = z.object({ period: z.string().min(4) });

export const createPayrollRun = asyncHandler(async (req: Request, res: Response) => {
  const { period } = createSchema.parse(req.body);
  const existing = await prisma.payrollRun.findUnique({ where: { period } });
  if (existing) throw new ApiError(409, `A payroll run for ${period} already exists.`);

  const run = await prisma.payrollRun.create({ data: { period, status: 'DRAFT', createdById: req.user!.id } });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'PAYROLL_RUN_CREATED', entityType: 'PayrollRun', entityId: run.id, newValue: { period } });
  res.status(201).json({ payrollRun: run });
});

function assertTransition(current: string, allowed: PayrollStatus[]) {
  if (!(allowed as string[]).includes(current)) {
    throw new ApiError(400, `Payroll run cannot transition from ${current}.`);
  }
}

export const calculatePayroll = asyncHandler(async (req: Request, res: Response) => {
  const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
  assertTransition(run.status, ['DRAFT', 'FAILED']);

  await prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'CALCULATING' } });

  try {
    const activeStructures = await prisma.salaryStructure.findMany({
      where: { isActive: true, employee: { status: 'ACTIVE' } },
      include: { employee: true },
    });

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    await prisma.payslip.deleteMany({ where: { payrollRunId: run.id } });

    for (const s of activeStructures) {
      const gross = s.basic + s.hra + s.conveyance + s.medical + s.specialAllowance + s.otherAllowances;
      const deductions = s.providentFund + s.professionalTax + s.incomeTax + s.otherDeductions;
      const net = gross - deductions;
      totalGross += gross;
      totalDeductions += deductions;
      totalNet += net;

      await prisma.payslip.create({
        data: {
          payrollRunId: run.id,
          employeeId: s.employeeId,
          period: run.period,
          gross,
          deductions,
          net,
          breakdown: JSON.stringify({
            earnings: { basic: s.basic, hra: s.hra, conveyance: s.conveyance, medical: s.medical, specialAllowance: s.specialAllowance, otherAllowances: s.otherAllowances },
            deductions: { providentFund: s.providentFund, professionalTax: s.professionalTax, incomeTax: s.incomeTax, otherDeductions: s.otherDeductions },
          }),
        },
      });
    }

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        status: 'PENDING_REVIEW',
        totalGross,
        totalDeductions,
        totalNet,
        employeeCount: activeStructures.length,
        submittedAt: new Date(),
      },
    });

    await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'PAYROLL_CALCULATED', entityType: 'PayrollRun', entityId: run.id, newValue: { totalGross, totalDeductions, totalNet, employeeCount: activeStructures.length } });
    res.json({ payrollRun: updated });
  } catch (err) {
    await prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'FAILED' } });
    throw err;
  }
});

export const submitForApproval = asyncHandler(async (req: Request, res: Response) => {
  const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
  assertTransition(run.status, ['PENDING_REVIEW']);

  const updated = await prisma.payrollRun.update({
    where: { id: run.id },
    data: { status: 'PENDING_APPROVAL', reviewedById: req.user!.id, reviewedAt: new Date() },
  });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'PAYROLL_SUBMITTED_FOR_APPROVAL', entityType: 'PayrollRun', entityId: run.id });
  res.json({ payrollRun: updated });
});

export const approvePayroll = asyncHandler(async (req: Request, res: Response) => {
  const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
  assertTransition(run.status, ['PENDING_APPROVAL']);

  const updated = await prisma.payrollRun.update({
    where: { id: run.id },
    data: { status: 'APPROVED', approvedById: req.user!.id, approvedAt: new Date() },
  });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'PAYROLL_APPROVED', entityType: 'PayrollRun', entityId: run.id });
  res.json({ payrollRun: updated });
});

const rejectSchema = z.object({ reason: z.string().min(1, 'A rejection reason is required.') });

export const rejectPayroll = asyncHandler(async (req: Request, res: Response) => {
  const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
  assertTransition(run.status, ['PENDING_REVIEW', 'PENDING_APPROVAL']);
  const { reason } = rejectSchema.parse(req.body);

  const updated = await prisma.payrollRun.update({
    where: { id: run.id },
    data: { status: 'REJECTED', rejectionReason: reason },
  });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'PAYROLL_REJECTED', entityType: 'PayrollRun', entityId: run.id, newValue: { reason } });
  res.json({ payrollRun: updated });
});

export const processPayroll = asyncHandler(async (req: Request, res: Response) => {
  const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
  if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
  assertTransition(run.status, ['APPROVED']);

  await prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'PROCESSING' } });

  try {
    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'COMPLETED', processedAt: new Date() },
    });
    await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'PAYROLL_PROCESSED', entityType: 'PayrollRun', entityId: run.id });

    const payslips = await prisma.payslip.findMany({ where: { payrollRunId: run.id } });
    for (const p of payslips) {
      await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'PAYSLIP_GENERATED', entityType: 'Payslip', entityId: p.id });
    }

    res.json({ payrollRun: updated, message: `Payroll completed. ${payslips.length} payslip(s) generated and employees notified.` });
  } catch (err) {
    await prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'FAILED' } });
    throw err;
  }
});
