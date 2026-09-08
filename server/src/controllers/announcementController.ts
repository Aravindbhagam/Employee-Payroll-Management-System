import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { recordAudit } from '../utils/audit';

export const listAnnouncements = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const where: any = {
    OR: [{ audience: 'ALL' }, ...(user.departmentId ? [{ audience: 'DEPARTMENT', departmentId: user.departmentId }] : [])],
  };
  const announcements = await prisma.announcement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20, include: { createdBy: { select: { email: true } } } });
  res.json({ announcements });
});

const createSchema = z.object({ title: z.string().min(1), body: z.string().min(1), audience: z.enum(['ALL', 'DEPARTMENT']).default('ALL'), departmentId: z.string().optional() });

export const createAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const data = createSchema.parse(req.body);
  const announcement = await prisma.announcement.create({ data: { ...data, createdById: req.user!.id } });
  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'ANNOUNCEMENT_CREATED', entityType: 'Announcement', entityId: announcement.id, newValue: data });
  res.status(201).json({ announcement });
});
