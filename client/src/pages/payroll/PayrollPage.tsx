import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { useFetch } from '../../hooks/useFetch';
import { api, apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { formatCurrency, formatDate } from '../../utils/format';
import { Spinner } from '../../components/FullPageSpinner';
import { MyPayrollHistory } from './MyPayrollHistory';

export function PayrollPage() {
  const { user } = useAuth();
  if (user?.role === 'EMPLOYEE') return <MyPayrollHistory />;
  return <PayrollAdminPage />;
}

function PayrollAdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const { data, loading, refetch } = useFetch<{ payrollRuns: any[] }>('/payroll');
  const canCreate = can(user, 'PAYROLL', 'CREATE');

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Calculate, review, approve, and process payroll runs."
        actions={
          canCreate ? (
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> New Payroll Run
            </button>
          ) : undefined
        }
      />

      <div className="card">
        <DataTable
          loading={loading}
          data={data?.payrollRuns ?? []}
          keyFn={(r) => r.id}
          columns={[
            {
              header: 'Period',
              accessor: (r) => (
                <button className="font-medium text-brand-600 hover:text-brand-700" onClick={() => navigate(`/payroll/${r.id}`)}>
                  {r.period}
                </button>
              ),
            },
            { header: 'Employees', accessor: (r) => r._count?.payslips ?? r.employeeCount },
            { header: 'Gross', accessor: (r) => formatCurrency(r.totalGross) },
            { header: 'Net', accessor: (r) => formatCurrency(r.totalNet) },
            { header: 'Status', accessor: (r) => <StatusBadge status={r.status} /> },
            { header: 'Created', accessor: (r) => formatDate(r.createdAt) },
          ]}
        />
      </div>

      {showCreate && (
        <CreateRunModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            refetch();
            navigate(`/payroll/${id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateRunModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post('/payroll', { period });
      onCreated(res.data.payrollRun.id);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to create payroll run.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New Payroll Run" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="label">Pay Period</label>
          <input type="month" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} required />
        </div>
        <button className="btn-primary w-full" disabled={submitting}>
          {submitting && <Spinner />} Create Run
        </button>
      </form>
    </Modal>
  );
}
