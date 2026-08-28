/**
 * Textual tripwires for the canonical component kit (design-spec 5.16).
 *
 * `outline-none` deleting a focus ring with nothing replacing it is exactly
 * AUDIT B1's defect; a raw Tailwind palette class (`bg-blue-500`) is exactly
 * how the pre-rebuild set drifted into seven different `.btn` renderings.
 * Neither should ever reappear inside this kit.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('./*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const RAW_PALETTE = /\b(zinc|blue|red|amber|green)-[0-9]{2,3}\b/;

describe('ui kit invariants', () => {
  it('covers every kit component file', () => {
    // Control: the glob must actually find files, or every check below
    // would pass just as happily on an empty kit.
    expect(Object.keys(SOURCES).length).toBeGreaterThanOrEqual(12);
  });

  for (const [path, source] of Object.entries(SOURCES)) {
    it(`${path} does not emit outline-none`, () => {
      expect(source.includes('outline-none')).toBe(false);
    });

    it(`${path} does not emit a raw Tailwind palette class`, () => {
      expect(RAW_PALETTE.test(source)).toBe(false);
    });
  }
});
