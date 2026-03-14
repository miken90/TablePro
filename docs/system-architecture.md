# TablePro System Architecture

## High-Level Architecture

TablePro operates as a **dual-platform database client** with platform-specific implementations but shared architectural patterns.

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER INTERFACES                              │
├─────────────────────────────────────────────────────────────────┤
│  macOS (SwiftUI + AppKit)  │  Windows (Tauri v2 + Chromium)     │
├─────────────────────────────────────────────────────────────────┤
│        DATABASE DRIVERS (Plugin System)                         │
│  PostgreSQL | MySQL | MSSQL | SQLite | MongoDB | Redis | ...   │
├─────────────────────────────────────────────────────────────────┤
│       CONNECTION POOLING & MANAGEMENT                           │
├─────────────────────────────────────────────────────────────────┤
│              EXTERNAL DATABASES                                 │
│  Remote instances via direct connection or SSH tunnel           │
└─────────────────────────────────────────────────────────────────┘
```

## macOS Architecture

### Layers

```
┌─────────────────────────────────────────────────────────┐
│               SwiftUI Views & AppKit                    │
│  (ContentView, EditorView, DataGridView, Settings)      │
├─────────────────────────────────────────────────────────┤
│            ViewModels (@Observable)                     │
│  (SidebarViewModel, EditorViewModel, GridViewModel)     │
├─────────────────────────────────────────────────────────┤
│           Services (async/await)                        │
│  (DatabaseService, QueryExecutor, SchemaLoader)         │
├─────────────────────────────────────────────────────────┤
│        DatabaseDriver Protocol (Polymorphic)            │
├─────────────────────────────────────────────────────────┤
│           Plugin System (PluginManager)                 │
│  .tableplugin bundles, code signature verification      │
├─────────────────────────────────────────────────────────┤
│    Native Database Drivers (PostgreSQL, MySQL, etc.)    │
├─────────────────────────────────────────────────────────┤
│          External: Remote Databases                     │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Action (edit cell, execute query)
    ↓
SwiftUI View triggers action
    ↓
@Observable ViewModel updates state
    ↓
Service method called (async)
    ↓
DatabaseDriver protocol method (polymorphic)
    ↓
Plugin-provided driver implementation (SwiftUI DLL or Bundle)
    ↓
Native database protocol (SQL, MongoDB BSON, Redis protocol)
    ↓
Remote Database
    ↓
Results streamed back
    ↓
Service parses results into QueryResult
    ↓
ViewModel updates @State (observable)
    ↓
SwiftUI re-renders with new data
```

### Key Components

| Component | Responsibility |
|-----------|-----------------|
| **Views** | UI rendering, user input capture |
| **ViewModels** | State management (@Observable), business logic orchestration |
| **Services** | Data access layer, query execution, schema loading |
| **DatabaseDriver** | Protocol for polymorphic database access |
| **PluginManager** | Load .tableplugin bundles, verify signatures, instantiate drivers |
| **Storage** | UserDefaults (settings), Keychain (passwords), custom JSON (tabs) |

### Plugin Loading (macOS)

```swift
// 1. Discover plugins
let pluginPath = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
  .appendingPathComponent("TablePro/Plugins")
let bundles = FileManager.default.contentsOfDirectory(
  atPath: pluginPath.path
).filter { $0.hasSuffix(".tableplugin") }

// 2. Load bundle & verify signature
let bundle = Bundle(path: pluginPath.appendingPathComponent(bundleName).path)!
// Signature verification happens automatically via OS

// 3. Instantiate driver
let driverClass = bundle.principalClass as! PluginDatabaseDriver.Type
let driver = driverClass.init()

