import { renderIcons } from '../../icons.js';
import { api } from '../../api.js';
import { formatDateTime, esc } from '../../format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { dataTable } from '../../ui/dataTable.js';
import { pagination } from '../../ui/pagination.js';

const PAGE_SIZE = 25;
const ENTITY_TYPES = ['User', 'Employee', 'PayrollRun', 'Payslip', 'LeaveRequest', 'SalaryStructure', 'Department', 'Designation', 'CompanySettings', 'RolePermission'];

export function render(container) {
  const local = { action: '', entityType: '', page: 1, logs: [], total: 0, loading: true };
  let debounce = null;

  async function load() {
    local.loading = true;
    drawTable();
    const params = new URLSearchParams({ page: String(local.page), pageSize: String(PAGE_SIZE) });
    if (local.action) params.set('action', local.action);
    if (local.entityType) params.set('entityType', local.entityType);
    const res = await api.get(`/audit-logs?${params.toString()}`);
    local.logs = res.data.logs;
    local.total = res.data.total ?? 0;
    local.loading = false;
    drawTable();
  }

  function draw() {
    container.innerHTML = `
      ${pageHeader({ title: 'Audit Logs', subtitle: 'Track every sensitive action taken across the system.' })}
      <div class="mb-4 flex flex-wrap gap-3">
        <input id="action-filter" class="input w-56" placeholder="Filter by action..." value="${esc(local.action)}" />
        <select id="entity-filter" class="input w-52">
          <option value="">All entity types</option>
          ${ENTITY_TYPES.map((t) => `<option value="${t}" ${t === local.entityType ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="card">
        <div id="audit-table"></div>
        <div id="audit-pagination"></div>
      </div>
    `;
    renderIcons();

    container.querySelector('#action-filter').addEventListener('input', (e) => {
      local.action = e.target.value;
      local.page = 1;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(load, 300);
    });
    container.querySelector('#entity-filter').addEventListener('change', (e) => {
      local.entityType = e.target.value;
      local.page = 1;
      load();
    });

    drawTable();
  }

  function drawTable() {
    const tableEl = container.querySelector('#audit-table');
    const pagEl = container.querySelector('#audit-pagination');
    if (!tableEl) return;
    tableEl.innerHTML = dataTable({
      loading: local.loading,
      data: local.logs,
      keyFn: (l) => l.id,
      columns: [
        { header: 'User', accessor: (l) => esc(l.userName) },
        { header: 'Action', accessor: (l) => esc(l.action.replaceAll('_', ' ')) },
        { header: 'Entity', accessor: (l) => esc(`${l.entityType}${l.entityId ? ` #${l.entityId.slice(0, 8)}` : ''}`) },
        { header: 'IP Address', accessor: (l) => esc(l.ipAddress ?? '—') },
        { header: 'Date/Time', accessor: (l) => formatDateTime(l.createdAt) },
      ],
    });
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
