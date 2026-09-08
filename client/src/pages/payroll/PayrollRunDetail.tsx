import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calculator, Send, CheckCircle2, XCircle, PlayCircle } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { api, apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { StatusBadge } from '../../components/StatusBadge';
import { StatCard } from '../../components/StatCard';
import { DataTable } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { formatCurrency } from '../../utils/format';
import { FullPageSpinner, Spinner } from '../../components/FullPageSpinner';
import { TrendingUp, TrendingDown, Wallet, Users } from 'lucide-react';

const WORKFLOW_STEPS = ['DRAFT', 'CALCULATING', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'COMPLETED'];

export function PayrollRunDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, refetch } = useFetch<{ payrollRun: any }>(`/payroll/${id}`, [id]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  if (loading || !data) return <FullPageSpinner />;
  const run = data.payrollRun;

  const canProcess = can(user, 'PAYROLL', 'PROCESS');
  const canApprove = can(user, 'PAYROLL', 'APPROVE');

  async function action(path: string, body?: any) {
    setError(null);
    setBusy(true);
    try {
      await api.post(`/payroll/${id}/${path}`, body);
      await refetch();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = WORKFLOW_STEPS.indexOf(run.status);

  return (
    <div>
      <button className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4" onClick={() => navigate('/payroll')}>
        <ArrowLeft className="h-4 w-4" /> Back to Payroll
      </button>

      <div className="card mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Payroll Run — {run.period}</h1>
            <div className="mt-1">
              <StatusBadge status={run.status} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {run.status !== 'REJECTED' && run.status !== 'COMPLETED' && (
              <>
                {(run.status === 'DRAFT' || run.status === 'FAILED') && canProcess && (
                  <button className="btn-primary" disabled={busy} onClick={() => action('calculate')}>
                    {busy ? <Spinner /> : <Calculator className="h-4 w-4" />} Calculate Payroll
                  </button>
                )}
                {run.status === 'PENDING_REVIEW' && canProcess && (
                  <button className="btn-primary" disabled={busy} onClick={() => action('submit')}>
                    {busy ? <Spinner /> : <Send className="h-4 w-4" />} Submit for Approval
                  </button>
                )}
                {run.status === 'PENDING_APPROVAL' && canApprove && (
                  <>
                    <button className="btn-primary" disabled={busy} onClick={() => action('approve')}>
                      {busy ? <Spinner /> : <CheckCircle2 className="h-4 w-4" />} Approve
                    </button>
                    <button className="btn-danger" disabled={busy} onClick={() => setShowReject(true)}>
                      <XCircle className="h-4 w-4" /> Reject
                    </button>
                  </>
                )}
                {run.status === 'APPROVED' && canProcess && (
                  <button className="btn-primary" disabled={busy} onClick={() => action('process')}>
                    {busy ? <Spinner /> : <PlayCircle className="h-4 w-4" />} Process Payroll
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
        {run.rejectionReason && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
            <strong>Rejected:</strong> {run.rejectionReason}
          </div>
        )}

        {/* Workflow progress */}
        {run.status !== 'REJECTED' && (
          <div className="flex items-center overflow-x-auto pb-2">
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={step} className="flex items-center shrink-0">
                <div
                  className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] font-semibold ${
                    i <= stepIndex ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {i + 1}
                </div>
                <span className={`ml-1.5 mr-3 text-xs whitespace-nowrap ${i <= stepIndex ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                  {step.replaceAll('_', ' ')}
                </span>
                {i < WORKFLOW_STEPS.length - 1 && <div className={`h-px w-6 shrink-0 ${i < stepIndex ? 'bg-brand-600' : 'bg-slate-200'}`} />}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Employees" value={run.employeeCount} icon={Users} tone="brand" />
        <StatCard label="Total Gross" value={formatCurrency(run.totalGross)} icon={TrendingUp} tone="slate" />
        <StatCard label="Total Deductions" value={formatCurrency(run.totalDeductions)} icon={TrendingDown} tone="amber" />
        <StatCard label="Total Net" value={formatCurrency(run.totalNet)} icon={Wallet} tone="emerald" />
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Payslips</h3>
        <DataTable
          data={run.payslips ?? []}
          keyFn={(p: any) => p.id}
          emptyMessage="No payslips generated yet. Calculate payroll to generate them."
          columns={[
            { header: 'Employee', accessor: (p: any) => `${p.employee.firstName} ${p.employee.lastName}` },
            { header: 'Department', accessor: (p: any) => p.employee.department?.name ?? '—' },
            { header: 'Gross', accessor: (p: any) => formatCurrency(p.gross) },
            { header: 'Deductions', accessor: (p: any) => formatCurrency(p.deductions) },
            { header: 'Net', accessor: (p: any) => <span className="font-semibold text-slate-900">{formatCurrency(p.net)}</span> },
          ]}
        />
      </div>

      {showReject && (
        <Modal title="Reject Payroll Run" onClose={() => setShowReject(false)}>
          <div className="space-y-3">
            <label className="label">Rejection reason</label>
            <textarea className="input" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} required />
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setShowReject(false)}>
                Cancel
              </button>
              <button
                className="btn-danger flex-1"
                disabled={!rejectReason.trim()}
                onClick={async () => {
                  await action('reject', { reason: rejectReason });
                  setShowReject(false);
                  setRejectReason('');
                }}
              >
                Reject Run
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
