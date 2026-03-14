import { useEffect, useRef, useCallback } from "react";
import { useEditorStore } from "../../stores/editorStore";
import { useQueryStore } from "../../stores/queryStore";
import { useConnectionStore } from "../../stores/connectionStore";

export function EditorPlaceholder() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const addTab = useEditorStore((s) => s.addTab);
  const { execute, setQueryText } = useQueryStore();
  const selectedConnectionId = useConnectionStore((s) => s.selectedConnectionId);
  const getSessionId = useConnectionStore((s) => s.getSessionId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Initialize with a default tab if none
  useEffect(() => {
    if (tabs.length === 0) {
      addTab();
    }
  }, [tabs.length, addTab]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!activeTabId) return;
      updateTabContent(activeTabId, e.target.value);
      setQueryText(e.target.value);
    },
    [activeTabId, updateTabContent, setQueryText],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        const sql = activeTab?.content ?? "";
        if (selectedConnectionId && sql.trim()) {
          const sessionId = getSessionId(selectedConnectionId);
          if (sessionId) void execute(sessionId, sql);
        }
      }
      // Tab inserts spaces
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = textareaRef.current;
        if (!ta || !activeTabId) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const newVal = ta.value.slice(0, start) + "  " + ta.value.slice(end);
        updateTabContent(activeTabId, newVal);
        setQueryText(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
      }
    },
    [activeTab, selectedConnectionId, getSessionId, execute, activeTabId, updateTabContent, setQueryText],
  );

  return (
    <div className="flex h-full flex-col">
      <textarea
        ref={textareaRef}
        value={activeTab?.content ?? ""}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="-- Write SQL here&#10;-- Ctrl+Enter to execute"
        spellCheck={false}
        className="flex-1 resize-none bg-[var(--editor-bg)] p-3 font-mono text-sm text-[var(--editor-fg)] outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
        style={{ fontFamily: "Consolas, 'Courier New', monospace" }}
      />
      <div className="flex items-center justify-end border-t border-zinc-200 bg-zinc-50 px-3 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800">
        SQL Editor (placeholder) · Ctrl+Enter to run
      </div>
    </div>
  );
}
