import { icon, renderIcons } from '../../icons.js';
import { api, apiErrorMessage } from '../../api.js';
import { getState } from '../../auth.js';
import { can } from '../../permissions.js';
import { statusBadge } from '../../ui/statusBadge.js';
import { spinner, fullPageSpinner } from '../../ui/spinner.js';
import { formatDate, initials, esc } from '../../format.js';
import { navigate } from '../../router.js';

export async function render(container, { params }) {
  const id = params.id;
  const user = getState().user;
  container.innerHTML = fullPageSpinner();

  const local = { employee: null, documents: [], error: null, success: null, saving: false, docName: '' };
  const canViewDocs = can(user, 'DOCUMENTS', 'VIEW');

  try {
    const res = await api.get(`/employees/${id}`);
    local.employee = res.data.employee;
    if (canViewDocs) {
      const docsRes = await api.get(`/employees/${id}/documents`);
      local.documents = docsRes.data.documents;
    }
  } catch (err) {
    container.innerHTML = `<p class="text-sm text-red-600">${esc(apiErrorMessage(err, 'Failed to load employee.'))}</p>`;
    return;
  }

  const isSelf = user.id === local.employee.userId;
  const canEdit = can(user, 'EMPLOYEES', 'EDIT') || isSelf;
  const canDelete = can(user, 'EMPLOYEES', 'DELETE');
  const canManageDocs = can(user, 'DOCUMENTS', 'CREATE');

  function draw() {
    const e = local.employee;
    container.innerHTML = `
      <div class="max-w-4xl">
        <button id="back-btn" class="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">${icon('arrow-left', 'h-4 w-4')} Back</button>

        <div class="card mb-6">
          <div class="flex items-start justify-between flex-wrap gap-4">
            <div class="flex items-center gap-4">
              <div class="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-lg font-semibold">${esc(initials(e.firstName, e.lastName))}</div>
              <div>
                <h1 class="text-lg font-semibold text-slate-900">${esc(e.firstName)} ${esc(e.lastName)}</h1>
                <p class="text-sm text-slate-500">${esc(e.designation?.title ?? 'No designation')} &middot; ${esc(e.department?.name ?? 'No department')}</p>
                <p class="text-xs text-slate-400 mt-0.5">${esc(e.employeeCode)} &middot; ${esc(e.email)}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              ${statusBadge(e.status)}
              ${canDelete && !isSelf ? `<button id="offboard-btn" class="btn-danger">${icon('user-x', 'h-4 w-4')} Offboard</button>` : ''}
            </div>
          </div>
        </div>

        ${local.error ? `<div class="mb-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(local.error)}</div>` : ''}
        ${local.success ? `<div class="mb-4 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">${esc(local.success)}</div>` : ''}

        <form id="save-form" class="card space-y-5">
          <h2 class="text-sm font-semibold text-slate-900">Profile Details</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="label">Phone</label>
              <input name="phone" class="input" ${canEdit ? '' : 'disabled'} value="${esc(e.phone ?? '')}" />
            </div>
            <div>
              <label class="label">Date of Joining</label>
              <input class="input" disabled value="${formatDate(e.dateOfJoining)}" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Address</label>
              <input name="address" class="input" ${canEdit ? '' : 'disabled'} value="${esc(e.address ?? '')}" />
            </div>
            <div>
              <label class="label">Emergency Contact Name</label>
              <input name="emergencyContactName" class="input" ${canEdit ? '' : 'disabled'} value="${esc(e.emergencyContactName ?? '')}" />
            </div>
            <div>
              <label class="label">Emergency Contact Phone</label>
              <input name="emergencyContactPhone" class="input" ${canEdit ? '' : 'disabled'} value="${esc(e.emergencyContactPhone ?? '')}" />
            </div>
          </div>

          <h2 class="text-sm font-semibold text-slate-900 pt-2">Banking &amp; Tax (sensitive)</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="label">Bank Name</label>
              <input name="bankName" class="input" ${canEdit && !isSelf ? '' : 'disabled'} value="${esc(e.bankName ?? '')}" />
            </div>
            <div>
              <label class="label">Bank Account Number</label>
              <input name="bankAccountNumber" class="input font-mono" ${canEdit && !isSelf ? '' : 'disabled'} value="${esc(e.bankAccountNumber ?? '')}" />
            </div>
            <div>
              <label class="label">Tax ID</label>
              <input class="input font-mono" disabled value="${esc(e.taxId ?? '')}" />
            </div>
          </div>

          ${canEdit ? `<button type="submit" id="save-btn" class="btn-primary">${local.saving ? spinner() : ''} ${icon('save', 'h-4 w-4')} Save Changes</button>` : ''}
        </form>

        ${
          canViewDocs
            ? `<div class="card mt-6">
                <h2 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">${icon('file-text', 'h-4 w-4 text-brand-600')} Documents</h2>
                ${
                  canManageDocs
                    ? `<form id="add-doc-form" class="flex gap-2 mb-4">
                        <input name="docName" class="input" placeholder="Document name (e.g. Offer Letter)" />
                        <button class="btn-secondary shrink-0">${icon('upload', 'h-4 w-4')} Add</button>
                      </form>`
                    : ''
                }
                <ul class="divide-y divide-slate-50">
                  ${local.documents
                    .map(
                      (d) => `
                    <li class="flex items-center justify-between py-2 text-sm">
                      <div>
                        <p class="font-medium text-slate-700">${esc(d.name)}</p>
                        <p class="text-xs text-slate-400">Uploaded ${formatDate(d.uploadedAt)}</p>
                      </div>
                      ${canManageDocs ? `<button class="text-slate-400 hover:text-red-600" data-delete-doc="${d.id}">${icon('trash-2', 'h-4 w-4')}</button>` : ''}
                    </li>`
                    )
                    .join('')}
                  ${local.documents.length === 0 ? '<p class="text-sm text-slate-400 py-2">No documents uploaded yet.</p>' : ''}
                </ul>
              </div>`
            : ''
        }
      </div>
    `;
    renderIcons();
    wire();
  }

  function wire() {
    container.querySelector('#back-btn').addEventListener('click', () => history.back());

    const offboardBtn = container.querySelector('#offboard-btn');
    if (offboardBtn) {
      offboardBtn.addEventListener('click', async () => {
        if (!confirm(`Offboard ${local.employee.firstName} ${local.employee.lastName}? Their account will be deactivated.`)) return;
        try {
          await api.delete(`/employees/${id}`);
          navigate('/employees');
        } catch (err) {
          local.error = apiErrorMessage(err);
          draw();
        }
      });
    }

    const saveForm = container.querySelector('#save-form');
    saveForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      local.error = null;
      local.success = null;
      local.saving = true;
      draw();
      const fd = new FormData(saveForm);
      const payload = {
        phone: fd.get('phone'),
        address: fd.get('address'),
        emergencyContactName: fd.get('emergencyContactName'),
        emergencyContactPhone: fd.get('emergencyContactPhone'),
      };
      if (canEdit && !isSelf) {
        payload.bankAccountNumber = fd.get('bankAccountNumber');
        payload.bankName = fd.get('bankName');
        payload.status = local.employee.status;
      }
      try {
        await api.put(`/employees/${id}`, payload);
        local.success = 'Employee profile updated successfully.';
        const res = await api.get(`/employees/${id}`);
        local.employee = res.data.employee;
      } catch (err) {
        local.error = apiErrorMessage(err, 'Failed to update employee.');
      } finally {
        local.saving = false;
        draw();
      }
    });

    const addDocForm = container.querySelector('#add-doc-form');
    if (addDocForm) {
      addDocForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = addDocForm.elements.docName.value.trim();
        if (!name) return;
        try {
          await api.post(`/employees/${id}/documents`, { name, type: 'General', fileName: `${name.replace(/\s+/g, '_')}.pdf` });
          const docsRes = await api.get(`/employees/${id}/documents`);
          local.documents = docsRes.data.documents;
        } catch (err) {
          local.error = apiErrorMessage(err);
        }
        draw();
      });
    }

    container.querySelectorAll('[data-delete-doc]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await api.delete(`/employees/${id}/documents/${btn.getAttribute('data-delete-doc')}`);
          const docsRes = await api.get(`/employees/${id}/documents`);
          local.documents = docsRes.data.documents;
        } catch (err) {
          local.error = apiErrorMessage(err);
        }
        draw();
      })
    );
  }

  draw();
}
