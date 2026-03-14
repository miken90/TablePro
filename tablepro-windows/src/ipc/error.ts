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
  if (isTauriError(err)) return err.message ?? err.kind;
  return String(err);
}
