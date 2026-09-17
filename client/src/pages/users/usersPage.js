import { icon, renderIcons } from '../../icons.js';
import { api, apiErrorMessage } from '../../api.js';
import { ROLE_LABELS } from '../../permissions.js';
import { formatDateTime, initials, esc } from '../../format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { dataTable } from '../../ui/dataTable.js';
import { pagination } from '../../ui/pagination.js';
import { statusBadge } from '../../ui/statusBadge.js';
import { openModal } from '../../ui/modal.js';
import { openAddEmployeeModal } from '../employees/addEmployeeModal.js';
import { openUserPermissionsModal } from './userPermissionsModal.js';
import { render as renderPermissionMatrix } from './permissionMatrix.js';

const PAGE_SIZE = 25;

export function render(container) {
  const local = { tab: 'users', page: 1, error: null, users: [], total: 0, loading: true };

  async function load() {
    local.loading = true;
    drawTable();
    const res = await api.get(`/users?page=${local.page}&pageSize=${PAGE_SIZE}`);
    local.users = res.data.users;
    local.total = res.data.total ?? 0;
    local.loading = false;
    drawTable();
  }

  function draw() {
    container.innerHTML = `
      ${pageHeader({
        title: 'Users & Roles',
        subtitle: 'Manage user accounts, roles, and permissions.',
        actionsHtml: local.tab === 'users' ? `<button id="create-user-btn" class="btn-primary">${icon('plus', 'h-4 w-4')} Create User</button>` : '',
      })}

      <div class="mb-4 flex gap-2 border-b border-slate-200">
        <button data-tab="users" class="px-3 py-2 text-sm font-medium border-b-2 -mb-px ${local.tab === 'users' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}">Users</button>
        <button data-tab="matrix" class="px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1 ${local.tab === 'matrix' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}">
          ${icon('shield-check', 'h-3.5 w-3.5')} Role Permission Matrix
        </button>
      </div>

      ${local.error ? `<div class="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(local.error)}</div>` : ''}

      <div id="tab-content"></div>
    `;
    renderIcons();

    const createBtn = container.querySelector('#create-user-btn');
    if (createBtn) createBtn.addEventListener('click', () => openAddEmployeeModal({ onClose() {}, onCreated: () => load() }));
    container.querySelectorAll('[data-tab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        local.tab = btn.getAttribute('data-tab');
        draw();
      })
    );

    if (local.tab === 'matrix') {
      renderPermissionMatrix(container.querySelector('#tab-content'));
    } else {
      container.querySelector('#tab-content').innerHTML = `<div class="card"><div id="users-table"></div><div id="users-pagination"></div></div>`;
      drawTable();
    }
  }

  function drawTable() {
    const tableEl = container.querySelector('#users-table');
    const pagEl = container.querySelector('#users-pagination');
    if (!tableEl) return;

    tableEl.innerHTML = dataTable({
      loading: local.loading,
      data: local.users,
      keyFn: (u) => u.id,
      columns: [
        {
          header: 'User',
          accessor: (u) => {
            const nameParts = (u.name || '').split(' ');
            return `
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">${esc(initials(nameParts[0], nameParts[1]))}</div>
                <div>
                  <p class="font-medium text-slate-800">${esc(u.name)}</p>
                  <p class="text-xs text-slate-400">${esc(u.email)}</p>
                </div>
              </div>`;
          },
        },
        { header: 'Role', accessor: (u) => esc(ROLE_LABELS[u.role] ?? u.role) },
        { header: 'Department', accessor: (u) => esc(u.department?.name ?? '—') },
        { header: 'Status', accessor: (u) => statusBadge(u.lockedUntil ? 'LOCKED' : u.status) },
        { header: 'Last Login', accessor: (u) => formatDateTime(u.lastLoginAt) },
        {
          header: 'Actions',
          accessor: (u) => `
            <div class="flex gap-2">
              <button class="text-slate-400 hover:text-brand-600" title="Permissions" data-perms="${u.id}">${icon('shield-check', 'h-4 w-4')}</button>
              <button class="text-slate-400 hover:text-amber-600" title="Reset password" data-reset="${u.id}" data-email="${esc(u.email)}">${icon('key-round', 'h-4 w-4')}</button>
              <button class="text-slate-400 hover:text-red-600" title="${u.lockedUntil ? 'Unlock' : 'Lock'}" data-lock="${u.id}" data-locked="${u.lockedUntil ? '1' : ''}">${icon(u.lockedUntil ? 'unlock' : 'lock', 'h-4 w-4')}</button>
              <button class="text-slate-400 hover:text-slate-700" title="${u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}" data-status="${u.id}" data-active="${u.status === 'ACTIVE' ? '1' : ''}">${icon(u.status === 'ACTIVE' ? 'ban' : 'check-circle', 'h-4 w-4')}</button>
            </div>`,
        },
      ],
    });

    if (pagEl) {
      pagEl.innerHTML = pagination({ page: local.page, pageSize: PAGE_SIZE, total: local.total });
      const prev = pagEl.querySelector('[data-action="prev-page"]');
      const next = pagEl.querySelector('[data-action="next-page"]');
      if (prev) prev.addEventListener('click', () => { local.page -= 1; load(); });
      if (next) next.addEventListener('click', () => { local.page += 1; load(); });
    }
    renderIcons();

    tableEl.querySelectorAll('[data-perms]').forEach((btn) => btn.addEventListener('click', () => openUserPermissionsModal(btn.getAttribute('data-perms'))));
    tableEl.querySelectorAll('[data-reset]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        local.error = null;
        try {
          const res = await api.post(`/users/${btn.getAttribute('data-reset')}/reset-password`);
          openPasswordResetResultModal(btn.getAttribute('data-email'), res.data.temporaryPassword);
        } catch (err) {
          local.error = apiErrorMessage(err);
          draw();
        }
      })
    );
    tableEl.querySelectorAll('[data-lock]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        local.error = null;
        const isLocked = btn.getAttribute('data-locked') === '1';
        try {
          await api.post(`/users/${btn.getAttribute('data-lock')}/${isLocked ? 'unlock' : 'lock'}`);
          await load();
        } catch (err) {
          local.error = apiErrorMessage(err);
          draw();
        }
      })
    );
    tableEl.querySelectorAll('[data-status]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        local.error = null;
        const isActive = btn.getAttribute('data-active') === '1';
        try {
          await api.post(`/users/${btn.getAttribute('data-status')}/${isActive ? 'deactivate' : 'activate'}`);
          await load();
        } catch (err) {
          local.error = apiErrorMessage(err);
          draw();
        }
      })
    );
  }

  draw();
  load();
}

function openPasswordResetResultModal(email, password) {
  openModal({
    title: 'Password Reset',
    bodyHtml: `
      <div class="space-y-3 text-sm">
        <p class="text-slate-600">A new temporary password has been generated for ${esc(email)}.</p>
        <div class="rounded-lg bg-slate-50 border border-slate-100 p-3 font-mono">${esc(password)}</div>
        <p class="text-xs text-slate-400">All existing sessions for this user have been revoked.</p>
        <button id="done-btn" class="btn-primary w-full">Done</button>
      </div>
    `,
    onMount(el, close) {
      el.querySelector('#done-btn').addEventListener('click', close);
    },
  });
}
