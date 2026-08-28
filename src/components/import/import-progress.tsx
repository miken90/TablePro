import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Loader2, Upload } from 'lucide-react';

interface ImportProgressProps {
  isImporting: boolean;
  current: number;
  total: number;
  onComplete?: () => void;
}

/**
 * Presentational — the Tauri `import_progress` listener lives in
 * import-dialog.tsx's `handleImport`, attached before the invoke so a
 * fast backend error can never race a listener this component would
 * otherwise attach after mount [RT-13].
 */
export function ImportProgress({ isImporting, current, total, onComplete }: ImportProgressProps) {
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- reset state on import start */
  useEffect(() => {
    if (!isImporting) return;

    setDone(false);
    setElapsed(0);
    startRef.current = Date.now();

    timerRef.current = setInterval(() => {
      if (startRef.current) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (completeTimeoutRef.current) clearTimeout(completeTimeoutRef.current);
    };
  }, [isImporting]);

  useEffect(() => {
    if (!isImporting || done) return;
    if (total > 0 && current >= total) {
      setDone(true);
      if (timerRef.current) clearInterval(timerRef.current);
      completeTimeoutRef.current = setTimeout(() => {
        onComplete?.();
      }, 1800);
    }
  }, [current, total, isImporting, done, onComplete]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/60">
      <div className="mb-2 flex items-center gap-2">
        {done ? (
          <CheckCircle size={14} className="text-green-500" />
        ) : (
          <Loader2 size={14} className="animate-spin text-blue-500" />
        )}
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {done ? 'Import complete' : 'Importing…'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
        <span>
          {current.toLocaleString()} / {total > 0 ? total.toLocaleString() : '…'} statements
        </span>
        <span className="flex items-center gap-1">
          <Upload size={10} />
          {elapsed}s
        </span>
      </div>
    </div>
  );
}
