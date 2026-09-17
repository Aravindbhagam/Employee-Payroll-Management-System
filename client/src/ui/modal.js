import { icon, renderIcons } from '../icons.js';

/**
 * Imperative modal helper (there's no component tree to mount into).
 * onMount(contentEl, close) runs after the modal is in the DOM, so callers
 * can query form fields and wire up submit handlers; it may call close()
 * itself once its action completes. Matches the original Modal.tsx: only
 * the X button closes it, not a backdrop click.
 */
export function openModal({ title, wide = false, bodyHtml, onMount }) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 animate-fadeIn';
  overlay.innerHTML = `
    <div class="w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-xl2 bg-white shadow-xl max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4 sticky top-0 bg-white">
        <h2 class="text-base font-semibold text-slate-900">${title}</h2>
        <button data-modal-close class="text-slate-400 hover:text-slate-600">${icon('x', 'h-5 w-5')}</button>
      </div>
      <div class="p-5"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const contentEl = overlay.querySelector('.p-5');
  contentEl.innerHTML = bodyHtml;

  function close() {
    overlay.remove();
  }
  overlay.querySelector('[data-modal-close]').addEventListener('click', close);

  renderIcons();
  if (onMount) onMount(contentEl, close);

  return { close, el: contentEl };
}
