import { useEffect, useState, FormEvent } from 'react';
import { KeyRound, ShieldCheck, Building2, Save } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { useFetch } from '../../hooks/useFetch';
import { api, apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { Spinner } from '../../components/FullPageSpinner';
import { Modal } from '../../components/Modal';

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const canView = can(user, 'SETTINGS', 'VIEW');
  const canManage = can(user, 'SETTINGS', 'MANAGE');

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Settings" subtitle="Manage your account security and, where permitted, company-wide configuration." />

      <SecuritySection user={user} refreshUser={refreshUser} />

      {canView && <CompanySettingsSection canManage={canManage} />}
    </div>
  );
}

function SecuritySection({ user, refreshUser }: { user: any; refreshUser: () => Promise<void> }) {
  const [showChangePw, setShowChangePw] = useState(false);
  const [show2fa, setShow2fa] = useState(false);

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-brand-600" /> Account Security
      </h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">Password</p>
            <p className="text-xs text-slate-400">Change your account password.</p>
          </div>
          <button className="btn-secondary" onClick={() => setShowChangePw(true)}>
            <KeyRound className="h-4 w-4" /> Change Password
          </button>
        </div>
        <div className="flex items-center justify-between border-t border-slate-50 pt-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Two-Factor Authentication</p>
            <p className="text-xs text-slate-400">
              {user?.twoFactorEnabled ? 'Enabled — your account requires a one-time code at login.' : 'Add an extra layer of security to your account.'}
            </p>
          </div>
          <button className="btn-secondary" onClick={() => setShow2fa(true)}>
            {user?.twoFactorEnabled ? 'Manage' : 'Enable 2FA'}
          </button>
        </div>
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
      {show2fa && (
        <TwoFactorModal
          enabled={user?.twoFactorEnabled}
          onClose={() => setShow2fa(false)}
          onChanged={async () => {
            await refreshUser();
          }}
        />
      )}
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setSuccess('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Change Password" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">{success}</div>}
        <div>
          <label className="label">Current Password</label>
          <input type="password" className="input" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div>
          <label className="label">New Password</label>
          <input type="password" className="input" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <p className="text-xs text-slate-400 mt-1">At least 8 characters, with an uppercase letter, lowercase letter, and a number.</p>
        </div>
        <button className="btn-primary w-full" disabled={submitting}>
          {submitting && <Spinner />} Update Password
        </button>
      </form>
    </Modal>
  );
}

function TwoFactorModal({ enabled, onClose, onChanged }: { enabled: boolean; onClose: () => void; onChanged: () => Promise<void> }) {
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!enabled) {
      api.post('/auth/2fa/setup').then((res) => setQr(res.data.qrCodeDataUrl));
    }
  }, [enabled]);

  async function handleEnable(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/auth/2fa/enable', { code });
      await onChanged();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisable() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/auth/2fa/disable');
      await onChanged();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (enabled) {
    return (
      <Modal title="Two-Factor Authentication" onClose={onClose}>
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">Two-factor authentication is currently enabled on your account.</p>
          {error && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button className="btn-danger w-full" onClick={handleDisable} disabled={submitting}>
            {submitting && <Spinner />} Disable Two-Factor Authentication
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Enable Two-Factor Authentication" onClose={onClose}>
      <form onSubmit={handleEnable} className="space-y-4 text-sm">
        <p className="text-slate-600">Scan this QR code with an authenticator app (e.g. Google Authenticator, Authy), then enter the 6-digit code.</p>
        {error && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
        {qr ? <img src={qr} alt="2FA QR Code" className="mx-auto h-40 w-40" /> : <div className="h-40 flex items-center justify-center"><Spinner /></div>}
        <div>
          <label className="label">Verification Code</label>
          <input
            className="input tracking-[0.4em] text-center"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
          />
        </div>
        <button className="btn-primary w-full" disabled={submitting || code.length !== 6}>
          {submitting && <Spinner />} Enable Two-Factor Authentication
        </button>
      </form>
    </Modal>
  );
}

function CompanySettingsSection({ canManage }: { canManage: boolean }) {
  const { data, loading, refetch } = useFetch<{ settings: any }>('/settings');
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.put('/settings', {
        companyName: form.companyName,
        address: form.address,
        currency: form.currency,
        sessionTimeoutMinutes: Number(form.sessionTimeoutMinutes),
        maxFailedLoginAttempts: Number(form.maxFailedLoginAttempts),
        lockoutMinutes: Number(form.lockoutMinutes),
        twoFactorRequired: form.twoFactorRequired,
      });
      setSuccess('Company settings updated.');
      refetch();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) return null;

  return (
    <form onSubmit={handleSave} className="card space-y-4">
      <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-brand-600" /> Company &amp; System Settings
      </h2>
      {error && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">{success}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Company Name</label>
          <input className="input" disabled={!canManage} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
        </div>
        <div>
          <label className="label">Currency</label>
          <input className="input" disabled={!canManage} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Address</label>
          <input className="input" disabled={!canManage} value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <label className="label">Session Timeout (minutes)</label>
          <input
            type="number"
            className="input"
            disabled={!canManage}
            value={form.sessionTimeoutMinutes}
            onChange={(e) => setForm({ ...form, sessionTimeoutMinutes: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Max Failed Login Attempts</label>
          <input
            type="number"
            className="input"
            disabled={!canManage}
            value={form.maxFailedLoginAttempts}
            onChange={(e) => setForm({ ...form, maxFailedLoginAttempts: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Lockout Duration (minutes)</label>
          <input
            type="number"
            className="input"
            disabled={!canManage}
            value={form.lockoutMinutes}
            onChange={(e) => setForm({ ...form, lockoutMinutes: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            id="tfr"
            disabled={!canManage}
            checked={form.twoFactorRequired}
            onChange={(e) => setForm({ ...form, twoFactorRequired: e.target.checked })}
          />
          <label htmlFor="tfr" className="text-sm text-slate-600">
            Require two-factor authentication for all users
          </label>
        </div>
      </div>

      {canManage && (
        <button className="btn-primary" disabled={saving}>
          {saving && <Spinner />} <Save className="h-4 w-4" /> Save Settings
        </button>
      )}
    </form>
  );
}
