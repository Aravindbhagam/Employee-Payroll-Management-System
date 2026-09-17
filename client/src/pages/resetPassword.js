import { icon, renderIcons } from '../icons.js';
import { api, apiErrorMessage } from '../api.js';
import { navigate } from '../router.js';
import { esc } from '../format.js';

export function render(container, { query }) {
  const token = query.get('token') || '';
  const local = { showPassword: false, submitting: false, error: null, success: null };

  function draw() {
    container.innerHTML = `
      <div class="min-h-screen w-full bg-gradient-to-br from-brand-950 via-brand-900 to-slate-900 flex items-center justify-center p-4">
        <div class="w-full max-w-md">
          <div class="flex flex-col items-center mb-8">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 mb-3">
              ${icon('landmark', 'h-7 w-7')}
            </div>
            <h1 class="text-white text-xl font-semibold tracking-tight">PayrollPro</h1>
          </div>
          <div class="card animate-fadeIn">${bodyHtml()}</div>
        </div>
      </div>
    `;
    renderIcons();
    wire();
  }

  function bodyHtml() {
    if (!token) {
      return `
        <div class="space-y-4 text-center">
          <h2 class="text-lg font-semibold text-slate-900">Invalid reset link</h2>
          <p class="text-sm text-slate-500">This password reset link is missing its token. Request a new one from the sign-in page.</p>
          <a href="#/login" class="btn-primary w-full inline-flex justify-center">Back to sign in</a>
        </div>
      `;
    }
    if (local.success) {
      return `
        <div class="space-y-4 text-center">
          <div class="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700" role="status">${esc(local.success)}</div>
          <button id="back-to-sign-in" class="btn-primary w-full">Back to sign in</button>
        </div>
      `;
    }
    return `
      <form id="reset-form" class="space-y-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-900">Choose a new password</h2>
          <p class="text-sm text-slate-500 mt-0.5">Your reset link is valid for 1 hour after it was requested.</p>
        </div>
        ${local.error ? `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700" role="alert">${esc(local.error)}</div>` : ''}
        <div>
          <label class="label" for="new-password">New password</label>
          <div class="relative">
            <input id="new-password" name="newPassword" class="input pr-10" type="${local.showPassword ? 'text' : 'password'}" autocomplete="new-password" required minlength="8" />
            <button type="button" id="toggle-password" class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              aria-label="${local.showPassword ? 'Hide password' : 'Show password'}">
              ${local.showPassword ? icon('eye-off', 'h-4 w-4') : icon('eye', 'h-4 w-4')}
            </button>
          </div>
        </div>
        <button type="submit" class="btn-primary w-full" ${local.submitting ? 'disabled' : ''}>
          ${local.submitting ? icon('loader-2', 'h-4 w-4 animate-spin') : ''} Reset password
        </button>
      </form>
    `;
  }

  function wire() {
    if (!token) return;
    if (local.success) {
      container.querySelector('#back-to-sign-in').addEventListener('click', () => navigate('/login'));
      return;
    }
    const form = container.querySelector('#reset-form');
    container.querySelector('#toggle-password').addEventListener('click', () => {
      local.showPassword = !local.showPassword;
      draw();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      local.error = null;
      local.submitting = true;
      draw();
      try {
        const res = await api.post('/auth/reset-password', { token, newPassword: form.elements.newPassword.value });
        local.success = res.data.message || 'Password has been reset. Please log in with your new password.';
      } catch (err) {
        local.error = apiErrorMessage(err, 'Failed to reset password.');
        local.submitting = false;
      }
      draw();
    });
  }

  draw();
}
