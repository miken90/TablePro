/**
 * Token layer invariants (Phase 1 of the UI rebuild).
 *
 * docs/design/tablepro-rebuild/tokens.css is the design authority (154 custom
 * property names). This test pins that src/styles/globals.css declares every
 * one of them, that both `color-scheme` statements exist, and that the two
 * Q4-retired legacy names (`--sidebar-bg`, bare `--border`) are gone — from
 * globals.css and from every `var(--border)` read in the app.
 */

import { describe, expect, it } from 'vitest';
import tokensCss from '../../docs/design/tablepro-rebuild/tokens.css?raw';
import globalsCss from './globals.css?raw';
import editorThemeTs from '../components/editor/editor-theme.ts?raw';

/** Extracts unique `--custom-property:` declaration names from CSS source. */
function tokenNames(source: string): Set<string> {
  const matches = source.match(/--[a-z0-9-]+:/g) ?? [];
  return new Set(matches);
}

describe('token layer', () => {
  it('declares every tokens.css name in globals.css', () => {
    const authority = tokenNames(tokensCss);
    const shipped = tokenNames(globalsCss);

    expect(authority.size).toBe(154);

    const missing = [...authority].filter((name) => !shipped.has(name));
    expect(missing).toEqual([]);
  });

  it('declares color-scheme for both themes', () => {
    expect(globalsCss).toMatch(/:root\s*{[^}]*color-scheme:\s*dark;/);
    expect(globalsCss).toMatch(/\.light\s*{[^}]*color-scheme:\s*light;/);
  });

  it('does not declare the Q4-retired legacy aliases', () => {
    expect(globalsCss.includes('--sidebar-bg:')).toBe(false);
    expect(globalsCss.includes('--border:')).toBe(false);
  });

  it('editor-theme.ts reads --color-border, never bare --border', () => {
    expect(editorThemeTs.includes('var(--border)')).toBe(false);
  });
});
