import React, { useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { CheckCircle, FileDown, Loader2 } from 'lucide-react';

interface ProgressPayload {
  current: number;
  total: number;
  format: string;
}

interface ExportProgressProps {
  isExporting: boolean;
  onComplete?: () => void;
}

export function ExportProgress({ isExporting, onComplete }: ExportProgressProps) {
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [format, setFormat] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    if (!isExporting) return;

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
    listen<ProgressPayload>('export:progress', (event) => {
      if (cancelled) return;
      const { current: c, total: t, format: f } = event.payload;
      setCurrent(c);
      setTotal(t);
      setFormat(f);
      if (t > 0 && c >= t) {
        setDone(true);
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeout(() => { if (!cancelled) onComplete?.(); }, 1800);
      }
    }).then((fn) => { unlistenRef.current = fn; });

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      unlistenRef.current?.();
    };
  }, [isExporting]);

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
          {done ? 'Export complete' : 'Exporting…'}
        </span>
        {format && (
          <span className="ml-auto rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
            {format}
          </span>
        )}
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
          {current.toLocaleString()} / {total > 0 ? total.toLocaleString() : '…'} rows
        </span>
        <span className="flex items-center gap-1">
          <FileDown size={10} />
          {elapsed}s
        </span>
      </div>
    </div>
  );
}
