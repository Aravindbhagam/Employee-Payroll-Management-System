import { getState, subscribe } from './auth.js';
import { renderShell, updateActiveNav, destroyShell } from './layout.js';
import { fullPageSpinner } from './ui/spinner.js';

const routes = [];

/**
 * config: { standalone?: boolean, checkAccess?: (user) => boolean,
 *           load: () => Promise<{ render(container, ctx): (void | (() => void)) }> }
 * render's return value (if any) is treated as a cleanup function, called
 * before the next navigation -- the equivalent of a React effect's cleanup.
 */
export function route(path, config) {
  const keys = [];
  const pattern = new RegExp(
    '^' +
      path.replace(/:[^/]+/g, (m) => {
        keys.push(m.slice(1));
        return '([^/]+)';
      }) +
      '$'
  );
  routes.push({ path, pattern, keys, ...config });
}

function matchRoute(pathname) {
  for (const r of routes) {
    const m = r.pattern.exec(pathname);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    }
  }
  return null;
}

export function navigate(path) {
  if (currentPath() === path) return;
  location.hash = '#' + path;
}

function currentPath() {
  const hash = location.hash.slice(1);
  return hash || '/';
}

function currentQuery() {
  const idx = location.hash.indexOf('?');
  return new URLSearchParams(idx >= 0 ? location.hash.slice(idx + 1) : '');
}

let appRoot;
let shellMain = null; // #main-content element, once the shell is built
let shellBuiltForUserId = null;
let currentDestroy = null;
let renderToken = 0;

async function renderRoute() {
  const token = ++renderToken;
  const { user, loading } = getState();
  const path = currentPath().split('?')[0];
  const match = matchRoute(path);

  if (currentDestroy) {
    try {
      currentDestroy();
    } catch {
      /* ignore cleanup errors */
    }
    currentDestroy = null;
  }

  if (loading) {
    appRoot.innerHTML = fullPageSpinner();
    return;
  }

  if (!match) {
    navigate('/dashboard');
    return;
  }

  if (match.route.standalone) {
    destroyShell(appRoot);
    shellMain = null;
    shellBuiltForUserId = null;
    const mod = await match.route.load();
    if (token !== renderToken) return;
    appRoot.innerHTML = '';
    currentDestroy = (await mod.render(appRoot, { params: match.params, query: currentQuery() })) || null;
    return;
  }

  if (!user) {
    navigate('/login');
    return;
  }

  if (match.route.checkAccess && !match.route.checkAccess(user)) {
    if (shellBuiltForUserId !== user.id) {
      shellMain = renderShell(appRoot, path);
      shellBuiltForUserId = user.id;
    } else {
      updateActiveNav(appRoot, path);
    }
    const mod = await import('./pages/forbidden.js');
    if (token !== renderToken) return;
    shellMain.innerHTML = '';
    mod.render(shellMain);
    return;
  }

  if (shellBuiltForUserId !== user.id) {
    shellMain = renderShell(appRoot, path);
    shellBuiltForUserId = user.id;
  } else {
    updateActiveNav(appRoot, path);
  }

  shellMain.innerHTML = fullPageSpinner();
  const mod = await match.route.load();
  if (token !== renderToken) return;
  shellMain.innerHTML = '';
  currentDestroy = (await mod.render(shellMain, { params: match.params, query: currentQuery() })) || null;
}

export function mountRouter(root) {
  appRoot = root;
  subscribe(() => renderRoute());
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
}
