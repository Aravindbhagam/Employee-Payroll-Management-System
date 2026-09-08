import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { asyncHandler } from '../middleware/errorHandler';

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { action, entityType, userId, from, to, page = '1', pageSize = '50' } = req.query as Record<string, string | undefined>;

  const where: any = {};
  if (action) where.action = { contains: action };
  if (entityType) where.entityType = entityType;
  if (userId) where.userId = userId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const take = Math.min(parseInt(pageSize, 10) || 50, 200);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
    prisma.auditLog.count({ where }),
  ]);

  const parsed = logs.map((l) => ({
    ...l,
    previousValue: l.previousValue ? JSON.parse(l.previousValue) : null,
    newValue: l.newValue ? JSON.parse(l.newValue) : null,
  }));

  res.json({ logs: parsed, total, page: Number(page), pageSize: take });
});
