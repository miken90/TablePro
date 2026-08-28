// @vitest-environment jsdom
/**
 * The Q5 laziness proof on a real mount: with a structure tab ACTIVE the
 * body mounts the structure view and its Columns sub-tab fetches; with the
 * same tab INACTIVE nothing of it mounts and no schema command is invoked.
 *
 * This has to be a client mount, not `renderToStaticMarkup`: zustand's
 * `useStore` gives React a server snapshot equal to the store's INITIAL
 * state, so static rendering can never observe `setState`.
 */

import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetInvokeImpl, __setInvokeImpl } from '../../__tests__/mocks/tauri';
import { useEditorStore, type EditorTab } from '../../stores/editorStore';
import { useConnectionStore } from '../../stores/connectionStore';
import '../../i18n';
import { WorkspaceBody, type WorkspaceBodyProps } from './workspace-body';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The SQL editor spins up a web worker on mount; jsdom has none. A silent
// stub is enough — nothing here asserts on editor behaviour.
class WorkerStub {
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage(): void {}
  terminate(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}
(globalThis as unknown as { Worker: typeof WorkerStub }).Worker = WorkerStub;

const invoked: string[] = [];
let container: HTMLDivElement | null = null;
let root: Root | null = null;

const QUERY_TAB: EditorTab = { id: 'q', title: 'Query 1', content: '', isDirty: false, isPreview: false, type: 'query', connectionId: 'conn-1' };
const STRUCTURE_TAB: EditorTab = { id: 's', title: 'users · structure', content: '', isDirty: false, isPreview: false, type: 'structure', tableName: 'users', tableSchema: 'public', connectionId: 'conn-1' };

const SQL_ENGINE: WorkspaceBodyProps['engine'] = { isConnected: true, sessionId: 'sess-1', isDocumentDb: false, isKeyValueDb: false };

function refs(): Omit<WorkspaceBodyProps, 'engine'> {
  return {
    pendingSaveRef: createRef() as never,
    requestSaveRef: createRef() as never,
    addRowRef: createRef() as never,
    deleteSelectedRef: createRef() as never,
    clearSelectionRef: createRef() as never,
  };
}

async function mount(activeTabId: string, engine = SQL_ENGINE, tabs: EditorTab[] = [QUERY_TAB, STRUCTURE_TAB]) {
  useEditorStore.setState({ tabs, activeTabId });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(WorkspaceBody, { engine, ...refs() }));
  });
  return container.innerHTML;
}

describe('WorkspaceBody', () => {
  beforeEach(() => {
    invoked.length = 0;
    __setInvokeImpl((cmd) => {
      invoked.push(cmd);
      // Schema fetches resolve to empty lists so the sub-tabs render their
      // empty states instead of throwing on `null`.
      return Promise.resolve(/^fetch_/.test(cmd) ? [] : null);
    });
    useConnectionStore.setState({
      connections: new Map(),
      groups: new Map(),
      selectedConnectionId: 'conn-1',
      connectionStatuses: new Map(),
      sessionIds: new Map([['conn-1', 'sess-1']]),
    });
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    __resetInvokeImpl();
  });

  it('mounts the structure view, and only then fetches, when the structure tab is active', async () => {
    const html = await mount('s');
    expect(html).toContain('Structure sections');
    expect(html).toContain('public.users');
    expect(invoked.some((c) => c === 'fetch_columns')).toBe(true);
  });

  it('mounts none of the structure view and fetches nothing when the structure tab is inactive', async () => {
    const html = await mount('q');
    expect(html).not.toContain('Structure sections');
    expect(html).not.toContain('public.users');
    expect(invoked.filter((c) => /^fetch_(columns|indexes|foreign_keys|ddl)$/.test(c))).toHaveLength(0);
  });

  it('renders the unsupported empty state for a structure tab on a document engine', async () => {
    const html = await mount('s', { ...SQL_ENGINE, isDocumentDb: true }, [STRUCTURE_TAB]);
    expect(html).toContain("This tab can't be shown on this connection");
    expect(html).not.toContain('Structure sections');
    expect(invoked.filter((c) => /^fetch_/.test(c))).toHaveLength(0);
  });
});
