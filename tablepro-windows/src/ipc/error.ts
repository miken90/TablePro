/** Tauri IPC error shape from Rust AppError (serde tagged enum). */
interface TauriIpcError {
  kind: string;
  message?: string;
}

function isTauriError(err: unknown): err is TauriIpcError {
  return typeof err === "object" && err !== null && "kind" in err;
}

/** Extract a human-readable message from any IPC error. */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (isTauriError(err)) return err.message ?? err.kind;
  // Catch-all: try JSON for objects, otherwise toString
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    try { return JSON.stringify(err); } catch { return '[Unserializable error object]'; }
  }
  return String(err);
}
