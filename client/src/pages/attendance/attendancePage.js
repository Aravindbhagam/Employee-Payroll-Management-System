import { icon, renderIcons } from '../../icons.js';
import { api, apiErrorMessage } from '../../api.js';
import { getState } from '../../auth.js';
import { formatDate, esc } from '../../format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { dataTable } from '../../ui/dataTable.js';
import { pagination } from '../../ui/pagination.js';
import { statusBadge } from '../../ui/statusBadge.js';
import { spinner } from '../../ui/spinner.js';

const PAGE_SIZE = 25;

export function render(container) {
  const user = getState().user;
  const local = { month: new Date().toISOString().slice(0, 7), page: 1, error: null, busy: null, attendance: [], total: 0, loading: true };
  const showTeamColumns = user.role !== 'EMPLOYEE';

  async function load() {
    local.loading = true;
    drawTable();
    const res = await api.get(`/attendance?month=${local.month}&page=${local.page}&pageSize=${PAGE_SIZE}`);
    local.attendance = res.data.attendance;
    local.total = res.data.total ?? 0;
    local.loading = false;
    drawTable();
  }

  function draw() {
    const showActions = user.role === 'EMPLOYEE' || user.role === 'MANAGER';
    container.innerHTML = `
      ${pageHeader({
        title: user.role === 'MANAGER' ? 'Team Attendance' : 'Attendance',
        subtitle: 'Track daily check-ins, check-outs, and attendance status.',
        actionsHtml: showActions
          ? `<button id="check-in-btn" class="btn-secondary" ${local.busy ? 'disabled' : ''}>${local.busy === 'in' ? spinner() : icon('log-in', 'h-4 w-4')} Check In</button>
             <button id="check-out-btn" class="btn-primary" ${local.busy ? 'disabled' : ''}>${local.busy === 'out' ? spinner() : icon('log-out', 'h-4 w-4')} Check Out</button>`
          : '',
      })}

      ${local.error ? `<div class="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(local.error)}</div>` : ''}

      <div class="card">
        <div class="mb-4 flex items-center gap-2">
          <label class="label mb-0">Month</label>
          <input type="month" id="month-input" class="input w-auto" value="${local.month}" />
        </div>
        <div id="attendance-table"></div>
        <div id="attendance-pagination"></div>
      </div>
    `;
    renderIcons();

    if (showActions) {
      container.querySelector('#check-in-btn').addEventListener('click', () => doAction('in', '/attendance/check-in'));
      container.querySelector('#check-out-btn').addEventListener('click', () => doAction('out', '/attendance/check-out'));
    }
    container.querySelector('#month-input').addEventListener('change', (e) => {
      local.month = e.target.value;
      local.page = 1;
      load();
    });

    drawTable();
  }

  async function doAction(which, path) {
    local.busy = which;
    local.error = null;
    draw();
    try {
      await api.post(path);
      await load();
    } catch (err) {
      local.error = apiErrorMessage(err);
    } finally {
      local.busy = null;
      draw();
    }
  }

  function drawTable() {
    const tableEl = container.querySelector('#attendance-table');
    const pagEl = container.querySelector('#attendance-pagination');
    if (!tableEl) return;

    const columns = [];
    if (showTeamColumns) columns.push({ header: 'Employee', accessor: (a) => `${esc(a.employee.firstName)} ${esc(a.employee.lastName)}` });
    columns.push(
      { header: 'Date', accessor: (a) => formatDate(a.date) },
      { header: 'Check In', accessor: (a) => esc(a.checkIn ? a.checkIn.slice(11, 16) : '—') },
      { header: 'Check Out', accessor: (a) => esc(a.checkOut ? a.checkOut.slice(11, 16) : '—') },
      { header: 'Hours', accessor: (a) => a.hoursWorked },
      { header: 'Status', accessor: (a) => statusBadge(a.status) }
    );

    tableEl.innerHTML = dataTable({ loading: local.loading, data: local.attendance, keyFn: (a) => a.id, columns });
    if (pagEl) {
      pagEl.innerHTML = pagination({ page: local.page, pageSize: PAGE_SIZE, total: local.total });
      const prev = pagEl.querySelector('[data-action="prev-page"]');
      const next = pagEl.querySelector('[data-action="next-page"]');
      if (prev) prev.addEventListener('click', () => { local.page -= 1; load(); });
      if (next) next.addEventListener('click', () => { local.page += 1; load(); });
    }
  }

  draw();
  load();
}
