const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { asyncHandler } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const { newId } = require('../utils/id');
const { ROLE_LABELS } = require('../permissions');

const getRolePermissionMatrix = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT id, role, resource, action, allowed FROM role_permissions');
  res.json({ matrix: rows, roleLabels: ROLE_LABELS });
});

const updateSchema = z.object({
  updates: z.array(z.object({ role: z.string(), resource: z.string(), action: z.string(), allowed: z.boolean() })),
});

const updateRolePermissionMatrix = asyncHandler(async (req, res) => {
  const { updates } = updateSchema.parse(req.body);

  await withTransaction(async (client) => {
    for (const u of updates) {
      await client.query(
        `INSERT INTO role_permissions (id, role, resource, action, allowed)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (role, resource, action) DO UPDATE SET allowed = EXCLUDED.allowed`,
        [newId(), u.role, u.resource, u.action, u.allowed]
      );
    }
  });

  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'PERMISSION_CHANGED', entityType: 'RolePermission', newValue: updates });
  res.json({ success: true });
});

module.exports = { getRolePermissionMatrix, updateRolePermissionMatrix };
