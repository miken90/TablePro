import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Pencil, Trash2, X } from "lucide-react";
import type { RoutineInfo } from "../../types/schema";
import * as commands from "../../ipc/commands";
import { classifyError } from "../../ipc/error";
import { useEditorStore } from "../../stores/editorStore";

interface ProcedureSourcePanelProps {
  open: boolean;
  routine: RoutineInfo;
  sessionId: string;
  onClose: () => void;
}

export function ProcedureSourcePanel({
  open,
  routine,
  sessionId,
  onClose,
}: ProcedureSourcePanelProps) {
  const { t } = useTranslation();
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dropConfirm, setDropConfirm] = useState(false);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSource(null);
    setError(null);
    setDropConfirm(false);
    setLoading(true);
    commands
      .getRoutineSource(sessionId, routine.name, routine.schema, routine.kind)
      .then((src) => {
        setSource(src);
        setLoading(false);
      })
      .catch((err) => {
        const classified = classifyError(err);
        setError(classified.message);
        setLoading(false);
      });
  }, [open, sessionId, routine]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleCopy = useCallback(async () => {
    if (!source) return;
    await navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [source]);

  const handleEdit = useCallback(() => {
    if (!source) return;
    const tabId = useEditorStore.getState().addTab(`Edit: ${routine.name}`);
    useEditorStore.getState().updateTabContent(tabId, source);
    onClose();
  }, [source, routine.name, onClose]);

  const handleDrop = useCallback(async () => {
    setDropping(true);
    try {
      const keyword = routine.kind === "procedure" ? "PROCEDURE" : "FUNCTION";
      const qualified = routine.schema
        ? `"${routine.schema}"."${routine.name}"`
        : `"${routine.name}"`;
      const sql = `DROP ${keyword} ${qualified}`;
      await commands.executeQuery(sessionId, sql);
      onClose();
    } catch (err) {
      const classified = classifyError(err);
      setError(classified.message);
      setDropConfirm(false);
    } finally {
      setDropping(false);
    }
  }, [sessionId, routine, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[85vh] w-[700px] max-w-[90vw] flex-col rounded-lg border border-border bg-surface-elevated shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              {t("procedures.sourceOf", { name: routine.name })}
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {routine.kind === "procedure" ? "Procedure" : "Function"}
              {routine.schema ? ` · ${routine.schema}` : ""}
              {routine.returnType ? ` → ${routine.returnType}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* Source code */}
        <div className="flex-1 overflow-hidden px-5 pb-2">
          {loading && (
            <div className="flex items-center justify-center py-8 text-xs text-text-muted">
              Loading…
            </div>
          )}
          {error && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </div>
          )}
          {source && (
            <div className="h-full max-h-[55vh] overflow-auto rounded border border-border bg-surface">
              <pre className="p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
                {source}
              </pre>
            </div>
          )}
        </div>

        {/* Drop confirmation */}
        {dropConfirm && (
          <div className="mx-5 mb-2 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-700 dark:bg-red-900/30">
            <p className="text-xs text-red-700 dark:text-red-300">
              {t("procedures.dropConfirm", { name: routine.name })}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setDropConfirm(false)}
                className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-muted"
              >
                {t("procedures.cancel")}
              </button>
              <button
                onClick={() => void handleDrop()}
                disabled={dropping}
                className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
              >
                {dropping ? "…" : t("procedures.drop")}
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <button
            onClick={() => setDropConfirm(true)}
            disabled={!source || dropConfirm}
            className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 size={12} />
            {t("procedures.drop")}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleCopy()}
              disabled={!source}
              className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-muted disabled:opacity-50"
            >
              <Copy size={12} />
              {copied ? t("procedures.copied") : t("procedures.copy")}
            </button>
            <button
              onClick={handleEdit}
              disabled={!source}
              className="flex items-center gap-1 rounded bg-accent-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-blue/90 disabled:opacity-50"
            >
              <Pencil size={12} />
              {t("procedures.edit")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
