// Test mock for `@tauri-apps/api/core`.
//
// `invoke` defaults to a no-op resolver. Tests may overwrite the export
// (or use `vi.mock` per-test) to inject custom behavior.
//
// `Channel` exposes the same `onmessage` setter the real Tauri channel
// does. Tests that need to fire chunks at the listener can grab the
// instance via the `__lastChannel__` ref and call `__emit__(chunk)`.

export type InvokeFn = (cmd: string, args?: unknown) => Promise<unknown>;

let invokeImpl: InvokeFn = () => Promise.resolve(null);

export function invoke(cmd: string, args?: unknown): Promise<unknown> {
  return invokeImpl(cmd, args);
}

/** Test-only: swap the `invoke` implementation. */
export function __setInvokeImpl(fn: InvokeFn): void {
  invokeImpl = fn;
}

/** Test-only: reset to the default no-op resolver. */
export function __resetInvokeImpl(): void {
  invokeImpl = () => Promise.resolve(null);
}

export class Channel<T> {
  // The real Tauri channel exposes a writable `onmessage`; this mock
  // mirrors that shape so production code is unchanged.
  public onmessage: ((msg: T) => void) | null = null;

  constructor() {
    __lastChannel = this as unknown as Channel<unknown>;
  }

  /** Test-only: deliver a chunk synchronously to whatever listener is set. */
  __emit__(msg: T): void {
    this.onmessage?.(msg);
  }
}

/** Test-only: most-recently-constructed Channel instance. */
export let __lastChannel: Channel<unknown> | null = null;
