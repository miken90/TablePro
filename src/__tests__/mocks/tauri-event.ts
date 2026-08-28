// Test mock for `@tauri-apps/api/event`.
//
// Stores subscribe to backend events at module load (`connectionStore.ts`
// calls `listen()` whenever `window` exists). Under jsdom the real module
// reaches for the Tauri bridge and rejects; here every subscription resolves
// to a no-op unlisten and nothing is ever delivered.

export type UnlistenFn = () => void;
export type EventCallback<T> = (event: { event: string; id: number; payload: T }) => void;

export function listen<T>(_event: string, _handler: EventCallback<T>): Promise<UnlistenFn> {
  return Promise.resolve(() => {});
}

export function once<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  return listen(event, handler);
}

export function emit(_event: string, _payload?: unknown): Promise<void> {
  return Promise.resolve();
}
