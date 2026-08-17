/**
 * Is a key event aimed at somewhere the user is typing?
 *
 * The result panel listens for Delete/Backspace/Ctrl+V on `window`, so it also
 * sees keys typed into the filter box, the WHERE input, the quick search and
 * the SQL editor. Without this guard, Backspace in any of them stopped editing
 * text and staged a row delete instead, and Ctrl+V never reached the input.
 *
 * Duck-typed rather than `instanceof HTMLElement` so the rule can be exercised
 * without a DOM.
 */
interface KeyEventTargetLike {
  tagName?: unknown;
  isContentEditable?: unknown;
  closest?: (selector: string) => unknown;
}

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isTextEntryTarget(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const el = target as KeyEventTargetLike;

  if (typeof el.tagName === 'string' && TEXT_ENTRY_TAGS.has(el.tagName.toUpperCase())) {
    return true;
  }
  if (el.isContentEditable === true) return true;
  // CodeMirror renders its editable surface inside `.cm-editor`.
  if (typeof el.closest === 'function' && el.closest('.cm-editor')) return true;

  return false;
}
