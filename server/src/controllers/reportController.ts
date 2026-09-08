import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { employeeScopeFilter } from '../utils/scope';

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => JSON.stringify(row[h] ?? '')).join(','));
  }
  return lines.join('\n');
}

export const runReport = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const type = (req.query.type as string) || 'employees';
  const format = (req.query.format as string) || 'json';
  const scope = await employeeScopeFilter(user);

  let rows: Record<string, unknown>[] = [];

  if (type === 'employees') {
    const employees = await prisma.employee.findMany({
      where: scope ? { id: scope } : {},
      include: { department: true, designation: true, user: { select: { email: true, role: true, status: true } } },
    });
    rows = employees.map((e) => ({
      employee: `${e.firstName} ${e.lastName}`,
      email: e.user.email,
      department: e.department?.name ?? '',
      designation: e.designation?.title ?? '',
      role: e.user.role,
      status: e.status,
      dateOfJoining: e.dateOfJoining.toISOString().slice(0, 10),
    }));
  } else if (type === 'attendance') {
    if (user.role === 'PAYROLL_ADMIN') throw new ApiError(403, "You don't have permission to run attendance reports.");
    const records = await prisma.attendance.findMany({
      where: scope ? { employeeId: scope } : {},
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { date: 'desc' },
      take: 500,
    });
    rows = records.map((r) => ({ employee: `${r.employee.firstName} ${r.employee.lastName}`, date: r.date.toISOString().slice(0, 10), status: r.status, hoursWorked: r.hoursWorked }));
  } else if (type === 'leave') {
    const records = await prisma.leaveRequest.findMany({
      where: scope ? { employeeId: scope } : {},
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    rows = records.map((r) => ({ employee: `${r.employee.firstName} ${r.employee.lastName}`, type: r.leaveType, from: r.startDate.toISOString().slice(0, 10), to: r.endDate.toISOString().slice(0, 10), days: r.days, status: r.status }));
  } else if (type === 'payroll') {
    if (user.role === 'HR_ADMIN' || user.role === 'MANAGER' || user.role === 'EMPLOYEE') {
      throw new ApiError(403, "You don't have permission to run payroll reports.");
    }
    const runs = await prisma.payrollRun.findMany({ orderBy: { createdAt: 'desc' }, take: 24 });
    rows = runs.map((r) => ({ period: r.period, status: r.status, gross: r.totalGross, deductions: r.totalDeductions, net: r.totalNet, employees: r.employeeCount }));
  } else {
    throw new ApiError(400, `Unknown report type: ${type}`);
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
    return res.send(toCsv(rows));
  }

  res.json({ type, rows });
});
