import { FormEvent, useState } from 'react';
import { Check, X, Plus } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { useFetch } from '../../hooks/useFetch';
import { api, apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { formatDate } from '../../utils/format';
import { Spinner } from '../../components/FullPageSpinner';

const LEAVE_TYPES = ['ANNUAL', 'SICK', 'CASUAL', 'UNPAID', 'MATERNITY', 'PATERNITY', 'OTHER'];

export function LeavePage() {
  const { user } = useAuth();
  const [showApply, setShowApply] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data, loading, refetch } = useFetch<{ leaveRequests: any[]; total: number }>(`/leave?page=${page}&pageSize=${pageSize}`, [page]);
  const { data: balanceData } = useFetch<{ balances: any[] }>('/leave/balances');

  const canApprove = can(user, 'LEAVE', 'APPROVE');
  const canApply = can(user, 'LEAVE', 'CREATE');

  async function approve(id: string) {
    setError(null);
    try {
      await api.post(`/leave/${id}/approve`);
      refetch();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function reject() {
    if (!rejectTarget) return;
    setError(null);
    try {
      await api.post(`/leave/${rejectTarget}/reject`, { reason: rejectReason });
      setRejectTarget(null);
      setRejectReason('');
      refetch();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function cancel(id: string) {
    setError(null);
    try {
      await api.post(`/leave/${id}/cancel`);
      refetch();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  const showEmployeeColumn = user?.role !== 'EMPLOYEE';

  return (
    <div>
      <PageHeader
        title={user?.role === 'MANAGER' ? 'Leave Requests' : 'Leave Management'}
        subtitle="Apply for leave, track balances, and manage approvals."
        actions={
          canApply ? (
            <button className="btn-primary" onClick={() => setShowApply(true)}>
              <Plus className="h-4 w-4" /> Apply for Leave
            </button>
          ) : undefined
        }
      />

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}

      {balanceData && balanceData.balances.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          {balanceData.balances.map((b) => (
            <div key={b.id} className="card text-center py-4">
              <p className="text-2xl font-semibold text-slate-900">{b.allocated - b.used}</p>
              <p className="text-xs text-slate-500 mt-1">{b.leaveType} days left</p>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <DataTable
          loading={loading}
          data={data?.leaveRequests ?? []}
          keyFn={(r) => r.id}
          columns={[
            ...(showEmployeeColumn ? [{ header: 'Employee', accessor: (r: any) => `${r.employee.firstName} ${r.employee.lastName}` }] : []),
            { header: 'Type', accessor: (r: any) => r.leaveType },
            { header: 'From', accessor: (r: any) => formatDate(r.startDate) },
            { header: 'To', accessor: (r: any) => formatDate(r.endDate) },
            { header: 'Days', accessor: (r: any) => r.days },
            { header: 'Status', accessor: (r: any) => <StatusBadge status={r.status} /> },
            {
              header: '',
              accessor: (r: any) => (
                <div className="flex gap-2">
                  {r.status === 'PENDING' && canApprove && (
                    <>
                      <button className="text-emerald-600 hover:text-emerald-700" onClick={() => approve(r.id)} title="Approve">
                        <Check className="h-4 w-4" />
                      </button>
                      <button className="text-red-600 hover:text-red-700" onClick={() => setRejectTarget(r.id)} title="Reject">
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {r.status === 'PENDING' && user?.role === 'EMPLOYEE' && (
                    <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => cancel(r.id)}>
                      Cancel
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
        <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPageChange={setPage} />
      </div>

      {showApply && <ApplyLeaveModal onClose={() => setShowApply(false)} onCreated={() => { setShowApply(false); refetch(); }} />}

      {rejectTarget && (
        <Modal title="Reject leave request" onClose={() => setRejectTarget(null)}>
          <div className="space-y-3">
            <label className="label">Reason (optional)</label>
            <textarea className="input" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setRejectTarget(null)}>
                Cancel
              </button>
              <button className="btn-danger flex-1" onClick={reject}>
                Reject Request
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ApplyLeaveModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ leaveType: 'ANNUAL', startDate: '', endDate: '', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/leave', form);
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to submit leave request.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Apply for Leave" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="label">Leave Type</label>
          <select className="input" value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })}>
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Start Date</label>
            <input type="date" className="input" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <label className="label">End Date</label>
            <input type="date" className="input" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Reason</label>
          <textarea className="input" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        <button className="btn-primary w-full" disabled={submitting}>
          {submitting && <Spinner />} Submit Request
        </button>
      </form>
    </Modal>
  );
}
