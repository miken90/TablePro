/**
 * The shell's accessibility landmarks survived the ConnectedLayout rewrite.
 *
 * `<main id="main-content">`, the skip link that points at it, and the live
 * region for query completion are shipped behaviour (design-spec 6.4). They
 * sit in files the tab-kind rebuild gutted, and nothing else asserted them.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../{App.tsx,components/**/*.tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(relativePath: string): string {
  const text = SOURCES[`../${relativePath}`];
  if (text === undefined) throw new Error(`source not found: ${relativePath}`);
  return text;
}

describe('shell landmarks', () => {
  it('the workspace is a <main> the skip link can reach', () => {
    expect(source('components/layout/ConnectedLayout.tsx')).toMatch(/<main id="main-content"/);
    expect(source('components/shared/skip-link.tsx')).toContain('href="#main-content"');
    expect(source('App.tsx')).toContain('<SkipLink />');
  });

  it('the query announcer live region is still mounted', () => {
    expect(source('components/layout/OverlayRegion.tsx')).toContain('<QueryAnnouncer />');
  });

  it('exactly one <main> is rendered by the shell', () => {
    const mains = Object.entries(SOURCES)
      .filter(([key]) => !/\.test\.tsx?$/.test(key))
      .filter(([, text]) => /<main[\s>]/.test(text))
      .map(([key]) => key);
    expect(mains).toEqual(['../components/layout/ConnectedLayout.tsx']);
  });
});
