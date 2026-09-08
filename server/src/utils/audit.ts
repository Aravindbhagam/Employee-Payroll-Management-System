import { Request } from 'express';
import { prisma } from '../config/prisma';

interface AuditParams {
  req?: Request;
  userId?: string | null;
  userName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
}

export async function recordAudit(params: AuditParams): Promise<void> {
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
    console.error('Failed to write audit log', err);
  }
}
