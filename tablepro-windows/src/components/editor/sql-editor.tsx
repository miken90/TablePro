import { useEffect, useRef, useCallback, useState } from "react";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { useEditorStore } from "../../stores/editorStore";
import { useQueryStore } from "../../stores/queryStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSchemaStore } from "../../stores/schemaStore";

type SqlDialect = "postgresql" | "mysql" | "mssql" | "standard";

interface SqlEditorProps {
  dialect?: SqlDialect;
}

async function loadEditorRuntime() {
  const [
    viewMod,
    stateMod,
    sqlMod,
    commandsMod,
    searchMod,
    autocompleteMod,
    languageMod,
    themeMod,
    completionMod,
    vimModeMod,
    keybindingsMod,
    formatterMod,
    scannerMod,
  ] = await Promise.all([
    import("@codemirror/view"),
    import("@codemirror/state"),
    import("@codemirror/lang-sql"),
    import("@codemirror/commands"),
    import("@codemirror/search"),
    import("@codemirror/autocomplete"),
    import("@codemirror/language"),
    import("./editor-theme"),
    import("../../editor/sql-completion-source"),
    import("../../editor/vim-mode"),
    import("../../editor/keybindings"),
    import("../../editor/sql-formatter"),
    import("../../editor/statement-scanner"),
  ]);

  return {
    ...viewMod,
    ...stateMod,
    ...sqlMod,
    ...commandsMod,
    ...searchMod,
    ...autocompleteMod,
    ...languageMod,
    ...themeMod,
    ...completionMod,
    ...vimModeMod,
    ...keybindingsMod,
    ...formatterMod,
    ...scannerMod,
  };
}

type EditorRuntime = Awaited<ReturnType<typeof loadEditorRuntime>>;

let runtimePromise: Promise<EditorRuntime> | null = null;

function getEditorRuntime() {
  if (!runtimePromise) {
    runtimePromise = loadEditorRuntime();
  }
  return runtimePromise;
}

function resolveDialect(runtime: EditorRuntime, dialect: SqlDialect | undefined) {
  switch (dialect) {
    case "postgresql":
      return runtime.PostgreSQL;
    case "mysql":
      return runtime.MySQL;
    case "mssql":
      return runtime.MSSQL;
    default:
      return runtime.StandardSQL;
  }
}

