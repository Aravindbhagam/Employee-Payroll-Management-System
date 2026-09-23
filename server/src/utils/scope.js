import { prisma } from '../config/prisma.js';

/** Returns the Employee.id linked to a given User.id, or null if none exists. */
export async function employeeIdForUser(userId) {
  const emp = await prisma.employee.findUnique({ where: { userId }, select: { id: true } });
  return emp?.id ?? null;
}

/**
 * Returns the list of Employee.id values a Manager is allowed to see:
 * direct reports (User.managerId === manager's user id) plus themself.
 */
export async function teamEmployeeIds(managerUserId) {
  const reports = await prisma.user.findMany({
    where: { managerId: managerUserId },
    select: { employee: { select: { id: true } } },
  });
  const ids = reports.map((r) => r.employee?.id).filter((id) => !!id);
  const own = await employeeIdForUser(managerUserId);
  if (own) ids.push(own);
  return ids;
}

/**
 * Builds a Prisma `employeeId` filter clause enforcing row-level scope for
 * the given user: Super Admin/HR/Payroll Admin see everything, Manager sees
 * their team, Employee sees only themself. Returns `undefined` for "no
 * filter needed" (full access) or an object with `in: string[]` to constrain to.
 */
export async function employeeScopeFilter(user) {
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
