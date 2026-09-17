export function pageHeader({ title, subtitle, actionsHtml }) {
  return `
    <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">${title}</h1>
        ${subtitle ? `<p class="text-sm text-slate-500 mt-0.5">${subtitle}</p>` : ''}
      </div>
      ${actionsHtml ? `<div class="flex flex-wrap gap-2">${actionsHtml}</div>` : ''}
    </div>
  `;
}
