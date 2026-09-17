/**
 * Presentational only. Buttons carry data-action="prev-page"/"next-page";
 * the page that renders this wires those into its own delegated click
 * handler (see pages for the pattern).
 */
export function pagination({ page, pageSize, total }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return `
    <div class="flex items-center justify-between mt-4 text-sm text-slate-500">
      <span>${total} total</span>
      <div class="flex items-center gap-2">
        <button class="btn-secondary" data-action="prev-page" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span class="text-xs text-slate-400">Page ${page} of ${totalPages}</span>
        <button class="btn-secondary" data-action="next-page" ${page >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  `;
}
