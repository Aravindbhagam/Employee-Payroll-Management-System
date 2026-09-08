import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { api, apiErrorMessage } from '../../api/client';
import { PermAction, Resource, ROLE_LABELS, RoleName } from '../../types';
import { Spinner } from '../../components/FullPageSpinner';

const ACTIONS: PermAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'PROCESS', 'MANAGE'];
const RESOURCES: Resource[] = [
  'DASHBOARD', 'EMPLOYEES', 'PAYROLL', 'ATTENDANCE', 'LEAVE', 'SALARY_STRUCTURE', 'PAYSLIPS', 'REPORTS',
  'USERS', 'SETTINGS', 'AUDIT_LOGS', 'TAX_COMPLIANCE', 'DEPARTMENTS', 'DESIGNATIONS', 'DOCUMENTS', 'ANNOUNCEMENTS',
];
const ROLES: RoleName[] = ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE'];

interface MatrixRow {
  role: string;
  resource: string;
  action: string;
  allowed: boolean;
}

export function PermissionMatrix() {
  const { data, loading, refetch } = useFetch<{ matrix: MatrixRow[] }>('/users/roles/permission-matrix');
  const [role, setRole] = useState<RoleName>('HR_ADMIN');
  const [grid, setGrid] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const g: Record<string, boolean> = {};
    for (const row of data.matrix) {
      if (row.role === role) g[`${row.resource}:${row.action}`] = row.allowed;
    }
    setGrid(g);
  }, [data, role]);

  function toggle(resource: string, action: string) {
    const key = `${resource}:${action}`;
    setGrid((g) => ({ ...g, [key]: !g[key] }));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updates = RESOURCES.flatMap((resource) =>
        ACTIONS.map((action) => ({ role, resource, action, allowed: !!grid[`${resource}:${action}`] }))
      );
      await api.put('/users/roles/permission-matrix', { updates });
      setMessage('Permission matrix updated successfully.');
      refetch();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="label mb-0">Role</label>
          <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value as RoleName)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={save} disabled={saving || loading}>
          {saving && <Spinner />} <Save className="h-4 w-4" /> Save Changes
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">{message}</div>}

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="pb-3 pr-4">Resource</th>
              {ACTIONS.map((a) => (
                <th key={a} className="pb-3 px-2 text-center">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {RESOURCES.map((resource) => (
              <tr key={resource}>
                <td className="py-2 pr-4 font-medium text-slate-700">{resource.replaceAll('_', ' ')}</td>
                {ACTIONS.map((action) => (
                  <td key={action} className="py-2 px-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      checked={!!grid[`${resource}:${action}`]}
                      disabled={role === 'SUPER_ADMIN'}
                      onChange={() => toggle(resource, action)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {role === 'SUPER_ADMIN' && <p className="text-xs text-slate-400 mt-3">Super Admin permissions are fixed at full access for system integrity.</p>}
    </div>
  );
}
