// These values are stored as plain strings in the database (see the
// datasource comment in prisma/schema.prisma) and enforced at the
// application boundary via zod validation.

export const ROLE_NAMES = ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE'];

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED'];

export const RESOURCES = [
  'DASHBOARD',
  'EMPLOYEES',
  'PAYROLL',
  'ATTENDANCE',
  'LEAVE',
  'SALARY_STRUCTURE',
  'PAYSLIPS',
  'REPORTS',
  'USERS',
  'SETTINGS',
  'AUDIT_LOGS',
  'TAX_COMPLIANCE',
  'DEPARTMENTS',
  'DESIGNATIONS',
  'DOCUMENTS',
  'ANNOUNCEMENTS',
];

export const PERM_ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'PROCESS', 'MANAGE'];

export const LEAVE_TYPES = ['ANNUAL', 'SICK', 'CASUAL', 'UNPAID', 'MATERNITY', 'PATERNITY', 'OTHER'];

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND'];

export const PAYROLL_STATUSES = ['DRAFT', 'CALCULATING', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED'];

export const EMPLOYEE_STATUSES = ['ONBOARDING', 'ACTIVE', 'OFFBOARDING', 'OFFBOARDED'];
