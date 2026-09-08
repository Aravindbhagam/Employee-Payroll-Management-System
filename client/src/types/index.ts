export type RoleName = 'SUPER_ADMIN' | 'HR_ADMIN' | 'PAYROLL_ADMIN' | 'MANAGER' | 'EMPLOYEE';

export const ROLE_LABELS: Record<RoleName, string> = {
  SUPER_ADMIN: 'Super Admin',
  HR_ADMIN: 'HR Admin',
  PAYROLL_ADMIN: 'Payroll Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};

export type Resource =
  | 'DASHBOARD'
  | 'EMPLOYEES'
  | 'PAYROLL'
  | 'ATTENDANCE'
  | 'LEAVE'
  | 'SALARY_STRUCTURE'
  | 'PAYSLIPS'
  | 'REPORTS'
  | 'USERS'
  | 'SETTINGS'
  | 'AUDIT_LOGS'
  | 'TAX_COMPLIANCE'
  | 'DEPARTMENTS'
  | 'DESIGNATIONS'
  | 'DOCUMENTS'
  | 'ANNOUNCEMENTS';

export type PermAction = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'APPROVE' | 'EXPORT' | 'PROCESS' | 'MANAGE';

export type Permissions = Partial<Record<Resource, PermAction[]>>;

export interface AuthUser {
  id: string;
  employeeCode: string;
  email: string;
  role: RoleName;
  status: string;
  department: { id: string; name: string } | null;
  managerId: string | null;
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  profile: { firstName: string; lastName: string; photoUrl: string | null; designationId: string | null } | null;
  permissions: Permissions;
}

export type PayrollStatus = 'DRAFT' | 'CALCULATING' | 'PENDING_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'FAILED';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type LeaveType = 'ANNUAL' | 'SICK' | 'CASUAL' | 'UNPAID' | 'MATERNITY' | 'PATERNITY' | 'OTHER';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE' | 'HOLIDAY' | 'WEEKEND';
export type EmployeeStatus = 'ONBOARDING' | 'ACTIVE' | 'OFFBOARDING' | 'OFFBOARDED';
