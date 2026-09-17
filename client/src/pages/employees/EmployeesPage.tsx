import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Building2 } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { StatusBadge } from '../../components/StatusBadge';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { AddEmployeeModal } from './AddEmployeeModal';
import { DepartmentsPanel } from './DepartmentsPanel';
import { ROLE_LABELS } from '../../types';
import { initials } from '../../utils/format';

export function EmployeesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState<'employees' | 'departments'>('employees');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) params.set('search', search);
  const { data, loading, refetch } = useFetch<{ employees: any[]; total: number }>(`/employees?${params.toString()}`, [search, page]);

  const canManageOrgStructure = can(user, 'DEPARTMENTS', 'MANAGE') || can(user, 'DESIGNATIONS', 'MANAGE');

  return (
    <div>
      <PageHeader
        title={user?.role === 'MANAGER' ? 'My Team' : 'Employees'}
        subtitle="Directory of employee profiles across the organization."
        actions={
          can(user, 'EMPLOYEES', 'CREATE') && tab === 'employees' ? (
            <button className="btn-primary" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> Add Employee
            </button>
          ) : undefined
        }
      />

      {canManageOrgStructure && (
        <div className="mb-4 flex gap-2 border-b border-slate-200">
          <button
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'employees' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}
            onClick={() => setTab('employees')}
          >
            Employees
          </button>
          <button
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1 ${tab === 'departments' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}
            onClick={() => setTab('departments')}
          >
            <Building2 className="h-3.5 w-3.5" /> Departments &amp; Designations
          </button>
        </div>
      )}

      {tab === 'departments' ? (
        <DepartmentsPanel />
      ) : (
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="Search employees..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <DataTable
            loading={loading}
            data={data?.employees ?? []}
            keyFn={(e) => e.id}
            emptyMessage="No employees found."
            columns={[
              {
                header: 'Employee',
                accessor: (e) => (
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
                      {initials(e.firstName, e.lastName)}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">
                        {e.firstName} {e.lastName}
                      </p>
                      <p className="text-xs text-slate-400">{e.employeeCode}</p>
                    </div>
                  </div>
                ),
              },
              { header: 'Department', accessor: (e) => e.department?.name ?? '—' },
              { header: 'Designation', accessor: (e) => e.designation?.title ?? '—' },
              { header: 'Role', accessor: (e) => ROLE_LABELS[e.role as keyof typeof ROLE_LABELS] ?? e.role },
              { header: 'Status', accessor: (e) => <StatusBadge status={e.status} /> },
              {
                header: '',
                accessor: (e) => (
                  <button className="text-brand-600 hover:text-brand-700 text-sm font-medium" onClick={() => navigate(`/employees/${e.id}`)}>
                    View
                  </button>
                ),
              },
            ]}
          />
          <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPageChange={setPage} />
        </div>
      )}

      {showAdd && (
        <AddEmployeeModal
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
