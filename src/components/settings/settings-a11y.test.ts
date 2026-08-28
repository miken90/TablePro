// @vitest-environment jsdom
/**
 * B4 — every Settings control has an accessible name.
 *
 * `SettingRow` clones its single child with `aria-labelledby` (design-spec
 * 5.16, audit B4); this renders every pane and scans the static markup for
 * any `<input>`, `<select>`, or `role="switch"` control that still lacks
 * `aria-label`/`aria-labelledby` — the exact defect ("combo box, blank")
 * this phase closes.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import '../../i18n';
import { SettingsGeneral } from './settings-general';
import { SettingsEditor } from './settings-editor';
import { SettingsAppearance } from './settings-appearance';
import { SettingsConnection } from './settings-connection';
import { SettingsAi } from './settings-ai';
import { SettingsPerformance } from './settings-performance';
import { SettingsDiagnostics } from './settings-diagnostics';
import { SettingsShortcuts } from './settings-shortcuts';

const PANES: Array<{ name: string; Component: () => React.ReactElement }> = [
  { name: 'general', Component: SettingsGeneral },
  { name: 'editor', Component: SettingsEditor },
  { name: 'appearance', Component: SettingsAppearance },
  { name: 'connection', Component: SettingsConnection },
  { name: 'ai', Component: SettingsAi },
  { name: 'performance', Component: SettingsPerformance },
  { name: 'diagnostics', Component: SettingsDiagnostics },
  { name: 'shortcuts', Component: SettingsShortcuts },
];

/** Every self-contained `<input ...>`, `<select ...>` opening tag, and every
 *  opening tag carrying `role="switch"`, from static markup. */
function controlTags(html: string): string[] {
  const tags = html.match(/<(?:input|select|button|span|div)\b[^>]*>/g) ?? [];
  return tags.filter((tag) => {
    if (/^<input\b/.test(tag) || /^<select\b/.test(tag)) return true;
    return /\brole="switch"/.test(tag);
  });
}

function isNamed(tag: string): boolean {
  return /\baria-label="/.test(tag) || /\baria-labelledby="/.test(tag);
}

describe('settings a11y — every control has an accessible name', () => {
  for (const { name, Component } of PANES) {
    it(`${name} pane: zero unnamed input/select/switch controls`, () => {
      const html = renderToStaticMarkup(createElement(Component));
      const unnamed = controlTags(html).filter((tag) => !isNamed(tag));
      expect(unnamed).toEqual([]);
    });
  }

  it('control: the scanner actually finds tags to check (not a vacuous pass)', () => {
    const html = renderToStaticMarkup(createElement(SettingsGeneral));
    expect(controlTags(html).length).toBeGreaterThan(0);
  });
});
