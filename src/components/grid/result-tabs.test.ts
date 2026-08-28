/**
 * M3 — the results strip owns the Explain plan.
 *
 * The plan used to render in a `max-h-[40%]` band stacked above the grid,
 * which stole height from the results nobody had asked it to. It is now the
 * middle tab of `Results | Explain | Messages`, so these tripwires assert both
 * halves: the tab kind exists, and the band is gone from every host that used
 * to draw it.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(relativePath: string): string {
  const text = SOURCES[`/src/${relativePath}`];
  if (text === undefined) throw new Error(`source not found: ${relativePath}`);
  return text;
}

describe('result panel tabs', () => {
  it('ActiveTab carries results, explain and messages', () => {
    expect(source('components/grid/result-toolbar.tsx')).toContain(
      "export type ActiveTab = 'results' | 'explain' | 'messages';",
    );
  });

  it('the toolbar renders an Explain tab button', () => {
    const toolbar = source('components/grid/result-toolbar.tsx');
    expect(toolbar).toContain("aria-selected={activeTab === 'explain'}");
    expect(toolbar).toContain("onTabChange('explain')");
  });

  it('result-panel mounts the plan under the Explain tab', () => {
    const panel = source('components/grid/result-panel.tsx');
    expect(panel).toContain("activeTab === 'explain'");
    expect(panel).toContain('<ExplainPanel result={explainResult} />');
  });

  it('the 40% band is gone from both layout hosts', () => {
    expect(source('components/layout/workspace-body.tsx')).not.toContain('max-h-[40%]');
    expect(source('components/layout/ConnectedLayout.tsx')).not.toContain('max-h-[40%]');
  });

  it('the auto-select marker lives in the store, not a per-mount ref', () => {
    expect(source('stores/queryStore.ts')).toContain('explainSelectedAt');
    expect(source('components/grid/result-panel.tsx')).toContain(
      'useQueryStore.setState({ explainSelectedAt: null })',
    );
  });

  it('the Messages error dot uses the token, not a raw Tailwind red', () => {
    expect(source('components/grid/result-toolbar.tsx')).not.toContain('bg-red-500');
  });
});
