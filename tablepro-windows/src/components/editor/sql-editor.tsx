import { useEffect, useRef, useCallback, useState } from "react";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { useEditorStore } from "../../stores/editorStore";
import { useQueryStore } from "../../stores/queryStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSchemaStore } from "../../stores/schemaStore";
import { useQueryProgress } from "../../hooks/useQueryProgress";
import { useEditorViewRef } from "../../contexts/editor-view-context";
import {
  fontCompartment,
  vimCompartment,
  dialectCompartment,
  reconfigureFont,
  reconfigureVim,
  reconfigureDialect,
} from "../../editor/editor-compartments";
import { createEditorTheme, createEditorFontTheme } from "./editor-theme";
import { sqlCompletionSource } from "../../editor/sql-completion-source";
import { createVimExtension } from "../../editor/vim-mode";
import { createKeybindings } from "../../editor/keybindings";
import { formatEditorContent } from "../../editor/sql-formatter";
import { allStatements, statementAtCursor } from "../../editor/statement-scanner";
import { statementHighlighter } from "../../editor/statement-highlighter";
import { errorMarkerField, setErrorMark } from "../../editor/error-marker";
import {
  parseErrorPosition,
  pgCharOffsetToDocOffset,
} from "../../editor/error-position-parser";

type SqlDialect = "postgresql" | "mysql" | "mssql" | "standard";

interface SqlEditorProps {
  dialect?: SqlDialect;
}

async function loadEditorRuntime() {
  const [viewMod, stateMod, sqlMod, commandsMod, searchMod, autocompleteMod, languageMod] =
    await Promise.all([
      import("@codemirror/view"),
      import("@codemirror/state"),
      import("@codemirror/lang-sql"),
      import("@codemirror/commands"),
      import("@codemirror/search"),
      import("@codemirror/autocomplete"),
      import("@codemirror/language"),
    ]);

  return {
    ...viewMod,
    ...stateMod,
    ...sqlMod,
    ...commandsMod,
    ...searchMod,
    ...autocompleteMod,
    ...languageMod,
    createEditorTheme,
    createEditorFontTheme,
    sqlCompletionSource,
    createVimExtension,
    createKeybindings,
    formatEditorContent,
    allStatements,
    statementAtCursor,
    statementHighlighter,
    errorMarkerField,
    setErrorMark,
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
  const contextViewRef = useEditorViewRef();
  const stateMapRef = useRef<Map<string, EditorState>>(new Map());
  const [editorRuntime, setEditorRuntime] = useState<EditorRuntime | null>(null);

  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const addTab = useEditorStore((s) => s.addTab);
  const execute = useQueryStore((s) => s.execute);
  const setQueryText = useQueryStore((s) => s.setQueryText);
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const settings = useSettingsStore((s) => s.settings);

  const activeSessionId = selectedConnectionId ? getSessionId(selectedConnectionId) : null;
  const queryProgress = useQueryProgress(activeSessionId);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Init default tab
  useEffect(() => {
    if (tabs.length === 0 && selectedConnectionId) {
      addTab();
    }
  }, [tabs.length, addTab, selectedConnectionId]);

  // Build extensions with compartments for configurable parts
  const buildExtensions = useCallback(
    (tabId: string, runtime: EditorRuntime) => {
      const updateListener = runtime.EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const content = update.state.doc.toString();
        updateTabContent(tabId, content);
        setQueryText(content);
      });

      return [
        // Configurable: dialect (in compartment)
        dialectCompartment.of(runtime.sql({ dialect: resolveDialect(runtime, dialect) })),
        // Theme (CSS-variable based, auto-adapts)
        runtime.createEditorTheme(),
        // Configurable: font (in compartment)
        fontCompartment.of(
          runtime.createEditorFontTheme(settings.editorFont, settings.editorFontSize),
        ),
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
        // Code folding
        runtime.foldGutter({ openText: "▾", closedText: "▸" }),
        // Autocomplete
        runtime.autocompletion({ override: [runtime.sqlCompletionSource] }),
        // Statement highlighting
        runtime.statementHighlighter,
        // Error marking
        runtime.errorMarkerField,
        // App keybindings
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
        // Keymaps (including fold keymaps)
        runtime.keymap.of([
          ...runtime.closeBracketsKeymap,
          ...runtime.defaultKeymap,
          ...runtime.historyKeymap,
          ...runtime.searchKeymap,
          ...runtime.completionKeymap,
          ...runtime.foldKeymap,
          runtime.indentWithTab,
        ]),
        // Placeholder
        runtime.placeholder("-- Write SQL here\n-- Ctrl+Enter to execute"),
        // Configurable: vim mode (in compartment)
        vimCompartment.of(settings.vimMode ? runtime.createVimExtension() : []),
        // Change listener
        updateListener,
      ];
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
      contextViewRef.current = view;
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
      contextViewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set editor state when active tab changes
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

    // Re-apply current settings to restored state (settings may have changed
    // while another tab was active; compartment reconfigure is idempotent)
    const currentSettings = useSettingsStore.getState().settings;
    reconfigureFont(view, runtime.createEditorFontTheme(currentSettings.editorFont, currentSettings.editorFontSize));
    reconfigureVim(view, currentSettings.vimMode ? runtime.createVimExtension() : []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, editorRuntime]);

  // Reconfigure font/vim via compartments (preserves undo history)
  useEffect(() => {
    const view = viewRef.current;
    const runtime = editorRuntime;
    if (!view || !runtime) return;

    reconfigureFont(view, runtime.createEditorFontTheme(settings.editorFont, settings.editorFontSize));
    reconfigureVim(view, settings.vimMode ? runtime.createVimExtension() : []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorRuntime, settings.editorFont, settings.editorFontSize, settings.vimMode]);

  // Reconfigure dialect via compartment when it changes
  useEffect(() => {
    const view = viewRef.current;
    const runtime = editorRuntime;
    if (!view || !runtime) return;

    reconfigureDialect(view, runtime.sql({ dialect: resolveDialect(runtime, dialect) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorRuntime, dialect]);

  // Dispatch error marker when query fails
  useEffect(() => {
    const view = viewRef.current;
    const runtime = editorRuntime;
    if (!view || !runtime) return;

    const unsub = useQueryStore.subscribe((state, prev) => {
      if (state.error && state.error !== prev.error) {
        const pos = parseErrorPosition(state.error);
        if (pos.charOffset !== null) {
          const docOffset = pgCharOffsetToDocOffset(pos.charOffset);
          const clampedOffset = Math.min(docOffset, view.state.doc.length);
          const to = Math.min(clampedOffset + 10, view.state.doc.length);
          view.dispatch({ effects: runtime.setErrorMark.of({ from: clampedOffset, to }) });
        }
      }
    });

    return unsub;
  }, [editorRuntime]);

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
      {queryProgress.isRunning && (
        <div className="border-t border-border-subtle bg-surface px-3 py-1 text-[10px] text-accent-blue">
          Running query… {(queryProgress.elapsedMs / 1000).toFixed(1)}s
        </div>
      )}
    </div>
  );
}

export type { SqlEditorProps };
