# TablePro Code Standards

## File Organization

### Naming Conventions

All files use **kebab-case** with descriptive names. Files must be self-documenting for LLM tools and developers.

```
✅ Good:
  src/components/connection-dialog.tsx
  src/stores/query-store.ts
  src-tauri/src/services/connection-manager.rs
  src-tauri/src/commands/execute-query.rs

❌ Bad:
  src/components/Dialog.tsx          # Generic, unclear
  src/CommandHandler.rs              # Not specific
```

### File Size Limits

- **Code files**: Max 200 lines per file
- **Documentation**: Max 800 lines per file
- **Markdown, config, test files**: No limit

When a file approaches the limit:
1. Extract logical modules into separate files
2. Use directory structure to group related code
3. Update imports and re-export from index file if needed

**Example of modularization** (src/stores):
```
stores/
├── connection-store.ts
├── query-store.ts
├── schema-store.ts
├── change-store.ts
├── tab-store.ts
└── editor-store.ts
```

## Rust Standards (Windows Backend)

### Error Handling

**RULE**: Never use `unwrap()` or `panic!()` on user data. Always return `Result<T, E>`.

```rust
// ✅ Good: Handle errors gracefully
async fn execute_query(sql: &str) -> Result<QueryResult, TauriError> {
  let mut conn = self.pool.get_connection().await?;
  let rows = sqlx::query(sql).fetch_all(&mut conn).await?;
  Ok(QueryResult::from_rows(rows))
}

// ❌ Bad: Unwrap on user data causes crashes
async fn execute_query(sql: &str) -> QueryResult {
  let rows = sqlx::query(sql).fetch_all(&mut pool).await.unwrap(); // CRASH!
  QueryResult::from_rows(rows)
}
```

### FFI Types

All C ABI boundary types must use `#[repr(C)]` and be fully specified:

```rust
#[repr(C)]
pub struct FfiStr {
  data: *const u8,
  len: usize,
}

#[repr(C)]
pub struct FfiResult<T> {
  ok: bool,
  value: T,
  error: FfiStr,
}

// ✅ Good: Explicit lifetime, safety comments
impl FfiStr {
  /// SAFETY: Caller must ensure `data` points to valid UTF-8
  pub unsafe fn from_cstr(ptr: *const c_char) -> Self {
    let len = unsafe { libc::strlen(ptr) };
    FfiStr { data: ptr as *const u8, len }
  }
}
```

### Logging (No println!)

Use the `tracing` crate for structured logging:

```rust
use tracing::{info, warn, error, span, Level};

fn execute_query(sql: &str, connection_id: &str) -> Result<QueryResult, Error> {
  let span = span!(Level::DEBUG, "execute_query", connection_id);
  let _enter = span.enter();
  
  info!("Executing query", sql_len = sql.len());
  
  match self.pool.execute(sql).await {
    Ok(result) => {
      info!(row_count = result.rows.len(), "Query executed successfully");
      Ok(result)
    }
    Err(e) => {
      error!("Query execution failed: {}", e);
      Err(Error::QueryFailed(e.to_string()))
    }
  }
}

// ❌ Bad: No println! in production code
println!("Executing: {}", sql); // NEVER
```

### Async/Await

Use `tokio` for async operations. All blocking I/O must be `.await`-ed:

```rust
// ✅ Good: Async all the way
async fn get_tables(&self) -> Result<Vec<TableInfo>, Error> {
  let conn = self.pool.get_connection().await?; // Non-blocking
  let tables = conn.query_tables().await?;       // Non-blocking
  Ok(tables)
}

// ❌ Bad: Blocking call on async function
async fn get_tables(&self) -> Result<Vec<TableInfo>, Error> {
  let conn = self.pool.get_connection().await?;
  let tables = conn.query_tables().wait(); // BLOCKS WHOLE THREAD!
}
```

### Clippy & Formatting

All Rust code must pass linting and formatting checks:

```bash
# Before commit
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml
```

