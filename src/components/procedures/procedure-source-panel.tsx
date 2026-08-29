import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { RoutineInfo } from "../../types/schema";
import * as commands from "../../ipc/commands";
import { classifyError } from "../../ipc/error";
import { useEditorStore } from "../../stores/editorStore";
import { Dialog, type DialogAction } from "../ui";

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
      const escName = routine.name.replace(/"/g, '""');
      const escSchema = routine.schema?.replace(/"/g, '""');
      const qualified = escSchema
        ? `"${escSchema}"."${escName}"`
        : `"${escName}"`;
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

  const actions: DialogAction[] = [
    {
      label: t("procedures.drop"),
      onClick: () => setDropConfirm(true),
      disabled: !source || dropConfirm,
      variant: 'danger-ghost',
    },
    {
      label: copied ? t("procedures.copied") : t("procedures.copy"),
      onClick: () => void handleCopy(),
      disabled: !source,
      variant: 'secondary',
    },
    {
      label: t("procedures.edit"),
      onClick: handleEdit,
      disabled: !source,
    },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("procedures.sourceOf", { name: routine.name })}
      size="lg"
      actions={actions}
    >
      <p className="-mt-2 mb-3 text-xs text-text-secondary">
        {routine.kind === "procedure" ? "Procedure" : "Function"}
        {routine.schema ? ` · ${routine.schema}` : ""}
        {routine.returnType ? ` → ${routine.returnType}` : ""}
      </p>

        {/* Source code */}
        <div className="pb-2">
          {loading && (
            <div className="flex items-center justify-center py-8 text-xs text-text-secondary">
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
          <div className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-700 dark:bg-red-900/30">
            <p className="text-xs text-red-700 dark:text-red-300">
              {t("procedures.dropConfirm", { name: routine.name })}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setDropConfirm(false)}
                className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-muted hover:text-text-primary"
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
    </Dialog>
  );
}
