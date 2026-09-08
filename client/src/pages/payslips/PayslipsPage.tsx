import { useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { useFetch } from '../../hooks/useFetch';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate } from '../../utils/format';

export function PayslipsPage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const { data, loading } = useFetch<{ payslips: any[] }>('/payslips');
  const showEmployeeColumn = user?.role !== 'EMPLOYEE';

  async function downloadPayslip(id: string) {
    const res = await api.get(`/payslips/${id}`);
    const p = res.data.payslip;
    const lines = [
      `Payslip - ${p.period}`,
      `Employee: ${p.employee.firstName} ${p.employee.lastName} (${p.employee.user.employeeCode})`,
      `Department: ${p.employee.department?.name ?? '-'}  Designation: ${p.employee.designation?.title ?? '-'}`,
      '',
      'Earnings:',
      ...Object.entries(p.breakdown.earnings).map(([k, v]) => `  ${k}: ${formatCurrency(v as number)}`),
      '',
      'Deductions:',
      ...Object.entries(p.breakdown.deductions).map(([k, v]) => `  ${k}: ${formatCurrency(v as number)}`),
      '',
      `Gross Pay: ${formatCurrency(p.gross)}`,
      `Total Deductions: ${formatCurrency(p.deductions)}`,
      `Net Pay: ${formatCurrency(p.net)}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payslip-${p.employee.user.employeeCode}-${p.period}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader title="Payslips" subtitle="View and download generated payslips." />

      <div className="card">
        <DataTable
          loading={loading}
          data={data?.payslips ?? []}
          keyFn={(p) => p.id}
          columns={[
            ...(showEmployeeColumn ? [{ header: 'Employee', accessor: (p: any) => `${p.employee.firstName} ${p.employee.lastName}` }] : []),
            { header: 'Period', accessor: (p) => p.period },
            { header: 'Gross', accessor: (p) => formatCurrency(p.gross) },
            { header: 'Net Pay', accessor: (p) => <span className="font-semibold text-slate-900">{formatCurrency(p.net)}</span> },
            { header: 'Generated', accessor: (p) => formatDate(p.generatedAt) },
            {
              header: '',
              accessor: (p) => (
                <div className="flex gap-3">
                  <button className="text-brand-600 hover:text-brand-700" title="View" onClick={() => setSelected(p.id)}>
                    <Eye className="h-4 w-4" />
                  </button>
                  <button className="text-slate-500 hover:text-slate-700" title="Download" onClick={() => downloadPayslip(p.id)}>
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

      {selected && <PayslipDetailModal id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function PayslipDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, loading } = useFetch<{ payslip: any }>(`/payslips/${id}`, [id]);

  if (loading || !data) {
    return (
      <Modal title="Payslip" onClose={onClose}>
        <p className="text-sm text-slate-400">Loading...</p>
      </Modal>
    );
  }

  const p = data.payslip;
  return (
    <Modal title={`Payslip — ${p.period}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div>
          <p className="font-medium text-slate-800">
            {p.employee.firstName} {p.employee.lastName}
          </p>
          <p className="text-xs text-slate-400">
            {p.employee.department?.name} &middot; {p.employee.designation?.title}
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-slate-400 mb-2">Earnings</p>
          {Object.entries(p.breakdown.earnings).map(([k, v]) => (
            <div key={k} className="flex justify-between py-0.5">
              <span className="text-slate-500 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
              <span>{formatCurrency(v as number)}</span>
            </div>
          ))}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-slate-400 mb-2">Deductions</p>
          {Object.entries(p.breakdown.deductions).map(([k, v]) => (
            <div key={k} className="flex justify-between py-0.5">
              <span className="text-slate-500 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
              <span>{formatCurrency(v as number)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 pt-3 flex justify-between font-semibold text-slate-900">
          <span>Net Pay</span>
          <span>{formatCurrency(p.net)}</span>
        </div>
      </div>
    </Modal>
  );
}
