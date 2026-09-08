import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { useFetch } from '../../hooks/useFetch';
import { formatCurrency } from '../../utils/format';

export function MyPayrollHistory() {
  const { data, loading } = useFetch<{ payslips: any[] }>('/payslips');

  return (
    <div>
      <PageHeader title="My Payroll" subtitle="Your payroll history and payment records." />
      <div className="card">
        <DataTable
          loading={loading}
          data={data?.payslips ?? []}
          keyFn={(p) => p.id}
          columns={[
            { header: 'Period', accessor: (p) => p.period },
            { header: 'Gross', accessor: (p) => formatCurrency(p.gross) },
            { header: 'Deductions', accessor: (p) => formatCurrency(p.deductions) },
            { header: 'Net Pay', accessor: (p) => <span className="font-semibold text-slate-900">{formatCurrency(p.net)}</span> },
            { header: 'Payroll Status', accessor: (p) => <StatusBadge status={p.payrollRun?.status ?? 'COMPLETED'} /> },
          ]}
        />
      </div>
    </div>
  );
}
