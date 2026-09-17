import { icon, renderIcons } from '../icons.js';
import { navigate } from '../router.js';

export function render(container) {
  container.innerHTML = `
    <div class="flex min-h-[70vh] flex-col items-center justify-center text-center px-4 animate-fadeIn">
      <div class="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600 mb-5">
        ${icon('shield-alert', 'h-8 w-8')}
      </div>
      <h1 class="text-2xl font-semibold text-slate-900">403 — Access Denied</h1>
      <p class="mt-2 max-w-md text-slate-500">
        You don't have permission to access this page. Please contact your administrator if you believe you need access.
      </p>
      <div class="mt-6 flex gap-3">
        <button id="forbidden-back" class="btn-secondary">Go back</button>
        <button id="forbidden-dashboard" class="btn-primary">Return to dashboard</button>
      </div>
    </div>
  `;
  renderIcons();
  container.querySelector('#forbidden-back').addEventListener('click', () => history.back());
  container.querySelector('#forbidden-dashboard').addEventListener('click', () => navigate('/dashboard'));
}
