/**
 * Frontend permission check -- used ONLY to decide what to render (nav items,
 * buttons, routes). This mirrors the server's RBAC matrix for UX purposes,
 * but it is never the security boundary: every API call independently
 * re-checks permissions server-side (see server/src/middleware/rbac.ts), so
 * hiding a button here does not grant or deny access on its own.
 */
export function can(user, resource, action) {
  if (!user) return false;
  return (user.permissions[resource] || []).includes(action);
}

export function canAny(user, resource, actions) {
  return actions.some((a) => can(user, resource, a));
}

export const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  HR_ADMIN: 'HR Admin',
  PAYROLL_ADMIN: 'Payroll Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};
