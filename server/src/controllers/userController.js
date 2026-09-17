const { z } = require('zod');
const { ROLE_NAMES } = require('../enums');
const { query, withTransaction } = require('../db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const { hashPassword, randomToken } = require('../utils/password');
const { getEffectivePermissions } = require('../middleware/rbac');
const { parsePagination } = require('../utils/pagination');
const { newId } = require('../utils/id');

const USER_JOIN_SELECT = `
  SELECT
    u.id, u.employee_code AS "employeeCode", u.email, u.role, u.status,
    u.two_factor_enabled AS "twoFactorEnabled", u.last_login_at AS "lastLoginAt",
    u.last_login_ip AS "lastLoginIp", u.locked_until AS "lockedUntil", u.created_at AS "createdAt",
    d.id AS "d_id", d.name AS "d_name",
    e.first_name AS "e_firstName", e.last_name AS "e_lastName",
    m.id AS "m_id", me.first_name AS "me_firstName", me.last_name AS "me_lastName"
  FROM users u
  LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN employees e ON e.user_id = u.id
  LEFT JOIN users m ON m.id = u.manager_id
  LEFT JOIN employees me ON me.user_id = m.id
`;

function mapUserRow(row) {
  return {
    id: row.id,
    employeeCode: row.employeeCode,
    email: row.email,
    role: row.role,
    status: row.status,
    department: row.d_id ? { id: row.d_id, name: row.d_name } : null,
    manager: row.m_id && row.me_firstName ? { id: row.m_id, name: `${row.me_firstName} ${row.me_lastName}` } : null,
    twoFactorEnabled: row.twoFactorEnabled,
    lastLoginAt: row.lastLoginAt,
    lastLoginIp: row.lastLoginIp,
    lockedUntil: row.lockedUntil,
    createdAt: row.createdAt,
    name: row.e_firstName ? `${row.e_firstName} ${row.e_lastName}` : row.email,
  };
}

const listUsers = asyncHandler(async (req, res) => {
  const { role, departmentId, status, search } = req.query;
  const conditions = [];
  const params = [];
  function addParam(value) {
    params.push(value);
    return `$${params.length}`;
  }

  if (role) conditions.push(`u.role = ${addParam(role)}`);
  if (departmentId) conditions.push(`u.department_id = ${addParam(departmentId)}`);
  if (status) conditions.push(`u.status = ${addParam(status)}`);
  if (search) {
    const like = `%${search}%`;
    conditions.push(`(u.email ILIKE ${addParam(like)} OR u.employee_code ILIKE ${addParam(like)} OR e.first_name ILIKE ${addParam(like)} OR e.last_name ILIKE ${addParam(like)})`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pagination = parsePagination(req, { optIn: true });
  const limitOffsetSql = pagination ? ` LIMIT ${addParam(pagination.take)} OFFSET ${addParam(pagination.skip)}` : '';

  const [usersRes, countRes] = await Promise.all([
    query(`${USER_JOIN_SELECT} ${whereSql} ORDER BY u.created_at DESC${limitOffsetSql}`, params),
    pagination
      ? query(`SELECT COUNT(*) FROM users u LEFT JOIN employees e ON e.user_id = u.id ${whereSql}`, params.slice(0, params.length - 2))
      : Promise.resolve(null),
  ]);

  res.json({
    users: usersRes.rows.map(mapUserRow),
    ...(pagination ? { total: parseInt(countRes.rows[0].count, 10), page: pagination.page, pageSize: pagination.pageSize } : {}),
  });
});

const getUser = asyncHandler(async (req, res) => {
  const { rows } = await query(`${USER_JOIN_SELECT} WHERE u.id = $1`, [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: mapUserRow(rows[0]) });
});

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(ROLE_NAMES),
  departmentId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
});

async function nextEmployeeCode() {
  const { rows } = await query('SELECT COUNT(*) FROM users');
  const count = parseInt(rows[0].count, 10);
  return `EMP${String(count + 1001).padStart(5, '0')}`;
}

const createUser = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);
  const existingRes = await query('SELECT id FROM users WHERE email = $1', [data.email.toLowerCase()]);
  if (existingRes.rows.length > 0) throw new ApiError(409, 'A user with this email already exists.');

  const tempPassword = randomToken(6);
  const passwordHash = await hashPassword(tempPassword);
  const employeeCode = await nextEmployeeCode();
  const userId = newId();

  await query(
    `INSERT INTO users (id, employee_code, email, password_hash, role, department_id, manager_id, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
    [userId, employeeCode, data.email.toLowerCase(), passwordHash, data.role, data.departmentId || null, data.managerId || null]
  );
  await query('INSERT INTO employees (id, user_id, first_name, last_name, department_id) VALUES ($1, $2, $3, $4, $5)', [
    newId(),
    userId,
    data.firstName,
    data.lastName,
    data.departmentId || null,
  ]);

  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'USER_CREATED', entityType: 'User', entityId: userId, newValue: { email: data.email, role: data.role } });

  const { rows } = await query(`${USER_JOIN_SELECT} WHERE u.id = $1`, [userId]);
  res.status(201).json({ user: mapUserRow(rows[0]), temporaryPassword: tempPassword, employeeCode });
});

const updateSchema = z.object({
  role: z.enum(ROLE_NAMES).optional(),
  departmentId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
});

const updateUser = asyncHandler(async (req, res) => {
  const existingRes = await query('SELECT id, role, department_id AS "departmentId", manager_id AS "managerId" FROM users WHERE id = $1', [req.params.id]);
  const existing = existingRes.rows[0];
  if (!existing) return res.status(404).json({ error: 'User not found.' });
  const data = updateSchema.parse(req.body);

  if (existing.role === 'SUPER_ADMIN' && data.role && data.role !== 'SUPER_ADMIN' && existing.id === req.user.id) {
    throw new ApiError(400, 'You cannot demote your own Super Admin account.');
  }

  const setClauses = [];
  const params = [];
  if (data.role !== undefined) {
    params.push(data.role);
    setClauses.push(`role = $${params.length}`);
  }
  if (data.departmentId !== undefined) {
    params.push(data.departmentId);
    setClauses.push(`department_id = $${params.length}`);
  }
  if (data.managerId !== undefined) {
    params.push(data.managerId);
    setClauses.push(`manager_id = $${params.length}`);
  }
  if (setClauses.length > 0) {
    params.push(req.params.id);
    await query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = $${params.length}`, params);
  }

  await recordAudit({
    req,
    userId: req.user.id,
    userName: req.user.email,
    action: 'USER_UPDATED',
    entityType: 'User',
    entityId: req.params.id,
    previousValue: { role: existing.role, departmentId: existing.departmentId, managerId: existing.managerId },
    newValue: data,
  });

  const { rows } = await query(`${USER_JOIN_SELECT} WHERE u.id = $1`, [req.params.id]);
  res.json({ user: mapUserRow(rows[0]) });
});