// 4. Use polymorphic interface
let result = try await driver.execute(sql: "SELECT * FROM users")
```

## Windows Architecture

### Layers

```
┌────────────────────────────────────────────────────────────┐
│        React Components (Functional + Hooks)               │
│  (ConnectionDialog, QueryEditor, DataGrid, Sidebar,        │
│   QuickSwitcher, HistoryPanel, ExportDialog)              │
├────────────────────────────────────────────────────────────┤
│              Zustand Stores (Reactive)                     │
│  (connectionStore, queryStore, schemaStore, changeStore)   │
├────────────────────────────────────────────────────────────┤
│              IPC Layer (Type-Safe)                         │
│  Typed wrappers around Tauri commands                     │
├────────────────────────────────────────────────────────────┤
│         Tauri IPC (JSON Messages)                         │
├─────────────────────────────────────────────────────────────┤
│         Rust Backend (tokio async)                         │
├─────────────────────────────────────────────────────────────┤
│        IPC Commands (Handler Layer)                       │
│  (execute_query, get_schema, save_connection, etc.)       │
├─────────────────────────────────────────────────────────────┤
│         Services (Business Logic)                         │
│  (ConnectionManager, QueryExecutor, SchemaLoader)         │
├─────────────────────────────────────────────────────────────┤
│      DatabaseDriver Trait (async)                        │
├─────────────────────────────────────────────────────────────┤
│          Plugin System (C ABI FFI)                        │
│  libloading, DLL plugins, PluginVTable vtable            │
├─────────────────────────────────────────────────────────────┤
│  Native Database Drivers (DLL: postgres, mysql, mssql)     │
├─────────────────────────────────────────────────────────────┤
│          External: Remote Databases                        │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User clicks "Execute Query"
    ↓
React component calls store action
    ↓
Zustand store updates state + calls IPC API
    ↓
IPC wrapper invoke("execute_query", { sql })
    ↓
Tauri serializes to JSON, sends to Rust backend
    ↓
Rust command handler receives JSON
    ↓
Service::execute_query(sql: &str) async
    ↓
DatabaseDriver::execute() trait method (async)
    ↓
PluginManager::load_driver() loads .dll if needed
    ↓
C ABI FFI: Call PluginVTable::execute() function pointer
    ↓
Plugin DLL executes SQL via native driver (PostgreSQL, MySQL, etc.)
    ↓
Results streamed back from database
    ↓
Plugin returns FfiQueryResult (C struct)
    ↓
Adapter converts FfiQueryResult → Rust QueryResult
    ↓
Service serializes QueryResult to JSON
    ↓
Tauri sends JSON back to frontend
    ↓
React receives data, updates Zustand store
    ↓
Zustand subscribers notified
    ↓
Components re-render with new data
```

### IPC Command Flow

```rust
// src/commands/query.rs
#[tauri::command]
async fn execute_query(
  sql: String,
  connection_id: String,
  state: State<'_, AppState>,
) -> Result<QueryResult, TauriError> {
  // 1. Validate input
  validate_sql(&sql)?;
  
  // 2. Get connection from store
  let connection = state.connections.get(&connection_id)?;
  
  // 3. Get or create driver via plugin system
  let driver = state.plugin_manager.get_driver(connection.db_type)?;
  
  // 4. Execute query
  let result = driver.execute(&sql).await?;
  
  // 5. Return JSON-serialized result
  Ok(result)
}
```

### Plugin Loading (Windows)

```rust
// src/plugin/manager.rs
pub struct PluginManager {
  loaded_plugins: HashMap<String, Box<dyn DatabaseDriver>>,
}

impl PluginManager {
  pub fn load_plugin(&mut self, db_type: &str) -> Result<&dyn DatabaseDriver> {
    // 1. Check if already loaded
    if let Some(driver) = self.loaded_plugins.get(db_type) {
      return Ok(driver.as_ref());
    }
    
    // 2. Find .dll file
    let dll_path = format!("{}/driver-{}.dll", self.plugins_dir, db_type);
    
    // 3. Load via libloading
    let lib = unsafe { libloading::Library::new(&dll_path)? };
    
    // 4. Call plugin_new() entry point (C ABI function pointer)
    let plugin_vtable: libloading::Symbol<extern "C" fn() -> *const PluginVTable> =
      unsafe { lib.get(b"plugin_new")? };
    
    // 5. Instantiate driver from vtable
    let vtable = unsafe { (*plugin_vtable)() };
    let driver = PluginAdapter::new(vtable);
    
    // 6. Store and return
    self.loaded_plugins.insert(db_type.to_string(), Box::new(driver));
    Ok(self.loaded_plugins[db_type].as_ref())
  }
}
```

### Key Components (Windows)

| Component | Responsibility |
|-----------|-----------------|
| **React Components** | UI rendering, event handling (Grid, Editor, Connection, QuickSwitcher) |
| **Zustand Stores** | Client state management (connection, query, schema, changes) |
| **IPC Layer** | Type-safe Tauri command wrappers |
| **Commands** | IPC handlers that delegate to services |
| **Services** | Business logic, database operations |
| **DatabaseDriver** | Async trait for polymorphic database access |
| **PluginManager** | DLL discovery, loading, version validation |
| **PluginAdapter** | FFI ↔ Rust trait conversion with PluginVTable |
| **Storage** | ConnectionStore (APPDATA JSON), SettingsStore (JSON) |
| **TanStack Virtual** | Grid virtualization for 100K+ row rendering |

## Plugin System (Both Platforms)

### Unified Plugin Interface

Both platforms use the same logical interface pattern:

```swift
// Swift protocol (macOS)
protocol PluginDatabaseDriver: PluginInterface {
  func instantiate() -> DatabaseDriver
  func driverName() -> String
  func apiVersion() -> String
}

