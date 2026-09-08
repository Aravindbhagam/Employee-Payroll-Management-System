import { FormEvent, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { useFetch } from '../../hooks/useFetch';
import { api, apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { formatCurrency, formatDate } from '../../utils/format';
import { Spinner } from '../../components/FullPageSpinner';

export function SalaryStructurePage() {
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const { data, loading, refetch } = useFetch<{ salaryStructures: any[] }>('/salary-structures');
  const canCreate = can(user, 'SALARY_STRUCTURE', 'CREATE');

  return (
    <div>
      <PageHeader
        title="Salary Structure"
        subtitle="Configure earnings and deduction components for each employee."
        actions={
          canCreate ? (
            <button className="btn-primary" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> New Structure
            </button>
          ) : undefined
        }
      />

      <div className="card">
        <DataTable
          loading={loading}
          data={data?.salaryStructures ?? []}
          keyFn={(s) => s.id}
          columns={[
            { header: 'Employee', accessor: (s) => `${s.employee.firstName} ${s.employee.lastName}` },
            { header: 'Basic', accessor: (s) => formatCurrency(s.basic) },
            { header: 'HRA', accessor: (s) => formatCurrency(s.hra) },
            { header: 'Deductions', accessor: (s) => formatCurrency(s.providentFund + s.professionalTax + s.incomeTax + s.otherDeductions) },
            { header: 'CTC', accessor: (s) => <span className="font-semibold text-slate-900">{formatCurrency(s.ctc)}</span> },
            { header: 'Effective From', accessor: (s) => formatDate(s.effectiveFrom) },
            { header: 'Active', accessor: (s) => (s.isActive ? 'Yes' : 'No') },
          ]}
        />
      </div>

      {showAdd && (
        <AddSalaryModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function AddSalaryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: empData } = useFetch<{ employees: any[] }>('/employees');
  const [form, setForm] = useState({
    employeeId: '',
    basic: 0,
    hra: 0,
    conveyance: 0,
    medical: 0,
    specialAllowance: 0,
    providentFund: 0,
    professionalTax: 0,
    incomeTax: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const num = (v: string) => (v === '' ? 0 : Number(v));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/salary-structures', form);
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save salary structure.'));
    } finally {
      setSubmitting(false);
    }
  }

  const fields: { key: keyof typeof form; label: string }[] = [
    { key: 'basic', label: 'Basic' },
    { key: 'hra', label: 'HRA' },
    { key: 'conveyance', label: 'Conveyance' },
    { key: 'medical', label: 'Medical' },
    { key: 'specialAllowance', label: 'Special Allowance' },
    { key: 'providentFund', label: 'Provident Fund' },
    { key: 'professionalTax', label: 'Professional Tax' },
    { key: 'incomeTax', label: 'Income Tax' },
  ];

  return (
    <Modal title="New Salary Structure" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="label">Employee</label>
          <select className="input" required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
            <option value="">Select employee</option>
            {empData?.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName} ({e.employeeCode})
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              <input
                type="number"
                min={0}
                className="input"
                value={form[f.key] as number}
                onChange={(e) => setForm({ ...form, [f.key]: num(e.target.value) })}
              />
            </div>
          ))}
        </div>
        <button className="btn-primary w-full" disabled={submitting}>
          {submitting && <Spinner />} Save Structure
        </button>
      </form>
    </Modal>
  );
}
