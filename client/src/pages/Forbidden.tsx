import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export function Forbidden() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center px-4 animate-fadeIn">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600 mb-5">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-semibold text-slate-900">403 — Access Denied</h1>
      <p className="mt-2 max-w-md text-slate-500">
        You don't have permission to access this page. Please contact your administrator if you believe you need access.
      </p>
      <div className="mt-6 flex gap-3">
        <button className="btn-secondary" onClick={() => navigate(-1)}>
          Go back
        </button>
        <button className="btn-primary" onClick={() => navigate('/dashboard')}>
          Return to dashboard
        </button>
      </div>
    </div>
  );
}
