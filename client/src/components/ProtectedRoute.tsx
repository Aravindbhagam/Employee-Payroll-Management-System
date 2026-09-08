import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PermAction, Resource } from '../types';
import { can } from '../utils/permissions';
import { Forbidden } from '../pages/Forbidden';
import { FullPageSpinner } from './FullPageSpinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  resource?: Resource;
  action?: PermAction;
}

export function ProtectedRoute({ children, resource, action }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;

  if (resource && action && !can(user, resource, action)) {
    return <Forbidden />;
  }

  return <>{children}</>;
}