Common clippy issues:
- Unused imports → remove
- Unneeded returns → simplify
- Unnecessary clones → borrow instead
- Missing `#[must_use]` on getters → add
- Result should be used → handle or `let _ =`

### Code Organization

```
src-tauri/src/
├── main.rs               # App entry, Tauri setup
├── lib.rs                # Library root, module declarations
├── error.rs              # TauriError type and conversions
├── models/               # Data structures (Connection, QueryResult, etc.)
│   ├── connection.rs
│   ├── query-result.rs
│   └── mod.rs
├── services/             # Business logic
│   ├── connection-manager.rs
│   ├── query-executor.rs
│   └── mod.rs
├── commands/             # IPC handlers
│   ├── connection.rs
│   ├── query.rs
│   └── mod.rs
├── plugin/               # Plugin system
│   ├── manager.rs        # DLL discovery/loading
│   ├── adapter.rs        # FFI → Rust trait
│   ├── driver-trait.rs   # DatabaseDriver trait definition
│   └── mod.rs
├── storage/              # Persistence
│   ├── connection-store.rs
│   ├── settings-store.rs
│   └── mod.rs
└── utils/                # Helpers
    ├── password.rs       # DPAPI encryption
    ├── logging.rs        # Tracing setup
    └── mod.rs
```

## TypeScript/React Standards (Windows Frontend)

### Type Safety

All code must use strict TypeScript (`strict: true`):

```typescript
// ✅ Good: Explicit types, no any
interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
}

async function fetchSchema(connection: Connection): Promise<TableInfo[]> {
  const result = await invoke<TableInfo[]>('get_schema', { connection });
  return result;
}

// ❌ Bad: any types defeat type checking
async function fetchSchema(connection: any): Promise<any> {
  const result = await invoke('get_schema', { connection }); // Untyped
  return result;
}
```

### Functional Components with Hooks

Only use functional components with React hooks. No class components:

```typescript
// ✅ Good: Functional component with hooks
export function QueryEditor({ tabId }: { tabId: string }) {
  const [sql, setSql] = useState('');
  const query = useQuery();
  
  const handleExecute = useCallback(async () => {
    const result = await query.execute(sql);
    // ...
  }, [sql, query]);
  
  return (
    <Editor value={sql} onChange={setSql} onExecute={handleExecute} />
  );
}

// ❌ Bad: Class component
class QueryEditor extends React.Component {
  state = { sql: '' };
  render() { /* ... */ }
}
```

### Zustand Store Pattern

Define stores with clear separation of state, actions, and selectors:

```typescript
// ✅ Good: Clear, modular store
import { create } from 'zustand';

interface QueryStore {
  // State
  currentQuery: string;
  results: QueryResult | null;
  isLoading: boolean;
  
  // Actions
  setCurrentQuery: (sql: string) => void;
  executeQuery: (sql: string) => Promise<void>;
  clearResults: () => void;
}

export const useQueryStore = create<QueryStore>((set, get) => ({
  currentQuery: '',
  results: null,
  isLoading: false,
  
  setCurrentQuery: (sql) => set({ currentQuery: sql }),
  
  executeQuery: async (sql) => {
    set({ isLoading: true });
    try {
      const result = await invoke<QueryResult>('execute_query', { sql });
      set({ results: result });
    } finally {
      set({ isLoading: false });
    }
  },
  
  clearResults: () => set({ results: null }),
}));
```

### Error Handling

Type-safe error boundaries and user-friendly messages:

```typescript
// ✅ Good: Type-safe error handling
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function executeQuery(sql: string): Promise<Result<QueryResult>> {
  try {
    const result = await invoke<QueryResult>('execute_query', { sql });
    return { ok: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, error: message };
  }
}

// Use it
const result = await executeQuery(sql);
if (result.ok) {
  setResults(result.data);
} else {
  showError(result.error);
}
```

### Component Props

Always use explicit prop interfaces:

