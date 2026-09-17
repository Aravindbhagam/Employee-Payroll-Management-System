import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { recordAudit } from '../utils/audit';
import { employeeIdForUser, employeeScopeFilter, teamEmployeeIds } from '../utils/scope';
import { parsePagination } from '../utils/pagination';

export const listLeaveRequests = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const scope = await employeeScopeFilter(user);
  const { status, employeeId } = req.query as Record<string, string | undefined>;

  const where: any = {};
  if (scope) where.employeeId = scope;
  if (employeeId) {
    if (scope && !scope.in.includes(employeeId)) throw new ApiError(403, "You don't have permission to view this employee's leave.");
    where.employeeId = employeeId;
  }
  if (status) where.status = status;

  const pagination = parsePagination(req, { optIn: true });
  const [requests, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, id: true, department: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      ...(pagination ? { take: pagination.take, skip: pagination.skip } : {}),
    }),
    pagination ? prisma.leaveRequest.count({ where }) : Promise.resolve(undefined),
  ]);
  res.json({
    leaveRequests: requests,
    ...(pagination ? { total, page: pagination.page, pageSize: pagination.pageSize } : {}),
  });
});

export const listLeaveBalances = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const employeeId = (req.query.employeeId as string | undefined) || (await employeeIdForUser(user.id));
  if (!employeeId) return res.json({ balances: [] });

  const scope = await employeeScopeFilter(user);
  if (scope && !scope.in.includes(employeeId)) throw new ApiError(403, "You don't have permission to view this employee's leave balance.");

  const year = new Date().getFullYear();
  const balances = await prisma.leaveBalance.findMany({ where: { employeeId, year } });
  res.json({ balances });
});

const applySchema = z.object({
  leaveType: z.enum(['ANNUAL', 'SICK', 'CASUAL', 'UNPAID', 'MATERNITY', 'PATERNITY', 'OTHER']),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
});

function daysBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export const applyLeave = asyncHandler(async (req: Request, res: Response) => {
  const employeeId = await employeeIdForUser(req.user!.id);
  if (!employeeId) throw new ApiError(400, 'No employee profile linked to this account.');
  const data = applySchema.parse(req.body);
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  if (endDate < startDate) throw new ApiError(400, 'End date cannot be before start date.');
  const days = daysBetween(startDate, endDate);

  const request = await prisma.leaveRequest.create({
    data: { employeeId, leaveType: data.leaveType, startDate, endDate, days, reason: data.reason, status: 'PENDING' },
  });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'LEAVE_APPLIED', entityType: 'LeaveRequest', entityId: request.id, newValue: data });
  res.status(201).json({ leaveRequest: request });
});

export const cancelLeave = asyncHandler(async (req: Request, res: Response) => {
  const employeeId = await employeeIdForUser(req.user!.id);
  const request = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Leave request not found.' });
  if (request.employeeId !== employeeId) throw new ApiError(403, 'You can only cancel your own leave requests.');
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only pending requests can be cancelled.');

  const updated = await prisma.leaveRequest.update({ where: { id: request.id }, data: { status: 'CANCELLED' } });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'LEAVE_CANCELLED', entityType: 'LeaveRequest', entityId: request.id });
  res.json({ leaveRequest: updated });
});

async function assertApproverScope(req: Request, request: { employeeId: string }) {
  const user = req.user!;
  if (user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN') return;
  if (user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(user.id);
    if (!ids.includes(request.employeeId)) throw new ApiError(403, 'You can only approve leave for your own team.');
    return;
  }
  throw new ApiError(403, "You don't have permission to approve leave requests.");
}

export const approveLeave = asyncHandler(async (req: Request, res: Response) => {
  const request = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Leave request not found.' });
  await assertApproverScope(req, request);
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only pending requests can be approved.');

  const updated = await prisma.leaveRequest.update({
    where: { id: request.id },
    data: { status: 'APPROVED', approverId: req.user!.id, approvedAt: new Date() },
  });

  const year = new Date(request.startDate).getFullYear();
  await prisma.leaveBalance.upsert({
    where: { employeeId_leaveType_year: { employeeId: request.employeeId, leaveType: request.leaveType, year } },
    update: { used: { increment: request.days } },
    create: { employeeId: request.employeeId, leaveType: request.leaveType, year, allocated: 0, used: request.days },
  });

  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'LEAVE_APPROVED', entityType: 'LeaveRequest', entityId: request.id });
  res.json({ leaveRequest: updated });
});

const rejectSchema = z.object({ reason: z.string().optional() });

export const rejectLeave = asyncHandler(async (req: Request, res: Response) => {
  const request = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Leave request not found.' });
  await assertApproverScope(req, request);
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only pending requests can be rejected.');

  const { reason } = rejectSchema.parse(req.body ?? {});
  const updated = await prisma.leaveRequest.update({
    where: { id: request.id },
    data: { status: 'REJECTED', approverId: req.user!.id, approvedAt: new Date(), rejectReason: reason },
  });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'LEAVE_REJECTED', entityType: 'LeaveRequest', entityId: request.id, newValue: { reason } });
  res.json({ leaveRequest: updated });
});
