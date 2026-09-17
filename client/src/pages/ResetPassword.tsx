import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Landmark, Loader2 } from 'lucide-react';
import { api, apiErrorMessage } from '../api/client';

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post('/auth/reset-password', { token, newPassword });
      setSuccess(res.data.message || 'Password has been reset. Please log in with your new password.');
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to reset password.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-brand-950 via-brand-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 mb-3">
            <Landmark className="h-7 w-7" />
          </div>
          <h1 className="text-white text-xl font-semibold tracking-tight">PayrollPro</h1>
        </div>

        <div className="card animate-fadeIn">
          {!token ? (
            <div className="space-y-4 text-center">
              <h2 className="text-lg font-semibold text-slate-900">Invalid reset link</h2>
              <p className="text-sm text-slate-500">
                This password reset link is missing its token. Request a new one from the sign-in page.
              </p>
              <Link to="/login" className="btn-primary w-full inline-flex justify-center">
                Back to sign in
              </Link>
            </div>
          ) : success ? (
            <div className="space-y-4 text-center">
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700" role="status">
                {success}
              </div>
              <button className="btn-primary w-full" onClick={() => navigate('/login')}>
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Choose a new password</h2>
                <p className="text-sm text-slate-500 mt-0.5">Your reset link is valid for 1 hour after it was requested.</p>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700" role="alert">
                  {error}
                </div>
              )}

              <div>
                <label className="label" htmlFor="new-password">
                  New password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    className="input pr-10"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Reset password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
