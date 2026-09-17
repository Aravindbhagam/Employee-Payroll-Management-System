import { api, apiErrorMessage } from '../../api.js';
import { openModal } from '../../ui/modal.js';
import { spinner } from '../../ui/spinner.js';
import { esc } from '../../format.js';

const ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'PROCESS', 'MANAGE'];
const RESOURCES = [
  'DASHBOARD', 'EMPLOYEES', 'PAYROLL', 'ATTENDANCE', 'LEAVE', 'SALARY_STRUCTURE', 'PAYSLIPS', 'REPORTS',
  'USERS', 'SETTINGS', 'AUDIT_LOGS', 'TAX_COMPLIANCE', 'DEPARTMENTS', 'DESIGNATIONS', 'DOCUMENTS', 'ANNOUNCEMENTS',
];

export async function openUserPermissionsModal(userId, onClose) {
  const modal = openModal({ title: 'Individual Permission Overrides', wide: true, bodyHtml: '<p class="text-sm text-slate-400">Loading...</p>' });

  let res;
  try {
    res = await api.get(`/users/${userId}/permissions`);
  } catch (err) {
    modal.el.innerHTML = `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(apiErrorMessage(err))}</div>`;
    return;
  }

  const grid = {};
  for (const row of res.data.effective) grid[`${row.resource}:${row.action}`] = row.allowed;

  function bodyHtml(error) {
    return `
      <div class="space-y-4">
        <p class="text-xs text-slate-500">Base role: <span class="font-medium">${esc(res.data.role)}</span>. Toggle individual permissions to override role defaults for this user only.</p>
        ${error ? `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(error)}</div>` : ''}
        <div class="overflow-x-auto max-h-96">
          <table class="w-full min-w-[700px] text-sm">
            <thead>
              <tr class="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100 sticky top-0 bg-white">
                <th class="pb-2 pr-4">Resource</th>
                ${ACTIONS.map((a) => `<th class="pb-2 px-1 text-center">${a}</th>`).join('')}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${RESOURCES.map(
                (resource) => `
                <tr>
                  <td class="py-1.5 pr-4 font-medium text-slate-700 text-xs">${esc(resource.replaceAll('_', ' '))}</td>
                  ${ACTIONS.map(
                    (action) => `
                    <td class="py-1.5 px-1 text-center">
                      <input type="checkbox" class="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        data-resource="${resource}" data-action-name="${action}" ${grid[`${resource}:${action}`] ? 'checked' : ''} />
                    </td>`
                  ).join('')}
                </tr>`
              ).join('')}
            </tbody>
          </table>
        </div>
        <button id="save-overrides-btn" class="btn-primary w-full">Save Overrides</button>
      </div>
    `;
  }

  modal.el.innerHTML = bodyHtml(null);
  wire();

  function wire() {
    modal.el.querySelectorAll('input[type="checkbox"][data-resource]').forEach((cb) =>
      cb.addEventListener('change', () => {
        grid[`${cb.getAttribute('data-resource')}:${cb.getAttribute('data-action-name')}`] = cb.checked;
      })
    );
    modal.el.querySelector('#save-overrides-btn').addEventListener('click', async () => {
      const btn = modal.el.querySelector('#save-overrides-btn');
      btn.disabled = true;
      btn.innerHTML = spinner() + ' Save Overrides';
      try {
        const overrides = RESOURCES.flatMap((resource) => ACTIONS.map((action) => ({ resource, action, allowed: !!grid[`${resource}:${action}`] })));
        await api.put(`/users/${userId}/permissions`, { overrides });
        modal.close();
        if (onClose) onClose();
      } catch (err) {
        modal.el.innerHTML = bodyHtml(apiErrorMessage(err));
        wire();
      }
    });
  }
}
