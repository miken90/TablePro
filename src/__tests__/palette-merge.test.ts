/**
 * M5 — the merge actually replaced the two overlays; a dead second palette
 * left unreferenced is exactly the class of defect this rebuild removes.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(relativePath: string): string {
  const text = SOURCES[`../${relativePath}`];
  if (text === undefined) throw new Error(`source not found: ${relativePath}`);
  return text;
}

describe('palette merge (M5)', () => {
  it('the old quick switcher and command palette files no longer exist', () => {
    expect(SOURCES['../components/layout/quick-switcher.tsx']).toBeUndefined();
    expect(SOURCES['../components/shared/command-palette/command-palette.tsx']).toBeUndefined();
    expect(SOURCES['../components/shared/command-palette/command-item.tsx']).toBeUndefined();
    expect(SOURCES['../components/shared/command-palette/index.ts']).toBeUndefined();
  });

  it('OverlayRegion mounts exactly one palette', () => {
    const text = source('components/layout/OverlayRegion.tsx');
    expect((text.match(/<Palette\b/g) ?? []).length).toBe(1);
    expect(text).not.toContain('<QuickSwitcher');
    expect(text).not.toContain('<CommandPalette');
  });

  it('layoutStore no longer owns the two separate overlay flags', () => {
    const text = source('stores/layoutStore.ts');
    expect(text).not.toContain('quickSwitcherOpen');
    expect(text).not.toContain('commandPaletteOpen');
    expect(text).toContain('paletteOpen');
    expect(text).toContain('paletteSeedMode');
  });

  it('cmdk is not imported anywhere in src', () => {
    for (const [path, text] of Object.entries(SOURCES)) {
      if (path.includes('.test.')) continue;
      expect(text, path).not.toMatch(/from ["']cmdk["']/);
    }
  });
});
