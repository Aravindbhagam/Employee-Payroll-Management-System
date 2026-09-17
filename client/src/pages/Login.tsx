import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Landmark, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth, apiErrorMessage } from '../context/AuthContext';
import { api } from '../api/client';

type Step = 'credentials' | 'twoFactor' | 'forgotPassword';

export function Login() {
  const { user, loading, login, verifyTwoFactor } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('credentials');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [tempToken, setTempToken] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [devResetToken, setDevResetToken] = useState<string | null>(null);

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const result = await login(identifier, password, rememberMe);
      if (result.requiresTwoFactor && result.tempToken) {
        setTempToken(result.tempToken);
        setStep('twoFactor');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid credentials. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify2fa(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await verifyTwoFactor(tempToken, otpCode);
      navigate('/dashboard');
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid verification code.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setForgotSubmitting(true);
    setDevResetToken(null);
    try {
      const res = await api.post('/auth/forgot-password', { identifier: forgotIdentifier });
      setSuccess(res.data.message || 'If an account exists, password reset instructions have been sent.');
      if (res.data.devResetToken) setDevResetToken(res.data.devResetToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setForgotSubmitting(false);
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
          <p className="text-brand-200 text-sm mt-1">Nimbus Corporation &middot; Employee Payroll Management</p>
        </div>

        <div className="card animate-fadeIn">
          {step === 'credentials' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Sign in to your account</h2>
                <p className="text-sm text-slate-500 mt-0.5">Use your work email or Employee ID</p>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700" role="alert">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700" role="status">
                  {success}
                </div>
              )}

              <div>
                <label className="label" htmlFor="identifier">
                  Email or Employee ID
                </label>
                <input
                  id="identifier"
                  className="input"
                  placeholder="you@nimbuscorp.com or EMP10001"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="label" htmlFor="password">
                    Password
                  </label>
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 mb-1"
                    onClick={() => {
                      setError(null);
                      setSuccess(null);
                      setStep('forgotPassword');
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    className="input pr-10"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
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

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me on this device
              </label>

              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
              </button>

              <p className="text-center text-xs text-slate-400 pt-1">
                Protected by role-based access control &amp; optional two-factor authentication.
              </p>
            </form>
          )}

          {step === 'twoFactor' && (
            <form onSubmit={handleVerify2fa} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Two-factor verification</h2>
                  <p className="text-sm text-slate-500">Enter the 6-digit code from your authenticator app.</p>
                </div>
              </div>

              {error && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}

              <div>
                <label className="label" htmlFor="otp">
                  Verification code
                </label>
                <input
                  id="otp"
                  className="input tracking-[0.5em] text-center text-lg"
                  maxLength={6}
                  inputMode="numeric"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                />
              </div>

              <button type="submit" className="btn-primary w-full" disabled={submitting || otpCode.length !== 6}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Verify &amp; sign in
              </button>
              <button type="button" className="btn-secondary w-full" onClick={() => setStep('credentials')}>
                Back
              </button>
            </form>
          )}

          {step === 'forgotPassword' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Reset your password</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Enter your email or Employee ID and we'll send you password reset instructions.
                </p>
              </div>

              {error && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
              {success && <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">{success}</div>}
              {devResetToken && (
                <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
                  Dev/test only (no email service configured):{' '}
                  <Link className="font-medium underline" to={`/reset-password?token=${devResetToken}`}>
                    open the reset link
                  </Link>
                  .
                </div>
              )}

              <div>
                <label className="label" htmlFor="forgot-identifier">
                  Email or Employee ID
                </label>
                <input
                  id="forgot-identifier"
                  className="input"
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary w-full" disabled={forgotSubmitting}>
                {forgotSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Send reset instructions
              </button>
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                  setDevResetToken(null);
                  setStep('credentials');
                }}
              >
                Back to sign in
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-brand-200">
          Demo accounts (password: <span className="font-mono">Password123!</span>) &mdash; superadmin / hradmin / payrolladmin / manager / employee
          @nimbuscorp.com
        </p>
      </div>
    </div>
  );
}
