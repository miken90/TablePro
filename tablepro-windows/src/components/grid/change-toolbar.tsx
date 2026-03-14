import React, { useEffect } from "react";
import { useChangeStore } from "../../stores/changeStore";

interface ChangeToolbarProps {
  onSave: () => void;
}

export function ChangeToolbar({ onSave }: ChangeToolbarProps) {
  const { _changes, _undoStack, _redoStack, hasChanges, undo, redo, clear } =
    useChangeStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  if (!hasChanges) return null;

  const changeCount = Object.keys(_changes).length;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 text-xs">
      <span className="flex-1 text-amber-800 dark:text-amber-300">
        ⚠ {changeCount} unsaved {changeCount === 1 ? "change" : "changes"}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={undo}
          disabled={_undoStack.length === 0}
          className="border border-zinc-300 px-2 py-0.5 rounded text-xs dark:border-zinc-600 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-700"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={_redoStack.length === 0}
          className="border border-zinc-300 px-2 py-0.5 rounded text-xs dark:border-zinc-600 disabled:opacity-40 hover:bg-zinc-100 dark:hover:bg-zinc-700"
        >
          Redo
        </button>
        <button
          type="button"
          onClick={clear}
          className="border border-red-400 text-red-600 hover:bg-red-50 px-2 py-0.5 rounded text-xs"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          className="bg-green-600 text-white hover:bg-green-700 px-2 py-0.5 rounded text-xs"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
