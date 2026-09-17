import { icon, renderIcons } from '../../icons.js';
import { api, apiErrorMessage } from '../../api.js';
import { getState } from '../../auth.js';
import { can } from '../../permissions.js';
import { formatDateTime, esc } from '../../format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { openModal } from '../../ui/modal.js';
import { spinner } from '../../ui/spinner.js';

export function render(container) {
  const user = getState().user;
  const canCreate = can(user, 'ANNOUNCEMENTS', 'CREATE');
  const local = { announcements: [], loading: true };

  async function load() {
    local.loading = true;
    draw();
    const res = await api.get('/announcements');
    local.announcements = res.data.announcements;
    local.loading = false;
    draw();
  }

  function draw() {
    container.innerHTML = `
      ${pageHeader({
        title: 'Notifications',
        subtitle: 'Company announcements and updates.',
        actionsHtml: canCreate ? `<button id="new-announcement-btn" class="btn-primary">${icon('plus', 'h-4 w-4')} New Announcement</button>` : '',
      })}
      <div class="space-y-4">
        ${local.loading ? '<p class="text-sm text-slate-400">Loading...</p>' : ''}
        ${local.announcements
          .map(
            (a) => `
          <div class="card">
            <div class="flex items-start gap-3">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">${icon('megaphone', 'h-4.5 w-4.5')}</div>
              <div class="flex-1">
                <div class="flex items-center justify-between">
                  <p class="font-medium text-slate-900">${esc(a.title)}</p>
                  <span class="text-xs text-slate-400">${formatDateTime(a.createdAt)}</span>
                </div>
                <p class="text-sm text-slate-600 mt-1">${esc(a.body)}</p>
                <p class="text-xs text-slate-400 mt-2">Posted by ${esc(a.createdBy?.email)}</p>
              </div>
            </div>
          </div>`
          )
          .join('')}
        ${!local.loading && local.announcements.length === 0 ? '<p class="text-sm text-slate-400">No announcements yet.</p>' : ''}
      </div>
    `;
    renderIcons();
    const btn = container.querySelector('#new-announcement-btn');
    if (btn) btn.addEventListener('click', () => openCreateModal(() => load()));
  }

  draw();
  load();
}

function openCreateModal(onCreated) {
  function formHtml(error) {
    return `
      <form id="create-announcement-form" class="space-y-4">
        ${error ? `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(error)}</div>` : ''}
        <div>
          <label class="label">Title</label>
          <input name="title" class="input" required />
        </div>
        <div>
          <label class="label">Message</label>
          <textarea name="body" class="input" rows="4" required></textarea>
        </div>
        <button id="post-btn" class="btn-primary w-full">Post Announcement</button>
      </form>
    `;
  }

  const modal = openModal({ title: 'New Announcement', bodyHtml: formHtml(null), onMount: (el) => wire(el) });

  function wire(el) {
    const form = el.querySelector('#create-announcement-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('#post-btn');
      btn.disabled = true;
      btn.innerHTML = spinner() + ' Post Announcement';
      const fd = new FormData(form);
      try {
        await api.post('/announcements', { title: fd.get('title'), body: fd.get('body'), audience: 'ALL' });
        modal.close();
        onCreated();
      } catch (err) {
        el.innerHTML = formHtml(apiErrorMessage(err));
        wire(el);
      }
    });
  }
}
