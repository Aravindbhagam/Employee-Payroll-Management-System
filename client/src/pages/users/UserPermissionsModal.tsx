import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { useFetch } from '../../hooks/useFetch';
import { api, apiErrorMessage } from '../../api/client';
import { PermAction, Resource } from '../../types';
import { Spinner } from '../../components/FullPageSpinner';

const ACTIONS: PermAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'PROCESS', 'MANAGE'];
const RESOURCES: Resource[] = [
  'DASHBOARD', 'EMPLOYEES', 'PAYROLL', 'ATTENDANCE', 'LEAVE', 'SALARY_STRUCTURE', 'PAYSLIPS', 'REPORTS',
  'USERS', 'SETTINGS', 'AUDIT_LOGS', 'TAX_COMPLIANCE', 'DEPARTMENTS', 'DESIGNATIONS', 'DOCUMENTS', 'ANNOUNCEMENTS',
];

export function UserPermissionsModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data, loading } = useFetch<{ role: string; effective: { resource: string; action: string; allowed: boolean }[] }>(
    `/users/${userId}/permissions`,
    [userId]
  );
  const [grid, setGrid] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const g: Record<string, boolean> = {};
    for (const row of data.effective) g[`${row.resource}:${row.action}`] = row.allowed;
    setGrid(g);
  }, [data]);

  function toggle(resource: string, action: string) {
    setGrid((g) => ({ ...g, [`${resource}:${action}`]: !g[`${resource}:${action}`] }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const overrides = RESOURCES.flatMap((resource) => ACTIONS.map((action) => ({ resource, action, allowed: !!grid[`${resource}:${action}`] })));
      await api.put(`/users/${userId}/permissions`, { overrides });
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Individual Permission Overrides" onClose={onClose} wide>
      {loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Base role: <span className="font-medium">{data?.role}</span>. Toggle individual permissions to override role defaults for this user only.
          </p>
          {error && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="overflow-x-auto max-h-96">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100 sticky top-0 bg-white">
                  <th className="pb-2 pr-4">Resource</th>
                  {ACTIONS.map((a) => (
                    <th key={a} className="pb-2 px-1 text-center">
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {RESOURCES.map((resource) => (
                  <tr key={resource}>
                    <td className="py-1.5 pr-4 font-medium text-slate-700 text-xs">{resource.replaceAll('_', ' ')}</td>
                    {ACTIONS.map((action) => (
                      <td key={action} className="py-1.5 px-1 text-center">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          checked={!!grid[`${resource}:${action}`]}
                          onChange={() => toggle(resource, action)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn-primary w-full" onClick={save} disabled={saving}>
            {saving && <Spinner />} Save Overrides
          </button>
        </div>
      )}
    </Modal>
  );
}
