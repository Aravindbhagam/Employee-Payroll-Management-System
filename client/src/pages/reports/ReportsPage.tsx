import { useState } from 'react';
import { Download } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, Column } from '../../components/DataTable';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';

const REPORT_TYPES: { value: string; label: string }[] = [
  { value: 'employees', label: 'Employee Directory' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'leave', label: 'Leave' },
  { value: 'payroll', label: 'Payroll Summary' },
];

export function ReportsPage() {
  const { user } = useAuth();
  const [type, setType] = useState('employees');
  const { data, loading } = useFetch<{ type: string; rows: Record<string, any>[] }>(`/reports?type=${type}`, [type]);
  const canExport = can(user, 'REPORTS', 'EXPORT');

  const availableTypes = REPORT_TYPES.filter((t) => {
    if (t.value === 'payroll') return user?.role === 'SUPER_ADMIN' || user?.role === 'PAYROLL_ADMIN';
    if (t.value === 'attendance') return user?.role !== 'PAYROLL_ADMIN';
    return true;
  });

  const rows = data?.rows ?? [];
  const columns: Column<Record<string, any>>[] = rows.length > 0 ? Object.keys(rows[0]).map((key) => ({ header: key, accessor: (r) => String(r[key]) })) : [];

  async function download() {
    // Use the authenticated axios client (not a plain link/window.open) so
    // the Authorization header is attached -- the API requires it and has
    // no session cookie to fall back on for this route.
    const res = await api.get(`/reports?type=${type}&format=csv`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title={user?.role === 'MANAGER' ? 'Team Reports' : 'Reports'}
        subtitle="Generate and export operational reports."
        actions={
          canExport ? (
            <button className="btn-secondary" onClick={download}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
          ) : undefined
        }
      />

      <div className="mb-4 flex gap-2 flex-wrap">
        {availableTypes.map((t) => (
          <button
            key={t.value}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
              type === t.value ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            onClick={() => setType(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <DataTable loading={loading} data={rows} keyFn={(r) => JSON.stringify(r)} columns={columns} emptyMessage="No data available." />
      </div>
    </div>
  );
}
