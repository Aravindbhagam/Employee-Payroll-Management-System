import { Navigate } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { FullPageSpinner } from '../../components/FullPageSpinner';

export function ProfilePage() {
  const { user } = useAuth();
  const { data, loading } = useFetch<{ employees: any[] }>('/employees');

  if (loading || !data) return <FullPageSpinner />;

  const own = data.employees.find((e) => e.userId === user?.id);
  if (!own) {
    return (
      <div className="card max-w-lg">
        <p className="text-sm text-slate-500">No employee profile is linked to your account yet. Please contact your administrator.</p>
      </div>
    );
  }

  return <Navigate to={`/employees/${own.id}`} replace />;
}
