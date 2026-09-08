import { PERM_ACTIONS, PermAction, RESOURCES, Resource, ROLE_NAMES, RoleName } from './types/enums';

/**
 * Central source of truth for default role -> permission grants.
 * This is seeded into the RolePermission table (see prisma/seed.ts) so that
 * Super Admin can customize it at runtime without a code change. This object
 * is also used to (re)seed defaults and as a fallback matrix.
 */
export { RESOURCES };
export const ACTIONS = PERM_ACTIONS;
export const ROLES = ROLE_NAMES;

type Matrix = Record<RoleName, Partial<Record<Resource, PermAction[]>>>;

const FULL: PermAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'PROCESS', 'MANAGE'];

export const DEFAULT_PERMISSIONS: Matrix = {
  SUPER_ADMIN: {
    DASHBOARD: ['VIEW'],
    EMPLOYEES: FULL,
    PAYROLL: FULL,
    ATTENDANCE: ['VIEW', 'EDIT', 'EXPORT', 'MANAGE'],
    LEAVE: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'MANAGE'],
    SALARY_STRUCTURE: FULL,
    PAYSLIPS: ['VIEW', 'CREATE', 'EXPORT', 'MANAGE'],
    REPORTS: ['VIEW', 'EXPORT'],
    USERS: FULL,
    SETTINGS: FULL,
    AUDIT_LOGS: ['VIEW', 'EXPORT'],
    TAX_COMPLIANCE: FULL,
    DEPARTMENTS: FULL,
    DESIGNATIONS: FULL,
    DOCUMENTS: FULL,
    ANNOUNCEMENTS: FULL,
  },
  HR_ADMIN: {
    DASHBOARD: ['VIEW'],
    EMPLOYEES: ['VIEW', 'CREATE', 'EDIT', 'MANAGE'],
    ATTENDANCE: ['VIEW', 'EDIT'],
    LEAVE: ['VIEW', 'CREATE', 'APPROVE', 'MANAGE'],
    SALARY_STRUCTURE: ['VIEW'],
    PAYSLIPS: ['VIEW'],
    PAYROLL: [],
    REPORTS: ['VIEW', 'EXPORT'],
    DEPARTMENTS: ['VIEW', 'CREATE', 'EDIT', 'MANAGE'],
    DESIGNATIONS: ['VIEW', 'CREATE', 'EDIT', 'MANAGE'],
    DOCUMENTS: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'MANAGE'],
    ANNOUNCEMENTS: ['VIEW', 'CREATE', 'EDIT'],
    SETTINGS: ['VIEW'],
  },
  PAYROLL_ADMIN: {
    DASHBOARD: ['VIEW'],
    EMPLOYEES: ['VIEW'],
    PAYROLL: ['VIEW', 'CREATE', 'EDIT', 'PROCESS', 'EXPORT', 'MANAGE'],
    SALARY_STRUCTURE: ['VIEW', 'CREATE', 'EDIT', 'MANAGE'],
    PAYSLIPS: ['VIEW', 'CREATE', 'EXPORT', 'MANAGE'],
    TAX_COMPLIANCE: ['VIEW', 'EDIT', 'MANAGE'],
    REPORTS: ['VIEW', 'EXPORT'],
    ATTENDANCE: ['VIEW'],
    LEAVE: ['VIEW'],
    ANNOUNCEMENTS: ['VIEW'],
    SETTINGS: ['VIEW'],
  },
  MANAGER: {
    DASHBOARD: ['VIEW'],
    EMPLOYEES: ['VIEW'],
    ATTENDANCE: ['VIEW'],
    LEAVE: ['VIEW', 'APPROVE'],
    REPORTS: ['VIEW'],
    PAYROLL: [],
    SALARY_STRUCTURE: [],
    ANNOUNCEMENTS: ['VIEW'],
  },
  EMPLOYEE: {
    DASHBOARD: ['VIEW'],
    EMPLOYEES: ['VIEW'],
    ATTENDANCE: ['VIEW'],
    LEAVE: ['VIEW', 'CREATE'],
    // Employees view their own pay through PAYSLIPS (scoped to self), never
    // the administrative PAYROLL run list -- see EmployeeController scope.
    PAYSLIPS: ['VIEW', 'EXPORT'],
    PAYROLL: [],
    DOCUMENTS: ['VIEW'],
    ANNOUNCEMENTS: ['VIEW'],
  },
};

export function flattenDefaults(): { role: RoleName; resource: Resource; action: PermAction; allowed: boolean }[] {
  const rows: { role: RoleName; resource: Resource; action: PermAction; allowed: boolean }[] = [];
  for (const role of ROLES) {
    for (const resource of RESOURCES) {
      const grantedActions = DEFAULT_PERMISSIONS[role]?.[resource] ?? [];
      for (const action of ACTIONS) {
        rows.push({ role, resource, action, allowed: grantedActions.includes(action) });
      }
    }
  }
  return rows;
}

export const ROLE_LABELS: Record<RoleName, string> = {
  SUPER_ADMIN: 'Super Admin',
  HR_ADMIN: 'HR Admin',
  PAYROLL_ADMIN: 'Payroll Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};