async function setStatus(req, res, status, action) {
  const existingRes = await query('SELECT id, status FROM users WHERE id = $1', [req.params.id]);
  const existing = existingRes.rows[0];
  if (!existing) return res.status(404).json({ error: 'User not found.' });
  if (existing.id === req.user.id) throw new ApiError(400, 'You cannot change the status of your own account.');

  await query('UPDATE users SET status = $1 WHERE id = $2', [status, req.params.id]);
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action, entityType: 'User', entityId: req.params.id, previousValue: { status: existing.status }, newValue: { status } });
  res.json({ user: { id: req.params.id, status } });
}

const activateUser = asyncHandler((req, res) => setStatus(req, res, 'ACTIVE', 'USER_ACTIVATED'));
const deactivateUser = asyncHandler((req, res) => setStatus(req, res, 'INACTIVE', 'USER_DEACTIVATED'));

const lockUser = asyncHandler(async (req, res) => {
  const existingRes = await query('SELECT id FROM users WHERE id = $1', [req.params.id]);
  if (existingRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
  const lockedUntil = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
  await query('UPDATE users SET locked_until = $1 WHERE id = $2', [lockedUntil, req.params.id]);
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'USER_LOCKED', entityType: 'User', entityId: req.params.id });
  res.json({ user: { id: req.params.id, lockedUntil } });
});

const unlockUser = asyncHandler(async (req, res) => {
  const existingRes = await query('SELECT id FROM users WHERE id = $1', [req.params.id]);
  if (existingRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
  await query('UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = $1', [req.params.id]);
  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'USER_UNLOCKED', entityType: 'User', entityId: req.params.id });
  res.json({ user: { id: req.params.id, lockedUntil: null } });
});

const adminResetPassword = asyncHandler(async (req, res) => {
  const existingRes = await query('SELECT id FROM users WHERE id = $1', [req.params.id]);
  const existing = existingRes.rows[0];
  if (!existing) return res.status(404).json({ error: 'User not found.' });

  const tempPassword = randomToken(6);
  const passwordHash = await hashPassword(tempPassword);
  await query('UPDATE users SET password_hash = $1, must_change_password = true, failed_login_attempts = 0, locked_until = NULL WHERE id = $2', [passwordHash, req.params.id]);
  await query('UPDATE sessions SET revoked = true WHERE user_id = $1', [req.params.id]);

  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'USER_PASSWORD_RESET_BY_ADMIN', entityType: 'User', entityId: existing.id });
  res.json({ success: true, temporaryPassword: tempPassword });
});

const getUserPermissions = asyncHandler(async (req, res) => {
  const userRes = await query('SELECT id, role FROM users WHERE id = $1', [req.params.id]);
  const user = userRes.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const effective = await getEffectivePermissions(user.id, user.role);
  const overridesRes = await query('SELECT id, user_id AS "userId", resource, action, allowed FROM user_permissions WHERE user_id = $1', [user.id]);

  const effectiveArray = Array.from(effective.entries()).map(([key, allowed]) => {
    const [resource, action] = key.split(':');
    return { resource, action, allowed };
  });

  res.json({ role: user.role, effective: effectiveArray, overrides: overridesRes.rows });
});

const overrideSchema = z.object({
  overrides: z.array(z.object({ resource: z.string(), action: z.string(), allowed: z.boolean() })),
});

const setUserPermissions = asyncHandler(async (req, res) => {
  const userRes = await query('SELECT id FROM users WHERE id = $1', [req.params.id]);
  if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
  const { overrides } = overrideSchema.parse(req.body);

  await withTransaction(async (client) => {
    for (const o of overrides) {
      await client.query(
        `INSERT INTO user_permissions (id, user_id, resource, action, allowed)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, resource, action) DO UPDATE SET allowed = EXCLUDED.allowed`,
        [newId(), req.params.id, o.resource, o.action, o.allowed]
      );
    }
  });

  await recordAudit({ req, userId: req.user.id, userName: req.user.email, action: 'PERMISSION_CHANGED', entityType: 'User', entityId: req.params.id, newValue: overrides });
  res.json({ success: true });
});

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  activateUser,
  deactivateUser,
  lockUser,
  unlockUser,
  adminResetPassword,
  getUserPermissions,
  setUserPermissions,
};
