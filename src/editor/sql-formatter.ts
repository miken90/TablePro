import { format } from 'sql-formatter';
import type { SqlLanguage } from 'sql-formatter';
import type { EditorView } from '@codemirror/view';

type Dialect = 'postgresql' | 'mysql' | 'mssql' | string | undefined;

function mapDialect(dialect: Dialect): SqlLanguage {
  switch (dialect) {
    case 'postgresql': return 'postgresql';
    case 'mysql':      return 'mysql';
    case 'mssql':      return 'tsql';
    default:           return 'sql';
  }
}

/**
 * Formats a SQL string using sql-formatter.
 * @param sql     Raw SQL text to format.
 * @param dialect Optional database dialect hint.
 */
export function formatSql(sql: string, dialect?: Dialect): string {
  return format(sql, {
    language: mapDialect(dialect),
    tabWidth: 2,
    useTabs: false,
    keywordCase: 'upper',
    linesBetweenQueries: 2,
  });
}

/**
 * CodeMirror 6 command that formats the selected text or the entire document.
 * Returns true to signal the command was handled.
 */
export function formatEditorContent(view: EditorView, dialect?: Dialect): boolean {
  const state = view.state;
  const selection = state.selection.main;
  const hasSelection = !selection.empty;

  if (hasSelection) {
    const selectedText = state.sliceDoc(selection.from, selection.to);
    let formatted: string;
    try {
      formatted = formatSql(selectedText, dialect);
    } catch {
      return true; // formatting failed — still handled
    }
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: formatted },
    });
  } else {
    const fullText = state.doc.toString();
    let formatted: string;
    try {
      formatted = formatSql(fullText, dialect);
    } catch {
      return true;
    }
    view.dispatch({
      changes: { from: 0, to: state.doc.length, insert: formatted },
    });
  }

  return true;
}
