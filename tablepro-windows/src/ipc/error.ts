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

// --- Error Classification ---

export interface ClassifiedError {
  kind: string;
  message: string;
  hint: string | null;
  recoverable: boolean;
}

const KIND_HINTS: Record<string, { hint: string; recoverable: boolean }> = {
  DatabaseError:  { hint: "Check if the database server is running and accessible", recoverable: false },
  NotConnected:   { hint: "Try reconnecting to the database", recoverable: true },
  PluginError:    { hint: "Check if the database driver is installed correctly", recoverable: false },
  IoError:        { hint: "Check file permissions and disk space", recoverable: false },
};

const MESSAGE_PATTERNS: { pattern: RegExp; hint: string; recoverable: boolean }[] = [
  { pattern: /connection refused/i,       hint: "Check if the server is running on the correct host and port", recoverable: true },
  { pattern: /auth(entication|orization)\s*(failed|denied|error)/i, hint: "Check your username and password", recoverable: false },
  { pattern: /password/i,                 hint: "Check your username and password", recoverable: false },
  { pattern: /timed?\s*out/i,             hint: "The operation timed out. Try again or check server load", recoverable: true },
  { pattern: /no\s*such\s*(host|address)/i, hint: "Check if the server is running on the correct host and port", recoverable: true },
];

/** Classify an error into kind, message, hint, and recoverability. */
export function classifyError(err: unknown): ClassifiedError {
  const message = extractErrorMessage(err);
  const kind = isTauriError(err) ? err.kind : "Unknown";

  // Check kind-based hints first
  const kindHint = KIND_HINTS[kind];
  if (kindHint) {
    return { kind, message, hint: kindHint.hint, recoverable: kindHint.recoverable };
  }

  // Check message patterns
  for (const { pattern, hint, recoverable } of MESSAGE_PATTERNS) {
    if (pattern.test(message)) {
      return { kind, message, hint, recoverable };
    }
  }

  return { kind, message, hint: null, recoverable: false };
}
