import { icon, renderIcons } from './icons.js';
import { NAV_BY_ROLE } from './navigation.js';
import { ROLE_LABELS } from './permissions.js';
import { getState, logout, dismissSessionExpired, subscribe } from './auth.js';
import { navigate } from './router.js';
import { initials } from './format.js';

function sidebarHtml(user, activePath) {
  const items = NAV_BY_ROLE[user.role];
  const name = user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email;
  return `
    <div id="sidebar-overlay" class="fixed inset-0 z-30 bg-slate-900/40 lg:hidden hidden"></div>
    <aside id="sidebar" class="fixed z-40 inset-y-0 left-0 w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col transition-transform lg:static lg:translate-x-0 -translate-x-full">
      <div class="flex items-center justify-between px-5 h-16 border-b border-slate-100">
        <div class="flex items-center gap-2">
          <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">${icon('landmark', 'h-5 w-5')}</div>
          <div>
            <p class="text-sm font-semibold text-slate-900 leading-none">PayrollPro</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Nimbus Corporation</p>
          </div>
        </div>
        <button id="sidebar-close" class="lg:hidden text-slate-400 hover:text-slate-600">${icon('x', 'h-5 w-5')}</button>
      </div>

      <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        ${items
          .map(
            (item) => `
          <a href="#${item.path}" data-nav-link data-path="${item.path}"
             class="nav-link flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
               item.path === activePath ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
             }">
            ${icon(item.icon, 'h-4.5 w-4.5 shrink-0')}
            ${item.label}
          </a>`
          )
          .join('')}
      </nav>

      <div class="p-4 border-t border-slate-100">
        <p class="text-[11px] text-slate-400">Signed in as</p>
        <p class="text-sm font-medium text-slate-700 truncate">${name}</p>
      </div>
    </aside>
  `;
}

function topbarHtml(user) {
  const name = user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email;
  const avatarInitials = user.profile ? initials(user.profile.firstName, user.profile.lastName) : user.email[0].toUpperCase();
  return `
    <header class="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 backdrop-blur px-4 lg:px-6">
      <div class="flex items-center gap-3">
        <button id="topbar-menu-btn" class="lg:hidden text-slate-500 hover:text-slate-700">${icon('menu', 'h-6 w-6')}</button>
        <div>
          <p class="text-sm text-slate-400">Welcome back,</p>
          <p class="text-sm font-semibold text-slate-900 -mt-0.5">${name}</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span class="hidden sm:inline-flex badge bg-brand-50 text-brand-700">${ROLE_LABELS[user.role]}</span>
        <a href="#/notifications" class="relative rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
          ${icon('bell', 'h-5 w-5')}
        </a>

        <div class="relative">
          <button id="topbar-profile-btn" class="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">${avatarInitials}</div>
            ${icon('chevron-down', 'h-4 w-4 text-slate-400')}
          </button>
          <div id="topbar-profile-menu" class="hidden">
            <div id="topbar-profile-overlay" class="fixed inset-0 z-10"></div>
            <div class="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-slate-100 bg-white py-1 shadow-lg animate-fadeIn">
              <a href="#/profile" class="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                ${icon('user-circle', 'h-4 w-4')} My Profile
              </a>
              <a href="#/settings" class="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                ${icon('settings', 'h-4 w-4')} Settings
              </a>
              <div class="my-1 border-t border-slate-100"></div>
              <button id="topbar-logout-btn" class="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                ${icon('log-out', 'h-4 w-4')} Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  `;
}

function sessionExpiredHtml() {
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 animate-fadeIn">
      <div class="card max-w-sm w-full text-center">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          ${icon('alert-triangle', 'h-6 w-6')}
        </div>
        <h2 class="text-lg font-semibold text-slate-900">Session expired</h2>
        <p class="mt-1 text-sm text-slate-500">
          For your security, you've been signed out due to inactivity or an expired session. Please log in again.
        </p>
        <button id="session-expired-back-btn" class="btn-primary mt-5 w-full">Back to login</button>
      </div>
    </div>
  `;
}

/** Builds the persistent app shell (sidebar + topbar + empty main) once per login. Returns the #main-content element. */
export function renderShell(appRoot, activePath) {
  const { user } = getState();
  appRoot.innerHTML = `
    <div class="flex h-screen overflow-hidden bg-slate-50">
      ${sidebarHtml(user, activePath)}
      <div class="flex flex-1 flex-col overflow-hidden">
        ${topbarHtml(user)}
        <main id="main-content" class="flex-1 overflow-y-auto p-4 lg:p-6"></main>
      </div>
      <div id="session-expired-container"></div>
    </div>
  `;
  renderIcons();
  wireShellInteractions(appRoot);
  renderSessionExpired(appRoot);

  const unsubscribe = subscribe((state) => {
    if (state.sessionExpired) renderSessionExpired(appRoot);
    else {
      const c = appRoot.querySelector('#session-expired-container');
      if (c) c.innerHTML = '';
    }
  });
  appRoot._shellUnsubscribe = unsubscribe;

  return appRoot.querySelector('#main-content');
}

function renderSessionExpired(appRoot) {
  const container = appRoot.querySelector('#session-expired-container');
  if (!container) return;
  if (!getState().sessionExpired) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = sessionExpiredHtml();
  renderIcons();
  container.querySelector('#session-expired-back-btn').addEventListener('click', () => {
    dismissSessionExpired();
    navigate('/login');
  });
}

function wireShellInteractions(appRoot) {
  const sidebar = appRoot.querySelector('#sidebar');
  const overlay = appRoot.querySelector('#sidebar-overlay');

  function openSidebar() {
    sidebar.classList.remove('-translate-x-full');
    overlay.classList.remove('hidden');
  }
  function closeSidebar() {
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
  }
  appRoot.querySelector('#topbar-menu-btn').addEventListener('click', openSidebar);
  appRoot.querySelector('#sidebar-close').addEventListener('click', closeSidebar);
  overlay.addEventListener('click', closeSidebar);
  appRoot.querySelectorAll('[data-nav-link]').forEach((el) => el.addEventListener('click', closeSidebar));

  const profileBtn = appRoot.querySelector('#topbar-profile-btn');
  const profileMenu = appRoot.querySelector('#topbar-profile-menu');
  profileBtn.addEventListener('click', () => profileMenu.classList.toggle('hidden'));
  profileMenu.querySelector('#topbar-profile-overlay').addEventListener('click', () => profileMenu.classList.add('hidden'));
  profileMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => profileMenu.classList.add('hidden')));
  appRoot.querySelector('#topbar-logout-btn').addEventListener('click', () => {
    profileMenu.classList.add('hidden');
    logout();
  });
}

/** Updates the sidebar's active-link highlighting without rebuilding the shell. */
export function updateActiveNav(appRoot, activePath) {
  appRoot.querySelectorAll('[data-nav-link]').forEach((el) => {
    const isActive = el.getAttribute('data-path') === activePath;
    el.classList.toggle('bg-brand-50', isActive);
    el.classList.toggle('text-brand-700', isActive);
    el.classList.toggle('text-slate-600', !isActive);
  });
}

export function destroyShell(appRoot) {
  if (appRoot._shellUnsubscribe) {
    appRoot._shellUnsubscribe();
    appRoot._shellUnsubscribe = null;
  }
}
