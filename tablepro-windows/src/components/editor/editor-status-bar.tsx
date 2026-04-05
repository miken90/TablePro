import { useEffect, useState, useMemo, useRef } from "react";
import type { EditorView } from "@codemirror/view";
import { Database } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useEditorViewRef } from "../../contexts/editor-view-context";
import { allStatements, locatedStatementAtCursor } from "../../editor/statement-scanner";

interface CursorInfo {
  line: number;
  col: number;
  selected: number;
}

function getCursorInfo(view: EditorView | null): CursorInfo {
  if (!view) return { line: 1, col: 1, selected: 0 };
  const state = view.state;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head);
  const col = range.head - line.from + 1;
  const selected = range.empty ? 0 : Math.abs(range.to - range.from);
  return { line: line.number, col, selected };
}

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
  const viewRef = useEditorViewRef();
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, col: 1, selected: 0 });
  const [stmtInfo, setStmtInfo] = useState({ current: 0, total: 0 });
  const vimMode = useSettingsStore((s) => s.settings.vimMode);
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const connections = useConnectionStore((s) => s.connections);

  const dbType = useMemo(() => {
    if (!selectedConnectionId) return undefined;
    return connections.get(selectedConnectionId)?.config?.dbType;
  }, [selectedConnectionId, connections]);

  const dialectLabel = dbType ? (DIALECT_LABELS[dbType.toLowerCase()] ?? dbType) : "SQL";

  const cachedDocRef = useRef<string>("");
  const cachedStmtsRef = useRef<string[]>([]);
  const cachedOffsetsRef = useRef<number[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const view = viewRef.current;
      if (!view) return;
      setCursor(getCursorInfo(view));

      const doc = view.state.doc.toString();
      const cursorPos = view.state.selection.main.head;

      if (doc !== cachedDocRef.current) {
        cachedDocRef.current = doc;
        cachedStmtsRef.current = allStatements(doc);
        const offsets: number[] = [];
        let searchFrom = 0;
        for (const stmt of cachedStmtsRef.current) {
          const idx = doc.indexOf(stmt, searchFrom);
          offsets.push(idx >= 0 ? idx : searchFrom);
          if (idx >= 0) searchFrom = idx + stmt.length;
        }
        cachedOffsetsRef.current = offsets;
      }

      const stmts = cachedStmtsRef.current;
      const offsets = cachedOffsetsRef.current;

      const located = locatedStatementAtCursor(doc, cursorPos);
      let currentIdx = 0;
      if (located.sql.trim().length > 0) {
        const idx = offsets.findIndex((o) => Math.abs(o - located.offset) <= 1);
        currentIdx = idx >= 0 ? idx + 1 : 1;
      }
      setStmtInfo({ current: currentIdx || 1, total: stmts.length });
    }, 100);

    return () => clearInterval(interval);
  }, [viewRef]);

  return (
    <div className="flex items-center gap-3 border-t border-border-subtle bg-surface px-3 py-0.5 text-[10px] text-text-muted">
      {stmtInfo.total > 0 && (
        <span>{t("editorStatusBar.stmt", { current: stmtInfo.current, total: stmtInfo.total })}</span>
      )}

      <span>
        {t("editorStatusBar.ln", { line: cursor.line, col: cursor.col })}
      </span>

      {cursor.selected > 0 && (
        <span>{t("editorStatusBar.selected", { count: cursor.selected })}</span>
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
