import { prisma } from '../config/prisma.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { employeeScopeFilter } from '../utils/scope.js';

export const listPayslips = asyncHandler(async (req, res) => {
  const user = req.user;
  const scope = await employeeScopeFilter(user);
  const employeeId = req.query.employeeId;

  const where = {};
  if (scope) where.employeeId = scope;
  if (employeeId) {
    if (scope && !scope.in.includes(employeeId)) throw new ApiError(403, "You don't have permission to view this employee's payslips.");
    where.employeeId = employeeId;
  }

  const payslips = await prisma.payslip.findMany({
    where,
    include: { employee: { select: { firstName: true, lastName: true, id: true } }, payrollRun: { select: { status: true, period: true } } },
    orderBy: { generatedAt: 'desc' },
  });
  res.json({ payslips });
});

export const getPayslip = asyncHandler(async (req, res) => {
  const user = req.user;
  const payslip = await prisma.payslip.findUnique({
    where: { id: req.params.id },
    include: { employee: { include: { user: true, department: true, designation: true } }, payrollRun: true },
  });
  if (!payslip) return res.status(404).json({ error: 'Payslip not found.' });

  const scope = await employeeScopeFilter(user);
  if (scope && !scope.in.includes(payslip.employeeId)) throw new ApiError(403, "You don't have permission to view this payslip.");

  res.json({ payslip: { ...payslip, breakdown: JSON.parse(payslip.breakdown) } });
});
