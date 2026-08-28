import { useCallback, useEffect, useState } from 'react';
import { previewStatements, type SavePayload, type SavePlan } from '../../ipc/commands';
import { extractErrorMessage } from '../../ipc/error';

interface FetchResult {
  /** The payload instance this answers; identity is the staleness check. */
  payload: SavePayload;
  nonce: number;
  plan: SavePlan | null;
  error: string | null;
}

export interface SavePlanState {
  plan: SavePlan | null;
  loading: boolean;
  error: string | null;
  /** Re-run the fetch after a failure. */
  retry: () => void;
}

/**
 * Fetch the plan the backend would execute for `payload`.
 *
 * `plan` is cleared the moment a fetch starts or the consumer closes, so a
 * popover or dialog can never show statements left over from an earlier
 * payload — the whole point of the command is that what is displayed is what
 * will run.
 */
export function useSavePlan(
  sessionId: string | undefined,
  payload: SavePayload | null,
  enabled: boolean,
): SavePlanState {
  const [result, setResult] = useState<FetchResult | null>(null);
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || !sessionId || !payload) return;

    let cancelled = false;
    previewStatements(sessionId, payload)
      .then((plan) => {
        if (!cancelled) setResult({ payload, nonce, plan, error: null });
      })
      .catch((err) => {
        if (!cancelled) setResult({ payload, nonce, plan: null, error: extractErrorMessage(err) });
      });

    return () => { cancelled = true; };
  }, [enabled, sessionId, payload, nonce]);

  // A result answers exactly one payload and one attempt. Anything else is
  // stale, and stale statements are the failure this command exists to stop.
  const current = result && result.payload === payload && result.nonce === nonce ? result : null;
  const pending = enabled && !!sessionId && !!payload;

  return {
    plan: current?.plan ?? null,
    loading: pending && !current,
    error: current?.error ?? null,
    retry,
  };
}

/**
 * The plan as the user reads it: the statements the backend returned, wrapped
 * in this engine's own transaction keywords only when the backend decided to
 * wrap them.
 */
export function formatSavePlan(plan: SavePlan): string {
  const body = plan.statements.join(';\n');
  if (!body) return '';
  if (!plan.transactional) return `${body};`;
  return `${plan.begin};\n${body};\n${plan.commit};`;
}
