import { useMemo } from "react";
import { Database } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useEditorStatusStore } from "../../stores/editorStatusStore";

const DIALECT_LABELS: Record<string, string> = {
  postgres: "PG",
  postgresql: "PG",
  mysql: "MySQL",
  mssql: "MSSQL",
  sqlite: "SQLite",
  redis: "Redis",
  oracle: "ORA",
  clickhouse: "CH",
  duckdb: "Duck",
};

export function EditorStatusBar() {
  const { t } = useTranslation();
  const line = useEditorStatusStore((s) => s.line);
  const col = useEditorStatusStore((s) => s.col);
  const selected = useEditorStatusStore((s) => s.selected);
  const statementIndex = useEditorStatusStore((s) => s.statementIndex);
  const statementCount = useEditorStatusStore((s) => s.statementCount);
  const vimMode = useSettingsStore((s) => s.settings.vimMode);
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const connections = useConnectionStore((s) => s.connections);

  const dbType = useMemo(() => {
    if (!selectedConnectionId) return undefined;
    return connections.get(selectedConnectionId)?.config?.dbType;
  }, [selectedConnectionId, connections]);

  const dialectLabel = dbType ? (DIALECT_LABELS[dbType.toLowerCase()] ?? dbType) : "SQL";

  return (
    <div className="flex items-center gap-3 border-t border-border-subtle bg-surface px-3 py-0.5 text-[10px] text-text-muted">
      {statementCount > 0 && (
        <span>{t("editorStatusBar.stmt", { current: statementIndex, total: statementCount })}</span>
      )}

      <span>
        {t("editorStatusBar.ln", { line, col })}
      </span>

      {selected > 0 && (
        <span>{t("editorStatusBar.selected", { count: selected })}</span>
      )}

      <span className="flex-1" />

      {vimMode && (
        <span className="rounded bg-surface-muted px-1 font-mono text-[9px] text-text-secondary">
          VIM
        </span>
      )}

      <span className="flex items-center gap-1">
        <Database size={10} aria-hidden="true" />
        {dialectLabel}
      </span>

      <span>{t("editorStatusBar.ctrlEnterToRun")}</span>
    </div>
  );
}
