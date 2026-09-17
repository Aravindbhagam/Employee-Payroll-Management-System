import { icon, renderIcons } from '../../icons.js';
import { api } from '../../api.js';
import { getState } from '../../auth.js';
import { formatDate, esc } from '../../format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { fullPageSpinner } from '../../ui/spinner.js';
import { navigate } from '../../router.js';

export async function render(container) {
  const user = getState().user;
  if (user.role !== 'EMPLOYEE') {
    navigate('/employees');
    return;
  }

  container.innerHTML = fullPageSpinner();
  const empRes = await api.get('/employees');
  const own = empRes.data.employees.find((e) => e.userId === user.id);
  const documents = own ? (await api.get(`/employees/${own.id}/documents`)).data.documents : [];

  container.innerHTML = `
    ${pageHeader({ title: 'My Documents', subtitle: 'View documents on file with HR.' })}
    <div class="card">
      <ul class="divide-y divide-slate-50">
        ${documents
          .map(
            (d) => `
          <li class="flex items-center gap-3 py-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">${icon('file-text', 'h-4 w-4')}</div>
            <div>
              <p class="text-sm font-medium text-slate-700">${esc(d.name)}</p>
              <p class="text-xs text-slate-400">Uploaded ${formatDate(d.uploadedAt)}</p>
            </div>
          </li>`
          )
          .join('')}
        ${documents.length === 0 ? '<p class="text-sm text-slate-400 py-2">No documents on file.</p>' : ''}
      </ul>
    </div>
  `;
  renderIcons();
}
