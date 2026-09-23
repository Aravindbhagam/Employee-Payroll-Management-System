import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';

export async function recordAudit(params) {
  const { req, userId, userName, action, entityType, entityId, previousValue, newValue } = params;
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        userName,
        action,
        entityType,
        entityId: entityId ?? null,
        previousValue: previousValue !== undefined ? JSON.stringify(previousValue) : null,
        newValue: newValue !== undefined ? JSON.stringify(newValue) : null,
        ipAddress: req?.ip ?? null,
        userAgent: req?.headers['user-agent'] ?? null,
      },
    });
  } catch (err) {
    // Auditing must never break the primary request flow.
    logger.error({ err, action, entityType }, 'Failed to write audit log');
  }
}
