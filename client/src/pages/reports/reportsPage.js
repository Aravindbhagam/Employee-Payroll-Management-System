import { icon, renderIcons } from '../../icons.js';
import { api } from '../../api.js';
import { getState } from '../../auth.js';
import { can } from '../../permissions.js';
import { esc } from '../../format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { dataTable } from '../../ui/dataTable.js';

const REPORT_TYPES = [
  { value: 'employees', label: 'Employee Directory' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'leave', label: 'Leave' },
  { value: 'payroll', label: 'Payroll Summary' },
];

export function render(container) {
  const user = getState().user;
  const canExport = can(user, 'REPORTS', 'EXPORT');
  const availableTypes = REPORT_TYPES.filter((t) => {
    if (t.value === 'payroll') return user.role === 'SUPER_ADMIN' || user.role === 'PAYROLL_ADMIN';
    if (t.value === 'attendance') return user.role !== 'PAYROLL_ADMIN';
    return true;
  });

  const local = { type: availableTypes[0]?.value ?? 'employees', rows: [], loading: true };

  async function load() {
    local.loading = true;
    drawTable();
    const res = await api.get(`/reports?type=${local.type}`);
    local.rows = res.data.rows;
    local.loading = false;
    drawTable();
  }

  async function download() {
    const blob = await api.getBlob(`/reports?type=${local.type}&format=csv`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${local.type}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function draw() {
    container.innerHTML = `
      ${pageHeader({
        title: user.role === 'MANAGER' ? 'Team Reports' : 'Reports',
        subtitle: 'Generate and export operational reports.',
        actionsHtml: canExport ? `<button id="export-btn" class="btn-secondary">${icon('download', 'h-4 w-4')} Export CSV</button>` : '',
      })}
      <div class="mb-4 flex gap-2 flex-wrap">
        ${availableTypes
          .map(
            (t) => `<button data-type="${t.value}" class="px-3 py-1.5 rounded-lg text-sm font-medium border ${
              local.type === t.value ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }">${esc(t.label)}</button>`
          )
          .join('')}
      </div>
      <div class="card"><div id="report-table"></div></div>
    `;
    renderIcons();

    const exportBtn = container.querySelector('#export-btn');
    if (exportBtn) exportBtn.addEventListener('click', download);
    container.querySelectorAll('[data-type]').forEach((btn) =>
      btn.addEventListener('click', () => {
        local.type = btn.getAttribute('data-type');
        draw();
        load();
      })
    );

    drawTable();
  }

  function drawTable() {
    const tableEl = container.querySelector('#report-table');
    if (!tableEl) return;
    const columns = local.rows.length > 0 ? Object.keys(local.rows[0]).map((key) => ({ header: key, accessor: (r) => esc(String(r[key])) })) : [];
    tableEl.innerHTML = dataTable({ loading: local.loading, data: local.rows, keyFn: (r) => JSON.stringify(r), columns, emptyMessage: 'No data available.' });
  }

  draw();
  load();
}
