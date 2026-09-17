import { icon, renderIcons } from '../../icons.js';
import { api, apiErrorMessage } from '../../api.js';
import { getState } from '../../auth.js';
import { can } from '../../permissions.js';
import { formatCurrency, esc } from '../../format.js';
import { statusBadge } from '../../ui/statusBadge.js';
import { statCard } from '../../ui/statCard.js';
import { dataTable } from '../../ui/dataTable.js';
import { fullPageSpinner, spinner } from '../../ui/spinner.js';
import { openModal } from '../../ui/modal.js';

const WORKFLOW_STEPS = ['DRAFT', 'CALCULATING', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'COMPLETED'];

export async function render(container, { params }) {
  const id = params.id;
  const user = getState().user;
  const canProcess = can(user, 'PAYROLL', 'PROCESS');
  const canApprove = can(user, 'PAYROLL', 'APPROVE');
  const local = { run: null, error: null, busy: false };

  container.innerHTML = fullPageSpinner();

  async function load() {
    const res = await api.get(`/payroll/${id}`);
    local.run = res.data.payrollRun;
  }

  async function action(path, body) {
    local.error = null;
    local.busy = true;
    draw();
    try {
      await api.post(`/payroll/${id}/${path}`, body);
      await load();
    } catch (err) {
      local.error = apiErrorMessage(err);
    } finally {
      local.busy = false;
      draw();
    }
  }

  function draw() {
    const run = local.run;
    const stepIndex = WORKFLOW_STEPS.indexOf(run.status);

    let actionsHtml = '';
    if (run.status !== 'REJECTED' && run.status !== 'COMPLETED') {
      if ((run.status === 'DRAFT' || run.status === 'FAILED') && canProcess) {
        actionsHtml += `<button class="btn-primary" id="calculate-btn" ${local.busy ? 'disabled' : ''}>${local.busy ? spinner() : icon('calculator', 'h-4 w-4')} Calculate Payroll</button>`;
      }
      if (run.status === 'PENDING_REVIEW' && canProcess) {
        actionsHtml += `<button class="btn-primary" id="submit-btn" ${local.busy ? 'disabled' : ''}>${local.busy ? spinner() : icon('send', 'h-4 w-4')} Submit for Approval</button>`;
      }
      if (run.status === 'PENDING_APPROVAL' && canApprove) {
        actionsHtml += `<button class="btn-primary" id="approve-btn" ${local.busy ? 'disabled' : ''}>${local.busy ? spinner() : icon('check-circle-2', 'h-4 w-4')} Approve</button>`;
        actionsHtml += `<button class="btn-danger" id="reject-btn" ${local.busy ? 'disabled' : ''}>${icon('x-circle', 'h-4 w-4')} Reject</button>`;
      }
      if (run.status === 'APPROVED' && canProcess) {
        actionsHtml += `<button class="btn-primary" id="process-btn" ${local.busy ? 'disabled' : ''}>${local.busy ? spinner() : icon('play-circle', 'h-4 w-4')} Process Payroll</button>`;
      }
    }

    container.innerHTML = `
      <div>
        <button id="back-btn" class="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">${icon('arrow-left', 'h-4 w-4')} Back to Payroll</button>

        <div class="card mb-6">
          <div class="flex items-center justify-between flex-wrap gap-4 mb-6">
            <div>
              <h1 class="text-lg font-semibold text-slate-900">Payroll Run — ${esc(run.period)}</h1>
              <div class="mt-1">${statusBadge(run.status)}</div>
            </div>
            <div class="flex flex-wrap gap-2">${actionsHtml}</div>
          </div>

          ${local.error ? `<div class="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(local.error)}</div>` : ''}
          ${run.rejectionReason ? `<div class="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700"><strong>Rejected:</strong> ${esc(run.rejectionReason)}</div>` : ''}

          ${
            run.status !== 'REJECTED'
              ? `<div class="flex items-center overflow-x-auto pb-2">
                  ${WORKFLOW_STEPS.map(
                    (step, i) => `
                    <div class="flex items-center shrink-0">
                      <div class="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] font-semibold ${i <= stepIndex ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400'}">${i + 1}</div>
                      <span class="ml-1.5 mr-3 text-xs whitespace-nowrap ${i <= stepIndex ? 'text-slate-700 font-medium' : 'text-slate-400'}">${esc(step.replaceAll('_', ' '))}</span>
                      ${i < WORKFLOW_STEPS.length - 1 ? `<div class="h-px w-6 shrink-0 ${i < stepIndex ? 'bg-brand-600' : 'bg-slate-200'}"></div>` : ''}
                    </div>`
                  ).join('')}
                </div>`
              : ''
          }
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          ${statCard({ label: 'Employees', value: run.employeeCount, iconName: 'users', tone: 'brand' })}
          ${statCard({ label: 'Total Gross', value: formatCurrency(run.totalGross), iconName: 'trending-up', tone: 'slate' })}
          ${statCard({ label: 'Total Deductions', value: formatCurrency(run.totalDeductions), iconName: 'trending-down', tone: 'amber' })}
          ${statCard({ label: 'Total Net', value: formatCurrency(run.totalNet), iconName: 'wallet', tone: 'emerald' })}
        </div>

        <div class="card">
          <h3 class="text-sm font-semibold text-slate-900 mb-4">Payslips</h3>
          ${dataTable({
            data: run.payslips || [],
            keyFn: (p) => p.id,
            emptyMessage: 'No payslips generated yet. Calculate payroll to generate them.',
            columns: [
              { header: 'Employee', accessor: (p) => `${esc(p.employee.firstName)} ${esc(p.employee.lastName)}` },
              { header: 'Department', accessor: (p) => esc(p.employee.department?.name ?? '—') },
              { header: 'Gross', accessor: (p) => formatCurrency(p.gross) },
              { header: 'Deductions', accessor: (p) => formatCurrency(p.deductions) },
              { header: 'Net', accessor: (p) => `<span class="font-semibold text-slate-900">${formatCurrency(p.net)}</span>` },
            ],
          })}
        </div>
      </div>
    `;
    renderIcons();
    wire();
  }

  function wire() {
    container.querySelector('#back-btn').addEventListener('click', () => (location.hash = '#/payroll'));
    const calc = container.querySelector('#calculate-btn');
    if (calc) calc.addEventListener('click', () => action('calculate'));
    const submit = container.querySelector('#submit-btn');
    if (submit) submit.addEventListener('click', () => action('submit'));
    const approve = container.querySelector('#approve-btn');
    if (approve) approve.addEventListener('click', () => action('approve'));
    const process = container.querySelector('#process-btn');
    if (process) process.addEventListener('click', () => action('process'));
    const reject = container.querySelector('#reject-btn');
    if (reject) reject.addEventListener('click', () => openRejectModal());
  }

  function openRejectModal() {
    const modal = openModal({
      title: 'Reject Payroll Run',
      bodyHtml: `
        <div class="space-y-3">
          <label class="label">Rejection reason</label>
          <textarea id="reject-reason" class="input" rows="3" required></textarea>
          <div class="flex gap-3">
            <button id="reject-cancel" class="btn-secondary flex-1">Cancel</button>
            <button id="reject-confirm" class="btn-danger flex-1" disabled>Reject Run</button>
          </div>
        </div>
      `,
      onMount(el, close) {
        const textarea = el.querySelector('#reject-reason');
        const confirmBtn = el.querySelector('#reject-confirm');
        textarea.addEventListener('input', () => {
          confirmBtn.disabled = !textarea.value.trim();
        });
        el.querySelector('#reject-cancel').addEventListener('click', close);
        confirmBtn.addEventListener('click', async () => {
          close();
          await action('reject', { reason: textarea.value });
        });
      },
    });
    return modal;
  }

  try {
    await load();
  } catch (err) {
    container.innerHTML = `<p class="text-sm text-red-600">${esc(apiErrorMessage(err, 'Failed to load payroll run.'))}</p>`;
    return;
  }
  draw();
}
