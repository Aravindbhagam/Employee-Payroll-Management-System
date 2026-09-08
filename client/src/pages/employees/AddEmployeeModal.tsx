import { FormEvent, useState } from 'react';
import { Modal } from '../../components/Modal';
import { api, apiErrorMessage } from '../../api/client';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../types';
import { Spinner } from '../../components/FullPageSpinner';

export function AddEmployeeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const { data: deptData } = useFetch<{ departments: any[] }>('/departments');
  const { data: desigData } = useFetch<{ designations: any[] }>('/designations');
  const { data: mgrData } = useFetch<{ employees: any[] }>('/employees');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'EMPLOYEE',
    departmentId: '',
    designationId: '',
    managerId: '',
    dateOfJoining: new Date().toISOString().slice(0, 10),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ employeeCode: string; temporaryPassword: string } | null>(null);

  const roleOptions = user?.role === 'SUPER_ADMIN' ? (Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]) : (['EMPLOYEE', 'MANAGER'] as const);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = { ...form, departmentId: form.departmentId || undefined, designationId: form.designationId || undefined, managerId: form.managerId || undefined };
      const res = await api.post('/employees', payload);
      setCreated({ employeeCode: res.data.employeeCode, temporaryPassword: res.data.temporaryPassword });
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to create employee.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <Modal title="Employee created" onClose={onCreated}>
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">The employee account has been created. Share these temporary credentials securely.</p>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-1">
            <p>
              <span className="text-slate-400">Employee ID:</span> <span className="font-mono">{created.employeeCode}</span>
            </p>
            <p>
              <span className="text-slate-400">Temporary password:</span> <span className="font-mono">{created.temporaryPassword}</span>
            </p>
          </div>
          <p className="text-xs text-slate-400">The user will be required to change this password on first login.</p>
          <button className="btn-primary w-full" onClick={onCreated}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add Employee" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {error && <div className="sm:col-span-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div>
          <label className="label">First name</label>
          <input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </div>
        <div>
          <label className="label">Last name</label>
          <input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Email</label>
          <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date of joining</label>
          <input className="input" type="date" value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} />
        </div>
        <div>
          <label className="label">Department</label>
          <select className="input" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
            <option value="">Select department</option>
            {deptData?.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Designation</label>
          <select className="input" value={form.designationId} onChange={(e) => setForm({ ...form, designationId: e.target.value })}>
            <option value="">Select designation</option>
            {desigData?.designations
              .filter((d) => !form.departmentId || d.departmentId === form.departmentId)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Manager (optional)</label>
          <select className="input" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
            <option value="">No manager</option>
            {mgrData?.employees.map((e) => (
              <option key={e.userId} value={e.userId}>
                {e.firstName} {e.lastName}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 flex gap-3 pt-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={submitting}>
            {submitting && <Spinner />} Create Employee
          </button>
        </div>
      </form>
    </Modal>
  );
}
