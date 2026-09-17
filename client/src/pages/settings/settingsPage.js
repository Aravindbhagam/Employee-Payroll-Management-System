import { icon, renderIcons } from '../../icons.js';
import { api, apiErrorMessage } from '../../api.js';
import { getState, refreshUser } from '../../auth.js';
import { can } from '../../permissions.js';
import { pageHeader } from '../../ui/pageHeader.js';
import { openModal } from '../../ui/modal.js';
import { spinner } from '../../ui/spinner.js';
import { esc } from '../../format.js';

export async function render(container) {
  const user = getState().user;
  const canView = can(user, 'SETTINGS', 'VIEW');
  const canManage = can(user, 'SETTINGS', 'MANAGE');

  container.innerHTML = `
    <div class="space-y-6 max-w-3xl">
      ${pageHeader({ title: 'Settings', subtitle: 'Manage your account security and, where permitted, company-wide configuration.' })}
      <div id="security-section"></div>
      ${canView ? '<div id="company-settings-section"></div>' : ''}
    </div>
  `;

  renderSecuritySection(container.querySelector('#security-section'));
  if (canView) await renderCompanySettingsSection(container.querySelector('#company-settings-section'), canManage);
}

function renderSecuritySection(el) {
  const user = getState().user;
  el.innerHTML = `
    <div class="card">
      <h2 class="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">${icon('shield-check', 'h-4 w-4 text-brand-600')} Account Security</h2>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-slate-800">Password</p>
            <p class="text-xs text-slate-400">Change your account password.</p>
          </div>
          <button id="change-pw-btn" class="btn-secondary">${icon('key-round', 'h-4 w-4')} Change Password</button>
        </div>
        <div class="flex items-center justify-between border-t border-slate-50 pt-4">
          <div>
            <p class="text-sm font-medium text-slate-800">Two-Factor Authentication</p>
            <p class="text-xs text-slate-400">${user.twoFactorEnabled ? 'Enabled — your account requires a one-time code at login.' : 'Add an extra layer of security to your account.'}</p>
          </div>
          <button id="tfa-btn" class="btn-secondary">${user.twoFactorEnabled ? 'Manage' : 'Enable 2FA'}</button>
        </div>
      </div>
    </div>
  `;
  renderIcons();
  el.querySelector('#change-pw-btn').addEventListener('click', openChangePasswordModal);
  el.querySelector('#tfa-btn').addEventListener('click', () => openTwoFactorModal(user.twoFactorEnabled, () => renderSecuritySection(el)));
}

function openChangePasswordModal() {
  function bodyHtml(error, success) {
    return `
      <form id="change-pw-form" class="space-y-4">
        ${error ? `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(error)}</div>` : ''}
        ${success ? `<div class="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">${esc(success)}</div>` : ''}
        <div>
          <label class="label">Current Password</label>
          <input type="password" name="currentPassword" class="input" required />
        </div>
        <div>
          <label class="label">New Password</label>
          <input type="password" name="newPassword" class="input" required />
          <p class="text-xs text-slate-400 mt-1">At least 8 characters, with an uppercase letter, lowercase letter, and a number.</p>
        </div>
        <button id="update-pw-btn" class="btn-primary w-full">Update Password</button>
      </form>
    `;
  }

  const modal = openModal({ title: 'Change Password', bodyHtml: bodyHtml(null, null), onMount: (el) => wire(el) });

  function wire(el) {
    const form = el.querySelector('#change-pw-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('#update-pw-btn');
      btn.disabled = true;
      btn.innerHTML = spinner() + ' Update Password';
      const fd = new FormData(form);
      try {
        await api.post('/auth/change-password', { currentPassword: fd.get('currentPassword'), newPassword: fd.get('newPassword') });
        el.innerHTML = bodyHtml(null, 'Password updated successfully.');
        wire(el);
      } catch (err) {
        el.innerHTML = bodyHtml(apiErrorMessage(err), null);
        wire(el);
      }
    });
  }
}

