import { useRef, useCallback, useEffect } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor as monacoEditor } from "monaco-editor";
import { useSettingsStore } from "../../stores/settings";
import { useVimMode } from "../../hooks/useVimMode";
import { isDarkMode } from "../../utils/theme";

interface SQLEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: (query: string) => void;
  readOnly?: boolean;
  onVimModeChange?: (mode: "NORMAL" | "INSERT" | "VISUAL" | "REPLACE") => void;
}

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN",
  "IS", "NULL", "AS", "ON", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "CROSS",
  "FULL", "GROUP", "BY", "ORDER", "ASC", "DESC", "HAVING", "LIMIT", "OFFSET",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE",
  "ALTER", "DROP", "INDEX", "VIEW", "DATABASE", "SCHEMA", "IF", "EXISTS",
  "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "UNIQUE", "CHECK", "DEFAULT",
  "AUTO_INCREMENT", "SERIAL", "CASCADE", "RESTRICT", "TRUNCATE", "EXPLAIN",
  "UNION", "ALL", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX", "CASE",
  "WHEN", "THEN", "ELSE", "END", "COALESCE", "CAST", "CONVERT", "TRUE", "FALSE",
  "GRANT", "REVOKE", "COMMIT", "ROLLBACK", "BEGIN", "TRANSACTION", "SAVEPOINT",
  "WITH", "RECURSIVE", "RETURNING", "UPSERT", "REPLACE", "IGNORE",
];

function getCurrentStatement(model: monacoEditor.ITextModel, position: { lineNumber: number; column: number }): string {
  const fullText = model.getValue();
  const offset = model.getOffsetAt(position);

  let start = offset;
  let end = offset;

  while (start > 0 && fullText[start - 1] !== ";") start--;
  while (end < fullText.length && fullText[end] !== ";") end++;

  return fullText.slice(start, end).trim();
}

export function SQLEditor({ value, onChange, onExecute, readOnly, onVimModeChange }: SQLEditorProps) {
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const vimModeEnabled = useSettingsStore((s) => s.settings?.editor.vimModeEnabled ?? false);
  const theme = useSettingsStore((s) => s.settings?.appearance.theme ?? "system");
  const editorTheme = theme === "light" ? "vs" : theme === "dark" ? "vs-dark" : (isDarkMode() ? "vs-dark" : "vs");

  const { mode: vimMode, enabled: vimEnabled } = useVimMode(editorRef, vimModeEnabled);

  useEffect(() => {
    if (vimEnabled) {
      onVimModeChange?.(vimMode);
    }
  }, [vimMode, vimEnabled, onVimModeChange]);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      monaco.languages.registerCompletionItemProvider("sql", {
        provideCompletionItems: (
          model: monacoEditor.ITextModel,
          pos: { lineNumber: number; column: number },
        ) => {
          const word = model.getWordUntilPosition(pos);
          const range = {
            startLineNumber: pos.lineNumber,
            endLineNumber: pos.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions = SQL_KEYWORDS.map((kw) => ({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range,
          }));

          return { suggestions };
        },
      });

      editor.addAction({
        id: "run-query",
        label: "Run Query",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: (ed) => {
          const model = ed.getModel();
          const pos = ed.getPosition();
          if (model && pos) {
            const stmt = getCurrentStatement(model, pos);
            if (stmt) onExecute(stmt);
          }
        },
      });

      editor.addAction({
        id: "run-all",
        label: "Run All",
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        ],
        run: (ed) => {
          const text = ed.getValue().trim();
          if (text) onExecute(text);
        },
      });
    },
    [onExecute],
  );

  return (
    <Editor
      height="100%"
      language="sql"
      theme={editorTheme}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        wordWrap: "on",
        automaticLayout: true,
        tabSize: 2,
        readOnly,
        padding: { top: 8 },
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
      }}
    />
  );
}
