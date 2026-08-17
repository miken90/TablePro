import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Loader2, Upload } from 'lucide-react';
import { onImportProgress, type ImportProgress } from '../../ipc/events';

interface ImportProgressProps {
  isImporting: boolean;
  onComplete?: () => void;
}

export function ImportProgress({ isImporting, onComplete }: ImportProgressProps) {
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- reset state on import start */
  useEffect(() => {
    if (!isImporting) return;

    setDone(false);
    setCurrent(0);
    setTotal(0);
    setElapsed(0);
    startRef.current = Date.now();

    timerRef.current = setInterval(() => {
      if (startRef.current) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);

    let cancelled = false;

    onImportProgress((progress: ImportProgress) => {
      if (cancelled) return;
      const { current: c, total: t } = progress;
      setCurrent(c);
      setTotal(t);
      if (t > 0 && c >= t) {
        setDone(true);
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeout(() => {
          if (!cancelled) onComplete?.();
        }, 1800);
      }
    }).then((fn) => {
      unlistenRef.current = fn;
    });

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      unlistenRef.current?.();
    };
  }, [isImporting, onComplete]);
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
