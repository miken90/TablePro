/**
 * Import SQL reachability.
 *
 * The import backend and its dialog were both fully implemented, but nothing
 * outside `src/components/import/` imported the dialog and no handler was
 * attached to the `data.importSql` command — so the feature could not be
 * reached from the running app. These tests pin the three routes that now
 * exist: the keyboard shortcut, the command palette entry, and the toolbar
 * button, plus the store flag they all drive.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useLayoutStore } from '../stores/layoutStore';
import { COMMAND_DEFINITIONS, getDefaultBinding } from '../hooks/useCommandRegistry';
import { isGloballyDispatchable } from '../hooks/useMainLayoutShortcuts';

// Read the wiring sites as text. Rendering them is not possible in this
// node-environment vitest setup, and the point of these assertions is that the
// wiring *exists at all* — the components were fully written and simply never
// referenced.
const SOURCES = import.meta.glob('../{hooks,components}/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(relativePath: string): string {
  const key = `../${relativePath}`;
  const text = SOURCES[key];
  if (text === undefined) {
    throw new Error(`source not found: ${key}`);
  }
  return text;
}

beforeEach(() => {
  useLayoutStore.setState({ importOpen: false });
});

describe('data.importSql command', () => {
  it('is declared in the registry with the documented shortcut', () => {
    const def = COMMAND_DEFINITIONS.find((c) => c.id === 'data.importSql');
    expect(def).toBeDefined();
    expect(def?.label).toBe('Import SQL');
    expect(getDefaultBinding('data.importSql')).toEqual(['Ctrl', 'Shift', 'M']);
  });

  it('is bound in the live keydown dispatcher, not just declared', () => {
    // The global dispatcher resolves bindings from the registry and fires
    // whatever handler is registered, so the invariant is now: the command is
    // globally dispatchable AND something registered a handler for it.
    expect(isGloballyDispatchable('data.importSql')).toBe(true);
    expect(source('hooks/useMainLayoutCommands.ts')).toContain('data.importSql');
  });

  it('is registered as a palette command with an action', () => {
    expect(source('hooks/useMainLayoutCommands.ts')).toContain('data.importSql');
    expect(source('hooks/useMainLayoutCommands.ts')).toContain('setImportOpen');
  });
});

describe('import dialog wiring', () => {
  it('is imported by ConnectedLayout, which owns the active session', () => {
    const layout = source('components/layout/ConnectedLayout.tsx');
    expect(layout).toContain('../import/import-dialog');
    expect(layout).toContain('<ImportDialog');
  });

  it('is reachable from the toolbar next to the other session actions', () => {
    const toolbar = source('components/layout/Toolbar.tsx');
    expect(toolbar).toContain('setImportOpen');
    // Gated on the same capability the export command enforces.
    expect(toolbar).toContain('capabilities.supportsImportExport');
  });
});

describe('layout store import flag', () => {
  it('defaults closed and toggles', () => {
    expect(useLayoutStore.getState().importOpen).toBe(false);
    useLayoutStore.getState().setImportOpen(true);
    expect(useLayoutStore.getState().importOpen).toBe(true);
    useLayoutStore.getState().setImportOpen(false);
    expect(useLayoutStore.getState().importOpen).toBe(false);
  });
});

describe('export dialog formats', () => {
  it('offers XLSX alongside the three text formats', () => {
    const dialog = source('components/export/export-dialog.tsx');
    expect(dialog).toContain("'csv' | 'json' | 'sql' | 'xlsx'");
    expect(dialog).toContain("setFormat('xlsx')");
    expect(dialog).toContain("xlsx: 'xlsx'");
  });

  it('excludes XLSX from the text-only preview and copy paths', () => {
    const dialog = source('components/export/export-dialog.tsx');
    expect(dialog).toContain("TEXT_FORMATS: ReadonlySet<ExportFormat> = new Set<ExportFormat>(['csv', 'json', 'sql'])");
    expect(dialog).toContain('TEXT_FORMATS.has(format)');
  });
});
