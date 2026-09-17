import { openModal } from '../../ui/modal.js';
import { spinner } from '../../ui/spinner.js';
import { api, apiErrorMessage } from '../../api.js';
import { getState } from '../../auth.js';
import { ROLE_LABELS } from '../../permissions.js';
import { esc } from '../../format.js';

/** onCreated() is called both when the user closes the "created" confirmation and when they cancel before submitting. */
export async function openAddEmployeeModal({ onClose, onCreated }) {
  const user = getState().user;
  const roleOptions = user.role === 'SUPER_ADMIN' ? Object.keys(ROLE_LABELS) : ['EMPLOYEE', 'MANAGER'];

  const [deptRes, desigRes, mgrRes] = await Promise.all([api.get('/departments'), api.get('/designations'), api.get('/employees')]);
  const departments = deptRes.data.departments;
  const designations = desigRes.data.designations;
  const managers = mgrRes.data.employees;

  function formHtml(error) {
    return `
      <form id="add-employee-form" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        ${error ? `<div class="sm:col-span-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(error)}</div>` : ''}
        <div>
          <label class="label">First name</label>
          <input name="firstName" class="input" required />
        </div>
        <div>
          <label class="label">Last name</label>
          <input name="lastName" class="input" required />
        </div>
        <div class="sm:col-span-2">
          <label class="label">Email</label>
          <input name="email" class="input" type="email" required />
        </div>
        <div>
          <label class="label">Role</label>
          <select name="role" class="input">
            ${roleOptions.map((r) => `<option value="${r}">${ROLE_LABELS[r]}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="label">Date of joining</label>
          <input name="dateOfJoining" class="input" type="date" value="${new Date().toISOString().slice(0, 10)}" />
        </div>
        <div>
          <label class="label">Department</label>
          <select name="departmentId" class="input">
            <option value="">Select department</option>
            ${departments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="label">Designation</label>
          <select name="designationId" class="input">
            <option value="">Select designation</option>
            ${designations.map((d) => `<option value="${d.id}" data-dept="${d.departmentId}">${esc(d.title)}</option>`).join('')}
          </select>
        </div>
        <div class="sm:col-span-2">
          <label class="label">Manager (optional)</label>
          <select name="managerId" class="input">
            <option value="">No manager</option>
            ${managers.map((e) => `<option value="${e.userId}">${esc(e.firstName)} ${esc(e.lastName)}</option>`).join('')}
          </select>
        </div>
        <div class="sm:col-span-2 flex gap-3 pt-2">
          <button type="button" id="cancel-btn" class="btn-secondary flex-1">Cancel</button>
          <button type="submit" id="submit-btn" class="btn-primary flex-1">Create Employee</button>
        </div>
      </form>
    `;
  }

  function createdHtml(created) {
    return `
      <div class="space-y-3 text-sm">
        <p class="text-slate-600">The employee account has been created. Share these temporary credentials securely.</p>
        <div class="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-1">
          <p><span class="text-slate-400">Employee ID:</span> <span class="font-mono">${esc(created.employeeCode)}</span></p>
          <p><span class="text-slate-400">Temporary password:</span> <span class="font-mono">${esc(created.temporaryPassword)}</span></p>
        </div>
        <p class="text-xs text-slate-400">The user will be required to change this password on first login.</p>
        <button id="done-btn" class="btn-primary w-full">Done</button>
      </div>
    `;
  }

  const modal = openModal({
    title: 'Add Employee',
    wide: true,
    bodyHtml: formHtml(null),
    onMount: (contentEl) => wireForm(contentEl, null),
  });

  function wireForm(contentEl, error) {
    contentEl.querySelector('#cancel-btn').addEventListener('click', () => {
      modal.close();
      if (onClose) onClose();
    });
    const form = contentEl.querySelector('#add-employee-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('#submit-btn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = spinner() + ' Create Employee';
      const fd = new FormData(form);
      const payload = {
        firstName: fd.get('firstName'),
        lastName: fd.get('lastName'),
        email: fd.get('email'),
        role: fd.get('role'),
        dateOfJoining: fd.get('dateOfJoining') || undefined,
        departmentId: fd.get('departmentId') || undefined,
        designationId: fd.get('designationId') || undefined,
        managerId: fd.get('managerId') || undefined,
      };
      try {
        const res = await api.post('/employees', payload);
        contentEl.innerHTML = createdHtml({ employeeCode: res.data.employeeCode, temporaryPassword: res.data.temporaryPassword });
        contentEl.querySelector('#done-btn').addEventListener('click', () => {
          modal.close();
          if (onCreated) onCreated();
        });
      } catch (err) {
        contentEl.innerHTML = formHtml(apiErrorMessage(err, 'Failed to create employee.'));
        wireForm(contentEl);
      }
    });
  }
}
