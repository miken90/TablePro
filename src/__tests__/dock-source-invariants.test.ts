/**
 * M2 — textual tripwires that the right dock actually replaced the two
 * dimming slide-overs, not just added a third panel beside them.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../**/*.{ts,tsx,css}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(relativePath: string): string {
  const text = SOURCES[`../${relativePath}`];
  if (text === undefined) throw new Error(`source not found: ${relativePath}`);
  return text;
}

describe('dock source invariants', () => {
  it('ConnectedLayout.tsx has no slide-over scrim or slide-in-right animation left', () => {
    const layout = source('components/layout/ConnectedLayout.tsx');
    expect(layout).not.toContain('slide-in-right');
    expect(layout).not.toContain('bg-black/20');
  });

  it('globals.css no longer defines slide-in-right', () => {
    expect(source('styles/globals.css')).not.toContain('slide-in-right');
  });

  it('layoutStore.ts no longer owns inspector/history/AI-chat visibility', () => {
    const layoutStore = source('stores/layoutStore.ts');
    expect(layoutStore).not.toContain('inspectorVisible');
    expect(layoutStore).not.toContain('historyVisible');
    expect(layoutStore).not.toContain('aiChatVisible');
    expect(layoutStore).not.toContain('syncInspectorForTabKind');
  });

  it('the right dock mounts once in ConnectedLayout.tsx', () => {
    const layout = source('components/layout/ConnectedLayout.tsx');
    expect(layout).toContain('<RightDock');
  });

  it('the AI pane stays lazy() + Suspense inside the dock', () => {
    const dock = source('components/layout/right-dock.tsx');
    expect(dock).toMatch(/lazy\(\(\)\s*=>\s*import\(["']\.\.\/ai\/ai-chat-panel["']\)/);
    expect(dock).toContain('<Suspense');
  });
});