```typescript
// ✅ Good: Explicit interface
interface DataGridProps {
  data: QueryResult;
  onCellChange: (row: number, column: string, value: any) => void;
  isLoading: boolean;
}

export function DataGrid({ data, onCellChange, isLoading }: DataGridProps) {
  // ...
}

// ❌ Bad: Implicit, hard to understand
export function DataGrid(props: any) {
  // What props are expected?
}
```

### IPC Layer (Typed Wrappers)

All Tauri invokes must be wrapped with type-safe functions:

```typescript
// src/ipc/connection.ts
import { invoke } from '@tauri-apps/api/core';
import type { Connection } from '@/types';

export const connectionApi = {
  saveConnection: async (conn: Connection): Promise<string> => {
    return invoke<string>('save_connection', { connection: conn });
  },
  
  listConnections: async (): Promise<Connection[]> => {
    return invoke<Connection[]>('list_connections');
  },
  
  deleteConnection: async (id: string): Promise<void> => {
    await invoke<void>('delete_connection', { id });
  },
};

// Use in components
const handleSave = async (conn: Connection) => {
  const id = await connectionApi.saveConnection(conn);
  // id is typed as string, no type assertion needed
};
```

### ESLint & Prettier

All TypeScript must pass linting and formatting:

```bash
# Before commit
npx eslint src --ext .ts,.tsx
npx prettier --write src
```

Common ESLint issues:
- Unused variables → remove
- Missing dependencies in hooks → add
- Implicit any → add types
- console.log in production → remove
- Missing keys in lists → add unique key

### Code Organization

```
src/
├── components/           # React components
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── main-content.tsx
│   │   └── toolbar.tsx
│   ├── connection/
│   │   ├── connection-dialog.tsx
│   │   ├── connection-list.tsx
│   │   └── ssh-config-form.tsx
│   ├── editor/
│   │   ├── sql-editor.tsx
│   │   └── query-history.tsx
│   ├── grid/
│   │   ├── data-grid.tsx
│   │   ├── grid-cell.tsx
│   │   └── grid-toolbar.tsx
│   └── common/
│       ├── modal.tsx
│       ├── button.tsx
│       └── loading-spinner.tsx
├── stores/               # Zustand stores
│   ├── connection-store.ts
│   ├── query-store.ts
│   ├── schema-store.ts
│   ├── change-store.ts
│   ├── tab-store.ts
│   └── editor-store.ts
├── hooks/                # Custom hooks
│   ├── useIpc.ts
│   ├── useDatabase.ts
│   ├── useLocalStorage.ts
│   └── useAsync.ts
├── ipc/                  # Typed IPC wrappers
│   ├── connection.ts
│   ├── query.ts
│   ├── schema.ts
│   └── settings.ts
├── types/                # TypeScript interfaces
│   ├── connection.ts
│   ├── query.ts
│   ├── schema.ts
│   └── index.ts
├── utils/                # Utilities
│   ├── format.ts         # Data formatting
│   ├── validation.ts     # Form validation
│   └── sql.ts            # SQL helpers
├── styles/               # Tailwind CSS
│   └── globals.css
├── App.tsx               # Root component
└── main.tsx              # Vite entry point
```

## Swift Standards (macOS Reference)

### SwiftUI Patterns

Prefer SwiftUI over AppKit for new code:

```swift
// ✅ Good: SwiftUI with @Observable
@Observable
final class QueryViewModel {
  var sql: String = ""
  var results: QueryResult?
  var isLoading = false
  
  func execute() async {
    isLoading = true
    do {
      results = try await database.execute(sql)
    } catch {
      // Handle error
    }
    isLoading = false
  }
}

struct QueryEditor: View {
  @State var model = QueryViewModel()
  
  var body: some View {
    VStack {
      TextEditor(text: $model.sql)
      Button("Execute", action: { Task { await model.execute() } })
    }
  }
}
```

### Error Handling

Use Swift.Error protocol, never force unwrap in production:

