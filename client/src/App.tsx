import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardLayout } from './components/DashboardLayout';
import { FullPageSpinner } from './components/FullPageSpinner';
import { Forbidden } from './pages/Forbidden';
import { can } from './utils/permissions';

import { Login } from './pages/Login';
import { Dashboard } from './pages/dashboard/Dashboard';
import { EmployeesPage } from './pages/employees/EmployeesPage';
import { EmployeeDetail } from './pages/employees/EmployeeDetail';
import { AttendancePage } from './pages/attendance/AttendancePage';
import { LeavePage } from './pages/leave/LeavePage';
import { SalaryStructurePage } from './pages/salary/SalaryStructurePage';
import { PayrollPage } from './pages/payroll/PayrollPage';
import { PayrollRunDetail } from './pages/payroll/PayrollRunDetail';
import { PayslipsPage } from './pages/payslips/PayslipsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { TaxCompliancePage } from './pages/tax/TaxCompliancePage';
import { UsersPage } from './pages/users/UsersPage';
import { AuditLogsPage } from './pages/auditlogs/AuditLogsPage';
import { NotificationsPage } from './pages/announcements/NotificationsPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { DocumentsPage } from './pages/documents/DocumentsPage';

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
    <Routes>
      <Route path="/login" element={<Login />} />

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
  );
}
