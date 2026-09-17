const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../../src/db');
const { flattenDefaults } = require('../../src/permissions');
const { newId } = require('../../src/utils/id');

const PASSWORD = 'Password123!';

let permissionsSeeded = false;

/** Seeds the default role -> permission matrix (idempotent, safe to call from every test file). */
async function ensureRolePermissionsSeeded() {
  if (permissionsSeeded) return;
  const rows = flattenDefaults();
  await withTransaction(async (client) => {
    for (const r of rows) {
      await client.query(
        `INSERT INTO role_permissions (id, role, resource, action, allowed)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (role, resource, action) DO UPDATE SET allowed = EXCLUDED.allowed`,
        [newId(), r.role, r.resource, r.action, r.allowed]
      );
    }
  });
  permissionsSeeded = true;
}

async function createUser(prefix, opts) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const email = `${prefix}-${opts.name}@test.local`;
  const userId = newId();
  const employeeId = newId();

  await query(
    `INSERT INTO users (id, employee_code, email, password_hash, role, status, department_id, manager_id)
     VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7)`,
    [userId, `${prefix.toUpperCase()}-${opts.name.toUpperCase()}`, email, passwordHash, opts.role, opts.departmentId, opts.managerId || null]
  );
  await query(
    `INSERT INTO employees (id, user_id, first_name, last_name, department_id, status)
     VALUES ($1, $2, $3, 'Test', $4, 'ACTIVE')`,
    [employeeId, userId, opts.name, opts.departmentId]
  );

  return { id: userId, employeeId, email, role: opts.role };
}

/**
 * Creates a fully independent set of fixture users (one per role, plus an
 * unrelated manager/employee pair for cross-team scoping tests) under a
 * unique prefix, so multiple test files -- or even multiple calls in the
 * same file -- can share the same test database without colliding on
 * unique email/employeeCode/department-name constraints. The prefix is
 * combined with a random suffix rather than trusted alone, since Vitest
 * may schedule test files across worker processes that don't share the
 * in-memory de-duplication this module would otherwise rely on.
 */
async function createFixtureSet(prefix) {
  await ensureRolePermissionsSeeded();

  const unique = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const departmentId = newId();
  await query('INSERT INTO departments (id, name) VALUES ($1, $2)', [departmentId, `${unique}-dept`]);

  const superAdmin = await createUser(unique, { name: 'superadmin', role: 'SUPER_ADMIN', departmentId });
  const hrAdmin = await createUser(unique, { name: 'hradmin', role: 'HR_ADMIN', departmentId });
  const payrollAdmin = await createUser(unique, { name: 'payrolladmin', role: 'PAYROLL_ADMIN', departmentId });
  const manager = await createUser(unique, { name: 'manager', role: 'MANAGER', departmentId });
  const employee = await createUser(unique, { name: 'employee', role: 'EMPLOYEE', departmentId, managerId: manager.id });
  const otherManager = await createUser(unique, { name: 'othermanager', role: 'MANAGER', departmentId });
  const otherEmployee = await createUser(unique, { name: 'otheremployee', role: 'EMPLOYEE', departmentId, managerId: otherManager.id });

  return { departmentId, superAdmin, hrAdmin, payrollAdmin, manager, employee, otherManager, otherEmployee };
}

module.exports = { PASSWORD, ensureRolePermissionsSeeded, createFixtureSet };
