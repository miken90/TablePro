# Phase 3: SQL Editor (CodeMirror 6)

**Duration:** 3 weeks | **Team:** Dev 2 (Frontend, primary) + Dev 1 (completion data from Rust)
**Gate:** Multi-cursor editing, SQL autocomplete with schema, vim mode all working

## Editor Stack

```
┌──────────────────────────────────┐
│  SqlEditor.tsx (React wrapper)   │
│  ├── CodeMirror 6 EditorView     │
│  ├── @codemirror/lang-sql        │  ← SQL syntax, dialect support
│  ├── @replit/codemirror-vim       │  ← Vim mode
│  ├── Custom autocomplete ext     │  ← Schema-aware completions
│  ├── Custom theme extension      │  ← SQLEditorTheme equivalent
│  └── Tab bar (EditorTabBar.tsx)  │
└──────────────────────────────────┘
```

## Key Packages

```json
{
  "@codemirror/lang-sql": "^6.8",
  "@codemirror/autocomplete": "^6.18",
  "@codemirror/view": "^6.35",
  "@codemirror/state": "^6.5",
  "@codemirror/search": "^6.5",
  "@codemirror/lint": "^6.8",
  "@replit/codemirror-vim": "^6.3",
  "sql-formatter": "^15.4"
}
```

## Feature Parity Matrix (macOS → Windows)

| macOS Feature | CodeMirror 6 Solution | Complexity |
|---------------|----------------------|------------|
| Multi-cursor | Built-in CM6 (`EditorSelection`) | Low — native support |
| SQL syntax highlight | `@codemirror/lang-sql` with dialect | Low |
| SQL autocomplete | `@codemirror/autocomplete` + custom source | Medium |
| Schema-aware completions | Custom `CompletionSource` fed from Rust schema | Medium |
| Vim mode | `@replit/codemirror-vim` | Low — drop-in |
| Vim command line (:w, :q) | `Vim.defineEx()` | Medium |
| SQL formatting | `sql-formatter` npm package | Low |
| Tab bar (multi-query tabs) | Custom React component | Medium |
| Query history panel | Custom React panel below editor | Medium |
| Run selected / run all | `view.state.selection` + IPC dispatch | Low |
| Keyboard shortcuts | CM6 `keymap` extension | Low |
| Theme (colors/fonts) | CM6 `EditorView.theme()` | Low |
| Large document perf | CM6 viewport-based rendering (native) | Built-in |

### macOS Vim Engine → @replit/codemirror-vim Mapping

macOS has a custom 884-line `VimEngine.swift`. CM6 vim plugin handles:
- Normal/Insert/Visual/Command modes ✓
- Motions (w, b, e, 0, $, gg, G, etc.) ✓
- Operators (d, y, c, >, <) ✓
- Registers (", named a-z) ✓
- Command line (:w, :q, :number) — via `Vim.defineEx()`
- Custom mappings — via `Vim.map()`

**Gap analysis**: No gaps found. `@replit/codemirror-vim` is a full port of CM5's vim mode. All features in `VimEngine.swift` are covered.

### macOS CompletionEngine → CM6 Autocomplete

macOS `CompletionEngine` is 146 lines, framework-agnostic. Port logic to TypeScript:

```typescript
// src/editor/completionSource.ts

import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { schemaStore } from '../stores/schemaStore';

export function sqlCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w.]+/);
  if (!word) return null;

  const text = context.state.doc.toString();
  const cursor = context.pos;

  // Analyze SQL context (FROM clause, SELECT, WHERE, etc.)
  const sqlContext = analyzeSqlContext(text, cursor);

  // Build completions based on context
  const items = buildCompletions(sqlContext, word.text, schemaStore.getState());

  return {
    from: word.from,
    options: items.map(item => ({
      label: item.label,
      type: item.type, // 'table', 'column', 'keyword', 'function'
      detail: item.detail,
      boost: item.boost,
    })),
  };
}
```

Key adaptation: macOS `SQLContextAnalyzer` determines if cursor is in FROM, SELECT, WHERE, JOIN context. Port this logic (it's ~200 lines of string parsing) to TypeScript.

## Implementation Steps

### Week 1: Core Editor

- [ ] Install CM6 packages, remove Monaco references
- [ ] Create `SqlEditor.tsx` React component wrapping CM6 `EditorView`
- [ ] Configure SQL language support with dialect switching (PostgreSQL, MySQL, MSSQL)
- [ ] Implement theme extension matching macOS `SQLEditorTheme` colors
- [ ] Implement tab bar with add/close/reorder (port `EditorTabBar`)
- [ ] Wire "Run Query" button → extract text/selection → IPC `query:execute`
- [ ] Implement "Run Selected" vs "Run All" (multi-statement via `;` splitting)
- [ ] Port `SQLStatementScanner.swift` logic to TypeScript (statement boundary detection)
- [ ] **TEST**: Open editor, type SQL, see syntax highlighting, run query via button

### Week 2: Autocomplete & Vim

- [ ] Implement `sqlCompletionSource` with schema awareness
- [ ] Port `SQLContextAnalyzer` from Swift to TypeScript (FROM/SELECT/WHERE detection)
- [ ] Wire schema data: Rust `schema:columns` → Zustand schemaStore → completion source
- [ ] Add keyword completions per dialect (port `SQLKeywords.swift` lists)
- [ ] Add function completions per dialect
- [ ] Integrate `@replit/codemirror-vim`
- [ ] Map custom Vim ex-commands:
  - `:w` → save/execute query
  - `:q` → close tab
  - `:e` → open new tab
  - `:vs` → split view (defer if complex)
- [ ] Add Vim mode indicator (NORMAL/INSERT/VISUAL) in status bar
- [ ] Vim mode toggle in settings (on/off, same as macOS)
- [ ] **TEST**: Autocomplete shows tables after FROM, columns after SELECT, vim motions work

### Week 3: Polish & Performance

- [ ] Implement SQL formatting via `sql-formatter` (Ctrl+Shift+F)
- [ ] Implement query history panel (below editor, fed from Rust `history:search`)
- [ ] Implement EXPLAIN/EXPLAIN ANALYZE button (sends to Rust, renders text result)
- [ ] Large document optimization: verify CM6 handles 500KB+ SQL files smoothly
- [ ] Keyboard shortcuts parity:
  - Ctrl+Enter → Run query
  - Ctrl+Shift+Enter → Run all
  - Ctrl+/ → Toggle comment
  - Ctrl+D → Select next occurrence
  - Ctrl+Shift+L → Select all occurrences
  - F5 → Refresh schema
- [ ] Editor font settings (family, size, line height) persisted via settings store
- [ ] **BENCHMARK**: Keystroke latency < 16ms, autocomplete popup < 100ms

## Theme Mapping

```typescript
// src/editor/theme.ts — port of SQLEditorTheme.swift

export const tableProTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--editor-fg)',
    fontFamily: 'var(--editor-font)',
    fontSize: 'var(--editor-font-size)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--gutter-bg)',
    color: 'var(--gutter-fg)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--active-line-bg)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--selection-match-bg)' },
  // ... map all SQLEditorTheme colors
});
```

## Success Criteria

1. SQL editor with syntax highlighting for PG/MySQL/MSSQL dialects
2. Schema-aware autocomplete (tables after FROM, columns after table.)
3. Multi-cursor editing (Ctrl+D, Ctrl+Shift+L)
4. Vim mode with all basic motions + operators + ex commands
5. Query execution from editor (run selected, run all)
6. Keystroke latency < 16ms on 10KB document
7. Autocomplete popup appears < 100ms
