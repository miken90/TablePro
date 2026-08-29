import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import type { RoutineInfo } from "../../types/schema";
import type { RoutineParam, RoutineResult } from "../../ipc/commands";
import * as commands from "../../ipc/commands";
import { classifyError } from "../../ipc/error";
import { Dialog, type DialogAction } from "../ui";

interface ProcedureExecuteDialogProps {
  open: boolean;
  routine: RoutineInfo;
  sessionId: string;
  onClose: () => void;
}

interface ParamEntry {
  name: string;
  paramType: string;
  value: string;
  isNull: boolean;
}

function parseSignatureParams(signature: string | null): ParamEntry[] {
  if (!signature || !signature.trim()) return [];
  return signature.split(",").map((part) => {
    const trimmed = part.trim();
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) {
      return { name: trimmed, paramType: "unknown", value: "", isNull: false };
    }
    const name = trimmed.substring(0, spaceIdx);
    const paramType = trimmed.substring(spaceIdx + 1).trim();
    return { name, paramType, value: "", isNull: false };
  });
}

export function ProcedureExecuteDialog({
  open,
  routine,
  sessionId,
  onClose,
}: ProcedureExecuteDialogProps) {
  const { t } = useTranslation();
  const [params, setParams] = useState<ParamEntry[]>([]);
  const [sqlPreview, setSqlPreview] = useState<string | null>(null);
  const [result, setResult] = useState<RoutineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedTsv, setCopiedTsv] = useState(false);

  useEffect(() => {
    if (open) {
      setParams(parseSignatureParams(routine.signature));
      setSqlPreview(null);
      setResult(null);
      setError(null);
      setExecuting(false);
    }
  }, [open, routine]);

  const buildParams = useCallback((): RoutineParam[] => {
    return params.map((p) => ({
      name: p.name,
      value: p.isNull ? null : p.value,
      paramType: p.paramType || null,
    }));
  }, [params]);

  const handlePreview = useCallback(async () => {
    try {
      const preview = await commands.previewRoutineSql(
        sessionId,
        routine.name,
        routine.schema,
        routine.kind,
        buildParams(),
      );
      setSqlPreview(preview);
      setError(null);
    } catch (err) {
      const classified = classifyError(err);
      setError(classified.message);
    }
  }, [sessionId, routine, buildParams]);

  const handleExecute = useCallback(async () => {
    setExecuting(true);
    setError(null);
    try {
      const res = await commands.executeRoutine(
        sessionId,
        routine.name,
        routine.schema,
        routine.kind,
        buildParams(),
      );
      setResult(res);
    } catch (err) {
      const classified = classifyError(err);
      setError(classified.hint ? `${classified.message} — ${classified.hint}` : classified.message);
    } finally {
      setExecuting(false);
    }
  }, [sessionId, routine, buildParams]);

  const handleCopySql = useCallback(async () => {
    if (!sqlPreview) return;
    await navigator.clipboard.writeText(sqlPreview);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [sqlPreview]);

  const handleReExecute = useCallback(async () => {
    setResult(null);
    setError(null);
    setSqlPreview(null);
    await handleExecute();
  }, [handleExecute]);

  const handleCopyTsv = useCallback(async () => {
    const rs = result?.resultSet;
    if (!rs || rs.columns.length === 0) return;
    const header = rs.columns.map((c) => c.name).join("\t");
    const rows = rs.rows.map((row) => row.map((cell) => cell ?? "NULL").join("\t"));
    await navigator.clipboard.writeText([header, ...rows].join("\n"));
    setCopiedTsv(true);
    setTimeout(() => setCopiedTsv(false), 1500);
  }, [result]);

  const updateParam = (index: number, field: "value" | "isNull", val: string | boolean) => {
    setParams((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: val } : p)),
    );
  };

  const rs = result?.resultSet;

  const actions: DialogAction[] = [
    ...(!result ? [{ label: t("procedures.generatePreview"), onClick: () => void handlePreview(), variant: 'secondary' as const }] : []),
    {
      label: executing
        ? t("procedures.executing")
        : result
          ? t("procedures.reExecute", "Re-execute")
          : t("procedures.confirm"),
      onClick: () => void (result ? handleReExecute() : handleExecute()),
      disabled: executing,
      loading: executing,
    },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("procedures.executeRoutine")}
      size="lg"
      cancelLabel={result ? t("procedures.close") : t("procedures.cancel")}
      actions={actions}
    >
      <p className="-mt-2 mb-3 text-xs text-text-secondary">
        {routine.schema ? `${routine.schema}.` : ""}{routine.name}
        {routine.returnType ? ` → ${routine.returnType}` : ""}
      </p>
      <div>
          {/* Parameters */}
          {params.length > 0 ? (
            <div className="mb-3">
              <p className="mb-2 text-xs font-medium text-text-secondary">
                {t("procedures.parameters")}
              </p>
              <div className="space-y-2">
                {params.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate text-xs text-text-secondary" title={p.name}>
                      {p.name}
                    </span>
                    <span className="w-20 shrink-0 truncate text-[10px] text-text-secondary" title={p.paramType}>
                      {p.paramType}
                    </span>
                    <input
                      type="text"
                      value={p.isNull ? "" : p.value}
                      disabled={p.isNull}
                      onChange={(e) => updateParam(i, "value", e.target.value)}
                      placeholder={p.isNull ? "NULL" : t("procedures.paramValue")}
                      className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary disabled:opacity-50"
                    />
                    <label className="flex items-center gap-1 text-[10px] text-text-secondary">
                      <input
                        type="checkbox"
                        checked={p.isNull}
                        onChange={(e) => updateParam(i, "isNull", e.target.checked)}
                        className="h-3 w-3"
                      />
                      {t("procedures.null")}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mb-3 text-xs text-text-secondary">{t("procedures.noParameters")}</p>
          )}

          {/* SQL Preview */}
          {sqlPreview && (
            <div className="mb-3 rounded border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                <span className="text-[11px] font-medium text-text-secondary">
                  {t("procedures.sqlPreview")}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopySql()}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                >
                  <Copy size={11} />
                  {copied ? t("procedures.copied") : t("procedures.copy")}
                </button>
              </div>
              <pre className="max-h-[15vh] overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[11px] text-text-secondary">
                {sqlPreview}
              </pre>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Result set */}
          {rs && rs.columns.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium text-text-secondary">
                  {t("procedures.resultSet")} ({rs.rows.length} rows)
                </p>
                <button
                  type="button"
                  onClick={() => void handleCopyTsv()}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                >
                  <Copy size={11} />
                  {copiedTsv ? t("procedures.copied") : "Copy as TSV"}
                </button>
              </div>
              <div className="max-h-[30vh] overflow-auto rounded border border-border">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border bg-surface-muted">
                      {rs.columns.map((col) => (
                        <th key={col.name} className="whitespace-nowrap px-2 py-1 text-left font-medium text-text-secondary">
                          {col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rs.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-border last:border-b-0">
                        {row.map((cell, ci) => (
                          <td key={ci} className={`whitespace-nowrap px-2 py-1 ${cell === null ? "italic text-grid-null-fg" : "text-text-primary"}`}>
                            {cell ?? "NULL"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* No result message */}
          {result && (!rs || rs.columns.length === 0) && (
            <div className="mb-3 rounded border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300">
              {t("procedures.noResults")}
            </div>
          )}
      </div>
    </Dialog>
  );
}
