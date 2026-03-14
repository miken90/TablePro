/**
 * CodeMirror 6 completion source adapter.
 * Bridges sql-completion-provider to the CM6 @codemirror/autocomplete API.
 */

import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { useSchemaStore } from '../stores/schemaStore';
import type { SchemaData } from './sql-completion-provider';
import { getCompletions } from './sql-completion-provider';
import type { CompletionItemKind, SQLCompletionItem } from './sql-completion-types';

// ---------------------------------------------------------------------------
// Kind → CM6 type mapping
// ---------------------------------------------------------------------------

const KIND_TO_CM6_TYPE: Record<CompletionItemKind, string> = {
  keyword: 'keyword',
  table: 'type',
  view: 'type',
  column: 'property',
  function: 'function',
  schema: 'namespace',
  alias: 'variable',
  operator: 'operator',
};

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

function toCM6Completion(item: SQLCompletionItem): Completion {
  return {
    label: item.label,
    type: KIND_TO_CM6_TYPE[item.kind],
    apply: item.insertText !== item.label ? item.insertText : undefined,
    detail: item.detail,
    info: item.documentation,
    boost: item.sortPriority < 200 ? 1 : 0, // Slight boost for high-priority items
  };
}

// ---------------------------------------------------------------------------
// Activation helpers
// ---------------------------------------------------------------------------

/** Return true if the character immediately before `pos` is a dot. */
function isCursorAfterDot(text: string, pos: number): boolean {
  if (pos <= 0) return false;
  // Skip backward through any identifier chars to find the dot
  let i = pos - 1;
  // The prefix extractor already consumed trailing identifier chars; just check char at pos-1 when prefix is empty
  for (; i >= 0; i--) {
    const ch = text.charCodeAt(i);
    // identifier char — keep going back
    if (
      (ch >= 0x41 && ch <= 0x5a) ||
      (ch >= 0x61 && ch <= 0x7a) ||
      (ch >= 0x30 && ch <= 0x39) ||
      ch === 0x5f // _
    ) {
      continue;
    }
    return ch === 0x2e; // '.'
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main completion source
// ---------------------------------------------------------------------------

/**
 * CM6 completion source for SQL. Register with:
 *   autocompletion({ override: [sqlCompletionSource] })
 */
export function sqlCompletionSource(context: CompletionContext): CompletionResult | null {
  const storeState = useSchemaStore.getState();
  const schema: SchemaData = {
    tables: storeState.tables,
    columnsByTable: storeState.columnsByTable,
  };

  const text = context.state.doc.toString();
  const cursorPos = context.pos;

  // Determine if we should trigger:
  // 1. Explicit request (Ctrl+Space)
  // 2. After typing 1+ identifier chars
  // 3. After typing a dot
  const identWord = context.matchBefore(/[\w.]+/);
  const afterDot = isCursorAfterDot(text, cursorPos);

  if (!context.explicit && identWord === null && !afterDot) {
    return null;
  }

  const { items, context: sqlCtx } = getCompletions(text, cursorPos, schema);

  if (items.length === 0) return null;

  const options = items.map(toCM6Completion);

  // `from` = start of the token being replaced
  const from = sqlCtx.prefixRange.from;

  return {
    from,
    options,
    validFor: /^[\w.*]*$/,
  };
}
