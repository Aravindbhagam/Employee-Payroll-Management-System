// Auth store: a tiny pub-sub replacement for React's AuthContext. Any UI
// that needs auth state calls subscribe() and re-renders itself on change.
import { api, setAccessToken, setUnauthorizedHandler } from './api.js';

const listeners = new Set();
let state = { user: null, loading: true, sessionExpired: false };

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState() {
  return state;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity auto-logout
const IDLE_WARNING_MS = 28 * 60 * 1000; // warn 2 minutes before

let idleTimer = null;
let warnTimer = null;
let idleListenersAttached = false;
const IDLE_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'];

function clearIdleTimers() {
  if (idleTimer) clearTimeout(idleTimer);
  if (warnTimer) clearTimeout(warnTimer);
}

function resetIdleTimer() {
  clearIdleTimers();
  if (!state.user) return;
  warnTimer = setTimeout(() => console.info('Session will expire soon due to inactivity.'), IDLE_WARNING_MS);
  idleTimer = setTimeout(() => {
    logout();
    setState({ sessionExpired: true });
  }, IDLE_TIMEOUT_MS);
}

function attachIdleListeners() {
  if (idleListenersAttached) return;
  idleListenersAttached = true;
  IDLE_EVENTS.forEach((e) => window.addEventListener(e, resetIdleTimer));
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } catch {
    /* best-effort */
  }
  setAccessToken(null);
  clearIdleTimers();
  setState({ user: null });
}

export async function login(identifier, password, rememberMe) {
  const res = await api.post('/auth/login', { identifier, password, rememberMe });
  if (res.data.requiresTwoFactor) {
    return { requiresTwoFactor: true, tempToken: res.data.tempToken };
  }
  setAccessToken(res.data.accessToken);
  setState({ user: res.data.user, sessionExpired: false });
  attachIdleListeners();
  resetIdleTimer();
  return {};
}

export async function verifyTwoFactor(tempToken, code) {
  const res = await api.post('/auth/2fa/verify', { tempToken, code });
  setAccessToken(res.data.accessToken);
  setState({ user: res.data.user, sessionExpired: false });
  attachIdleListeners();
  resetIdleTimer();
}

export async function refreshUser() {
  const res = await api.get('/auth/me');
  setState({ user: res.data.user });
}

export function dismissSessionExpired() {
  setState({ sessionExpired: false });
}

export async function initAuth() {
  setUnauthorizedHandler(() => {
    clearIdleTimers();
    setState({ user: null, sessionExpired: true });
  });
  try {
    const res = await api.post('/auth/refresh');
    setAccessToken(res.data.accessToken);
    setState({ user: res.data.user });
    attachIdleListeners();
    resetIdleTimer();
  } catch {
    setAccessToken(null);
    setState({ user: null });
  } finally {
    setState({ loading: false });
  }
}
