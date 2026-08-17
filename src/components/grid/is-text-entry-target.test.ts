/**
 * Focus guard for the grid's global key handler.
 *
 * The result panel listens on `window`, so with rows selected in table mode a
 * Backspace typed into the filter box, the WHERE input, the quick search or
 * the SQL editor was swallowed: `preventDefault()` stopped the text edit and
 * `deleteContextRows()` staged deletes the user never asked for. Ctrl+V was
 * swallowed the same way.
 */

import { describe, expect, it } from 'vitest';
import { isTextEntryTarget } from './is-text-entry-target';

/** A stand-in for a DOM element; this suite runs without a DOM. */
function element(tagName: string, opts: { editable?: boolean; insideEditor?: boolean } = {}) {
  return {
    tagName,
    isContentEditable: opts.editable ?? false,
    closest: (selector: string) => (opts.insideEditor && selector === '.cm-editor' ? {} : null),
  };
}

describe('isTextEntryTarget', () => {
  it('claims the inputs the grid shortcuts used to break', () => {
    expect(isTextEntryTarget(element('INPUT'))).toBe(true);
    expect(isTextEntryTarget(element('TEXTAREA'))).toBe(true);
    expect(isTextEntryTarget(element('SELECT'))).toBe(true);
  });

  it('claims contenteditable and anything inside the SQL editor', () => {
    expect(isTextEntryTarget(element('DIV', { editable: true }))).toBe(true);
    expect(isTextEntryTarget(element('DIV', { insideEditor: true }))).toBe(true);
  });

  it('leaves the grid itself alone so row shortcuts still work', () => {
    expect(isTextEntryTarget(element('DIV'))).toBe(false);
    expect(isTextEntryTarget(element('TD'))).toBe(false);
    expect(isTextEntryTarget(element('BODY'))).toBe(false);
  });

  it('is safe for a missing or non-element target', () => {
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isTextEntryTarget(undefined)).toBe(false);
    // A non-element target (the window itself, in the browser) must not claim
    // the key either.
    expect(isTextEntryTarget({})).toBe(false);
    expect(isTextEntryTarget('INPUT')).toBe(false);
  });
});
