import { icon, renderIcons } from '../../icons.js';
import { api } from '../../api.js';
import { getState } from '../../auth.js';
import { formatCurrency, formatDate, esc } from '../../format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { dataTable } from '../../ui/dataTable.js';
import { openModal } from '../../ui/modal.js';

export async function render(container) {
  const user = getState().user;
  const showEmployeeColumn = user.role !== 'EMPLOYEE';

  container.innerHTML = `${pageHeader({ title: 'Payslips', subtitle: 'View and download generated payslips.' })}<div class="card"><div id="payslips-table"></div></div>`;
  renderIcons();
  const tableEl = container.querySelector('#payslips-table');
  tableEl.innerHTML = dataTable({ loading: true, data: [], keyFn: () => '', columns: [] });

  const res = await api.get('/payslips');
  const payslips = res.data.payslips;

  const columns = [];
  if (showEmployeeColumn) columns.push({ header: 'Employee', accessor: (p) => `${esc(p.employee.firstName)} ${esc(p.employee.lastName)}` });
  columns.push(
    { header: 'Period', accessor: (p) => esc(p.period) },
    { header: 'Gross', accessor: (p) => formatCurrency(p.gross) },
    { header: 'Net Pay', accessor: (p) => `<span class="font-semibold text-slate-900">${formatCurrency(p.net)}</span>` },
    { header: 'Generated', accessor: (p) => formatDate(p.generatedAt) },
    {
      header: '',
      accessor: (p) => `
        <div class="flex gap-3">
          <button class="text-brand-600 hover:text-brand-700" title="View" data-view="${p.id}">${icon('eye', 'h-4 w-4')}</button>
          <button class="text-slate-500 hover:text-slate-700" title="Download" data-download="${p.id}">${icon('download', 'h-4 w-4')}</button>
        </div>`,
    }
  );

  tableEl.innerHTML = dataTable({ loading: false, data: payslips, keyFn: (p) => p.id, columns });
  renderIcons();

  tableEl.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => openPayslipModal(el.getAttribute('data-view'))));
  tableEl.querySelectorAll('[data-download]').forEach((el) => el.addEventListener('click', () => downloadPayslip(el.getAttribute('data-download'))));
}

async function downloadPayslip(id) {
  const res = await api.get(`/payslips/${id}`);
  const p = res.data.payslip;
  const lines = [
    `Payslip - ${p.period}`,
    `Employee: ${p.employee.firstName} ${p.employee.lastName} (${p.employee.user.employeeCode})`,
    `Department: ${p.employee.department?.name ?? '-'}  Designation: ${p.employee.designation?.title ?? '-'}`,
    '',
    'Earnings:',
    ...Object.entries(p.breakdown.earnings).map(([k, v]) => `  ${k}: ${formatCurrency(v)}`),
    '',
    'Deductions:',
    ...Object.entries(p.breakdown.deductions).map(([k, v]) => `  ${k}: ${formatCurrency(v)}`),
    '',
    `Gross Pay: ${formatCurrency(p.gross)}`,
    `Total Deductions: ${formatCurrency(p.deductions)}`,
    `Net Pay: ${formatCurrency(p.net)}`,
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Payslip-${p.employee.user.employeeCode}-${p.period}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function capitalizeSplit(k) {
  return k.replace(/([A-Z])/g, ' $1');
}

async function openPayslipModal(id) {
  const modal = openModal({ title: 'Payslip', bodyHtml: '<p class="text-sm text-slate-400">Loading...</p>' });
  const res = await api.get(`/payslips/${id}`);
  const p = res.data.payslip;

  const earningsHtml = Object.entries(p.breakdown.earnings)
    .map(([k, v]) => `<div class="flex justify-between py-0.5"><span class="text-slate-500 capitalize">${esc(capitalizeSplit(k))}</span><span>${formatCurrency(v)}</span></div>`)
    .join('');
  const deductionsHtml = Object.entries(p.breakdown.deductions)
    .map(([k, v]) => `<div class="flex justify-between py-0.5"><span class="text-slate-500 capitalize">${esc(capitalizeSplit(k))}</span><span>${formatCurrency(v)}</span></div>`)
    .join('');

  modal.el.innerHTML = `
    <div class="space-y-4 text-sm">
      <div>
        <p class="font-medium text-slate-800">${esc(p.employee.firstName)} ${esc(p.employee.lastName)}</p>
        <p class="text-xs text-slate-400">${esc(p.employee.department?.name)} &middot; ${esc(p.employee.designation?.title)}</p>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase text-slate-400 mb-2">Earnings</p>
        ${earningsHtml}
      </div>
      <div>
        <p class="text-xs font-semibold uppercase text-slate-400 mb-2">Deductions</p>
        ${deductionsHtml}
      </div>
      <div class="border-t border-slate-100 pt-3 flex justify-between font-semibold text-slate-900">
        <span>Net Pay</span>
        <span>${formatCurrency(p.net)}</span>
      </div>
    </div>
  `;
  // The title was set to a generic "Payslip" before we knew the period; refresh it now.
  const titleEl = modal.el.closest('.rounded-xl2')?.querySelector('h2');
  if (titleEl) titleEl.textContent = `Payslip — ${p.period}`;
}
