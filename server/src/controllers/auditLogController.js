import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { parsePagination } from '../utils/pagination.js';

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { action, entityType, userId, from, to } = req.query;

  const where = {};
  if (action) where.action = { contains: action };
  if (entityType) where.entityType = entityType;
  if (userId) where.userId = userId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const pagination = parsePagination(req, { defaultPageSize: 50 });

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: pagination.take, skip: pagination.skip }),
    prisma.auditLog.count({ where }),
  ]);

  const parsed = logs.map((l) => ({
    ...l,
    previousValue: l.previousValue ? JSON.parse(l.previousValue) : null,
    newValue: l.newValue ? JSON.parse(l.newValue) : null,
  }));

  res.json({ logs: parsed, total, page: pagination.page, pageSize: pagination.pageSize });
});
