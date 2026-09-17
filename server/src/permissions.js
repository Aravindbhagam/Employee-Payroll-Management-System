const { PERM_ACTIONS, RESOURCES, ROLE_NAMES } = require('./enums');

/**
 * Central source of truth for default role -> permission grants.
 * This is seeded into the role_permissions table (see db/seed.js) so that
 * Super Admin can customize it at runtime without a code change. This object
 * is also used to (re)seed defaults and as a fallback matrix.
 */
const ACTIONS = PERM_ACTIONS;
const ROLES = ROLE_NAMES;

const FULL = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'PROCESS', 'MANAGE'];

const DEFAULT_PERMISSIONS = {
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
    LEAVE: ['VIEW', 'CREATE'],
    ANNOUNCEMENTS: ['VIEW'],
    SETTINGS: ['VIEW'],
  },
  MANAGER: {
    DASHBOARD: ['VIEW'],
    EMPLOYEES: ['VIEW'],
    ATTENDANCE: ['VIEW'],
    LEAVE: ['VIEW', 'CREATE', 'APPROVE'],
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
    // the administrative PAYROLL run list -- see employeeController scope.
    PAYSLIPS: ['VIEW', 'EXPORT'],
    PAYROLL: [],
    DOCUMENTS: ['VIEW'],
    ANNOUNCEMENTS: ['VIEW'],
  },
};

function flattenDefaults() {
  const rows = [];
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

const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  HR_ADMIN: 'HR Admin',
  PAYROLL_ADMIN: 'Payroll Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};

module.exports = { RESOURCES, ACTIONS, ROLES, DEFAULT_PERMISSIONS, flattenDefaults, ROLE_LABELS };
