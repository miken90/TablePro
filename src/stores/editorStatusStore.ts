/**
 * Editor status (cursor position, statement index) for the editor status bar.
 *
 * Fed by the SQL editor's CodeMirror `updateListener`. It replaced a 100 ms
 * `setInterval` that called `view.state.doc.toString()` ten times a second
 * for the lifetime of the app, allocating the whole document on every tick
 * even when nothing had changed and the window was hidden.
 *
 * The statement scan is the expensive part, so it runs only when the document
 * actually changed; cursor movement reuses the cached scan.
 */

import { create } from "zustand";
import type { EditorState } from "@codemirror/state";
import { allStatements, locatedStatementAtCursor } from "../editor/statement-scanner";

export interface EditorStatus {
  /** 1-based cursor line. */
  line: number;
  /** 1-based cursor column. */
  col: number;
  /** Characters covered by the primary selection (0 when collapsed). */
  selected: number;
  /** 1-based index of the statement under the cursor (0 when none). */
  statementIndex: number;
  /** Statements in the document. */
  statementCount: number;
}

const INITIAL: EditorStatus = {
  line: 1,
  col: 1,
  selected: 0,
  statementIndex: 0,
  statementCount: 0,
};

interface Cache {
  doc: string;
  statements: string[];
  offsets: number[];
}

let cache: Cache = { doc: "", statements: [], offsets: [] };

function rescan(doc: string): Cache {
  const statements = allStatements(doc);
  const offsets: number[] = [];
  let searchFrom = 0;
  for (const stmt of statements) {
    const idx = doc.indexOf(stmt, searchFrom);
    offsets.push(idx >= 0 ? idx : searchFrom);
    if (idx >= 0) searchFrom = idx + stmt.length;
  }
  return { doc, statements, offsets };
}

/** Derive the status a given editor state implies. Exported for tests. */
export function deriveEditorStatus(
  state: EditorState,
  docChanged: boolean,
): EditorStatus {
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head);

  if (docChanged) {
    cache = rescan(state.doc.toString());
  }

  const located = locatedStatementAtCursor(cache.doc, range.head);
  let statementIndex = 0;
  if (located.sql.trim().length > 0) {
    const idx = cache.offsets.findIndex((o) => Math.abs(o - located.offset) <= 1);
    statementIndex = idx >= 0 ? idx + 1 : 1;
  }

  return {
    line: line.number,
    col: range.head - line.from + 1,
    selected: range.empty ? 0 : Math.abs(range.to - range.from),
    statementIndex: statementIndex || 1,
    statementCount: cache.statements.length,
  };
}

interface EditorStatusState extends EditorStatus {
  /** Publish the status implied by `state`. */
  syncFrom: (state: EditorState, docChanged: boolean) => void;
  /** Clear the status (editor destroyed). */
  reset: () => void;
}

export const useEditorStatusStore = create<EditorStatusState>((set) => ({
  ...INITIAL,
  syncFrom: (state, docChanged) => set(deriveEditorStatus(state, docChanged)),
  reset: () => {
    cache = { doc: "", statements: [], offsets: [] };
    set({ ...INITIAL });
  },
}));
