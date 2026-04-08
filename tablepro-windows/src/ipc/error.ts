import type { ErrorCategory, ErrorAction, ErrorContext } from './error-patterns';
import { ERROR_PATTERNS, CATEGORY_DEFAULTS } from './error-patterns';

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
  category: ErrorCategory;
  message: string;
  hint: string | null;
  recoverable: boolean;
  action?: ErrorAction;
}

/** Classify an error into kind, category, message, hint, recoverability, and action. */
export function classifyError(err: unknown, context?: ErrorContext): ClassifiedError {
  const message = extractErrorMessage(err);
  const kind = isTauriError(err) ? err.kind : "Unknown";

  // Check message patterns (SSH patterns checked first for disambiguation)
  for (const { pattern, category, hint, recoverable, action } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      // Context-aware: if SSH enabled and category is network during connect, reclassify as ssh
      let finalCategory = category;
      if (context?.sshEnabled && category === 'network' && context?.operation === 'connect') {
        finalCategory = 'ssh';
      }
      const defaults = CATEGORY_DEFAULTS[finalCategory];
      return {
        kind,
        category: finalCategory,
        message,
        hint: hint || defaults.hint,
        recoverable,
        action: action || defaults.action,
      };
    }
  }

  // Kind-based fallback classification
  let category: ErrorCategory = 'system';
  if (kind === 'DatabaseError') category = 'query';
  else if (kind === 'NotConnected') category = 'network';
  else if (kind === 'PluginError') category = 'config';
  else if (kind === 'IoError') category = 'system';

  const defaults = CATEGORY_DEFAULTS[category];
  return {
    kind,
    category,
    message,
    hint: defaults.hint,
    recoverable: kind === 'NotConnected' ? true : defaults.recoverable,
    action: kind === 'NotConnected' ? 'reconnect' : defaults.action,
  };
}
