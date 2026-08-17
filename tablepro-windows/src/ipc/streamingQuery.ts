/**
 * useStreamingQuery — React hook driving `execute_query_streaming`.
 *
 * Spike rules (`plans/reports/spike-tauri-channel.md`):
 *   1. `Channel.onmessage` MUST be assigned BEFORE `invoke()` so no chunks
 *      are dropped between Rust starting to send and JS subscribing.
 *   2. Tauri `Channel` has no `Drop` hook — to actually stop the Rust
 *      side we explicitly call `cancel_query` on unmount / new run.
 *   3. The message handler must be cheap; this one just forwards into the
 *      Zustand store which finishes the work synchronously.
 *
 * Generation token: every `run()` mints a new monotonic generation. Stale
 * chunks (from a query the user superseded) are dropped both in the JS
 * handler (early-return on cancelled) and in the store (generation
 * mismatch). The Rust side echoes the generation back on every chunk.
 */

import { Channel, invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { useQueryResultStore, type QueryChunk } from "../stores/queryResultStore";
import { extractErrorMessage } from "./error";
import { useSettingsStore } from "../stores/settingsStore";

export interface StreamingQueryHandle {
  /** Start a new streaming query. Cancels any previous in-flight run. */
  run: (sessionId: string, sql: string) => Promise<void>;
  /** Cancel any in-flight run. No-op if nothing is running. */
  cancel: () => void;
}

export function useStreamingQuery(): StreamingQueryHandle {
  const generationRef = useRef(0);
  const cancelRef = useRef<null | (() => void)>(null);

  const run = async (sessionId: string, sql: string) => {
    // 1. Cancel previous run (idempotent).
    cancelRef.current?.();

    // 2. Mint generation, reset store.
    generationRef.current += 1;
    const gen = generationRef.current;
    useQueryResultStore.getState().beginStream(gen);

    // 3. Wire channel handler BEFORE invoke (spike rule §1).
    const channel = new Channel<QueryChunk>();
    let cancelled = false;
    cancelRef.current = () => {
      if (cancelled) return;
      cancelled = true;
      // Channel has no .close() — fire-and-forget Rust-side cancel.
      void invoke("cancel_query", { sessionId }).catch(() => {
        /* swallow: cancel best-effort */
      });
    };

    channel.onmessage = (chunk) => {
      if (cancelled) return;
      // Generation mismatch is also caught inside the store, but cheap
      // to early-return here so we skip a state-fn call.
      if (chunk.generation !== gen) return;
      useQueryResultStore.getState().appendChunk(chunk);
    };

    // 4. Invoke. Threshold from settings; backend resolves to user
    //    setting if undefined, but we pass it through for clarity.
    const threshold = useSettingsStore.getState().settings.streamingThreshold;
    try {
      await invoke("execute_query_streaming", {
        sessionId,
        sql,
        threshold,
        generation: gen,
        channel,
      });
    } catch (err) {
      if (cancelled) return;
      useQueryResultStore.getState().appendChunk({
        kind: "err",
        message: extractErrorMessage(err),
        generation: gen,
      });
    }
  };

  // Cleanup on unmount: cancel any in-flight stream so the Rust side
  // stops draining the connection into a dropped channel.
  useEffect(
    () => () => {
      cancelRef.current?.();
    },
    [],
  );

  return {
    run,
    cancel: () => cancelRef.current?.(),
  };
}
