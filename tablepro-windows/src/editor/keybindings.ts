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
  /** Run EXPLAIN on the current statement. */
  runExplain?: (view: EditorView) => boolean;
}

/**
 * Creates a CodeMirror 6 Extension that registers application-level keybindings.
 *
 * Bindings:
 *  - Ctrl-Enter       → runQuery
 *  - Ctrl-Shift-Enter → runAll
 *  - Ctrl-Shift-f     → formatSql
 *  - Ctrl-Shift-x     → runExplain
 *  - F5               → refreshSchema
 *  - Ctrl-/           → toggleComment
 *  - Ctrl-d           → selectNextOccurrence
 */
export function createKeybindings(callbacks: KeybindingCallbacks): Extension {
  const bindings = [
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
      run: (_view: EditorView) => {
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
  ];

  if (callbacks.runExplain) {
    bindings.push({
      key: 'Ctrl-Shift-x',
      run: callbacks.runExplain,
    });
  }

  return keymap.of(bindings);
}
