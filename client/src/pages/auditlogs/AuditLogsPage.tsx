import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { useFetch } from '../../hooks/useFetch';
import { formatDateTime } from '../../utils/format';

const PAGE_SIZE = 25;

export function AuditLogsPage() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (action) params.set('action', action);
  if (entityType) params.set('entityType', entityType);

  const { data, loading } = useFetch<{ logs: any[]; total: number }>(`/audit-logs?${params.toString()}`, [action, entityType, page]);

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Track every sensitive action taken across the system." />

      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input w-56" placeholder="Filter by action..." value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        <select
          className="input w-52"
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
        >
          <option value="">All entity types</option>
          {['User', 'Employee', 'PayrollRun', 'Payslip', 'LeaveRequest', 'SalaryStructure', 'Department', 'Designation', 'CompanySettings', 'RolePermission'].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <DataTable
          loading={loading}
          data={data?.logs ?? []}
          keyFn={(l) => l.id}
          columns={[
            { header: 'User', accessor: (l) => l.userName },
            { header: 'Action', accessor: (l) => l.action.replaceAll('_', ' ') },
            { header: 'Entity', accessor: (l) => `${l.entityType}${l.entityId ? ` #${l.entityId.slice(0, 8)}` : ''}` },
            { header: 'IP Address', accessor: (l) => l.ipAddress ?? '—' },
            { header: 'Date/Time', accessor: (l) => formatDateTime(l.createdAt) },
          ]}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
      </div>
    </div>
  );
}
