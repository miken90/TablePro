// @vitest-environment jsdom
/**
 * What the right dock actually renders (M2): one `role="tablist"` with three
 * tabs, no scrim, no `slide-in-right` — static markup only, matching the
 * `about-dialog-render.test.ts` convention (`.tsx` files are not collected by
 * `vitest.config.ts`, so this file stays `.ts` and renders via `createElement`).
 *
 * `renderToStaticMarkup` puts React into server-render mode, where zustand's
 * hook reads `getServerSnapshot` — the store's state *as captured at module
 * load* — not the live state a `setState` call would otherwise produce. So
 * only `isConnected` (a real prop) and the store's actual default
 * (`dockOpen: true`, `dockPane: 'inspector'`) are exercisable here; a
 * live-state assertion (closed, a different pane) belongs in
 * `dock-store.test.ts`, which already covers `dockOpen`/`dockPane`
 * transitions directly against the store.
 */

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RightDock } from './right-dock';
import '../../i18n';

describe('RightDock rendering', () => {
  it('renders nothing while disconnected', () => {
    const html = renderToStaticMarkup(createElement(RightDock, { isConnected: false }));
    expect(html).toBe('');
  });

  it('renders one tablist with three tabs, open on Inspector by default', () => {
    const html = renderToStaticMarkup(createElement(RightDock, { isConnected: true }));
    expect(html).toContain('role="tablist"');
    expect((html.match(/role="tab"/g) ?? []).length).toBe(3);
    expect(html).toContain('aria-selected="true"');
  });

  it('has no scrim element and no slide-in-right animation', () => {
    const html = renderToStaticMarkup(createElement(RightDock, { isConnected: true }));
    expect(html).not.toContain('slide-in-right');
    expect(html).not.toMatch(/bg-black\//);
  });

  it('has exactly one close control for the whole dock', () => {
    const html = renderToStaticMarkup(createElement(RightDock, { isConnected: true }));
    expect((html.match(/aria-label="Close panel"/g) ?? []).length).toBe(1);
  });
});
