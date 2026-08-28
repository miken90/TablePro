// @vitest-environment jsdom
/**
 * Dialog's real-DOM focus behaviour (design-spec 5.16, AUDIT M5; [RT-9]).
 *
 * `ui-kit-render.test.ts` only checks static markup, which runs no effects.
 * This mounts for real to exercise `useFocusTrap`'s initial-focus effect,
 * and to prove the trap's own stopPropagation (scoped to Esc/Tab only)
 * does not also swallow F12 before it reaches the devtools lockout that
 * main.tsx installs on `document`.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog, type DialogProps } from './dialog';

// jsdom + vitest does not set this on its own; without it React warns that
// the environment is not configured for act() on every call.
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(props: DialogProps) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(Dialog, props));
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe('Dialog focus behaviour', () => {
  it('places initial focus on Cancel for a destructive dialog, never the commit button', () => {
    mount({
      open: true,
      onClose: () => {},
      title: 'Drop table',
      destructive: true,
      actions: [{ label: 'Drop', onClick: () => {}, variant: 'danger' }],
      children: createElement('p', null, 'This cannot be undone.'),
    });

    const focused = document.activeElement;
    expect(focused?.textContent).toBe('Cancel');
    expect(focused?.textContent).not.toBe('Drop');
  });

  it('places initial focus on the first field for a non-destructive dialog', () => {
    mount({
      open: true,
      onClose: () => {},
      title: 'Rename connection',
      children: createElement('input', { defaultValue: 'prod-db' }),
    });

    expect(document.activeElement?.tagName).toBe('INPUT');
  });

  it('does not let a dispatched F12 keydown skip the document-level devtools lockout', () => {
    const seenByDocument: string[] = [];
    const onDocumentKeydown = (e: KeyboardEvent) => seenByDocument.push(e.key);
    document.addEventListener('keydown', onDocumentKeydown);

    mount({
      open: true,
      onClose: () => {},
      title: 'Any dialog',
      children: createElement('p', null, 'Body'),
    });

    const target = document.activeElement ?? container;
    act(() => {
      target?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F12', bubbles: true, cancelable: true }),
      );
    });

    expect(seenByDocument).toContain('F12');
    document.removeEventListener('keydown', onDocumentKeydown);
  });
});
