// @vitest-environment jsdom
/**
 * The Inspector shows the same values as the grid, so it must render NULL
 * the same way: through the Settings > General "NULL display" text, not a
 * hardcoded literal. A blank setting falls back to the default, so a NULL
 * field never renders empty — which would be indistinguishable from an
 * empty-string value.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { FieldRow } from './field-row';
import { useSettingsStore } from '../../stores/settingsStore';
import { DEFAULT_SETTINGS } from '../../types/settings';

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
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
});

function mount(nullDisplay: string, value: string | null) {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, nullDisplay } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(FieldRow, {
        name: 'note',
        typeName: 'text',
        value,
        isPrimaryKey: false,
      }),
    );
  });
  return container;
}

describe('FieldRow NULL rendering', () => {
  it('renders the configured nullDisplay setting, not the hardcoded literal', () => {
    const el = mount('∅', null);
    expect(el.textContent).toContain('∅');
    expect(el.textContent).not.toContain('NULL');
  });

  it('falls back to the default literal when nullDisplay is blank', () => {
    const el = mount('', null);
    expect(el.textContent).toContain('NULL');
  });

  it('leaves a non-null value alone', () => {
    const el = mount('∅', 'hello');
    expect(el.textContent).toContain('hello');
    expect(el.textContent).not.toContain('∅');
  });
});
