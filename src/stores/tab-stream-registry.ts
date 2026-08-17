/**
 * Registry of in-flight query streams, keyed by the tab that owns them.
 *
 * Lives in its own module because both `queryStore` (which starts and cancels
 * runs) and `editorStore` (which must release a stream when its tab closes)
 * need it, and importing one store from the other would create a cycle.
 *
 * Ownership rule: the owning key and the session id are captured when the run
 * STARTS. Nothing here re-reads the active tab, so switching tabs after a run
 * begins can never redirect that run's cancel to another tab or another
 * database session.
 */

/** An in-flight stream owned by a single tab. */
export interface TabStream {
  /** Monotonic run generation. Also encodes start order. */
  generation: number;
  /** Key of the owning tab (or `session:<id>` when no tab was active). */
  ownerKey: string;
  /** Session the run was started on — the only session its cancel may target. */
  sessionId: string;
  /** Detach the local listener and issue the backend cancel. Idempotent. */
  cancel: () => void;
}

const tabStreams = new Map<string, TabStream>();

/** Monotonic generation allocator. Deliberately shared across tabs: the
 *  columnar result store is a single global stream buffer that drops chunks
 *  whose generation doesn't match, so per-tab counters would collide and let
 *  one tab's late chunks land in another tab's result. */
let nextStreamGeneration = 0;

export function mintStreamGeneration(): number {
  nextStreamGeneration += 1;
  return nextStreamGeneration;
}

export function registerTabStream(stream: TabStream): void {
  tabStreams.set(stream.ownerKey, stream);
}

/** Drop a tab's slot, but only if it still holds the given handle — a newer
 *  run in the same tab may already have replaced it. */
export function releaseTabStream(ownerKey: string, cancel: () => void): void {
  if (tabStreams.get(ownerKey)?.cancel === cancel) {
    tabStreams.delete(ownerKey);
  }
}

/** Cancel the in-flight stream of one tab, if any. */
export function cancelTabStream(ownerKey: string): void {
  tabStreams.get(ownerKey)?.cancel();
}

/** Cancel and unregister the streams owned by tabs that are going away. */
export function cancelStreamsForTabs(ownerKeys: string[]): void {
  for (const key of ownerKeys) {
    const stream = tabStreams.get(key);
    if (!stream) continue;
    stream.cancel();
    tabStreams.delete(key);
  }
}

/**
 * Pick the run a user-initiated Stop should abort.
 *
 * The active tab's own run wins. When the active tab has nothing in flight,
 * fall back to the most recently started run — that is the run whose state the
 * global query store is displaying, and therefore the one the Stop button the
 * user just pressed refers to.
 */
export function resolveCancelTarget(activeTabId: string | null): TabStream | undefined {
  if (activeTabId) {
    const owned = tabStreams.get(activeTabId);
    if (owned) return owned;
  }

  let newest: TabStream | undefined;
  for (const stream of tabStreams.values()) {
    if (!newest || stream.generation > newest.generation) newest = stream;
  }
  return newest;
}

/** Test seam: drop all registered handles between cases. */
export function __resetTabStreams(): void {
  tabStreams.clear();
}

/** Test seam: which tabs currently hold an in-flight stream. */
export function __activeStreamKeys(): string[] {
  return [...tabStreams.keys()];
}
