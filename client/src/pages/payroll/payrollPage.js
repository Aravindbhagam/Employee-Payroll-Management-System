import { icon, renderIcons } from '../../icons.js';
import { api, apiErrorMessage } from '../../api.js';
import { getState } from '../../auth.js';
import { can } from '../../permissions.js';
import { formatCurrency, formatDate, esc } from '../../format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { dataTable } from '../../ui/dataTable.js';
import { statusBadge } from '../../ui/statusBadge.js';
import { openModal } from '../../ui/modal.js';
import { spinner } from '../../ui/spinner.js';
import { navigate } from '../../router.js';
import { render as renderMyPayrollHistory } from './myPayrollHistory.js';

export function render(container, ctx) {
  const user = getState().user;
  if (user.role === 'EMPLOYEE') return renderMyPayrollHistory(container, ctx);
  return renderPayrollAdmin(container);
}

async function renderPayrollAdmin(container) {
  const user = getState().user;
  const canCreate = can(user, 'PAYROLL', 'CREATE');
  const local = { runs: [], loading: true };

  async function load() {
    local.loading = true;
    drawTable();
    const res = await api.get('/payroll');
    local.runs = res.data.payrollRuns;
    local.loading = false;
    drawTable();
  }

  function draw() {
    container.innerHTML = `
      ${pageHeader({
        title: 'Payroll',
        subtitle: 'Calculate, review, approve, and process payroll runs.',
        actionsHtml: canCreate ? `<button id="new-run-btn" class="btn-primary">${icon('plus', 'h-4 w-4')} New Payroll Run</button>` : '',
      })}
      <div class="card"><div id="payroll-table"></div></div>
    `;
    renderIcons();
    const btn = container.querySelector('#new-run-btn');
    if (btn) btn.addEventListener('click', () => openCreateRunModal((id) => { load(); navigate(`/payroll/${id}`); }));
    drawTable();
  }

  function drawTable() {
    const tableEl = container.querySelector('#payroll-table');
    if (!tableEl) return;
    tableEl.innerHTML = dataTable({
      loading: local.loading,
      data: local.runs,
      keyFn: (r) => r.id,
      columns: [
        { header: 'Period', accessor: (r) => `<button class="font-medium text-brand-600 hover:text-brand-700" data-view="${r.id}">${esc(r.period)}</button>` },
        { header: 'Employees', accessor: (r) => r._count?.payslips ?? r.employeeCount },
        { header: 'Gross', accessor: (r) => formatCurrency(r.totalGross) },
        { header: 'Net', accessor: (r) => formatCurrency(r.totalNet) },
        { header: 'Status', accessor: (r) => statusBadge(r.status) },
        { header: 'Created', accessor: (r) => formatDate(r.createdAt) },
      ],
    });
    tableEl.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => navigate(`/payroll/${el.getAttribute('data-view')}`)));
  }

  draw();
  load();
}

function openCreateRunModal(onCreated) {
  function formHtml(error) {
    return `
      <form id="create-run-form" class="space-y-4">
        ${error ? `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(error)}</div>` : ''}
        <div>
          <label class="label">Pay Period</label>
          <input type="month" name="period" class="input" value="${new Date().toISOString().slice(0, 7)}" required />
        </div>
        <button id="create-run-submit" class="btn-primary w-full">Create Run</button>
      </form>
    `;
  }

  const modal = openModal({ title: 'New Payroll Run', bodyHtml: formHtml(null), onMount: (el) => wire(el) });

  function wire(el) {
    const form = el.querySelector('#create-run-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('#create-run-submit');
      btn.disabled = true;
      btn.innerHTML = spinner() + ' Create Run';
      try {
        const res = await api.post('/payroll', { period: form.elements.period.value });
        modal.close();
        onCreated(res.data.payrollRun.id);
      } catch (err) {
        el.innerHTML = formHtml(apiErrorMessage(err, 'Failed to create payroll run.'));
        wire(el);
      }
    });
  }
}
