import { useState } from 'react';
import { Lock, Unlock, KeyRound, Ban, CheckCircle, ShieldCheck, Plus } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { useFetch } from '../../hooks/useFetch';
import { api, apiErrorMessage } from '../../api/client';
import { ROLE_LABELS } from '../../types';
import { formatDateTime, initials } from '../../utils/format';
import { AddEmployeeModal } from '../employees/AddEmployeeModal';
import { PermissionMatrix } from './PermissionMatrix';
import { UserPermissionsModal } from './UserPermissionsModal';

export function UsersPage() {
  const [tab, setTab] = useState<'users' | 'matrix'>('users');
  const [showAdd, setShowAdd] = useState(false);
  const [permTarget, setPermTarget] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, refetch } = useFetch<{ users: any[] }>('/users');

  async function toggleStatus(u: any) {
    setError(null);
    try {
      await api.post(`/users/${u.id}/${u.status === 'ACTIVE' ? 'deactivate' : 'activate'}`);
      refetch();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function toggleLock(u: any) {
    setError(null);
    try {
      await api.post(`/users/${u.id}/${u.lockedUntil ? 'unlock' : 'lock'}`);
      refetch();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function resetPassword(u: any) {
    setError(null);
    try {
      const res = await api.post(`/users/${u.id}/reset-password`);
      setResetResult({ email: u.email, password: res.data.temporaryPassword });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        subtitle="Manage user accounts, roles, and permissions."
        actions={
          tab === 'users' ? (
            <button className="btn-primary" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> Create User
            </button>
          ) : undefined
        }
      />

      <div className="mb-4 flex gap-2 border-b border-slate-200">
        <button
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'users' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}
          onClick={() => setTab('users')}
        >
          Users
        </button>
        <button
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1 ${tab === 'matrix' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}
          onClick={() => setTab('matrix')}
        >
          <ShieldCheck className="h-3.5 w-3.5" /> Role Permission Matrix
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}

      {tab === 'matrix' ? (
        <PermissionMatrix />
      ) : (
        <div className="card">
          <DataTable
            loading={loading}
            data={data?.users ?? []}
            keyFn={(u) => u.id}
            columns={[
              {
                header: 'User',
                accessor: (u) => (
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
                      {initials(u.name?.split(' ')[0], u.name?.split(' ')[1])}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{u.name}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </div>
                  </div>
                ),
              },
              { header: 'Role', accessor: (u) => ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role },
              { header: 'Department', accessor: (u) => u.department?.name ?? '—' },
              { header: 'Status', accessor: (u) => (u.lockedUntil ? <StatusBadge status="LOCKED" /> : <StatusBadge status={u.status} />) },
              { header: 'Last Login', accessor: (u) => formatDateTime(u.lastLoginAt) },
              {
                header: 'Actions',
                accessor: (u) => (
                  <div className="flex gap-2">
                    <button className="text-slate-400 hover:text-brand-600" title="Permissions" onClick={() => setPermTarget(u.id)}>
                      <ShieldCheck className="h-4 w-4" />
                    </button>
                    <button className="text-slate-400 hover:text-amber-600" title="Reset password" onClick={() => resetPassword(u)}>
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button className="text-slate-400 hover:text-red-600" title={u.lockedUntil ? 'Unlock' : 'Lock'} onClick={() => toggleLock(u)}>
                      {u.lockedUntil ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    </button>
                    <button
                      className="text-slate-400 hover:text-slate-700"
                      title={u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      onClick={() => toggleStatus(u)}
                    >
                      {u.status === 'ACTIVE' ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {showAdd && (
        <AddEmployeeModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            refetch();
          }}
        />
      )}

      {permTarget && <UserPermissionsModal userId={permTarget} onClose={() => setPermTarget(null)} />}

      {resetResult && (
        <Modal title="Password Reset" onClose={() => setResetResult(null)}>
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">A new temporary password has been generated for {resetResult.email}.</p>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 font-mono">{resetResult.password}</div>
            <p className="text-xs text-slate-400">All existing sessions for this user have been revoked.</p>
            <button className="btn-primary w-full" onClick={() => setResetResult(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
