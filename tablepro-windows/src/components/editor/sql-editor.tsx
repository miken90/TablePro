import { useEffect, useRef, useCallback } from "react";
import { EditorView, lineNumbers, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightActiveLine, keymap, placeholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { sql, PostgreSQL, MySQL, MSSQL, StandardSQL } from "@codemirror/lang-sql";
import { history, historyKeymap, defaultKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { indentOnInput, bracketMatching } from "@codemirror/language";
import { useEditorStore } from "../../stores/editorStore";
import { useQueryStore } from "../../stores/queryStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { createEditorTheme, createEditorFontTheme } from "./editor-theme";
import { sqlCompletionSource } from "../../editor/sql-completion-source";
import { createVimExtension } from "../../editor/vim-mode";
import { createKeybindings } from "../../editor/keybindings";
import { formatEditorContent } from "../../editor/sql-formatter";
import { statementAtCursor, allStatements } from "../../editor/statement-scanner";
import { useSchemaStore } from "../../stores/schemaStore";

type SqlDialect = "postgresql" | "mysql" | "mssql" | "standard";

interface SqlEditorProps {
  dialect?: SqlDialect;
}

function resolveDialect(dialect: SqlDialect | undefined) {
  switch (dialect) {
    case "postgresql":
      return PostgreSQL;
    case "mysql":
      return MySQL;
    case "mssql":
      return MSSQL;
    default:
      return StandardSQL;
  }
}

export function SqlEditor({ dialect }: SqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Map from tabId → saved EditorState
  const stateMapRef = useRef<Map<string, EditorState>>(new Map());

  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const addTab = useEditorStore((s) => s.addTab);
  const { execute, setQueryText } = useQueryStore();
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const settings = useSettingsStore((s) => s.settings);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Init default tab
  useEffect(() => {
    if (tabs.length === 0) {
      addTab();
    }
  }, [tabs.length, addTab]);

  // Build the extension list (stable between renders)
  const buildExtensions = useCallback(
    (tabId: string) => {
      const updateListener = EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const content = update.state.doc.toString();
        updateTabContent(tabId, content);
        setQueryText(content);
      });

      const extensions = [
        // Language
        sql({ dialect: resolveDialect(dialect) }),
        // Theme
        createEditorTheme(),
        createEditorFontTheme(settings.editorFont, settings.editorFontSize),
        // Editor features
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        drawSelection(),
        rectangularSelection(),
        crosshairCursor(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        history(),
        // Autocomplete with schema-aware SQL source
        autocompletion({ override: [sqlCompletionSource] }),
        // App keybindings (run query, format, etc.)
        createKeybindings({
          runQuery: (view) => {
            const connId = useConnectionStore.getState().selectedConnectionId;
            if (!connId) return false;
            const sessionId = useConnectionStore.getState().getSessionId(connId);
            if (!sessionId) return false;
            const text = view.state.doc.toString();
            const cursor = view.state.selection.main.head;
            const stmt = statementAtCursor(text, cursor);
            if (stmt.trim()) void execute(sessionId, stmt);
            return true;
          },
          runAll: (view) => {
            const connId = useConnectionStore.getState().selectedConnectionId;
            if (!connId) return false;
            const sessionId = useConnectionStore.getState().getSessionId(connId);
            if (!sessionId) return false;
            const stmts = allStatements(view.state.doc.toString());
            const combined = stmts.join(";\n");
            if (combined.trim()) void execute(sessionId, combined);
            return true;
          },
          formatSql: (view) => formatEditorContent(view, dialect),
          refreshSchema: () => {
            const connId = useConnectionStore.getState().selectedConnectionId;
            if (!connId) return;
            const sessionId = useConnectionStore.getState().getSessionId(connId);
            if (sessionId) void useSchemaStore.getState().fetchSchema(sessionId);
          },
        }),
        // Keymaps
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        // Placeholder hint
        placeholder("-- Write SQL here\n-- Ctrl+Enter to execute"),
        // Change listener
        updateListener,
      ];

      if (settings.vimMode) {
        extensions.unshift(createVimExtension());
      }

      return extensions;
    },
    [dialect, settings.editorFont, settings.editorFontSize, settings.vimMode, updateTabContent, setQueryText, execute, selectedConnectionId],
  );

  // Mount EditorView
  useEffect(() => {
    if (!containerRef.current || !activeTabId) return;

    const initialContent = activeTab?.content ?? "";
    const savedState = stateMapRef.current.get(activeTabId);

    const startState = savedState ?? EditorState.create({
      doc: initialContent,
      extensions: buildExtensions(activeTabId),
    });

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      // Save state before unmounting
      if (activeTabId) {
        stateMapRef.current.set(activeTabId, view.state);
      }
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle tab switching
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeTabId) return;

    const saved = stateMapRef.current.get(activeTabId);
    if (saved) {
      view.setState(saved);
    } else {
      const content = activeTab?.content ?? "";
      const newState = EditorState.create({
        doc: content,
        extensions: buildExtensions(activeTabId),
      });
      view.setState(newState);
      stateMapRef.current.set(activeTabId, newState);
    }
  // buildExtensions is memoized; activeTabId drives tab switching
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // Update font/vim settings without full remount
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeTabId) return;

    // Reconfigure by rebuilding state with new extensions but preserving doc
    const doc = view.state.doc;
    const newState = EditorState.create({
      doc,
      extensions: buildExtensions(activeTabId),
    });
    // Save old selection and cursor if possible
    view.setState(newState);
    stateMapRef.current.set(activeTabId, view.state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.editorFont, settings.editorFontSize, settings.vimMode, dialect]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden text-sm [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto"
        style={{
          fontFamily: `${settings.editorFont}, Consolas, 'Courier New', monospace`,
          fontSize: `${settings.editorFontSize}px`,
        }}
      />
    </div>
  );
}

/** Expose the EditorView ref for parent components that need to dispatch commands. */
export type { SqlEditorProps };
