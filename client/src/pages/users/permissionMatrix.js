import { icon, renderIcons } from '../../icons.js';
import { api, apiErrorMessage } from '../../api.js';
import { ROLE_LABELS } from '../../permissions.js';
import { esc } from '../../format.js';
import { spinner } from '../../ui/spinner.js';

const ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'PROCESS', 'MANAGE'];
const RESOURCES = [
  'DASHBOARD', 'EMPLOYEES', 'PAYROLL', 'ATTENDANCE', 'LEAVE', 'SALARY_STRUCTURE', 'PAYSLIPS', 'REPORTS',
  'USERS', 'SETTINGS', 'AUDIT_LOGS', 'TAX_COMPLIANCE', 'DEPARTMENTS', 'DESIGNATIONS', 'DOCUMENTS', 'ANNOUNCEMENTS',
];
const ROLES = ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE'];

export async function render(container) {
  const local = { role: 'HR_ADMIN', matrix: [], grid: {}, saving: false, message: null, error: null, loading: true };

  async function load() {
    local.loading = true;
    draw();
    const res = await api.get('/users/roles/permission-matrix');
    local.matrix = res.data.matrix;
    rebuildGrid();
    local.loading = false;
    draw();
  }

  function rebuildGrid() {
    const g = {};
    for (const row of local.matrix) {
      if (row.role === local.role) g[`${row.resource}:${row.action}`] = row.allowed;
    }
    local.grid = g;
  }

  function draw() {
    container.innerHTML = `
      <div class="card">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div class="flex items-center gap-2">
            <label class="label mb-0">Role</label>
            <select id="role-select" class="input w-auto">
              ${ROLES.map((r) => `<option value="${r}" ${r === local.role ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}
            </select>
          </div>
          <button id="save-matrix-btn" class="btn-primary" ${local.saving || local.loading ? 'disabled' : ''}>${local.saving ? spinner() : ''} ${icon('save', 'h-4 w-4')} Save Changes</button>
        </div>

        ${local.error ? `<div class="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(local.error)}</div>` : ''}
        ${local.message ? `<div class="mb-4 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">${esc(local.message)}</div>` : ''}

        <div class="overflow-x-auto -mx-5 px-5">
          <table class="w-full min-w-[900px] text-sm">
            <thead>
              <tr class="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th class="pb-3 pr-4">Resource</th>
                ${ACTIONS.map((a) => `<th class="pb-3 px-2 text-center">${a}</th>`).join('')}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${RESOURCES.map(
                (resource) => `
                <tr>
                  <td class="py-2 pr-4 font-medium text-slate-700">${esc(resource.replaceAll('_', ' '))}</td>
                  ${ACTIONS.map(
                    (action) => `
                    <td class="py-2 px-2 text-center">
                      <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        data-resource="${resource}" data-action-name="${action}"
                        ${local.grid[`${resource}:${action}`] ? 'checked' : ''}
                        ${local.role === 'SUPER_ADMIN' ? 'disabled' : ''} />
                    </td>`
                  ).join('')}
                </tr>`
              ).join('')}
            </tbody>
          </table>
        </div>
        ${local.role === 'SUPER_ADMIN' ? '<p class="text-xs text-slate-400 mt-3">Super Admin permissions are fixed at full access for system integrity.</p>' : ''}
      </div>
    `;
    renderIcons();
    wire();
  }

  function wire() {
    container.querySelector('#role-select').addEventListener('change', (e) => {
      local.role = e.target.value;
      local.message = null;
      rebuildGrid();
      draw();
    });
    container.querySelectorAll('input[type="checkbox"][data-resource]').forEach((cb) =>
      cb.addEventListener('change', () => {
        const key = `${cb.getAttribute('data-resource')}:${cb.getAttribute('data-action-name')}`;
        local.grid[key] = cb.checked;
        local.message = null;
      })
    );
    container.querySelector('#save-matrix-btn').addEventListener('click', async () => {
      local.saving = true;
      local.error = null;
      local.message = null;
      draw();
      try {
        const updates = RESOURCES.flatMap((resource) => ACTIONS.map((action) => ({ role: local.role, resource, action, allowed: !!local.grid[`${resource}:${action}`] })));
        await api.put('/users/roles/permission-matrix', { updates });
        local.message = 'Permission matrix updated successfully.';
        const res = await api.get('/users/roles/permission-matrix');
        local.matrix = res.data.matrix;
      } catch (err) {
        local.error = apiErrorMessage(err);
      } finally {
        local.saving = false;
        draw();
      }
    });
  }

  await load();
}
