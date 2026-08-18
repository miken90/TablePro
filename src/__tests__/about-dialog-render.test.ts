// @vitest-environment jsdom
/**
 * What the About box actually renders.
 *
 * Runs in jsdom: the dialog reads `navigator.platform`, which does not exist
 * in every Node version the CI runner may use.
 */

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AboutDialog } from '../components/shared/about-dialog';
import '../i18n';
import pkg from '../../package.json';

// `__APP_VERSION__` is injected by Vite's `define` at build time; the test
// runner does not apply it, so stand in the same value the build would.
declare global {
  var __APP_VERSION__: string;
}
globalThis.__APP_VERSION__ = pkg.version;

describe('AboutDialog rendering', () => {
  it('renders the build version, not a hardcoded one', () => {
    const html = renderToStaticMarkup(
      createElement(AboutDialog, { open: true, onClose: () => {} }),
    );
    expect(html).toContain('TablePro');
    expect(html).toContain(__APP_VERSION__);
    expect(html).not.toContain('0.1.0');
  });

  it('renders nothing while closed', () => {
    const html = renderToStaticMarkup(
      createElement(AboutDialog, { open: false, onClose: () => {} }),
    );
    expect(html).toBe('');
  });

  it('links nowhere — the dialog makes no external claims', () => {
    const html = renderToStaticMarkup(
      createElement(AboutDialog, { open: true, onClose: () => {} }),
    );
    expect(html).not.toContain('<a ');
    // The only http in the markup is the SVG namespace on the close icon.
    expect(html).not.toMatch(/href=["']https?:/);
  });
});
