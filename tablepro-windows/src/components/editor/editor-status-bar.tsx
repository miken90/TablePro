import { useEffect, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { useSettingsStore } from "../../stores/settingsStore";

interface EditorStatusBarProps {
  editorView: EditorView | null;
}

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

export function EditorStatusBar({ editorView }: EditorStatusBarProps) {
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, col: 1, selected: 0 });
  const vimMode = useSettingsStore((s) => s.settings.vimMode);

  useEffect(() => {
    if (!editorView) return;

    // Listen for updates
    const interval = setInterval(() => {
      setCursor(getCursorInfo(editorView));
    }, 100);

    return () => clearInterval(interval);
  }, [editorView]);

  return (
    <div className="flex items-center gap-3 border-t border-zinc-200 bg-zinc-50 px-3 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500">
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

      <span>SQL</span>
      <span>Ctrl+Enter to run</span>
    </div>
  );
}
