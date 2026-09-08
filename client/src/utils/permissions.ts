import { AuthUser, PermAction, Resource } from '../types';

/**
 * Frontend permission check -- used ONLY to decide what to render (nav items,
 * buttons, routes). This mirrors the server's RBAC matrix for UX purposes,
 * but it is never the security boundary: every API call independently
 * re-checks permissions server-side (see server/src/middleware/rbac.ts), so
 * hiding a button here does not grant or deny access on its own.
 */
export function can(user: AuthUser | null, resource: Resource, action: PermAction): boolean {
  if (!user) return false;
  return user.permissions[resource]?.includes(action) ?? false;
}

export function canAny(user: AuthUser | null, resource: Resource, actions: PermAction[]): boolean {
  return actions.some((a) => can(user, resource, a));
}
