import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useFetch';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { SuperAdminDashboard } from './SuperAdminDashboard';
import { HRDashboard } from './HRDashboard';
import { PayrollDashboard } from './PayrollDashboard';
import { ManagerDashboard } from './ManagerDashboard';
import { EmployeeDashboard } from './EmployeeDashboard';

export function Dashboard() {
  const { user } = useAuth();
  const { data, loading } = useFetch<{ dashboard: any }>('/dashboard');

  if (loading || !data) return <FullPageSpinner />;
  const d = data.dashboard;

  switch (user?.role) {
    case 'SUPER_ADMIN':
      return <SuperAdminDashboard data={d} />;
    case 'HR_ADMIN':
      return <HRDashboard data={d} />;
    case 'PAYROLL_ADMIN':
      return <PayrollDashboard data={d} />;
    case 'MANAGER':
      return <ManagerDashboard data={d} />;
    default:
      return <EmployeeDashboard data={d} />;
  }
}
