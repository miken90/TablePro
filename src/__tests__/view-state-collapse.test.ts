/**
 * The tab is the only view state (design-spec M1).
 *
 * `layoutStore.viewMode`, `activeTableContext` and `structureTarget` were
 * three globals the shell hand-synchronised in three copies of the same
 * callback. This pins their absence, and pins that every activation path
 * goes through the one sync function — including the restore of a persisted
 * active tab at launch, which had no sync path at all before.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../{stores,hooks,components,editor}/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(relativePath: string): string {
  const text = SOURCES[`../${relativePath}`];
  if (text === undefined) throw new Error(`source not found: ${relativePath}`);
  return text;
}

const DELETED_GLOBALS = ['viewMode', 'activeTableContext', 'structureTarget', 'switchToQueryMode', 'openStructure(', 'closeStructure'];

describe('view-state collapse', () => {
  it('layoutStore no longer carries a view mode, table context, or structure target', () => {
    const store = source('stores/layoutStore.ts');
    for (const name of DELETED_GLOBALS) {
      expect(store, name).not.toContain(name);
    }
  });

  it('no store, hook, or layout component reads the deleted globals', () => {
    for (const [key, text] of Object.entries(SOURCES)) {
      if (/\.test\.tsx?$/.test(key)) continue;
      if (!/\/(stores|hooks|components\/layout)\//.test(key)) continue;
      for (const name of ['activeTableContext', 'structureTarget', 'switchToQueryMode']) {
        expect(text, `${key} still references ${name}`).not.toContain(name);
      }
      // `viewMode` survives only as a component-local useState elsewhere,
      // never as a layoutStore field.
      expect(text, `${key} reads viewMode from a store`).not.toMatch(/useLayoutStore\([^)]*viewMode/);
    }
  });

  it('MainLayout has one tab-sync function, not three hand-rolled switch callbacks', () => {
    const main = source('components/layout/MainLayout.tsx');
    expect(main).toContain('syncActiveTabContext');
    expect(main).not.toMatch(/tab\.type === "query"/);
    expect(main).not.toContain('openTable(');
  });

  it('every activation path calls syncActiveTabContext, including the launch-time restore', () => {
    const main = source('components/layout/MainLayout.tsx');
    // performTabSwitch, handleTabActivated, handleAfterClose, and the
    // initFromBackend continuation.
    expect(main.match(/syncActiveTabContext\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(main).toMatch(/initFromBackend\(\)\s*\.then\([\s\S]*?syncActiveTabContext/);

    const callbacks = source('hooks/useTableCallbacks.ts');
    // quick switcher + sidebar open go through openTableTab; preview table
    // syncs explicitly; history select activates a query tab (which syncs).
    expect(callbacks.match(/openTableTab\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(callbacks).toContain('syncActiveTabContext(');
    expect(callbacks).toMatch(/handleHistorySelect[\s\S]*?activateQueryTab\(/);

    const connected = source('components/layout/ConnectedLayout.tsx');
    expect(connected).toContain('openStructureTab(');

    const sync = source('stores/active-tab-sync.ts');
    for (const fn of ['openTableTab', 'openStructureTab', 'activateQueryTab']) {
      expect(sync).toMatch(new RegExp(`export function ${fn}[\\s\\S]*?syncActiveTabContext\\(`));
    }
  });

  it('the activeTabId subscription is installed at boot and Ctrl+W / vim :q close through the tab bar guard', () => {
    expect(source('components/layout/MainLayout.tsx')).toContain('installActiveTabSync()');
    expect(source('stores/active-tab-sync.ts')).toMatch(/useEditorStore\.subscribe\(\s*\(s\) => s\.activeTabId/);
    const cmds = source('hooks/useMainLayoutCommands.ts');
    expect(cmds).toContain('requestCloseTab(');
    expect(cmds).not.toMatch(/tabs\.close[\s\S]{0,300}closeTab\(/);
    expect(source('editor/vim-mode.ts')).toContain('requestCloseTab(');
    expect(source('components/editor/EditorTabBar.tsx')).toContain('registerCloseTabHandler(handleCloseTab)');
  });

  it('ConnectedLayout no longer has the structure takeover branch and always renders the tab bar when connected', () => {
    const connected = source('components/layout/ConnectedLayout.tsx');
    expect(connected).not.toContain('TableStructureView');
    expect(connected).toContain('<EditorTabBar');
    expect(connected).toContain('<WorkspaceBody');
  });

  it('the change store exposes a non-destructive scope release', () => {
    const change = source('stores/changeStore.ts');
    expect(change).toContain('clearActiveTable()');
    const sync = source('stores/active-tab-sync.ts');
    expect(sync).toContain('clearActiveTable()');
    expect(sync).not.toMatch(/\.clear\(\)/);
    expect(sync).not.toContain('clearForTable');
  });
});
