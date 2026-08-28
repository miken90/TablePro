// @vitest-environment jsdom
/**
 * D3 on a real mount: staging one edit is enough to make the strip appear,
 * and it carries the five controls §5.16 specifies.
 *
 * The strip is given no table-name prop at all here — if the guard ever grows
 * one back, this mount goes blank.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useChangeStore } from '../../stores/changeStore';
import '../../i18n';
import { PendingChangesStrip } from './pending-changes-strip';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const PAYLOAD = {
  table: 'users',
  schema: null,
  columns: ['id'],
  columnTypes: ['int4'],
  primaryKeys: ['id'],
  changes: [],
};

function mount(props: Partial<Parameters<typeof PendingChangesStrip>[0]> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(PendingChangesStrip, {
        sessionId: 'sess-1',
        buildSavePayload: () => PAYLOAD,
        stagedViewMatches: true,
        stagedPage: 1,
        onExecute: () => {},
        ...props,
      }),
    );
  });
  return container!;
}

function stageOneEdit() {
  useChangeStore.getState().setActiveTable('conn-1', 'public', 'users');
  useChangeStore.getState().recordCellChange(
    { rowIndex: 0, columnIndex: 1, columnName: 'name', oldValue: 'ann', newValue: 'bea' },
    ['1', 'ann'],
  );
}

beforeEach(() => {
  useChangeStore.setState({ _byTable: {}, _activeTableKey: null, _changes: {}, _undoStack: [], _redoStack: [], hasChanges: false });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('pending-changes strip', () => {
  it('renders nothing while there are no staged changes', () => {
    const el = mount();
    expect(el.textContent).toBe('');
  });

  it('appears on a staged edit with no table-name prop passed', () => {
    stageOneEdit();
    const el = mount();
    expect(el.textContent).toContain('1 unsaved change');
  });

  it('carries Undo, Redo, Discard, Preview SQL and Execute with a count', () => {
    stageOneEdit();
    const labels = Array.from(mount().querySelectorAll('button')).map((b) => b.textContent ?? '');
    expect(labels.some((l) => l.includes('Undo'))).toBe(true);
    expect(labels.some((l) => l.includes('Redo'))).toBe(true);
    expect(labels.some((l) => l.includes('Discard'))).toBe(true);
    expect(labels.some((l) => l.includes('Preview SQL'))).toBe(true);
    expect(labels.some((l) => l.includes('Execute (1)'))).toBe(true);
  });

  it('disables Execute when the grid has moved off the page the edits were staged on', () => {
    stageOneEdit();
    const el = mount({ stagedViewMatches: false, stagedPage: 3 });
    const execute = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Execute'));
    expect(execute?.disabled).toBe(true);
    expect(execute?.title).toContain('Staged on page 3');
  });

  it('keeps Execute enabled on the page the edits were staged on', () => {
    stageOneEdit();
    const el = mount();
    const execute = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Execute'));
    expect(execute?.disabled).toBe(false);
  });

  it('disables Execute when there is no session to write to', () => {
    stageOneEdit();
    const el = mount({ sessionId: undefined });
    const execute = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Execute'));
    expect(execute?.disabled).toBe(true);
  });
});
