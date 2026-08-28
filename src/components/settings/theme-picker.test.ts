// @vitest-environment jsdom
/**
 * M9 / SCR-57 — the theme picker is a radio group of three cards
 * (Light / Dark / System), not a plain button row (design-spec 2.3, 5.16).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import '../../i18n';
import { SettingsAppearance } from './settings-appearance';

describe('theme picker', () => {
  it('is a radiogroup with exactly three radio cards and one checked', () => {
    const html = renderToStaticMarkup(createElement(SettingsAppearance));

    expect(html).toContain('role="radiogroup"');

    const radios = html.match(/<button[^>]*\brole="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(3);

    const checked = radios.filter((tag) => /\baria-checked="true"/.test(tag));
    expect(checked).toHaveLength(1);
  });
});
