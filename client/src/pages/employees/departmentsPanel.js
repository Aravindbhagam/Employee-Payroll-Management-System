import { icon, renderIcons } from '../../icons.js';
import { api, apiErrorMessage } from '../../api.js';
import { getState } from '../../auth.js';
import { can } from '../../permissions.js';
import { esc } from '../../format.js';

export async function render(container) {
  const user = getState().user;
  const canManageDept = can(user, 'DEPARTMENTS', 'CREATE');
  const canManageDesig = can(user, 'DESIGNATIONS', 'CREATE');
  const local = { departments: [], designations: [], error: null };

  async function loadDepartments() {
    const res = await api.get('/departments');
    local.departments = res.data.departments;
  }
  async function loadDesignations() {
    const res = await api.get('/designations');
    local.designations = res.data.designations;
  }

  await Promise.all([loadDepartments(), loadDesignations()]);
  draw();

  function draw() {
    container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        ${local.error ? `<div class="lg:col-span-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(local.error)}</div>` : ''}

        <div class="card">
          <h3 class="text-sm font-semibold text-slate-900 mb-4">Departments</h3>
          ${
            canManageDept
              ? `<form id="add-dept-form" class="flex gap-2 mb-4">
                  <input name="name" class="input" placeholder="New department name" required />
                  <button class="btn-primary shrink-0">${icon('plus', 'h-4 w-4')}</button>
                </form>`
              : ''
          }
          <ul class="divide-y divide-slate-50">
            ${local.departments
              .map(
                (d) => `
              <li class="flex items-center justify-between py-2 text-sm">
                <div>
                  <p class="font-medium text-slate-700">${esc(d.name)}</p>
                  <p class="text-xs text-slate-400">${d._count?.employees ?? 0} employees</p>
                </div>
                ${canManageDept ? `<button class="text-slate-400 hover:text-red-600" data-remove-dept="${d.id}">${icon('trash-2', 'h-4 w-4')}</button>` : ''}
              </li>`
              )
              .join('')}
          </ul>
        </div>

        <div class="card">
          <h3 class="text-sm font-semibold text-slate-900 mb-4">Designations</h3>
          ${
            canManageDesig
              ? `<form id="add-desig-form" class="flex flex-col sm:flex-row gap-2 mb-4">
                  <select name="departmentId" class="input" required>
                    <option value="">Department</option>
                    ${local.departments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}
                  </select>
                  <input name="title" class="input" placeholder="Title" required />
                  <button class="btn-primary shrink-0">${icon('plus', 'h-4 w-4')}</button>
                </form>`
              : ''
          }
          <ul class="divide-y divide-slate-50">
            ${local.designations
              .map(
                (d) => `
              <li class="flex items-center justify-between py-2 text-sm">
                <div>
                  <p class="font-medium text-slate-700">${esc(d.title)}</p>
                  <p class="text-xs text-slate-400">${esc(d.department?.name)}</p>
                </div>
                ${canManageDesig ? `<button class="text-slate-400 hover:text-red-600" data-remove-desig="${d.id}">${icon('trash-2', 'h-4 w-4')}</button>` : ''}
              </li>`
              )
              .join('')}
          </ul>
        </div>
      </div>
    `;
    renderIcons();
    wire();
  }

  function wire() {
    const addDeptForm = container.querySelector('#add-dept-form');
    if (addDeptForm) {
      addDeptForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        local.error = null;
        try {
          await api.post('/departments', { name: addDeptForm.elements.name.value });
          await loadDepartments();
        } catch (err) {
          local.error = apiErrorMessage(err);
        }
        draw();
      });
    }
    const addDesigForm = container.querySelector('#add-desig-form');
    if (addDesigForm) {
      addDesigForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        local.error = null;
        try {
          await api.post('/designations', { title: addDesigForm.elements.title.value, departmentId: addDesigForm.elements.departmentId.value });
          await loadDesignations();
        } catch (err) {
          local.error = apiErrorMessage(err);
        }
        draw();
      });
    }
    container.querySelectorAll('[data-remove-dept]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        local.error = null;
        try {
          await api.delete(`/departments/${btn.getAttribute('data-remove-dept')}`);
          await loadDepartments();
        } catch (err) {
          local.error = apiErrorMessage(err);
        }
        draw();
      })
    );
    container.querySelectorAll('[data-remove-desig]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        local.error = null;
        try {
          await api.delete(`/designations/${btn.getAttribute('data-remove-desig')}`);
          await loadDesignations();
        } catch (err) {
          local.error = apiErrorMessage(err);
        }
        draw();
      })
    );
  }
}
