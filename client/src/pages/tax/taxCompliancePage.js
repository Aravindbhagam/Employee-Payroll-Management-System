import { icon, renderIcons } from '../../icons.js';
import { api, apiErrorMessage } from '../../api.js';
import { getState } from '../../auth.js';
import { can } from '../../permissions.js';
import { formatCurrency, esc } from '../../format.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { statCard } from '../../ui/statCard.js';
import { spinner } from '../../ui/spinner.js';
import { barChart } from '../../ui/charts.js';

export async function render(container) {
  const user = getState().user;
  const canEdit = can(user, 'TAX_COMPLIANCE', 'EDIT');
  const local = { rates: null, history: [], saving: false, error: null, success: null };

  async function load() {
    const res = await api.get('/tax-compliance');
    local.rates = res.data.rates;
    local.history = res.data.statutoryDeductionHistory || [];
  }

  function draw() {
    container.innerHTML = `
      ${pageHeader({ title: 'Tax & Compliance', subtitle: 'Statutory deduction rates and compliance history.' })}

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        ${statCard({ label: 'Provident Fund Rate', value: `${local.rates.providentFundRate ?? 0}%`, iconName: 'landmark', tone: 'brand' })}
        ${statCard({ label: 'Professional Tax', value: formatCurrency(local.rates.professionalTax), iconName: 'landmark', tone: 'amber' })}
        ${statCard({ label: 'Income Tax Rate', value: `${local.rates.incomeTaxRate ?? 0}%`, iconName: 'landmark', tone: 'slate' })}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="card">
          <h3 class="text-sm font-semibold text-slate-900 mb-4">Statutory Deduction History</h3>
          ${barChart(local.history, { xKey: 'period', formatValue: (v) => formatCurrency(v), series: [{ key: 'totalDeductions', color: '#4f46e5', label: 'Total Deductions' }] })}
        </div>

        ${
          canEdit
            ? `<form id="rates-form" class="card space-y-4">
                <h3 class="text-sm font-semibold text-slate-900">Default Statutory Rates</h3>
                ${local.error ? `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(local.error)}</div>` : ''}
                ${local.success ? `<div class="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">${esc(local.success)}</div>` : ''}
                <div>
                  <label class="label">Provident Fund Rate (%)</label>
                  <input type="number" name="providentFundRate" class="input" value="${local.rates.providentFundRate}" />
                </div>
                <div>
                  <label class="label">Professional Tax (flat)</label>
                  <input type="number" name="professionalTax" class="input" value="${local.rates.professionalTax}" />
                </div>
                <div>
                  <label class="label">Income Tax Rate (%)</label>
                  <input type="number" name="incomeTaxRate" class="input" value="${local.rates.incomeTaxRate}" />
                </div>
                <button type="submit" class="btn-primary" ${local.saving ? 'disabled' : ''}>${local.saving ? spinner() : ''} ${icon('save', 'h-4 w-4')} Save Rates</button>
              </form>`
            : ''
        }
      </div>
    `;
    renderIcons();
    wire();
  }

  function wire() {
    const form = container.querySelector('#rates-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      local.error = null;
      local.success = null;
      local.saving = true;
      draw();
      const fd = new FormData(form);
      try {
        await api.put('/tax-compliance', {
          providentFundRate: Number(fd.get('providentFundRate')),
          professionalTax: Number(fd.get('professionalTax')),
          incomeTaxRate: Number(fd.get('incomeTaxRate')),
        });
        local.success = 'Tax & compliance settings updated.';
        await load();
      } catch (err) {
        local.error = apiErrorMessage(err);
      } finally {
        local.saving = false;
        draw();
      }
    });
  }

  await load();
  draw();
}
