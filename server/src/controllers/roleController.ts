import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { recordAudit } from '../utils/audit';
import { ROLE_LABELS } from '../permissions';

export const getRolePermissionMatrix = asyncHandler(async (req: Request, res: Response) => {
  const rows = await prisma.rolePermission.findMany();
  res.json({ matrix: rows, roleLabels: ROLE_LABELS });
});

const updateSchema = z.object({
  updates: z.array(z.object({ role: z.string(), resource: z.string(), action: z.string(), allowed: z.boolean() })),
});

export const updateRolePermissionMatrix = asyncHandler(async (req: Request, res: Response) => {
  const { updates } = updateSchema.parse(req.body);

  await prisma.$transaction(
    updates.map((u) =>
      prisma.rolePermission.upsert({
        where: { role_resource_action: { role: u.role as any, resource: u.resource as any, action: u.action as any } },
        update: { allowed: u.allowed },
        create: { role: u.role as any, resource: u.resource as any, action: u.action as any, allowed: u.allowed },
      })
    )
  );

  await recordAudit({ req, userId: req.user!.id, userName: req.user!.email, action: 'PERMISSION_CHANGED', entityType: 'RolePermission', newValue: updates });
  res.json({ success: true });
});