export function SqlEditor({ dialect }: SqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Map from tabId → saved EditorState
  const stateMapRef = useRef<Map<string, EditorState>>(new Map());
  const [editorRuntime, setEditorRuntime] = useState<EditorRuntime | null>(null);

  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const addTab = useEditorStore((s) => s.addTab);
  const execute = useQueryStore((s) => s.execute);
  const setQueryText = useQueryStore((s) => s.setQueryText);
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const settings = useSettingsStore((s) => s.settings);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Init default tab (only when connected)
  useEffect(() => {
    if (tabs.length === 0 && selectedConnectionId) {
      addTab();
    }
  }, [tabs.length, addTab, selectedConnectionId]);

  // Build the extension list (stable between renders)
  const buildExtensions = useCallback(
    (tabId: string, runtime: EditorRuntime) => {
      const updateListener = runtime.EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const content = update.state.doc.toString();
        updateTabContent(tabId, content);
        setQueryText(content);
      });

      const extensions = [
        // Language
        runtime.sql({ dialect: resolveDialect(runtime, dialect) }),
        // Theme
        runtime.createEditorTheme(),
        runtime.createEditorFontTheme(settings.editorFont, settings.editorFontSize),
        // Editor features
        runtime.lineNumbers(),
        runtime.highlightActiveLineGutter(),
        runtime.highlightActiveLine(),
        runtime.highlightSelectionMatches(),
        runtime.drawSelection(),
        runtime.rectangularSelection(),
        runtime.crosshairCursor(),
        runtime.bracketMatching(),
        runtime.closeBrackets(),
        runtime.indentOnInput(),
        runtime.history(),
        // Autocomplete with schema-aware SQL source
        runtime.autocompletion({ override: [runtime.sqlCompletionSource] }),
        // App keybindings (run query, format, etc.)
        runtime.createKeybindings({
          runQuery: (view) => {
            const connId = useConnectionStore.getState().selectedConnectionId;
            if (!connId) return false;
            const sessionId = useConnectionStore.getState().getSessionId(connId);
            if (!sessionId) return false;
            const text = view.state.doc.toString();
            const cursor = view.state.selection.main.head;
            const stmt = runtime.statementAtCursor(text, cursor);
            if (stmt.trim()) void execute(sessionId, stmt);
            return true;
          },
          runAll: (view) => {
            const connId = useConnectionStore.getState().selectedConnectionId;
            if (!connId) return false;
            const sessionId = useConnectionStore.getState().getSessionId(connId);
            if (!sessionId) return false;
            const stmts = runtime.allStatements(view.state.doc.toString());
            const combined = stmts.join(";\n");
            if (combined.trim()) void execute(sessionId, combined);
            return true;
          },
          formatSql: (view) => runtime.formatEditorContent(view, dialect),
          refreshSchema: () => {
            const connId = useConnectionStore.getState().selectedConnectionId;
            if (!connId) return;
            const sessionId = useConnectionStore.getState().getSessionId(connId);
            if (sessionId) void useSchemaStore.getState().fetchSchema(sessionId);
          },
        }),
        // Keymaps
        runtime.keymap.of([
          ...runtime.closeBracketsKeymap,
          ...runtime.defaultKeymap,
          ...runtime.historyKeymap,
          ...runtime.searchKeymap,
          ...runtime.completionKeymap,
          runtime.indentWithTab,
        ]),
        // Placeholder hint
        runtime.placeholder("-- Write SQL here\n-- Ctrl+Enter to execute"),
        // Change listener
        updateListener,
      ];

      if (settings.vimMode) {
        extensions.unshift(runtime.createVimExtension());
      }

      return extensions;
    },
    [dialect, settings.editorFont, settings.editorFontSize, settings.vimMode, updateTabContent, setQueryText, execute],
  );

  // Create EditorView once after runtime lazy-load completes
  useEffect(() => {
    let cancelled = false;

    async function initializeEditor() {
      if (!containerRef.current) return;

      const runtime = await getEditorRuntime();
      if (cancelled || !containerRef.current) return;

      setEditorRuntime(runtime);

      const tabId = useEditorStore.getState().activeTabId;
      const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId);
      const initialState = tabId
        ? runtime.EditorState.create({
            doc: tab?.content ?? "",
            extensions: buildExtensions(tabId, runtime),
          })
        : runtime.EditorState.create({
            doc: "",
            extensions: buildExtensions("__init__", runtime),
          });

      const view = new runtime.EditorView({
        state: initialState,
        parent: containerRef.current,
      });

      viewRef.current = view;
      if (tabId) {
        stateMapRef.current.set(tabId, initialState);
      }
    }

    void initializeEditor();

    return () => {
      cancelled = true;
      const view = viewRef.current;
      if (!view) return;

      const currentTabId = useEditorStore.getState().activeTabId;
      if (currentTabId) {
        stateMapRef.current.set(currentTabId, view.state as EditorState);
      }

      view.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set editor state when active tab changes (or first becomes available)
  useEffect(() => {
    const view = viewRef.current;
    const runtime = editorRuntime;
    if (!view || !runtime || !activeTabId) return;

    const saved = stateMapRef.current.get(activeTabId);
    if (saved) {
      view.setState(saved);
    } else {
      const content = activeTab?.content ?? "";
      const newState = runtime.EditorState.create({
        doc: content,
        extensions: buildExtensions(activeTabId, runtime),
      });
      view.setState(newState);
      stateMapRef.current.set(activeTabId, newState);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, editorRuntime]);

  // Update font/vim settings without full remount
  useEffect(() => {
    const view = viewRef.current;
    const runtime = editorRuntime;
    if (!view || !runtime || !activeTabId) return;

    const doc = view.state.doc;
    const newState = runtime.EditorState.create({
      doc,
      extensions: buildExtensions(activeTabId, runtime),
    });

    view.setState(newState);
    stateMapRef.current.set(activeTabId, view.state as EditorState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorRuntime, settings.editorFont, settings.editorFontSize, settings.vimMode, dialect]);

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
