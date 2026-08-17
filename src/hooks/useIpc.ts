import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { extractErrorMessage } from "../ipc/error";

interface UseIpcResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  run: (...args: unknown[]) => Promise<T | null>;
}

export function useIpc<T>(command: string): UseIpcResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: unknown[]): Promise<T | null> => {
      setIsLoading(true);
      setError(null);
      try {
        // Build args object if provided as single object, otherwise pass as-is
        const payload = args.length === 1 && typeof args[0] === "object" ? args[0] as Record<string, unknown> : {};
        const result = await invoke<T>(command, payload);
        setData(result);
        return result;
      } catch (err) {
        const msg = extractErrorMessage(err);
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [command],
  );

  return { data, isLoading, error, run };
}
