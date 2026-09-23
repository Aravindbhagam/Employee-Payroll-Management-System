import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { recordAudit } from '../utils/audit.js';
import { employeeIdForUser, employeeScopeFilter } from '../utils/scope.js';
import { parsePagination } from '../utils/pagination.js';

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export const listAttendance = asyncHandler(async (req, res) => {
  const user = req.user;
  const scope = await employeeScopeFilter(user);
  const { employeeId, from, to, month } = req.query;

  const where = {};
  if (scope) where.employeeId = scope;
  if (employeeId) {
    if (scope && !scope.in.includes(employeeId)) throw new ApiError(403, "You don't have permission to view this employee's attendance.");
    where.employeeId = employeeId;
  }
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }
  if (month) {
    const [y, m] = month.split('-').map(Number);
    where.date = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
  }

  const pagination = parsePagination(req, { optIn: true });
  const [records, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, id: true, department: { select: { name: true } } } } },
      orderBy: { date: 'desc' },
      ...(pagination ? { take: pagination.take, skip: pagination.skip } : {}),
    }),
    pagination ? prisma.attendance.count({ where }) : Promise.resolve(undefined),
  ]);
  res.json({
    attendance: records,
    ...(pagination ? { total, page: pagination.page, pageSize: pagination.pageSize } : {}),
  });
});

export const checkIn = asyncHandler(async (req, res) => {
  const employeeId = await employeeIdForUser(req.user.id);
  if (!employeeId) throw new ApiError(400, 'No employee profile linked to this account.');
  const today = startOfDay(new Date());
  const record = await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId, date: today } },
    update: { checkIn: new Date().toISOString(), status: 'PRESENT' },
    create: { employeeId, date: today, checkIn: new Date().toISOString(), status: 'PRESENT' },
  });
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'ATTENDANCE_CHECK_IN', entityType: 'Attendance', entityId: record.id });
  res.json({ attendance: record });
});

export const checkOut = asyncHandler(async (req, res) => {
  const employeeId = await employeeIdForUser(req.user.id);
  if (!employeeId) throw new ApiError(400, 'No employee profile linked to this account.');
  const today = startOfDay(new Date());
  const existing = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId, date: today } } });
  if (!existing || !existing.checkIn) throw new ApiError(400, 'You must check in before checking out.');

  const checkOutTime = new Date();
  const hoursWorked = Math.max(0, (checkOutTime.getTime() - new Date(existing.checkIn).getTime()) / 3600000);
  const record = await prisma.attendance.update({
    where: { id: existing.id },
    data: { checkOut: checkOutTime.toISOString(), hoursWorked: Math.round(hoursWorked * 100) / 100 },
  });
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'ATTENDANCE_CHECK_OUT', entityType: 'Attendance', entityId: record.id });
  res.json({ attendance: record });
});

const manualSchema = z.object({
  employeeId: z.string(),
  date: z.string(),
  status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND']),
  checkIn: z.string().optional().nullable(),
  checkOut: z.string().optional().nullable(),
  hoursWorked: z.number().optional(),
});

export const upsertManualAttendance = asyncHandler(async (req, res) => {
  const data = manualSchema.parse(req.body);
  const date = startOfDay(new Date(data.date));
  const record = await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId: data.employeeId, date } },
    update: { status: data.status, checkIn: data.checkIn, checkOut: data.checkOut, hoursWorked: data.hoursWorked ?? 0 },
    create: { employeeId: data.employeeId, date, status: data.status, checkIn: data.checkIn, checkOut: data.checkOut, hoursWorked: data.hoursWorked ?? 0 },
  });
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'ATTENDANCE_UPDATED', entityType: 'Attendance', entityId: record.id, newValue: data });
  res.json({ attendance: record });
});