```swift
// ✅ Good: Typed errors
enum DatabaseError: Error, LocalizedError {
  case connectionFailed(String)
  case queryFailed(String)
  case invalidSQL
  
  var errorDescription: String? {
    switch self {
    case .connectionFailed(let msg): return "Connection failed: \(msg)"
    case .queryFailed(let msg): return "Query failed: \(msg)"
    case .invalidSQL: return "Invalid SQL syntax"
    }
  }
}

// ❌ Bad: Force unwrap
let connection = try! database.connect() // CRASH if fails!
```

### Async/Await

Use Swift's native async/await:

```swift
// ✅ Good: Async/await
func fetchTables(database: String) async throws -> [TableInfo] {
  let query = "SELECT * FROM information_schema.tables WHERE table_schema = '\(database)'"
  let results = try await self.execute(query)
  return results.map { TableInfo(from: $0) }
}

// ❌ Bad: Completion handlers
func fetchTables(database: String, completion: @escaping ([TableInfo]?, Error?) -> Void) {
  // Complex nesting and error handling
}
```

## Commit Message Standards

Use **Conventional Commits** for all commits. Format:

```
type(scope): short description

Optional longer explanation if needed.

Fixes #123
```

### Commit Types

| Type | Usage | Example |
|------|-------|---------|
| **feat** | New feature | `feat(editor): add vim keybindings` |
| **fix** | Bug fix | `fix(grid): prevent crash on large datasets` |
| **docs** | Documentation | `docs: update architecture guide` |
| **refactor** | Code restructuring (no behavior change) | `refactor(store): split into modular files` |
| **test** | Test additions or fixes | `test: add unit tests for query parser` |
| **chore** | Build, CI, dependencies | `chore: upgrade tauri to v2.0` |
| **perf** | Performance improvement | `perf(grid): virtualize row rendering` |

### Single-Line Rule

Keep commit messages to single line (no body descriptions). Use GitHub PR descriptions for detailed context.

```bash
# ✅ Good
git commit -m "feat(plugin): add clickhouse driver"

# ❌ Bad (multiline)
git commit -m "feat(plugin): add clickhouse driver

This adds support for ClickHouse database..."
```

## Security Standards

### Passwords & Secrets

**RULE**: Never store plaintext passwords in code or configuration.

```rust
// ✅ Good: Encrypt sensitive data
let encrypted = dpapi_encrypt(password)?;
connection_store.save_connection(&Connection {
  password_encrypted: encrypted,
  // ...
})?;

// ❌ Bad: Plaintext in code
const DB_PASSWORD = "supersecret123"; // EXPOSED!
```

### No Secrets in Git

Pre-commit hook prevents committing secrets:

```bash
# Never commit these files:
.env
.env.local
secrets.json
private-key.pem
api-keys.txt
```

### DPAPI on Windows

Use DPAPI for storing credentials:

```rust
use dpapi_rs::CryptProtectData;

fn encrypt_password(password: &str) -> Result<Vec<u8>> {
  let encrypted = CryptProtectData(password.as_bytes(), None)?;
  Ok(encrypted)
}

fn decrypt_password(encrypted: &[u8]) -> Result<String> {
  let decrypted = CryptUnprotectData(encrypted, None)?;
  Ok(String::from_utf8(decrypted)?)
}
```

## Code Review Checklist

Before pushing, verify:

- ✅ Code compiles without warnings (`cargo clippy`, `npx eslint`)
- ✅ Code is formatted (`cargo fmt`, `npx prettier`)
- ✅ New functions have clear documentation/types
- ✅ Error handling is complete (no `unwrap()` on user data)
- ✅ Tests pass and cover new logic
- ✅ No secrets in code or git history
- ✅ CHANGELOG.md updated for notable changes
- ✅ Commit message follows Conventional Commits
- ✅ File size under 200 lines (or justified modularization)

---

**Last Updated**: 2026-03-13 | **Next Review**: v1.0.0 release
