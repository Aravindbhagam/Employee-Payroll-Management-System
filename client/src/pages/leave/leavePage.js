import { icon, renderIcons } from '../../icons.js';
import { api, apiErrorMessage } from '../../api.js';
import { getState } from '../../auth.js';
import { can } from '../../permissions.js';
import { formatDate, esc } from '../../format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { dataTable } from '../../ui/dataTable.js';
import { pagination } from '../../ui/pagination.js';
import { statusBadge } from '../../ui/statusBadge.js';
import { spinner } from '../../ui/spinner.js';
import { openModal } from '../../ui/modal.js';

const PAGE_SIZE = 25;
const LEAVE_TYPES = ['ANNUAL', 'SICK', 'CASUAL', 'UNPAID', 'MATERNITY', 'PATERNITY', 'OTHER'];

export function render(container) {
  const user = getState().user;
  const canApprove = can(user, 'LEAVE', 'APPROVE');
  const canApply = can(user, 'LEAVE', 'CREATE');
  const showEmployeeColumn = user.role !== 'EMPLOYEE';
  const local = { page: 1, error: null, requests: [], total: 0, loading: true, balances: [] };

  async function load() {
    local.loading = true;
    drawTable();
    const [reqRes, balRes] = await Promise.all([api.get(`/leave?page=${local.page}&pageSize=${PAGE_SIZE}`), api.get('/leave/balances')]);
    local.requests = reqRes.data.leaveRequests;
    local.total = reqRes.data.total ?? 0;
    local.balances = balRes.data.balances;
    local.loading = false;
    draw();
  }

  function draw() {
    container.innerHTML = `
      ${pageHeader({
        title: user.role === 'MANAGER' ? 'Leave Requests' : 'Leave Management',
        subtitle: 'Apply for leave, track balances, and manage approvals.',
        actionsHtml: canApply ? `<button id="apply-btn" class="btn-primary">${icon('plus', 'h-4 w-4')} Apply for Leave</button>` : '',
      })}

      ${local.error ? `<div class="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(local.error)}</div>` : ''}

      ${
        local.balances.length > 0
          ? `<div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              ${local.balances
                .map(
                  (b) => `
                <div class="card text-center py-4">
                  <p class="text-2xl font-semibold text-slate-900">${b.allocated - b.used}</p>
                  <p class="text-xs text-slate-500 mt-1">${esc(b.leaveType)} days left</p>
                </div>`
                )
                .join('')}
            </div>`
          : ''
      }

      <div class="card">
        <div id="leave-table"></div>
        <div id="leave-pagination"></div>
      </div>
    `;
    renderIcons();

    const applyBtn = container.querySelector('#apply-btn');
    if (applyBtn) applyBtn.addEventListener('click', () => openApplyLeaveModal(() => load()));

    drawTable();
  }

  function drawTable() {
    const tableEl = container.querySelector('#leave-table');
    const pagEl = container.querySelector('#leave-pagination');
    if (!tableEl) return;

    const columns = [];
    if (showEmployeeColumn) columns.push({ header: 'Employee', accessor: (r) => `${esc(r.employee.firstName)} ${esc(r.employee.lastName)}` });
    columns.push(
      { header: 'Type', accessor: (r) => esc(r.leaveType) },
      { header: 'From', accessor: (r) => formatDate(r.startDate) },
      { header: 'To', accessor: (r) => formatDate(r.endDate) },
      { header: 'Days', accessor: (r) => r.days },
      { header: 'Status', accessor: (r) => statusBadge(r.status) },
      {
        header: '',
        accessor: (r) => {
          let actions = '';
          if (r.status === 'PENDING' && canApprove) {
            actions += `<button class="text-emerald-600 hover:text-emerald-700" data-approve="${r.id}" title="Approve">${icon('check', 'h-4 w-4')}</button>`;
            actions += `<button class="text-red-600 hover:text-red-700" data-reject="${r.id}" title="Reject">${icon('x', 'h-4 w-4')}</button>`;
          }
          if (r.status === 'PENDING' && user.role === 'EMPLOYEE') {
            actions += `<button class="text-xs text-slate-400 hover:text-red-600" data-cancel="${r.id}">Cancel</button>`;
          }
          return `<div class="flex gap-2">${actions}</div>`;
        },
      }
    );

    tableEl.innerHTML = dataTable({ loading: local.loading, data: local.requests, keyFn: (r) => r.id, columns });
    if (pagEl) {
      pagEl.innerHTML = pagination({ page: local.page, pageSize: PAGE_SIZE, total: local.total });
      const prev = pagEl.querySelector('[data-action="prev-page"]');
      const next = pagEl.querySelector('[data-action="next-page"]');
      if (prev) prev.addEventListener('click', () => { local.page -= 1; load(); });
      if (next) next.addEventListener('click', () => { local.page += 1; load(); });
    }
    renderIcons();

    tableEl.querySelectorAll('[data-approve]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        local.error = null;
        try {
          await api.post(`/leave/${btn.getAttribute('data-approve')}/approve`);
          await load();
        } catch (err) {
          local.error = apiErrorMessage(err);
          draw();
        }
      })
    );
    tableEl.querySelectorAll('[data-reject]').forEach((btn) =>
      btn.addEventListener('click', () => openRejectModal(btn.getAttribute('data-reject'), () => load()))
    );
    tableEl.querySelectorAll('[data-cancel]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        local.error = null;
        try {
          await api.post(`/leave/${btn.getAttribute('data-cancel')}/cancel`);
          await load();
        } catch (err) {
          local.error = apiErrorMessage(err);
          draw();
        }
      })
    );
  }

  function openRejectModal(id, onDone) {
    const modal = openModal({
      title: 'Reject leave request',
      bodyHtml: `
        <div class="space-y-3">
          <label class="label">Reason (optional)</label>
          <textarea id="reject-reason" class="input" rows="3"></textarea>
          <div class="flex gap-3">
            <button id="reject-cancel" class="btn-secondary flex-1">Cancel</button>
            <button id="reject-confirm" class="btn-danger flex-1">Reject Request</button>
          </div>
        </div>
      `,
      onMount(el, close) {
        el.querySelector('#reject-cancel').addEventListener('click', close);
        el.querySelector('#reject-confirm').addEventListener('click', async () => {
          try {
            await api.post(`/leave/${id}/reject`, { reason: el.querySelector('#reject-reason').value });
            close();
            onDone();
          } catch (err) {
            local.error = apiErrorMessage(err);
            close();
            draw();
          }
        });
      },
    });
    return modal;
  }

  draw();
  load();
}

function openApplyLeaveModal(onCreated) {
  const modal = openModal({
    title: 'Apply for Leave',
    bodyHtml: formHtml(null),
    onMount: (el) => wire(el),
  });

  function formHtml(error) {
    return `
      <form id="apply-leave-form" class="space-y-4">
        ${error ? `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(error)}</div>` : ''}
        <div>
          <label class="label">Leave Type</label>
          <select name="leaveType" class="input">
            ${LEAVE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="label">Start Date</label>
            <input type="date" name="startDate" class="input" required />
          </div>
          <div>
            <label class="label">End Date</label>
            <input type="date" name="endDate" class="input" required />
          </div>
        </div>
        <div>
          <label class="label">Reason</label>
          <textarea name="reason" class="input" rows="3"></textarea>
        </div>
        <button id="apply-submit" class="btn-primary w-full">Submit Request</button>
      </form>
    `;
  }

  function wire(el) {
    const form = el.querySelector('#apply-leave-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('#apply-submit');
      submitBtn.disabled = true;
      submitBtn.innerHTML = spinner() + ' Submit Request';
      const fd = new FormData(form);
      try {
        await api.post('/leave', {
          leaveType: fd.get('leaveType'),
          startDate: fd.get('startDate'),
          endDate: fd.get('endDate'),
          reason: fd.get('reason'),
        });
        modal.close();
        onCreated();
      } catch (err) {
        el.innerHTML = formHtml(apiErrorMessage(err, 'Failed to submit leave request.'));
        wire(el);
      }
    });
  }
}
