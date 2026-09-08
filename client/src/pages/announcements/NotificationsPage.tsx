import { FormEvent, useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { useFetch } from '../../hooks/useFetch';
import { api, apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { formatDateTime } from '../../utils/format';
import { Spinner } from '../../components/FullPageSpinner';

export function NotificationsPage() {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const { data, loading, refetch } = useFetch<{ announcements: any[] }>('/announcements');
  const canCreate = can(user, 'ANNOUNCEMENTS', 'CREATE');

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Company announcements and updates."
        actions={
          canCreate ? (
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> New Announcement
            </button>
          ) : undefined
        }
      />

      <div className="space-y-4">
        {loading && <p className="text-sm text-slate-400">Loading...</p>}
        {(data?.announcements ?? []).map((a) => (
          <div key={a.id} className="card">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Megaphone className="h-4.5 w-4.5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-900">{a.title}</p>
                  <span className="text-xs text-slate-400">{formatDateTime(a.createdAt)}</span>
                </div>
                <p className="text-sm text-slate-600 mt-1">{a.body}</p>
                <p className="text-xs text-slate-400 mt-2">Posted by {a.createdBy?.email}</p>
              </div>
            </div>
          </div>
        ))}
        {!loading && (data?.announcements.length ?? 0) === 0 && <p className="text-sm text-slate-400">No announcements yet.</p>}
      </div>

      {showCreate && (
        <CreateAnnouncementModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function CreateAnnouncementModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/announcements', { title, body, audience: 'ALL' });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New Announcement" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} required />
        </div>
        <button className="btn-primary w-full" disabled={submitting}>
          {submitting && <Spinner />} Post Announcement
        </button>
      </form>
    </Modal>
  );
}
