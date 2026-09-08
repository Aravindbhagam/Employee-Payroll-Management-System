import { Navigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { formatDate } from '../../utils/format';

export function DocumentsPage() {
  const { user } = useAuth();
  if (user?.role !== 'EMPLOYEE') return <Navigate to="/employees" replace />;
  return <MyDocuments />;
}

function MyDocuments() {
  const { user } = useAuth();
  const { data: empData, loading: loadingEmp } = useFetch<{ employees: any[] }>('/employees');
  const own = empData?.employees.find((e) => e.userId === user?.id);
  const { data: docsData, loading: loadingDocs } = useFetch<{ documents: any[] }>(own ? `/employees/${own.id}/documents` : null, [own?.id]);

  if (loadingEmp || (own && loadingDocs)) return <FullPageSpinner />;

  return (
    <div>
      <PageHeader title="My Documents" subtitle="View documents on file with HR." />
      <div className="card">
        <ul className="divide-y divide-slate-50">
          {(docsData?.documents ?? []).map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">{d.name}</p>
                <p className="text-xs text-slate-400">Uploaded {formatDate(d.uploadedAt)}</p>
              </div>
            </li>
          ))}
          {(docsData?.documents ?? []).length === 0 && <p className="text-sm text-slate-400 py-2">No documents on file.</p>}
        </ul>
      </div>
    </div>
  );
}
