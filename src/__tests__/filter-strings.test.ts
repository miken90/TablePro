/**
 * D2 — the filter tooltip must never advertise another command's shortcut
 * again. `nav.toggleAiChat` is Ctrl+Shift+L; no filter-labelled string may
 * sit next to that literal combo, and the dead `grid.contextualBar.
 * toggleFilters` key (its button removed with Q9's single mount) must be
 * gone from both locales.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const JSON_SOURCES = import.meta.glob('../i18n/locales/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('filter shortcut strings are honest', () => {
  it('no source file pairs a filter label with the AI-chat shortcut Ctrl+Shift+L', () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(SOURCES)) {
      if (path.includes('__tests__') || path.includes('.test.')) continue;
      text.split('\n').forEach((line, i) => {
        if (/filter/i.test(line) && /Ctrl\+Shift\+L/.test(line)) {
          offenders.push(`${path}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('no locale file pairs a filter string with Ctrl+Shift+L', () => {
    expect(Object.keys(JSON_SOURCES).length).toBeGreaterThanOrEqual(2);
    for (const [path, text] of Object.entries(JSON_SOURCES)) {
      text.split('\n').forEach((line, i) => {
        if (/filter/i.test(line) && /Ctrl\+Shift\+L/.test(line)) {
          throw new Error(`${path}:${i + 1} still advertises Ctrl+Shift+L: ${line.trim()}`);
        }
      });
    }
  });

  it('the dead grid.contextualBar.toggleFilters key is gone from every locale', () => {
    expect(Object.keys(JSON_SOURCES).length).toBeGreaterThanOrEqual(2);
    for (const [path, text] of Object.entries(JSON_SOURCES)) {
      expect(text, path).not.toContain('"toggleFilters"');
    }
  });

  it('statusBar.toggleFilter interpolates {{shortcut}} rather than a literal combo', () => {
    for (const [path, text] of Object.entries(JSON_SOURCES)) {
      const match = /"toggleFilter"\s*:\s*"([^"]*)"/.exec(text);
      expect(match, `${path}: statusBar.toggleFilter not found`).toBeTruthy();
      const value = match![1];
      expect(value, path).toContain('{{shortcut}}');
      expect(value, path).not.toMatch(/Ctrl\+/);
    }
  });
});
