import { icon } from '../icons.js';

export function fullPageSpinner() {
  return `<div class="flex h-screen w-full items-center justify-center bg-slate-50">${icon('loader-2', 'h-8 w-8 animate-spin text-brand-600')}</div>`;
}

export function spinner(className = 'h-4 w-4') {
  return icon('loader-2', `animate-spin ${className}`);
}
