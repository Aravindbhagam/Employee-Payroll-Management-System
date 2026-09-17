const { query } = require('../db');

/** Returns the employees.id linked to a given users.id, or null if none exists. */
async function employeeIdForUser(userId) {
  const { rows } = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);
  return rows[0]?.id ?? null;
}

/**
 * Returns the list of employees.id values a Manager is allowed to see:
 * direct reports (users.manager_id === manager's user id) plus themself.
 */
async function teamEmployeeIds(managerUserId) {
  const { rows } = await query(
    `SELECT e.id FROM employees e JOIN users u ON u.id = e.user_id WHERE u.manager_id = $1`,
    [managerUserId]
  );
  const ids = rows.map((r) => r.id);
  const own = await employeeIdForUser(managerUserId);
  if (own) ids.push(own);
  return ids;
}

/**
 * Returns the row-level scope for the given user: Super Admin/HR/Payroll
 * Admin see everything, Manager sees their team, Employee sees only
 * themself. Returns `undefined` for "no filter needed" (full access) or
 * `{ in: string[] }` to constrain an `employee_id` filter to.
 */
async function employeeScopeFilter(user) {
  if (user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN' || user.role === 'PAYROLL_ADMIN') {
    return undefined;
  }
  if (user.role === 'MANAGER') {
    const ids = await teamEmployeeIds(user.id);
    return { in: ids };
  }
  // EMPLOYEE
  const own = await employeeIdForUser(user.id);
  return { in: own ? [own] : [] };
}

module.exports = { employeeIdForUser, teamEmployeeIds, employeeScopeFilter };
