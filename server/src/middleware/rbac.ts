import { NextFunction, Request, Response } from 'express';
import { PermAction, Resource } from '../types/enums';
import { prisma } from '../config/prisma';

/**
 * Computes the effective permission set for a user: role defaults from
 * RolePermission, overridden per-user by any rows in UserPermission.
 * This is the single source of truth used by both the `authorize` middleware
 * below and the /auth/me endpoint (which feeds the frontend nav/UI). Every
 * protected route MUST call `authorize` -- hiding UI elements alone is never
 * sufficient, per the security requirements of this system.
 */
export async function getEffectivePermissions(userId: string, role: string) {
  const [roleRows, overrideRows] = await Promise.all([
    prisma.rolePermission.findMany({ where: { role: role as any } }),
    prisma.userPermission.findMany({ where: { userId } }),
  ]);

  const map = new Map<string, boolean>();
  for (const row of roleRows) {
    map.set(`${row.resource}:${row.action}`, row.allowed);
  }
  for (const row of overrideRows) {
    map.set(`${row.resource}:${row.action}`, row.allowed);
  }
  return map;
}

export async function userHasPermission(userId: string, role: string, resource: Resource, action: PermAction): Promise<boolean> {
  const map = await getEffectivePermissions(userId, role);
  return map.get(`${resource}:${action}`) === true;
}

/**
 * Express middleware factory enforcing that the authenticated user has the
 * given (resource, action) permission. Super Admin is still subject to the
 * matrix (seeded with full access) so that a Super Admin's own permissions
 * can be inspected/audited like anyone else's.
 */
export function authorize(resource: Resource, action: PermAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    const allowed = await userHasPermission(req.user.id, req.user.role, resource, action);
    if (!allowed) {
      return res.status(403).json({
        error: 'Access denied.',
        message: "You don't have permission to access this resource. Please contact your administrator if you believe you need access.",
        resource,
        action,
      });
    }
    next();
  };
}
