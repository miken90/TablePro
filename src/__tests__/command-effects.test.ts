/**
 * Every command must actually do something.
 *
 * The previous version of this check asserted that a command id *string
 * appeared somewhere in a source file*. That passes for a command whose action
 * dispatches a window event nothing listens for, which is exactly how
 * `app.refreshSchema` and `editor.formatSql` shipped dead: the palette entries
 * existed, the ids were present, and pressing them did nothing.
 *
 * These tests invoke each action and require an observable effect — a store
 * update or an IPC call. An action that only fires an unheard event fails.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetInvokeImpl, __setInvokeImpl } from './mocks/tauri';
import { buildMainLayoutCommands } from '../hooks/useMainLayoutCommands';
import { COMMAND_DEFINITIONS, type Command } from '../hooks/useCommandRegistry';
import { isGloballyDispatchable } from '../hooks/useMainLayoutShortcuts';
import { useLayoutStore } from '../stores/layoutStore';
import { useEditorStore } from '../stores/editorStore';
import { useQueryStore } from '../stores/queryStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useSchemaStore } from '../stores/schemaStore';
import { useDockStore, DOCK_DEFAULT_WIDTHS } from '../stores/dock-store';
import { __resetTabStreams, registerTabStream } from '../stores/tab-stream-registry';
import type { ConnectionConfig, SavedConnection } from '../types/connection';

function connectionConfig(database: string): ConnectionConfig {
  return {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: '',
    database,
    dbType: 'postgres',
    sslMode: 'disable',
    sshEnabled: false,
    sshHost: '',
    sshPort: 22,
    sshUser: '',
  } as ConnectionConfig;
}

vi.mock('../ipc/commands', async (orig) => {
  const real = await orig<typeof import('../ipc/commands')>();
  return { ...real, historyRecord: () => Promise.resolve() };
});

const t = (key: string) => key;

/** Stores whose state counts as an observable effect. */
const STORES = [
  useLayoutStore,
  useEditorStore,
  useQueryStore,
  useConnectionStore,
  useSchemaStore,
  useDockStore,
];

/** Commands owned by a component that closes over its own state, so they
 *  cannot be built outside React. They are registered by `result-panel` at
 *  mount and exercised through the dispatcher tests instead. */
const COMPONENT_OWNED = new Set(['data.save', 'data.insertRow', 'editor.formatSql']);

const CONNECTION: SavedConnection = {
  id: 'conn-1',
  name: 'conn-1',
  config: connectionConfig('app'),
} as SavedConnection;

/** Put the app in a state where every command has something to act on. */
function arrangeConnectedWorkspace(): void {
  useConnectionStore.setState({
    connections: new Map([[CONNECTION.id, CONNECTION]]),
    sessionIds: new Map([[CONNECTION.id, 'session-1']]),
    selectedConnectionId: CONNECTION.id,
  });
  useEditorStore.setState({
    tabs: [
      { id: 'tab-A', title: 'A', content: '', isDirty: false, isPreview: false, type: 'query', connectionId: CONNECTION.id },
      { id: 'tab-B', title: 'B', content: '', isDirty: false, isPreview: false, type: 'query', connectionId: CONNECTION.id },
    ],
    activeTabId: 'tab-A',
    _hydrated: true,
  });
  useQueryStore.setState({ queryText: 'SELECT 1', isExecuting: true, error: null });
  // A run owned by the focused tab, so `editor.cancel` has a target.
  registerTabStream({
    generation: 1,
    ownerKey: 'tab-A',
    sessionId: 'session-1',
    cancel: () => { cancelledSessions.push('session-1'); },
  });
}

/** Sessions the registered cancel handle was fired for. */
const cancelledSessions: string[] = [];

/** Run `fn`, reporting whether any store changed or any IPC call was made. */
function recordEffects(fn: () => void): { storeChanged: boolean; invoked: string[] } {
  const invoked: string[] = [];
  let storeChanged = false;
  __setInvokeImpl(async (cmd: string) => {
    invoked.push(cmd);
    return null;
  });
  const unsubscribes = STORES.map((store) => store.subscribe(() => { storeChanged = true; }));
  try {
    fn();
  } finally {
    unsubscribes.forEach((u) => u());
  }
  return { storeChanged, invoked };
}

