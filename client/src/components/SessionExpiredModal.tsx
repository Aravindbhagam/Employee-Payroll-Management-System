import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function SessionExpiredModal() {
  const { sessionExpired, dismissSessionExpired } = useAuth();
  const navigate = useNavigate();

  if (!sessionExpired) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 animate-fadeIn">
      <div className="card max-w-sm w-full text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Session expired</h2>
        <p className="mt-1 text-sm text-slate-500">
          For your security, you've been signed out due to inactivity or an expired session. Please log in again.
        </p>
        <button
          className="btn-primary mt-5 w-full"
          onClick={() => {
            dismissSessionExpired();
            navigate('/login');
          }}
        >
          Back to login
        </button>
      </div>
    </div>
  );
}
