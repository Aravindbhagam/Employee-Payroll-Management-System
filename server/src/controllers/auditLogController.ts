import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { parsePagination } from '../utils/pagination';

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { action, entityType, userId, from, to } = req.query as Record<string, string | undefined>;

  const where: any = {};
  if (action) where.action = { contains: action };
  if (entityType) where.entityType = entityType;
  if (userId) where.userId = userId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const pagination = parsePagination(req, { defaultPageSize: 50 })!;

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
