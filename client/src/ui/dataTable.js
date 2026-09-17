/**
 * columns: { header: string, accessor: (row) => string (HTML), className?: string }[]
 * Each accessor returns an HTML string; callers are responsible for escaping
 * any untrusted values they interpolate (see format.js's esc()).
 */
export function dataTable({ columns, data, keyFn, emptyMessage = 'No records found.', loading }) {
  const head = columns.map((c) => `<th class="pb-3 pr-4 font-semibold">${c.header}</th>`).join('');

  let body;
  if (loading) {
    body = `<tr><td colspan="${columns.length}" class="py-8 text-center text-slate-400">Loading...</td></tr>`;
  } else if (!data || data.length === 0) {
    body = `<tr><td colspan="${columns.length}" class="py-8 text-center text-slate-400">${emptyMessage}</td></tr>`;
  } else {
    body = data
      .map(
        (row) => `
      <tr class="hover:bg-slate-50/70 transition-colors" data-row-key="${keyFn(row)}">
        ${columns.map((c) => `<td class="py-3 pr-4 text-slate-700 ${c.className || ''}">${c.accessor(row)}</td>`).join('')}
      </tr>`
      )
      .join('');
  }

  return `
    <div class="overflow-x-auto -mx-5 px-5">
      <table class="w-full min-w-[640px] text-sm">
        <thead>
          <tr class="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">${head}</tr>
        </thead>
        <tbody class="divide-y divide-slate-50">${body}</tbody>
      </table>
    </div>
  `;
}