// C interface (Windows)
extern "C" {
  pub fn plugin_new() -> *mut dyn DatabaseDriver;
  pub fn plugin_api_version() -> u32;
  pub fn plugin_driver_name() -> *const c_char;
}
```

### Plugin Lifecycle

```
1. Discovery
   - macOS: Scan ~/Library/Application Support/TablePro/Plugins/*.tableplugin
   - Windows: Scan %APPDATA%/TablePro/Plugins/*.dll

2. Loading
   - macOS: Bundle(path:) API + code signature verification
   - Windows: libloading + version validation

3. Initialization
   - macOS: Instantiate class via principalClass
   - Windows: Call plugin_new() function pointer

4. Binding
   - Both: DatabaseDriver trait methods available
   - Both: Polymorphic interface used throughout app

5. Execution
   - User executes query → calls driver method → plugin implementation
```

### Driver Plugin Structure (Windows)

```rust
// driver-postgres/src/lib.rs (cdylib crate)

#[repr(C)]
pub struct PostgresDriver {
  // Internal state
}

#[tauri::command]
impl DatabaseDriver for PostgresDriver {
  async fn execute(&self, sql: &str) -> Result<QueryResult> {
    // PostgreSQL-specific execution
  }
  
  async fn get_tables(&self) -> Result<Vec<TableInfo>> {
    // Query information_schema
  }
  
  // ... other methods
}

// FFI entry point
#[no_mangle]
pub extern "C" fn plugin_new() -> *mut dyn DatabaseDriver {
  Box::into_raw(Box::new(PostgresDriver::new()))
}

#[no_mangle]
pub extern "C" fn plugin_api_version() -> u32 {
  1
}
```

## Storage Architecture

### macOS Storage

```
~/Library/Application Support/TablePro/
├── connections.json          # Encrypted passwords stored separately
├── settings.json            # User preferences
├── history.db               # SQLite FTS5 for query history
└── tabs/
    ├── {uuid}.json          # Per-tab state (SQL content, position)
    └── ...
```

**Encryption**: Passwords stored in macOS Keychain (automatic on read/write)

### Windows Storage

```
%APPDATA%/TablePro/
├── connections.json         # Connection profiles (DPAPI-encrypted passwords)
├── settings.json           # User preferences
├── history.db              # SQLite FTS5 for query history
└── tabs/
    ├── {uuid}.json         # Per-tab state (SQL content, position)
    └── ...
```

**Encryption**: DPAPI (`CryptProtectData` / `CryptUnprotectData`) for passwords

### Query History Schema (Both Platforms)

```sql
CREATE TABLE queries (
  id INTEGER PRIMARY KEY,
  database TEXT NOT NULL,
  sql TEXT NOT NULL,
  executed_at TIMESTAMP NOT NULL,
  execution_time_ms INTEGER,
  row_count INTEGER,
  error TEXT
);

CREATE VIRTUAL TABLE queries_fts USING fts5(sql, database);
```

## Connection Pooling

Both platforms implement connection pooling to minimize overhead:

```
Connection Pool (per database type)
├─ Pool[0]: Active connection (in use)
├─ Pool[1]: Idle connection (ready for next query)
├─ Pool[2]: Idle connection
└─ Pool[max]: Max connections configured

When query executes:
1. Request connection from pool
2. If available → use immediately
3. If none available → create new (up to max)
4. After query → return to pool (idle)
5. Periodic cleanup: close idle > 10 min old
```

### Pool Configuration

| Setting | Default | Purpose |
|---------|---------|---------|
| **min_idle** | 1 | Minimum idle connections |
| **max_size** | 10 | Maximum total connections |
| **idle_timeout** | 10 min | Close idle connections after |
| **connection_timeout** | 30s | Max wait for available connection |

## Change Tracking Flow

### macOS

```
1. User edits cell in DataGrid
   ↓
2. DataGridViewModel records Change
   ↓
3. Change added to changeStore.pending
   ↓
4. Cell highlighted (visual indicator)
   ↓
5. User clicks Save
   ↓
6. changeStore generates SQL (INSERT/UPDATE/DELETE)
   ↓
7. SQL wrapped in transaction
   ↓
8. DatabaseService.execute(transaction)
   ↓
9. On success: changeStore.clear() + UI refresh
   ↓
10. On error: show alert, keep changes in editor
```

### Windows

```
1. User edits cell in DataGrid
   ↓
2. GridCell component calls changeStore.recordChange()
   ↓
3. Zustand store updates (addChange action)
   ↓
4. UI shows change indicator (yellow background)
   ↓
5. User clicks Save button
   ↓
6. changeStore.generateSQL() produces INSERT/UPDATE/DELETE
   ↓
7. IPC invoke('save_changes', { changes })
   ↓
8. Rust command wraps in transaction, executes
   ↓
9. Result sent back via IPC
   ↓
10. On success: store.clearChanges() + refresh grid
   ↓
11. On error: error toast, changes preserved
```

## Error Handling Strategy

### Error Types

```rust
// Rust: TauriError (IPC-safe)
pub enum TauriError {
  DatabaseError(String),
  ConnectionFailed(String),
  InvalidQuery(String),
  PermissionDenied,
  Timeout,
  Unknown(String),
}

// TypeScript: ApiError (IPC result type)
type ApiResult<T> = 
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

interface ApiError {
  code: string;
  message: string;
  details?: string;
}
```

### Error Flow

```
Rust Error (database, timeout, etc.)
    ↓
Service catches & converts to TauriError
    ↓
TauriError serialized to JSON
    ↓
React receives error object
    ↓
IPC wrapper returns { ok: false, error }
    ↓
Component renders error toast/alert
    ↓
User sees user-friendly message (not stack trace)
```

## Security Architecture

### Password Management

**macOS**: Uses native Keychain API
```swift
let credentials = SecCopyMatching([...], &result)
```

**Windows**: Uses DPAPI via Rust crate
```rust
let encrypted = dpapi::encrypt(password)?;
// Store encrypted bytes in JSON
let decrypted = dpapi::decrypt(encrypted_bytes)?;
```

### SSL/TLS

Both platforms support:
- SSL mode selection (disabled, preferred, required)
- Custom certificate validation
- Hostname verification options

### SSH Tunneling

Secure remote access via SSH proxy:
```
Local Port
    ↓ (TCP)
SSH Client
    ↓ (encrypted)
SSH Server
    ↓ (TCP)
Remote Database Port
```

Implemented via native SSH libraries (macOS) and Rust `russh` crate (Windows).

## Performance Optimization

### Data Grid Virtualization

Large datasets rendered efficiently:
```
Viewport (visible rows)
    ↓
Only render 20-30 visible rows in DOM
    ↓
Scroll events update render range
    ↓
Off-screen rows NOT in DOM (memory efficient)
    ↓
Can render 100K+ rows without lag
```

### Query Streaming

For large result sets:
```
Query execution returns rows
    ↓
Chunk rows (e.g., 1000 per chunk)
    ↓
Send first chunk to frontend
    ↓
User can view + interact immediately
    ↓
Remaining chunks stream in background
    ↓
User can sort/filter while loading
```

### IPC Chunking

Prevent JSON payloads >1MB:
```
Large result (5MB JSON)
    ↓
Split into 5x 1MB chunks
    ↓
Send chunk 1 via invoke
    ↓
Frontend updates grid
    ↓
Send chunk 2 via separate invoke
    ↓
... repeat until all chunks sent
```

---

**Last Updated**: 2026-03-13 | **Stable Release**: v0.17.0 (macOS) | **Windows Version**: In Progress
