// SQLite has no native enum type, so these values are stored as plain
// strings in the database and enforced here at the TypeScript/zod boundary.

export const ROLE_NAMES = ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

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
] as const;
export type Resource = (typeof RESOURCES)[number];

export const PERM_ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'PROCESS', 'MANAGE'] as const;
export type PermAction = (typeof PERM_ACTIONS)[number];

export const LEAVE_TYPES = ['ANNUAL', 'SICK', 'CASUAL', 'UNPAID', 'MATERNITY', 'PATERNITY', 'OTHER'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const PAYROLL_STATUSES = ['DRAFT', 'CALCULATING', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED'] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

export const EMPLOYEE_STATUSES = ['ONBOARDING', 'ACTIVE', 'OFFBOARDING', 'OFFBOARDED'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
