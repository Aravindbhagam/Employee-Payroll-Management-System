import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { recordAudit } from '../utils/audit.js';
import { ROLE_LABELS } from '../permissions.js';

export const getRolePermissionMatrix = asyncHandler(async (req, res) => {
  const rows = await prisma.rolePermission.findMany();
  res.json({ matrix: rows, roleLabels: ROLE_LABELS });
});

const updateSchema = z.object({
  updates: z.array(z.object({ role: z.string(), resource: z.string(), action: z.string(), allowed: z.boolean() })),
});

export const updateRolePermissionMatrix = asyncHandler(async (req, res) => {
  const { updates } = updateSchema.parse(req.body);

  await prisma.$transaction(
    updates.map((u) =>
      prisma.rolePermission.upsert({
        where: { role_resource_action: { role: u.role, resource: u.resource, action: u.action } },
        update: { allowed: u.allowed },
        create: { role: u.role, resource: u.resource, action: u.action, allowed: u.allowed },
      })
    )
  );

  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'PERMISSION_CHANGED', entityType: 'RolePermission', newValue: updates });
  res.json({ success: true });
});
