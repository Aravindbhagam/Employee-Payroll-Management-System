import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, UserX, FileText, Upload, Trash2 } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { api, apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { StatusBadge } from '../../components/StatusBadge';
import { Spinner, FullPageSpinner } from '../../components/FullPageSpinner';
import { formatDate, initials } from '../../utils/format';

export function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, refetch } = useFetch<{ employee: any }>(`/employees/${id}`, [id]);
  const canViewDocs = can(user, 'DOCUMENTS', 'VIEW');
  const { data: docsData, refetch: refetchDocs } = useFetch<{ documents: any[] }>(canViewDocs ? `/employees/${id}/documents` : null, [id, canViewDocs]);

  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [docName, setDocName] = useState('');

  useEffect(() => {
    if (data?.employee) setForm(data.employee);
  }, [data]);

  if (loading || !form) return <FullPageSpinner />;

  const isSelf = user?.id === form.userId;
  const canEdit = can(user, 'EMPLOYEES', 'EDIT') || isSelf;
  const canDelete = can(user, 'EMPLOYEES', 'DELETE');
  const canManageDocs = can(user, 'DOCUMENTS', 'CREATE');

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.put(`/employees/${id}`, {
        phone: form.phone,
        address: form.address,
        emergencyContactName: form.emergencyContactName,
        emergencyContactPhone: form.emergencyContactPhone,
        ...(canEdit && !isSelf ? { bankAccountNumber: form.bankAccountNumber, bankName: form.bankName, taxId: form.taxId, status: form.status } : {}),
      });
      setSuccess('Employee profile updated successfully.');
      refetch();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to update employee.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleOffboard() {
    if (!confirm(`Offboard ${form.firstName} ${form.lastName}? Their account will be deactivated.`)) return;
    try {
      await api.delete(`/employees/${id}`);
      navigate('/employees');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleAddDoc(e: FormEvent) {
    e.preventDefault();
    if (!docName.trim()) return;
    try {
      await api.post(`/employees/${id}/documents`, { name: docName, type: 'General', fileName: `${docName.replace(/\s+/g, '_')}.pdf` });
      setDocName('');
      refetchDocs();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function handleDeleteDoc(docId: string) {
    try {
      await api.delete(`/employees/${id}/documents/${docId}`);
      refetchDocs();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div className="max-w-4xl">
      <button className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="card mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-lg font-semibold">
              {initials(form.firstName, form.lastName)}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                {form.firstName} {form.lastName}
              </h1>
              <p className="text-sm text-slate-500">
                {form.designation?.title ?? 'No designation'} &middot; {form.department?.name ?? 'No department'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {form.employeeCode} &middot; {form.email}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={form.status} />
            {canDelete && !isSelf && (
              <button className="btn-danger" onClick={handleOffboard}>
                <UserX className="h-4 w-4" /> Offboard
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">{success}</div>}

      <form onSubmit={handleSave} className="card space-y-5">
        <h2 className="text-sm font-semibold text-slate-900">Profile Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Phone</label>
            <input className="input" disabled={!canEdit} value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Date of Joining</label>
            <input className="input" disabled value={formatDate(form.dateOfJoining)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <input className="input" disabled={!canEdit} value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label className="label">Emergency Contact Name</label>
            <input
              className="input"
              disabled={!canEdit}
              value={form.emergencyContactName ?? ''}
              onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Emergency Contact Phone</label>
            <input
              className="input"
              disabled={!canEdit}
              value={form.emergencyContactPhone ?? ''}
              onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })}
            />
          </div>
        </div>

        <h2 className="text-sm font-semibold text-slate-900 pt-2">Banking &amp; Tax (sensitive)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Bank Name</label>
            <input
              className="input"
              disabled={!canEdit || isSelf}
              value={form.bankName ?? ''}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Bank Account Number</label>
            <input
              className="input font-mono"
              disabled={!canEdit || isSelf}
              value={form.bankAccountNumber ?? ''}
              onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Tax ID</label>
            <input className="input font-mono" disabled value={form.taxId ?? ''} />
          </div>
        </div>

        {canEdit && (
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving && <Spinner />} <Save className="h-4 w-4" /> Save Changes
          </button>
        )}
      </form>

      {canViewDocs && (
        <div className="card mt-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4 text-brand-600" /> Documents
          </h2>
          {canManageDocs && (
            <form onSubmit={handleAddDoc} className="flex gap-2 mb-4">
              <input className="input" placeholder="Document name (e.g. Offer Letter)" value={docName} onChange={(e) => setDocName(e.target.value)} />
              <button className="btn-secondary shrink-0">
                <Upload className="h-4 w-4" /> Add
              </button>
            </form>
          )}
          <ul className="divide-y divide-slate-50">
            {(docsData?.documents ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-700">{d.name}</p>
                  <p className="text-xs text-slate-400">Uploaded {formatDate(d.uploadedAt)}</p>
                </div>
                {canManageDocs && (
                  <button className="text-slate-400 hover:text-red-600" onClick={() => handleDeleteDoc(d.id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
            {(docsData?.documents ?? []).length === 0 && <p className="text-sm text-slate-400 py-2">No documents uploaded yet.</p>}
          </ul>
        </div>
      )}
    </div>
  );
}
