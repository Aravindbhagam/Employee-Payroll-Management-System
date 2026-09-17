// Thin helper around the global `lucide` UMD build (loaded via CDN in
// index.html), which provides the same icon set/names as lucide-react.

/** Returns an <i> placeholder that lucide.createIcons() turns into an inline SVG. */
export function icon(name, className = 'h-4 w-4') {
  return `<i data-lucide="${name}" class="${className}"></i>`;
}

/**
 * Call after inserting HTML containing icon() placeholders into the DOM.
 * lucide.createIcons() scans the whole document for [data-lucide]
 * elements and swaps each for an inline SVG; it's idempotent, so calling
 * it after every render (rather than trying to scope it) is safe and
 * simple.
 */
export function renderIcons() {
  if (window.lucide) window.lucide.createIcons();
}
