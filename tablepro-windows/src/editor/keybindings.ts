import { keymap } from '@codemirror/view';
import { toggleComment } from '@codemirror/commands';
import { selectNextOccurrence } from '@codemirror/search';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export interface KeybindingCallbacks {
  /** Run the current query (or selection). */
  runQuery: (view: EditorView) => boolean;
  /** Run all queries in the editor. */
  runAll: (view: EditorView) => boolean;
  /** Format the SQL in the editor. */
  formatSql: (view: EditorView) => boolean;
  /** Refresh the schema tree (no view arg needed). */
  refreshSchema: () => void;
}

/**
 * Creates a CodeMirror 6 Extension that registers application-level keybindings.
 *
 * Bindings:
 *  - Ctrl-Enter       → runQuery
 *  - Ctrl-Shift-Enter → runAll
 *  - Ctrl-Shift-f     → formatSql
 *  - F5               → refreshSchema
 *  - Ctrl-/           → toggleComment
 *  - Ctrl-d           → selectNextOccurrence
 */
export function createKeybindings(callbacks: KeybindingCallbacks): Extension {
  return keymap.of([
    {
      key: 'Ctrl-Enter',
      run: callbacks.runQuery,
    },
    {
      key: 'Ctrl-Shift-Enter',
      run: callbacks.runAll,
    },
    {
      key: 'Ctrl-Shift-f',
      run: callbacks.formatSql,
    },
    {
      key: 'F5',
      run: (_view) => {
        callbacks.refreshSchema();
        return true;
      },
    },
    {
      key: 'Ctrl-/',
      run: toggleComment,
    },
    {
      key: 'Ctrl-d',
      run: selectNextOccurrence,
    },
  ]);
}
