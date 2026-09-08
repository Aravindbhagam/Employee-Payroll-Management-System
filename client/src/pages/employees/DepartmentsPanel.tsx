import { FormEvent, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { api, apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';

export function DepartmentsPanel() {
  const { user } = useAuth();
  const { data: deptData, refetch: refetchDepts } = useFetch<{ departments: any[] }>('/departments');
  const { data: desigData, refetch: refetchDesig } = useFetch<{ designations: any[] }>('/designations');

  const [deptName, setDeptName] = useState('');
  const [desigTitle, setDesigTitle] = useState('');
  const [desigDept, setDesigDept] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canManageDept = can(user, 'DEPARTMENTS', 'CREATE');
  const canManageDesig = can(user, 'DESIGNATIONS', 'CREATE');

  async function addDept(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/departments', { name: deptName });
      setDeptName('');
      refetchDepts();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function addDesig(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/designations', { title: desigTitle, departmentId: desigDept });
      setDesigTitle('');
      refetchDesig();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function removeDept(id: string) {
    try {
      await api.delete(`/departments/${id}`);
      refetchDepts();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function removeDesig(id: string) {
    try {
      await api.delete(`/designations/${id}`);
      refetchDesig();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {error && <div className="lg:col-span-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="card">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Departments</h3>
        {canManageDept && (
          <form onSubmit={addDept} className="flex gap-2 mb-4">
            <input className="input" placeholder="New department name" value={deptName} onChange={(e) => setDeptName(e.target.value)} required />
            <button className="btn-primary shrink-0">
              <Plus className="h-4 w-4" />
            </button>
          </form>
        )}
        <ul className="divide-y divide-slate-50">
          {deptData?.departments.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium text-slate-700">{d.name}</p>
                <p className="text-xs text-slate-400">{d._count?.employees ?? 0} employees</p>
              </div>
              {canManageDept && (
                <button className="text-slate-400 hover:text-red-600" onClick={() => removeDept(d.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Designations</h3>
        {canManageDesig && (
          <form onSubmit={addDesig} className="flex flex-col sm:flex-row gap-2 mb-4">
            <select className="input" value={desigDept} onChange={(e) => setDesigDept(e.target.value)} required>
              <option value="">Department</option>
              {deptData?.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input className="input" placeholder="Title" value={desigTitle} onChange={(e) => setDesigTitle(e.target.value)} required />
            <button className="btn-primary shrink-0">
              <Plus className="h-4 w-4" />
            </button>
          </form>
        )}
        <ul className="divide-y divide-slate-50">
          {desigData?.designations.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="font-medium text-slate-700">{d.title}</p>
                <p className="text-xs text-slate-400">{d.department?.name}</p>
              </div>
              {canManageDesig && (
                <button className="text-slate-400 hover:text-red-600" onClick={() => removeDesig(d.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