beforeEach(() => {
  __resetTabStreams();
  cancelledSessions.length = 0;
  useLayoutStore.setState({
    sidebarCollapsed: false,
    settingsOpen: false,
    helpOpen: false,
    importOpen: false,
    paletteOpen: false,
    paletteSeedMode: "objects",
  });
  useDockStore.setState({
    dockOpen: false,
    dockPane: "inspector",
    dockWidths: { ...DOCK_DEFAULT_WIDTHS },
  });
  arrangeConnectedWorkspace();
});

afterEach(() => {
  __resetInvokeImpl();
  __resetTabStreams();
});

describe('every layout command has an effect', () => {
  const commands = buildMainLayoutCommands(t);

  for (const command of commands) {
    it(`${command.id} changes something when invoked`, () => {
      // `when` guards must pass in the arranged state, or the command would be
      // unreachable in a normal connected workspace.
      expect(command.when?.() ?? true).toBe(true);

      const { storeChanged, invoked } = recordEffects(() => command.action());
      expect(
        storeChanged || invoked.length > 0,
        `${command.id} produced no store update and no IPC call`,
      ).toBe(true);
    });
  }

  it('covers every globally dispatchable command', () => {
    const built = new Set(commands.map((c: Command) => c.id));
    const missing = COMMAND_DEFINITIONS.filter((d) => isGloballyDispatchable(d.id))
      .map((d) => d.id)
      .filter((id) => !built.has(id) && !COMPONENT_OWNED.has(id));
    expect(missing).toEqual([]);
  });
});

describe('commands that reach the backend', () => {
  it('app.refreshSchema refetches the object tree', () => {
    const refresh = buildMainLayoutCommands(t).find((c) => c.id === 'app.refreshSchema')!;
    const { invoked } = recordEffects(() => refresh.action());
    // The defect: this dispatched `tablepro:refresh-schema`, which nothing
    // listened for, so no table fetch ever happened.
    expect(invoked).toContain('fetch_tables');
  });

  it('app.refreshSchema is unavailable with nothing connected', () => {
    useConnectionStore.setState({ selectedConnectionId: null, sessionIds: new Map() });
    const refresh = buildMainLayoutCommands(t).find((c) => c.id === 'app.refreshSchema')!;
    expect(refresh.when?.()).toBe(false);
  });

  it('editor.cancel stops the run owned by the focused tab', () => {
    const cancel = buildMainLayoutCommands(t).find((c) => c.id === 'editor.cancel')!;
    cancel.action();
    expect(cancelledSessions).toEqual(['session-1']);
    expect(useQueryStore.getState().isExecuting).toBe(false);
  });

  it('editor.run executes the current query text', () => {
    const run = buildMainLayoutCommands(t).find((c) => c.id === 'editor.run')!;
    const { invoked } = recordEffects(() => run.action());
    expect(invoked).toContain('execute_query_streaming');
  });
});

describe('data.importSql cannot leave sticky state', () => {
  it('is unavailable while nothing is connected', () => {
    useConnectionStore.setState({ selectedConnectionId: null, sessionIds: new Map() });
    useEditorStore.setState({ tabs: [], activeTabId: null });
    const importCmd = buildMainLayoutCommands(t).find((c) => c.id === 'data.importSql')!;

    // The defect: the action set `importOpen: true` unconditionally. The
    // dialog needs a session to render, so nothing appeared and the flag
    // stayed true — the dialog then sprang open on the next connect.
    expect(importCmd.when?.()).toBe(false);
    expect(useLayoutStore.getState().importOpen).toBe(false);
  });

  it('opens the dialog once a session exists', () => {
    const importCmd = buildMainLayoutCommands(t).find((c) => c.id === 'data.importSql')!;
    expect(importCmd.when?.()).toBe(true);
    importCmd.action();
    expect(useLayoutStore.getState().importOpen).toBe(true);
  });
});
