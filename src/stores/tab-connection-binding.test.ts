/**
 * Which connection a tab runs against.
 *
 * Two defects met here:
 *   1. `setActiveTab` assigned `tab.connectionId` in place — mutating an object
 *      inside zustand state, so no subscriber saw it — and then scheduled the
 *      real update on a `setTimeout(…, 0)` that raced the same tick.
 *   2. `connect()` rebound the active tab whenever its own connection was not
 *      in `sessionIds`. A tab whose dev database had dropped was silently
 *      re-pointed at whatever was connected next, so Ctrl+Enter could run its
 *      SQL against production.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetInvokeImpl, __setInvokeImpl } from '../__tests__/mocks/tauri';
import { useEditorStore, type EditorTab } from './editorStore';
import { useConnectionStore } from './connectionStore';
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
  return {
    ...real,
    getConnectionStatus: () => Promise.resolve('connected'),
    connect: () => Promise.resolve('session-prod'),
  };
});

function tab(id: string, connectionId?: string): EditorTab {
  return {
    id,
    title: id,
    content: '',
    isDirty: false,
    isPreview: false,
    isPinned: false,
    type: 'query',
    connectionId,
  };
}

function savedConnection(id: string): SavedConnection {
  return {
    id,
    name: id,
    config: connectionConfig(id),
  } as SavedConnection;
}

beforeEach(() => {
  __setInvokeImpl(async () => null);
  useConnectionStore.setState({
    connections: new Map([
      ['conn-dev', savedConnection('conn-dev')],
      ['conn-prod', savedConnection('conn-prod')],
    ]),
    sessionIds: new Map(),
    connectionStatuses: new Map(),
    selectedConnectionId: null,
  });
  useEditorStore.setState({ tabs: [], activeTabId: null, _hydrated: true });
});

afterEach(() => {
  __resetInvokeImpl();
});

describe('setActiveTab binds an unbound tab', () => {
  it('applies the binding synchronously and visibly', () => {
    useConnectionStore.setState({ selectedConnectionId: 'conn-dev' });
    useEditorStore.setState({ tabs: [tab('tab-A')], activeTabId: null });

    // Hold the pre-update snapshot the way a React render would.
    const snapshot = useEditorStore.getState().tabs[0];

    useEditorStore.getState().setActiveTab('tab-A');

    const updated = useEditorStore.getState().tabs[0];
    expect(updated.connectionId).toBe('conn-dev');
    // The defect: `tab.connectionId = …` mutated the object already in state,
    // so the snapshot React was holding changed under it and no subscriber
    // saw a new reference to re-render from.
    expect(snapshot.connectionId).toBeUndefined();
    expect(updated).not.toBe(snapshot);
  });

  it('leaves a bound tab pointing where it already pointed', () => {
    useConnectionStore.setState({ selectedConnectionId: 'conn-prod' });
    useEditorStore.setState({ tabs: [tab('tab-A', 'conn-dev')], activeTabId: null });

    useEditorStore.getState().setActiveTab('tab-A');

    expect(useEditorStore.getState().tabs[0].connectionId).toBe('conn-dev');
  });
});

describe('connecting does not re-point a bound tab', () => {
  it('leaves a tab bound to a disconnected connection alone', async () => {
    useEditorStore.setState({ tabs: [tab('tab-A', 'conn-dev')], activeTabId: 'tab-A' });

    // The dev connection is gone (not in sessionIds); the user connects prod.
    await useConnectionStore.getState().connect('conn-prod', savedConnection('conn-prod').config);

    // The defect: this became 'conn-prod', so the tab's SQL would run there.
    expect(useEditorStore.getState().tabs[0].connectionId).toBe('conn-dev');
  });

  it('still binds a tab that has no connection of its own', async () => {
    useEditorStore.setState({ tabs: [tab('tab-A')], activeTabId: 'tab-A' });

    await useConnectionStore.getState().connect('conn-prod', savedConnection('conn-prod').config);

    expect(useEditorStore.getState().tabs[0].connectionId).toBe('conn-prod');
  });
});
