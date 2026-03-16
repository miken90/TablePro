import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ---------------------------------------------------------------------------
// Import progress
// ---------------------------------------------------------------------------

export interface ImportProgress {
  current: number;
  total: number;
}

export const onImportProgress = (
  handler: (progress: ImportProgress) => void,
): Promise<UnlistenFn> =>
  listen<ImportProgress>("import_progress", (e) => handler(e.payload));
