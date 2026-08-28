// @vitest-environment jsdom
/**
 * Q7 — the import dialog cannot be dismissed mid-write, and a failure
 * reports the partial state honestly instead of guessing [RT-13].
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setInvokeImpl, __resetInvokeImpl } from '../../__tests__/mocks/tauri';
import '../../i18n';

const callOrder: string[] = [];
let progressHandler: ((p: { current: number; total: number }) => void) | null = null;
const unlistenSpy = vi.fn(() => {
  callOrder.push('unlisten');
});

vi.mock('../../ipc/events', () => ({
  onImportProgress: vi.fn(async (handler: (p: { current: number; total: number }) => void) => {
    callOrder.push('listen');
    progressHandler = handler;
    return unlistenSpy;
  }),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => '/tmp/fake.sql'),
}));

// vi.mock calls above are hoisted above this import by vitest.
import { ImportDialog } from './import-dialog';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PREVIEW = { statementCount: 3, fileSizeBytes: 100, firstStatements: ['INSERT INTO t VALUES (1)'] };

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function findButton(label: string): HTMLElement | undefined {
  return Array.from(document.body.querySelectorAll<HTMLElement>('button')).find(
    (b) => b.textContent?.trim() === label,
  );
}

function button(label: string): HTMLElement {
  const el = findButton(label);
  if (!el) throw new Error(`no button "${label}"`);
  return el;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mousedown(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

async function mount(onClose: () => void = () => {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ImportDialog, { open: true, onClose, sessionId: 'sess-1' }));
  });
}

/** Browse -> preview -> ready, so Import can be clicked. */
async function driveToReady() {
  await mount();
  await click(button('Browse…'));
}

beforeEach(() => {
  callOrder.length = 0;
  progressHandler = null;
  __resetInvokeImpl();
});

afterEach(async () => {
  if (root && container) {
    await act(async () => {
      root!.unmount();
    });
    container.remove();
  }
  root = null;
  container = null;
  vi.clearAllMocks();
});

describe('import dialog dismissal and error reporting (Q7)', () => {
  it('attaches the progress listener before invoking import_sql_file [RT-13]', async () => {
    __setInvokeImpl(async (cmd) => {
      if (cmd === 'import_preview') return PREVIEW;
      if (cmd === 'import_sql_file') {
        callOrder.push('invoke:import_sql_file');
        throw new Error('boom');
      }
      return null;
    });

    await driveToReady();
    await click(button('Import'));

    expect(callOrder).toContain('listen');
    expect(callOrder).toContain('invoke:import_sql_file');
    expect(callOrder.indexOf('listen')).toBeLessThan(callOrder.indexOf('invoke:import_sql_file'));
    expect(unlistenSpy).toHaveBeenCalled();
  });

  it('overlay mousedown and Escape do nothing while importing', async () => {
    let settleImport: (() => void) | null = null;
    __setInvokeImpl(async (cmd) => {
      if (cmd === 'import_preview') return PREVIEW;
      if (cmd === 'import_sql_file') {
        return new Promise((resolve) => {
          settleImport = () => resolve({ statementsExecuted: 1, durationMs: 5 });
        });
      }
      return null;
    });

    const onClose = vi.fn();
    await mount(onClose);
    await click(button('Browse…'));
    await click(button('Import'));

    const backdrop = container!.querySelector('[class*="bg-scrim"]') as HTMLElement;
    expect(backdrop).toBeTruthy();
    await mousedown(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });
    expect(onClose).not.toHaveBeenCalled();

    // Clean up the pending invoke so the test doesn't leak a floating promise.
    await act(async () => {
      settleImport?.();
      await Promise.resolve();
    });
  });

  it('a failed import stays open and reports the honest partial state (transaction on)', async () => {
    __setInvokeImpl(async (cmd) => {
      if (cmd === 'import_preview') return PREVIEW;
      if (cmd === 'import_sql_file') {
        return new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('duplicate key value violates unique constraint "t_pkey"')), 0);
        });
      }
      return null;
    });

    await driveToReady();
    await click(button('Import'));

    await act(async () => {
      progressHandler?.({ current: 1, total: 3 });
      await new Promise((r) => setTimeout(r, 5));
    });

    const text = container!.textContent ?? '';
    expect(text).toContain('duplicate key value violates unique constraint');
    expect(text).toContain('Executed 1 of 3 statements before the failure.');
    expect(text).toContain('A rollback was requested; the app cannot confirm it completed.');
    expect(findButton('Close')).toBeTruthy();
    expect(findButton('Retry')).toBeTruthy();
  });

  it('a failed import with no progress event says so, never "0 executed"', async () => {
    __setInvokeImpl(async (cmd) => {
      if (cmd === 'import_preview') return PREVIEW;
      if (cmd === 'import_sql_file') throw new Error('connection reset');
      return null;
    });

    await driveToReady();
    await click(button('Import'));

    const text = container!.textContent ?? '';
    expect(text).toContain('No progress reported — partial state unknown.');
    expect(text).not.toContain('0 executed');
  });

  it('without a transaction, a partial commit relabels Retry and warns about duplicate writes', async () => {
    __setInvokeImpl(async (cmd) => {
      if (cmd === 'import_preview') return PREVIEW;
      if (cmd === 'import_sql_file') {
        return new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('syntax error')), 0);
        });
      }
      return null;
    });

    await driveToReady();
    const wrapCheckbox = container!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(wrapCheckbox.checked).toBe(true);
    await act(async () => {
      wrapCheckbox.click();
      await Promise.resolve();
    });

    await click(button('Import'));
    await act(async () => {
      progressHandler?.({ current: 2, total: 4 });
      await new Promise((r) => setTimeout(r, 5));
    });

    const text = container!.textContent ?? '';
    expect(text).toContain('The statements that ran were committed.');
    expect(text).toContain('2 statements already committed and will run again.');
    expect(findButton('Re-run entire file')).toBeTruthy();
    expect(findButton('Retry')).toBeUndefined();
  });
});
