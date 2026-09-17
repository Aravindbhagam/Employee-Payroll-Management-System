const { query } = require('../db');

/**
 * Computes the effective permission set for a user: role defaults from
 * role_permissions, overridden per-user by any rows in user_permissions.
 * This is the single source of truth used by both the `authorize` middleware
 * below and the /auth/me endpoint (which feeds the frontend nav/UI). Every
 * protected route MUST call `authorize` -- hiding UI elements alone is never
 * sufficient, per the security requirements of this system.
 */
async function getEffectivePermissions(userId, role) {
  const [roleRes, overrideRes] = await Promise.all([
    query('SELECT resource, action, allowed FROM role_permissions WHERE role = $1', [role]),
    query('SELECT resource, action, allowed FROM user_permissions WHERE user_id = $1', [userId]),
  ]);

  const map = new Map();
  for (const row of roleRes.rows) {
    map.set(`${row.resource}:${row.action}`, row.allowed);
  }
  for (const row of overrideRes.rows) {
    map.set(`${row.resource}:${row.action}`, row.allowed);
  }
  return map;
}

async function userHasPermission(userId, role, resource, action) {
  const map = await getEffectivePermissions(userId, role);
  return map.get(`${resource}:${action}`) === true;
}

/**
 * Express middleware factory enforcing that the authenticated user has the
 * given (resource, action) permission. Super Admin is still subject to the
 * matrix (seeded with full access) so that a Super Admin's own permissions
 * can be inspected/audited like anyone else's.
 */
function authorize(resource, action) {
  return async (req, res, next) => {
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

module.exports = { getEffectivePermissions, userHasPermission, authorize };
