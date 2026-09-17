import { icon } from '../icons.js';

const TONE_STYLES = {
  brand: 'bg-brand-50 text-brand-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
};

export function statCard({ label, value, iconName, tone = 'brand', hint }) {
  return `
    <div class="card flex items-start justify-between animate-fadeIn">
      <div>
        <p class="text-sm text-slate-500">${label}</p>
        <p class="mt-1 text-2xl font-semibold text-slate-900">${value}</p>
        ${hint ? `<p class="mt-1 text-xs text-slate-400">${hint}</p>` : ''}
      </div>
      ${iconName ? `<div class="rounded-lg p-2.5 ${TONE_STYLES[tone]}">${icon(iconName, 'h-5 w-5')}</div>` : ''}
    </div>
  `;
}
