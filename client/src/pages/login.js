import { icon, renderIcons } from '../icons.js';
import { api, apiErrorMessage } from '../api.js';
import { login, verifyTwoFactor, getState } from '../auth.js';
import { navigate } from '../router.js';
import { esc } from '../format.js';

export function render(container) {
  const local = {
    step: 'credentials', // 'credentials' | 'twoFactor' | 'forgotPassword'
    showPassword: false,
    submitting: false,
    error: null,
    success: null,
    tempToken: '',
    devResetToken: null,
  };

  if (getState().user) {
    navigate('/dashboard');
    return;
  }

  function draw() {
    container.innerHTML = `
      <div class="min-h-screen w-full bg-gradient-to-br from-brand-950 via-brand-900 to-slate-900 flex items-center justify-center p-4">
        <div class="w-full max-w-md">
          <div class="flex flex-col items-center mb-8">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 mb-3">
              ${icon('landmark', 'h-7 w-7')}
            </div>
            <h1 class="text-white text-xl font-semibold tracking-tight">PayrollPro</h1>
            <p class="text-brand-200 text-sm mt-1">Nimbus Corporation &middot; Employee Payroll Management</p>
          </div>

          <div class="card animate-fadeIn">${stepHtml()}</div>

          <p class="mt-6 text-center text-xs text-brand-200">
            Demo accounts (password: <span class="font-mono">Password123!</span>) &mdash; superadmin / hradmin / payrolladmin / manager / employee
            @nimbuscorp.com
          </p>
        </div>
      </div>
    `;
    renderIcons();
    wire();
  }

  function alertHtml() {
    let html = '';
    if (local.error) html += `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700" role="alert">${esc(local.error)}</div>`;
    if (local.success) html += `<div class="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700" role="status">${esc(local.success)}</div>`;
    return html;
  }

  function stepHtml() {
    if (local.step === 'twoFactor') {
      return `
        <form id="form-2fa" class="space-y-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">${icon('shield-check', 'h-5 w-5')}</div>
            <div>
              <h2 class="text-lg font-semibold text-slate-900">Two-factor verification</h2>
              <p class="text-sm text-slate-500">Enter the 6-digit code from your authenticator app.</p>
            </div>
          </div>
          ${local.error ? `<div class="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">${esc(local.error)}</div>` : ''}
          <div>
            <label class="label" for="otp">Verification code</label>
            <input id="otp" name="otp" class="input tracking-[0.5em] text-center text-lg" maxlength="6" inputmode="numeric" required autofocus />
          </div>
          <button type="submit" class="btn-primary w-full" ${local.submitting ? 'disabled' : ''}>
            ${local.submitting ? icon('loader-2', 'h-4 w-4 animate-spin') : ''} Verify &amp; sign in
          </button>
          <button type="button" id="back-to-credentials" class="btn-secondary w-full">Back</button>
        </form>
      `;
    }

    if (local.step === 'forgotPassword') {
      return `
        <form id="form-forgot" class="space-y-4">
          <div>
            <h2 class="text-lg font-semibold text-slate-900">Reset your password</h2>
            <p class="text-sm text-slate-500 mt-0.5">Enter your email or Employee ID and we'll send you password reset instructions.</p>
          </div>
          ${alertHtml()}
          ${
            local.devResetToken
              ? `<div class="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
                  Dev/test only (no email service configured):
                  <a class="font-medium underline" href="#/reset-password?token=${encodeURIComponent(local.devResetToken)}">open the reset link</a>.
                </div>`
              : ''
          }
          <div>
            <label class="label" for="forgot-identifier">Email or Employee ID</label>
            <input id="forgot-identifier" name="identifier" class="input" required />
          </div>
          <button type="submit" class="btn-primary w-full" ${local.submitting ? 'disabled' : ''}>
            ${local.submitting ? icon('loader-2', 'h-4 w-4 animate-spin') : ''} Send reset instructions
          </button>
          <button type="button" id="back-to-credentials-2" class="btn-secondary w-full">Back to sign in</button>
        </form>
      `;
    }

    // credentials
    return `
      <form id="form-credentials" class="space-y-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-900">Sign in to your account</h2>
          <p class="text-sm text-slate-500 mt-0.5">Use your work email or Employee ID</p>
        </div>
        ${alertHtml()}
        <div>
          <label class="label" for="identifier">Email or Employee ID</label>
          <input id="identifier" name="identifier" class="input" placeholder="you@nimbuscorp.com or EMP10001" autocomplete="username" required />
        </div>
        <div>
          <div class="flex items-center justify-between">
            <label class="label" for="password">Password</label>
            <button type="button" id="forgot-link" class="text-xs font-medium text-brand-600 hover:text-brand-700 mb-1">Forgot password?</button>
          </div>
          <div class="relative">
            <input id="password" name="password" class="input pr-10" type="${local.showPassword ? 'text' : 'password'}" autocomplete="current-password" required />
            <button type="button" id="toggle-password" class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
              aria-label="${local.showPassword ? 'Hide password' : 'Show password'}">
              ${local.showPassword ? icon('eye-off', 'h-4 w-4') : icon('eye', 'h-4 w-4')}
            </button>
          </div>
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-600">
          <input id="remember-me" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          Remember me on this device
        </label>
        <button type="submit" class="btn-primary w-full" ${local.submitting ? 'disabled' : ''}>
          ${local.submitting ? icon('loader-2', 'h-4 w-4 animate-spin') : ''} Sign in
        </button>
        <p class="text-center text-xs text-slate-400 pt-1">
          Protected by role-based access control &amp; optional two-factor authentication.
        </p>
      </form>
    `;
  }

  function wire() {
    if (local.step === 'credentials') {
      const form = container.querySelector('#form-credentials');
      container.querySelector('#toggle-password').addEventListener('click', () => {
        local.showPassword = !local.showPassword;
        draw();
      });
      container.querySelector('#forgot-link').addEventListener('click', () => {
        local.error = null;
        local.success = null;
        local.step = 'forgotPassword';
        draw();
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        local.error = null;
        local.success = null;
        local.submitting = true;
        draw();
        const identifier = form.elements.identifier.value;
        const password = form.elements.password.value;
        const rememberMe = form.elements['remember-me'].checked;
        try {
          const result = await login(identifier, password, rememberMe);
          if (result.requiresTwoFactor) {
            local.tempToken = result.tempToken;
            local.submitting = false;
            local.step = 'twoFactor';
            draw();
          } else {
            navigate('/dashboard');
          }
        } catch (err) {
          local.error = apiErrorMessage(err, 'Invalid credentials. Please try again.');
          local.submitting = false;
          draw();
        }
      });
    } else if (local.step === 'twoFactor') {
      const form = container.querySelector('#form-2fa');
      container.querySelector('#back-to-credentials').addEventListener('click', () => {
        local.step = 'credentials';
        local.error = null;
        draw();
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        local.error = null;
        local.submitting = true;
        draw();
        try {
          await verifyTwoFactor(local.tempToken, form.elements.otp.value);
          navigate('/dashboard');
        } catch (err) {
          local.error = apiErrorMessage(err, 'Invalid verification code.');
          local.submitting = false;
          draw();
        }
      });
      const otpInput = form.elements.otp;
      otpInput.addEventListener('input', () => {
        otpInput.value = otpInput.value.replace(/\D/g, '');
      });
    } else if (local.step === 'forgotPassword') {
      const form = container.querySelector('#form-forgot');
      const back = () => {
        local.error = null;
        local.success = null;
        local.devResetToken = null;
        local.step = 'credentials';
        draw();
      };
      container.querySelector('#back-to-credentials-2').addEventListener('click', back);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        local.error = null;
        local.success = null;
        local.devResetToken = null;
        local.submitting = true;
        draw();
        try {
          const res = await api.post('/auth/forgot-password', { identifier: form.elements.identifier.value });
          local.success = res.data.message || 'If an account exists, password reset instructions have been sent.';
          if (res.data.devResetToken) local.devResetToken = res.data.devResetToken;
        } catch (err) {
          local.error = apiErrorMessage(err);
        } finally {
          local.submitting = false;
          draw();
        }
      });
    }
  }

  draw();
}
