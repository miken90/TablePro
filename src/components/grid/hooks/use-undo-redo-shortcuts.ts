import { useEffect } from 'react';
import { useChangeStore } from '../../../stores/changeStore';
import { isTextEntryTarget } from '../is-text-entry-target';

/**
 * The single Ctrl+Z / Ctrl+Y listener for staged grid edits.
 *
 * There used to be two, in two components that could both be mounted, so one
 * keypress undid two edits. Hosting it in the pending-changes strip would be
 * no better: `hasChanges` reads the change map alone, so undoing the last edit
 * unmounts the strip and takes Redo with it. It therefore lives above the
 * tab-kind switch, where it survives both.
 *
 * `isTextEntryTarget` keeps it out of the way of typing: Ctrl+Z in a cell
 * editor, the SQL editor (CodeMirror owns its own history) or the AI chat box
 * still means "undo my typing", not "undo my row edit".
 */
export function useUndoRedoShortcuts(): void {
  const undo = useChangeStore((s) => s.undo);
  const redo = useChangeStore((s) => s.redo);
  const hasHistory = useChangeStore((s) => s._undoStack.length > 0 || s._redoStack.length > 0);

  useEffect(() => {
    if (!hasHistory) return;

    const handler = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasHistory, undo, redo]);
}