function openTwoFactorModal(enabled, onChanged) {
  if (enabled) {
    const modal = openModal({
      title: 'Two-Factor Authentication',
      bodyHtml: `
        <div class="space-y-4 text-sm">
          <p class="text-slate-600">Two-factor authentication is currently enabled on your account.</p>
          <div id="tfa-error"></div>
          <button id="disable-tfa-btn" class="btn-danger w-full">Disable Two-Factor Authentication</button>
        </div>
      `,
      onMount(el, close) {
        el.querySelector('#disable-tfa-btn').addEventListener('click', async () => {
          const btn = el.querySelector('#disable-tfa-btn');
          btn.disabled = true;
          btn.innerHTML = spinner() + ' Disable Two-Factor Authentication';
          try {
            await api.post('/auth/2fa/disable');
            await refreshUser();
            close();
            onChanged();
          } catch (err) {
            el.querySelector('#tfa-error').innerHTML = `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(apiErrorMessage(err))}</div>`;
            btn.disabled = false;
            btn.textContent = 'Disable Two-Factor Authentication';
          }
        });
      },
    });
    return modal;
  }

  const modal = openModal({
    title: 'Enable Two-Factor Authentication',
    bodyHtml: `
      <form id="enable-tfa-form" class="space-y-4 text-sm">
        <p class="text-slate-600">Scan this QR code with an authenticator app (e.g. Google Authenticator, Authy), then enter the 6-digit code.</p>
        <div id="tfa-error"></div>
        <div id="qr-container" class="h-40 flex items-center justify-center">${spinner()}</div>
        <div>
          <label class="label">Verification Code</label>
          <input id="tfa-code" name="code" class="input tracking-[0.4em] text-center" maxlength="6" required />
        </div>
        <button id="enable-tfa-btn" class="btn-primary w-full" disabled>Enable Two-Factor Authentication</button>
      </form>
    `,
    async onMount(el, close) {
      const codeInput = el.querySelector('#tfa-code');
      const submitBtn = el.querySelector('#enable-tfa-btn');
      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.replace(/\D/g, '');
        submitBtn.disabled = codeInput.value.length !== 6;
      });

      try {
        const res = await api.post('/auth/2fa/setup');
        el.querySelector('#qr-container').innerHTML = `<img src="${res.data.qrCodeDataUrl}" alt="2FA QR Code" class="mx-auto h-40 w-40" />`;
      } catch (err) {
        el.querySelector('#tfa-error').innerHTML = `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(apiErrorMessage(err))}</div>`;
      }

      el.querySelector('#enable-tfa-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        submitBtn.innerHTML = spinner() + ' Enable Two-Factor Authentication';
        try {
          await api.post('/auth/2fa/enable', { code: codeInput.value });
          await refreshUser();
          close();
          onChanged();
        } catch (err) {
          el.querySelector('#tfa-error').innerHTML = `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(apiErrorMessage(err))}</div>`;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Enable Two-Factor Authentication';
        }
      });
    },
  });
  return modal;
}

async function renderCompanySettingsSection(el, canManage) {
  const local = { settings: null, saving: false, error: null, success: null };

  async function load() {
    const res = await api.get('/settings');
    local.settings = res.data.settings;
  }

  function draw() {
    const s = local.settings;
    el.innerHTML = `
      <form id="company-settings-form" class="card space-y-4">
        <h2 class="text-sm font-semibold text-slate-900 flex items-center gap-2">${icon('building-2', 'h-4 w-4 text-brand-600')} Company &amp; System Settings</h2>
        ${local.error ? `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(local.error)}</div>` : ''}
        ${local.success ? `<div class="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">${esc(local.success)}</div>` : ''}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="label">Company Name</label>
            <input name="companyName" class="input" ${canManage ? '' : 'disabled'} value="${esc(s.companyName)}" />
          </div>
          <div>
            <label class="label">Currency</label>
            <input name="currency" class="input" ${canManage ? '' : 'disabled'} value="${esc(s.currency)}" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Address</label>
            <input name="address" class="input" ${canManage ? '' : 'disabled'} value="${esc(s.address ?? '')}" />
          </div>
          <div>
            <label class="label">Session Timeout (minutes)</label>
            <input type="number" name="sessionTimeoutMinutes" class="input" ${canManage ? '' : 'disabled'} value="${s.sessionTimeoutMinutes}" />
          </div>
          <div>
            <label class="label">Max Failed Login Attempts</label>
            <input type="number" name="maxFailedLoginAttempts" class="input" ${canManage ? '' : 'disabled'} value="${s.maxFailedLoginAttempts}" />
          </div>
          <div>
            <label class="label">Lockout Duration (minutes)</label>
            <input type="number" name="lockoutMinutes" class="input" ${canManage ? '' : 'disabled'} value="${s.lockoutMinutes}" />
          </div>
          <div class="flex items-center gap-2 pt-6">
            <input type="checkbox" id="tfr" name="twoFactorRequired" ${canManage ? '' : 'disabled'} ${s.twoFactorRequired ? 'checked' : ''} />
            <label for="tfr" class="text-sm text-slate-600">Require two-factor authentication for all users</label>
          </div>
        </div>

        ${canManage ? `<button type="submit" id="save-settings-btn" class="btn-primary" ${local.saving ? 'disabled' : ''}>${local.saving ? spinner() : ''} ${icon('save', 'h-4 w-4')} Save Settings</button>` : ''}
      </form>
    `;
    renderIcons();
    wire();
  }

  function wire() {
    const form = el.querySelector('#company-settings-form');
    if (!canManage) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      local.error = null;
      local.success = null;
      local.saving = true;
      draw();
      const fd = new FormData(form);
      try {
        await api.put('/settings', {
          companyName: fd.get('companyName'),
          address: fd.get('address'),
          currency: fd.get('currency'),
          sessionTimeoutMinutes: Number(fd.get('sessionTimeoutMinutes')),
          maxFailedLoginAttempts: Number(fd.get('maxFailedLoginAttempts')),
          lockoutMinutes: Number(fd.get('lockoutMinutes')),
          twoFactorRequired: fd.get('twoFactorRequired') === 'on',
        });
        local.success = 'Company settings updated.';
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
