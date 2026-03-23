import { useEffect, useState, useMemo, useRef } from "react";
import type { EditorView } from "@codemirror/view";
import { Database } from "lucide-react";
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

  // H3 fix: cache parsed statements — only re-parse when doc text changes
  const cachedDocRef = useRef<string>("");
  const cachedStmtsRef = useRef<string[]>([]);
  // H1 fix: cache statement offsets for offset-based matching (no string-equality)
  const cachedOffsetsRef = useRef<number[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const view = viewRef.current;
      if (!view) return;
      setCursor(getCursorInfo(view));

      const doc = view.state.doc.toString();
      const cursorPos = view.state.selection.main.head;

      // Only re-parse when doc text actually changed
      if (doc !== cachedDocRef.current) {
        cachedDocRef.current = doc;
        cachedStmtsRef.current = allStatements(doc);
        // Build offset array by scanning each statement's located offset
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

      // H1 fix: use offset-based matching instead of string equality
      const located = locatedStatementAtCursor(doc, cursorPos);
      let currentIdx = 0;
      if (located.sql.trim().length > 0) {
        // Find by closest offset match
        const idx = offsets.findIndex((o) => Math.abs(o - located.offset) <= 1);
        currentIdx = idx >= 0 ? idx + 1 : 1;
      }
      setStmtInfo({ current: currentIdx || 1, total: stmts.length });
    }, 100);

    return () => clearInterval(interval);
  }, [viewRef]);

  return (
    <div className="flex items-center gap-3 border-t border-zinc-200 bg-zinc-50 px-3 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500">
      {/* Statement index */}
      {stmtInfo.total > 0 && (
        <span>Stmt {stmtInfo.current}/{stmtInfo.total}</span>
      )}

      {/* Position */}
      <span>
        Ln {cursor.line}, Col {cursor.col}
      </span>

      {/* Selection info */}
      {cursor.selected > 0 && (
        <span>{cursor.selected} selected</span>
      )}

      {/* Spacer */}
      <span className="flex-1" />

      {/* Vim mode indicator */}
      {vimMode && (
        <span className="rounded bg-zinc-200 px-1 font-mono text-[9px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
          VIM
        </span>
      )}

      {/* Dialect indicator */}
      <span className="flex items-center gap-1">
        <Database size={10} aria-hidden="true" />
        {dialectLabel}
      </span>

      <span>Ctrl+Enter to run</span>
    </div>
  );
}
