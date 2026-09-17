import { icon, renderIcons } from '../../icons.js';
import { api, apiErrorMessage } from '../../api.js';
import { getState } from '../../auth.js';
import { can } from '../../permissions.js';
import { formatCurrency, formatDate, esc } from '../../format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { dataTable } from '../../ui/dataTable.js';
import { openModal } from '../../ui/modal.js';
import { spinner } from '../../ui/spinner.js';

const FIELDS = [
  { key: 'basic', label: 'Basic' },
  { key: 'hra', label: 'HRA' },
  { key: 'conveyance', label: 'Conveyance' },
  { key: 'medical', label: 'Medical' },
  { key: 'specialAllowance', label: 'Special Allowance' },
  { key: 'providentFund', label: 'Provident Fund' },
  { key: 'professionalTax', label: 'Professional Tax' },
  { key: 'incomeTax', label: 'Income Tax' },
];

export function render(container) {
  const user = getState().user;
  const canCreate = can(user, 'SALARY_STRUCTURE', 'CREATE');
  const local = { structures: [], loading: true };

  async function load() {
    local.loading = true;
    drawTable();
    const res = await api.get('/salary-structures');
    local.structures = res.data.salaryStructures;
    local.loading = false;
    drawTable();
  }

  function draw() {
    container.innerHTML = `
      ${pageHeader({
        title: 'Salary Structure',
        subtitle: 'Configure earnings and deduction components for each employee.',
        actionsHtml: canCreate ? `<button id="new-structure-btn" class="btn-primary">${icon('plus', 'h-4 w-4')} New Structure</button>` : '',
      })}
      <div class="card"><div id="structures-table"></div></div>
    `;
    renderIcons();
    const btn = container.querySelector('#new-structure-btn');
    if (btn) btn.addEventListener('click', () => openAddSalaryModal(() => load()));
    drawTable();
  }

  function drawTable() {
    const tableEl = container.querySelector('#structures-table');
    if (!tableEl) return;
    tableEl.innerHTML = dataTable({
      loading: local.loading,
      data: local.structures,
      keyFn: (s) => s.id,
      columns: [
        { header: 'Employee', accessor: (s) => `${esc(s.employee.firstName)} ${esc(s.employee.lastName)}` },
        { header: 'Basic', accessor: (s) => formatCurrency(s.basic) },
        { header: 'HRA', accessor: (s) => formatCurrency(s.hra) },
        { header: 'Deductions', accessor: (s) => formatCurrency(s.providentFund + s.professionalTax + s.incomeTax + s.otherDeductions) },
        { header: 'CTC', accessor: (s) => `<span class="font-semibold text-slate-900">${formatCurrency(s.ctc)}</span>` },
        { header: 'Effective From', accessor: (s) => formatDate(s.effectiveFrom) },
        { header: 'Active', accessor: (s) => (s.isActive ? 'Yes' : 'No') },
      ],
    });
  }

  draw();
  load();
}

async function openAddSalaryModal(onCreated) {
  const empRes = await api.get('/employees');
  const employees = empRes.data.employees;

  function formHtml(error) {
    return `
      <form id="add-salary-form" class="space-y-4">
        ${error ? `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(error)}</div>` : ''}
        <div>
          <label class="label">Employee</label>
          <select name="employeeId" class="input" required>
            <option value="">Select employee</option>
            ${employees.map((e) => `<option value="${e.id}">${esc(e.firstName)} ${esc(e.lastName)} (${esc(e.employeeCode)})</option>`).join('')}
          </select>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          ${FIELDS.map((f) => `<div><label class="label">${f.label}</label><input type="number" min="0" name="${f.key}" class="input" value="0" /></div>`).join('')}
        </div>
        <button id="save-structure-btn" class="btn-primary w-full">Save Structure</button>
      </form>
    `;
  }

  const modal = openModal({ title: 'New Salary Structure', wide: true, bodyHtml: formHtml(null), onMount: (el) => wire(el) });

  function wire(el) {
    const form = el.querySelector('#add-salary-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('#save-structure-btn');
      btn.disabled = true;
      btn.innerHTML = spinner() + ' Save Structure';
      const fd = new FormData(form);
      const payload = { employeeId: fd.get('employeeId') };
      FIELDS.forEach((f) => {
        payload[f.key] = Number(fd.get(f.key)) || 0;
      });
      try {
        await api.post('/salary-structures', payload);
        modal.close();
        onCreated();
      } catch (err) {
        el.innerHTML = formHtml(apiErrorMessage(err, 'Failed to save salary structure.'));
        wire(el);
      }
    });
  }
}
