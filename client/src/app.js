import { initAuth } from './auth.js';
import { can } from './permissions.js';
import { route, mountRouter } from './router.js';

route('/login', { standalone: true, load: () => import('./pages/login.js') });
route('/reset-password', { standalone: true, load: () => import('./pages/resetPassword.js') });

route('/dashboard', { load: () => import('./pages/dashboard/dashboard.js') });

route('/employees', { checkAccess: (u) => can(u, 'EMPLOYEES', 'VIEW'), load: () => import('./pages/employees/employeesPage.js') });
route('/my-team', { checkAccess: (u) => can(u, 'EMPLOYEES', 'VIEW'), load: () => import('./pages/employees/employeesPage.js') });
route('/employees/:id', { checkAccess: (u) => can(u, 'EMPLOYEES', 'VIEW'), load: () => import('./pages/employees/employeeDetail.js') });

route('/attendance', { checkAccess: (u) => can(u, 'ATTENDANCE', 'VIEW'), load: () => import('./pages/attendance/attendancePage.js') });
route('/leave', { checkAccess: (u) => can(u, 'LEAVE', 'VIEW'), load: () => import('./pages/leave/leavePage.js') });
route('/salary-structure', { checkAccess: (u) => can(u, 'SALARY_STRUCTURE', 'VIEW'), load: () => import('./pages/salary/salaryStructurePage.js') });

route('/payroll', {
  checkAccess: (u) => (u.role === 'EMPLOYEE' ? can(u, 'PAYSLIPS', 'VIEW') : can(u, 'PAYROLL', 'VIEW')),
  load: () => import('./pages/payroll/payrollPage.js'),
});
route('/payroll/:id', { checkAccess: (u) => can(u, 'PAYROLL', 'VIEW'), load: () => import('./pages/payroll/payrollRunDetail.js') });

route('/payslips', { checkAccess: (u) => can(u, 'PAYSLIPS', 'VIEW'), load: () => import('./pages/payslips/payslipsPage.js') });
route('/reports', { checkAccess: (u) => can(u, 'REPORTS', 'VIEW'), load: () => import('./pages/reports/reportsPage.js') });
route('/tax-compliance', { checkAccess: (u) => can(u, 'TAX_COMPLIANCE', 'VIEW'), load: () => import('./pages/tax/taxCompliancePage.js') });
route('/users', { checkAccess: (u) => can(u, 'USERS', 'VIEW'), load: () => import('./pages/users/usersPage.js') });
route('/audit-logs', { checkAccess: (u) => can(u, 'AUDIT_LOGS', 'VIEW'), load: () => import('./pages/auditlogs/auditLogsPage.js') });
route('/notifications', { checkAccess: (u) => can(u, 'ANNOUNCEMENTS', 'VIEW'), load: () => import('./pages/announcements/notificationsPage.js') });
route('/documents', { checkAccess: (u) => can(u, 'DOCUMENTS', 'VIEW'), load: () => import('./pages/documents/documentsPage.js') });

route('/settings', { load: () => import('./pages/settings/settingsPage.js') });
route('/profile', { load: () => import('./pages/profile/profilePage.js') });

(async function boot() {
  await initAuth();
  mountRouter(document.getElementById('app'));
})();
