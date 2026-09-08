import { useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { useFetch } from '../../hooks/useFetch';
import { api, apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../utils/format';
import { Spinner } from '../../components/FullPageSpinner';

export function AttendancePage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);

  const { data, loading, refetch } = useFetch<{ attendance: any[] }>(`/attendance?month=${month}`, [month]);

  async function checkIn() {
    setBusy('in');
    setError(null);
    try {
      await api.post('/attendance/check-in');
      refetch();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function checkOut() {
    setBusy('out');
    setError(null);
    try {
      await api.post('/attendance/check-out');
      refetch();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const showTeamColumns = user?.role !== 'EMPLOYEE';

  return (
    <div>
      <PageHeader
        title={user?.role === 'MANAGER' ? 'Team Attendance' : 'Attendance'}
        subtitle="Track daily check-ins, check-outs, and attendance status."
        actions={
          user?.role === 'EMPLOYEE' || user?.role === 'MANAGER' ? (
            <>
              <button className="btn-secondary" onClick={checkIn} disabled={busy !== null}>
                {busy === 'in' ? <Spinner /> : <LogIn className="h-4 w-4" />} Check In
              </button>
              <button className="btn-primary" onClick={checkOut} disabled={busy !== null}>
                {busy === 'out' ? <Spinner /> : <LogOut className="h-4 w-4" />} Check Out
              </button>
            </>
          ) : undefined
        }
      />

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="card">
        <div className="mb-4 flex items-center gap-2">
          <label className="label mb-0">Month</label>
          <input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>

        <DataTable
          loading={loading}
          data={data?.attendance ?? []}
          keyFn={(a) => a.id}
          columns={[
            ...(showTeamColumns
              ? [
                  {
                    header: 'Employee',
                    accessor: (a: any) => `${a.employee.firstName} ${a.employee.lastName}`,
                  },
                ]
              : []),
            { header: 'Date', accessor: (a: any) => formatDate(a.date) },
            { header: 'Check In', accessor: (a: any) => a.checkIn?.slice(11, 16) ?? a.checkIn ?? '—' },
            { header: 'Check Out', accessor: (a: any) => a.checkOut?.slice(11, 16) ?? a.checkOut ?? '—' },
            { header: 'Hours', accessor: (a: any) => a.hoursWorked },
            { header: 'Status', accessor: (a: any) => <StatusBadge status={a.status} /> },
          ]}
        />
      </div>
    </div>
  );
}
