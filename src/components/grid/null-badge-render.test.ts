// @vitest-environment jsdom
/**
 * The Settings > General "NULL display" text must reach the grid cell, not
 * just the literal "NULL" the cell renderer used to hardcode. A blank
 * setting falls back to the default rather than rendering an empty cell,
 * which would be indistinguishable from an empty-string value.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { GridRow } from './grid-row';
import type { ColumnInfo } from '../../types/query';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root && container) {
    act(() => root!.unmount());
    container.remove();
  }
  root = null;
  container = null;
});

const COLUMN: ColumnInfo = { name: 'note', typeName: 'text', nullable: true, isPrimaryKey: false };

function mount(nullDisplay: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(GridRow, {
        rowIndex: 0,
        displayRowIndex: 0,
        row: [null],
        columns: [COLUMN],
        columnWidths: { note: 120 },
        isSelected: false,
        nullDisplay,
        virtualTop: 0,
        isActiveRow: false,
        activeColIdx: null,
        selectionCols: null,
        onRowClick: () => {},
      }),
    );
  });
  return container;
}

describe('GridRow NULL cell text', () => {
  it('renders the configured nullDisplay setting, not the hardcoded literal', () => {
    const el = mount('∅');
    expect(el.textContent).toContain('∅');
    expect(el.textContent).not.toContain('NULL');
  });

  it('falls back to the default literal when nullDisplay is set to an empty string', () => {
    const el = mount('');
    expect(el.textContent).toContain('NULL');
  });
});
