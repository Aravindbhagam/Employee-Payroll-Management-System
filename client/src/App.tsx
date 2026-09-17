import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardLayout } from './components/DashboardLayout';
import { FullPageSpinner } from './components/FullPageSpinner';
import { Forbidden } from './pages/Forbidden';
import { can } from './utils/permissions';

// Each page is its own chunk, fetched on first navigation to its route
// rather than bundled into the initial load.
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const EmployeesPage = lazy(() => import('./pages/employees/EmployeesPage').then((m) => ({ default: m.EmployeesPage })));
const EmployeeDetail = lazy(() => import('./pages/employees/EmployeeDetail').then((m) => ({ default: m.EmployeeDetail })));
const AttendancePage = lazy(() => import('./pages/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage })));
const LeavePage = lazy(() => import('./pages/leave/LeavePage').then((m) => ({ default: m.LeavePage })));
const SalaryStructurePage = lazy(() => import('./pages/salary/SalaryStructurePage').then((m) => ({ default: m.SalaryStructurePage })));
const PayrollPage = lazy(() => import('./pages/payroll/PayrollPage').then((m) => ({ default: m.PayrollPage })));
const PayrollRunDetail = lazy(() => import('./pages/payroll/PayrollRunDetail').then((m) => ({ default: m.PayrollRunDetail })));
const PayslipsPage = lazy(() => import('./pages/payslips/PayslipsPage').then((m) => ({ default: m.PayslipsPage })));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const TaxCompliancePage = lazy(() => import('./pages/tax/TaxCompliancePage').then((m) => ({ default: m.TaxCompliancePage })));
const UsersPage = lazy(() => import('./pages/users/UsersPage').then((m) => ({ default: m.UsersPage })));
const AuditLogsPage = lazy(() => import('./pages/auditlogs/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })));
const NotificationsPage = lazy(() => import('./pages/announcements/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const DocumentsPage = lazy(() => import('./pages/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));

function PayrollRoute() {
  const { user } = useAuth();
  const allowed = user?.role === 'EMPLOYEE' ? can(user, 'PAYSLIPS', 'VIEW') : can(user, 'PAYROLL', 'VIEW');
  if (!allowed) return <Forbidden />;
  return <PayrollPage />;
}

export default function App() {
  const { loading } = useAuth();
  if (loading) return <FullPageSpinner />;

  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />

          <Route path="/employees" element={<ProtectedRoute resource="EMPLOYEES" action="VIEW"><EmployeesPage /></ProtectedRoute>} />
          <Route path="/my-team" element={<ProtectedRoute resource="EMPLOYEES" action="VIEW"><EmployeesPage /></ProtectedRoute>} />
          <Route path="/employees/:id" element={<ProtectedRoute resource="EMPLOYEES" action="VIEW"><EmployeeDetail /></ProtectedRoute>} />

          <Route path="/attendance" element={<ProtectedRoute resource="ATTENDANCE" action="VIEW"><AttendancePage /></ProtectedRoute>} />
          <Route path="/leave" element={<ProtectedRoute resource="LEAVE" action="VIEW"><LeavePage /></ProtectedRoute>} />
          <Route path="/salary-structure" element={<ProtectedRoute resource="SALARY_STRUCTURE" action="VIEW"><SalaryStructurePage /></ProtectedRoute>} />

          <Route path="/payroll" element={<ProtectedRoute><PayrollRoute /></ProtectedRoute>} />
          <Route path="/payroll/:id" element={<ProtectedRoute resource="PAYROLL" action="VIEW"><PayrollRunDetail /></ProtectedRoute>} />

          <Route path="/payslips" element={<ProtectedRoute resource="PAYSLIPS" action="VIEW"><PayslipsPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute resource="REPORTS" action="VIEW"><ReportsPage /></ProtectedRoute>} />
          <Route path="/tax-compliance" element={<ProtectedRoute resource="TAX_COMPLIANCE" action="VIEW"><TaxCompliancePage /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute resource="USERS" action="VIEW"><UsersPage /></ProtectedRoute>} />
          <Route path="/audit-logs" element={<ProtectedRoute resource="AUDIT_LOGS" action="VIEW"><AuditLogsPage /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute resource="ANNOUNCEMENTS" action="VIEW"><NotificationsPage /></ProtectedRoute>} />
          <Route path="/documents" element={<ProtectedRoute resource="DOCUMENTS" action="VIEW"><DocumentsPage /></ProtectedRoute>} />

          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

          <Route path="/403" element={<Forbidden />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
