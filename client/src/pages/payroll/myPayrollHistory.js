import { api } from '../../api.js';
import { formatCurrency, esc } from '../../format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { dataTable } from '../../ui/dataTable.js';
import { statusBadge } from '../../ui/statusBadge.js';
import { renderIcons } from '../../icons.js';

export async function render(container) {
  container.innerHTML = `${pageHeader({ title: 'My Payroll', subtitle: 'Your payroll history and payment records.' })}<div class="card"><div id="payslips-table"></div></div>`;
  renderIcons();
  const tableEl = container.querySelector('#payslips-table');
  tableEl.innerHTML = dataTable({ loading: true, data: [], keyFn: () => '', columns: [] });

  const res = await api.get('/payslips');
  const payslips = res.data.payslips;
  tableEl.innerHTML = dataTable({
    loading: false,
    data: payslips,
    keyFn: (p) => p.id,
    columns: [
      { header: 'Period', accessor: (p) => esc(p.period) },
      { header: 'Gross', accessor: (p) => formatCurrency(p.gross) },
      { header: 'Deductions', accessor: (p) => formatCurrency(p.deductions) },
      { header: 'Net Pay', accessor: (p) => `<span class="font-semibold text-slate-900">${formatCurrency(p.net)}</span>` },
      { header: 'Payroll Status', accessor: (p) => statusBadge(p.payrollRun?.status ?? 'COMPLETED') },
    ],
  });
}
