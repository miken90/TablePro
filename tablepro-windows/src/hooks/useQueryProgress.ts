import { useEffect, useMemo, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

interface QueryStartedEvent {
  sessionId: string;
  queryId: string;
  timestamp: number;
}

interface QueryProgressEvent {
  sessionId: string;
  queryId: string;
  elapsedMs: number;
}

interface QueryCompletedEvent {
  sessionId: string;
  queryId: string;
  elapsedMs: number;
  rowCount: number;
}

interface QueryErrorEvent {
  sessionId: string;
  queryId: string;
  elapsedMs: number;
  error: string;
}

interface QueryProgressState {
  isRunning: boolean;
  elapsedMs: number;
  rowCount: number | null;
  statusText: string;
  error: string | null;
}

const INITIAL_STATE: QueryProgressState = {
  isRunning: false,
  elapsedMs: 0,
  rowCount: null,
  statusText: '',
  error: null,
};

export function useQueryProgress(sessionId?: string | null): QueryProgressState {
  const [state, setState] = useState<QueryProgressState>(INITIAL_STATE);
  const targetSessionId = useMemo(() => (sessionId ?? '').trim(), [sessionId]);

  useEffect(() => {
    if (!targetSessionId) {
      setState(INITIAL_STATE);
      return;
    }

    let mounted = true;
    const unlisteners: UnlistenFn[] = [];

    const matchesSession = (payloadSessionId: string) => payloadSessionId === targetSessionId;

    const register = async () => {
      const startedUnlisten = await listen<QueryStartedEvent>('query:started', (event) => {
        if (!mounted || !matchesSession(event.payload.sessionId)) return;
        setState({
          isRunning: true,
          elapsedMs: 0,
          rowCount: null,
          statusText: 'Running... 0.0s',
          error: null,
        });
      });

      const progressUnlisten = await listen<QueryProgressEvent>('query:progress', (event) => {
        if (!mounted || !matchesSession(event.payload.sessionId)) return;
        const elapsedSeconds = (event.payload.elapsedMs / 1000).toFixed(1);
        setState((prev) => ({
          ...prev,
          isRunning: true,
          elapsedMs: event.payload.elapsedMs,
          statusText: `Running... ${elapsedSeconds}s`,
          error: null,
        }));
      });

      const completedUnlisten = await listen<QueryCompletedEvent>('query:completed', (event) => {
        if (!mounted || !matchesSession(event.payload.sessionId)) return;
        const elapsedSeconds = (event.payload.elapsedMs / 1000).toFixed(1);
        setState({
          isRunning: false,
          elapsedMs: event.payload.elapsedMs,
          rowCount: event.payload.rowCount,
          statusText: `Completed in ${elapsedSeconds}s — ${event.payload.rowCount} rows`,
          error: null,
        });
      });

      const errorUnlisten = await listen<QueryErrorEvent>('query:error', (event) => {
        if (!mounted || !matchesSession(event.payload.sessionId)) return;
        const elapsedSeconds = (event.payload.elapsedMs / 1000).toFixed(1);
        setState({
          isRunning: false,
          elapsedMs: event.payload.elapsedMs,
          rowCount: null,
          statusText: `Failed after ${elapsedSeconds}s`,
          error: event.payload.error,
        });
      });

      unlisteners.push(startedUnlisten, progressUnlisten, completedUnlisten, errorUnlisten);
    };

    void register();

    return () => {
      mounted = false;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [targetSessionId]);

  return state;
}
