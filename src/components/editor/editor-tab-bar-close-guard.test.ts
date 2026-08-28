// @vitest-environment jsdom
/**
 * V3 on a real mount: closing a table tab that holds staged row edits opens
 * the confirm-discard dialog; Cancel keeps the tab and the edits; Discard
 * closes the tab and drops that table's snapshot. Bulk closes from the tab
 * context menu get the same guard, summing every victim's loss (staged
 * table edits, or one per dirty query tab).
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../../stores/editorStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { makeTableKey, useChangeStore } from '../../stores/changeStore';
import { openTableTab } from '../../stores/active-tab-sync';
import '../../i18n';
import { EditorTabBar } from './EditorTabBar';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const KEY = makeTableKey('conn-1', 'public', 'users');

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(EditorTabBar, {}));
  });
}

function closeButtons(): HTMLElement[] {
  return Array.from(container!.querySelectorAll<HTMLElement>('[aria-label="Close tab"]'));
}

function dialogButton(label: string): HTMLElement {
  const btn = Array.from(document.body.querySelectorAll<HTMLElement>('button')).find((b) => b.textContent?.trim() === label);
  if (!btn) throw new Error(`no button "${label}"`);
  return btn;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

describe('EditorTabBar close guard (V3)', () => {
  beforeEach(() => {
    useEditorStore.setState({ tabs: [], activeTabId: null });
    useChangeStore.setState({ _byTable: {}, _activeTableKey: null });
    useConnectionStore.setState({
      connections: new Map(),
      groups: new Map(),
      selectedConnectionId: 'conn-1',
      connectionStatuses: new Map(),
      sessionIds: new Map([['conn-1', 'sess-1']]),
    });
    openTableTab('users', 'public');
    useChangeStore.getState().recordCellChange({ rowIndex: 0, columnIndex: 1, columnName: 'name', oldValue: 'a', newValue: 'b' });
    useChangeStore.getState().recordCellChange({ rowIndex: 1, columnIndex: 1, columnName: 'name', oldValue: 'c', newValue: 'd' });
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
  });

  it('× on a table tab with staged edits prompts; Cancel keeps tab and edits', async () => {
    await mount();
    await click(closeButtons()[0]);
    expect(document.body.textContent).toContain('Discard 2');
    await click(dialogButton('Cancel'));
    expect(useEditorStore.getState().tabs).toHaveLength(1);
    expect(Object.keys(useChangeStore.getState()._byTable[KEY].changes)).toHaveLength(2);
  });

  it('× then Discard closes the tab and drops that table\'s snapshot', async () => {
    await mount();
    await click(closeButtons()[0]);
    await click(dialogButton('Discard'));
    expect(useEditorStore.getState().tabs).toHaveLength(0);
    expect(useChangeStore.getState()._byTable[KEY]).toBeUndefined();
  });

  it('× on a clean tab closes without a prompt', async () => {
    useChangeStore.getState().clearForTable(KEY);
    await mount();
    await click(closeButtons()[0]);
    expect(useEditorStore.getState().tabs).toHaveLength(0);
    expect(document.body.textContent).not.toContain('Discard');
  });

  it('Close Others from the context menu prompts with the summed loss and clears victims on Discard', async () => {
    // Anchor: a clean query tab; victims: the table tab (2 staged) + a dirty query tab (1).
    const anchor = useEditorStore.getState().addTab('Anchor');
    const dirty = useEditorStore.getState().addTab('Draft');
    useEditorStore.getState().updateTabContent(dirty, 'SELECT 1');
    useEditorStore.getState().setActiveTab(anchor);
    await mount();

    const tabEls = Array.from(container!.querySelectorAll<HTMLElement>('[role="tab"]'));
    const anchorEl = tabEls.find((el) => el.textContent?.includes('Anchor'))!;
    await act(async () => {
      anchorEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    });
    const closeOthers = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((b) => b.textContent?.trim() === 'Close Others')!;
    await click(closeOthers);

    expect(document.body.textContent).toContain('Discard 3');
    expect(useEditorStore.getState().tabs).toHaveLength(3);

    await click(dialogButton('Discard'));
    expect(useEditorStore.getState().tabs.map((t) => t.id)).toEqual([anchor]);
    expect(useChangeStore.getState()._byTable[KEY]).toBeUndefined();
  });
});
