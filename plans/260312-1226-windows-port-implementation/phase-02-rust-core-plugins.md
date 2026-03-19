# Phase 2: Rust Core & Plugin System

**Duration:** 4 weeks | **Team:** Dev 1 (Rust, primary) + Dev 3 (MSSQL driver)
**Gate:** PostgreSQL, MySQL, SQL Server drivers connect, execute queries, return schema

## Plugin Architecture

### Why DLL Plugins (not static linking)

macOS TablePro uses `.tableplugin` bundles loaded at runtime. We preserve this model on Windows with `.dll` files loaded via `libloading`. Benefits:
- Ship core app without all drivers (smaller base install)
- Enterprise customers can deploy only approved drivers
- Future community plugins possible
- Matches macOS architecture mentally

### FFI-Safe Driver Trait

Cannot use Rust traits across DLL boundaries (no stable ABI). Instead: C ABI function table.

```rust
// plugin-sdk/src/lib.rs — shared between core and plugins

#[repr(C)]
pub struct PluginVTable {
    pub api_version: u32,  // must match core's expected version
    pub create_driver: unsafe extern "C" fn(config: *const DriverConfig) -> *mut DriverHandle,
    pub destroy_driver: unsafe extern "C" fn(handle: *mut DriverHandle),
    pub connect: unsafe extern "C" fn(handle: *mut DriverHandle) -> FfiResult,
    pub disconnect: unsafe extern "C" fn(handle: *mut DriverHandle),
    pub execute: unsafe extern "C" fn(handle: *mut DriverHandle, query: FfiStr) -> FfiQueryResult,
    pub fetch_tables: unsafe extern "C" fn(handle: *mut DriverHandle) -> FfiTableList,
    pub fetch_columns: unsafe extern "C" fn(handle: *mut DriverHandle, table: FfiStr) -> FfiColumnList,
    pub fetch_indexes: unsafe extern "C" fn(handle: *mut DriverHandle, table: FfiStr) -> FfiIndexList,
    pub fetch_foreign_keys: unsafe extern "C" fn(handle: *mut DriverHandle, table: FfiStr) -> FfiForeignKeyList,
    pub fetch_databases: unsafe extern "C" fn(handle: *mut DriverHandle) -> FfiStringList,
    pub fetch_ddl: unsafe extern "C" fn(handle: *mut DriverHandle, table: FfiStr) -> FfiString,
    pub cancel_query: unsafe extern "C" fn(handle: *mut DriverHandle) -> FfiResult,
    pub ping: unsafe extern "C" fn(handle: *mut DriverHandle) -> FfiResult,
    // Capability flags
    pub supports_schemas: bool,
    pub supports_transactions: bool,
    pub database_type_id: FfiStr,
    pub display_name: FfiStr,
    pub default_port: u16,
}

// Each plugin DLL exports this symbol:
// #[no_mangle] pub extern "C" fn tablepro_plugin_init() -> *const PluginVTable
```

### FFI Data Types

```rust
// All strings across FFI boundary use owned buffers
#[repr(C)]
pub struct FfiStr {
    ptr: *const u8,
    len: usize,
}

#[repr(C)]
pub struct FfiResult {
    success: bool,
    error_ptr: *const u8,    // null if success
    error_len: usize,
}

#[repr(C)]
pub struct FfiQueryResult {
    columns: *const FfiColumnInfo,
    column_count: usize,
    rows: *const *const FfiStr, // rows[row_idx][col_idx]
    row_count: usize,
    affected_rows: i64,
    error: FfiResult,
}

// Deallocation: each plugin provides free functions
// Plugin allocates, plugin frees — no cross-boundary allocator mismatch
```

### Plugin Manager

```rust
// src-tauri/src/plugin/manager.rs

pub struct PluginManager {
    plugins: HashMap<String, LoadedPlugin>,
    plugin_dir: PathBuf,  // %APPDATA%/TablePro/plugins/ or app_dir/plugins/
}

struct LoadedPlugin {
    library: Library,  // libloading::Library
    vtable: &'static PluginVTable,
    metadata: PluginMetadata,
}

impl PluginManager {
    pub fn discover_plugins(&mut self) -> Vec<PluginMetadata> {
        // Scan plugin_dir for *.dll files
        // Load each, call tablepro_plugin_init()
        // Validate api_version matches
        // Store in self.plugins keyed by database_type_id
    }

    pub fn create_driver(&self, type_id: &str, config: DriverConfig)
        -> Result<Box<dyn DatabaseDriver>>
    {
        let plugin = self.plugins.get(type_id)?;
        // Call vtable.create_driver, wrap in PluginDriverAdapter
    }
}
```

## Driver Implementation Plan

### PostgreSQL Driver (`driver-postgres/`)

**Crate:** `tokio-postgres` (pure Rust, async, TLS via `rustls`)

```toml
[dependencies]
tokio-postgres = { version = "0.7", features = ["with-serde_json-1"] }
rustls = "0.23"
tokio-postgres-rustls = "0.13"
```

Key mappings from macOS `PostgreSQLPluginDriver`:
- `connect()` → `tokio_postgres::connect()` with TLS config
- `execute(query)` → `client.query(query, &[])` → map to FfiQueryResult
- `fetchTables(schema)` → `information_schema.tables` query
- `fetchColumns(table, schema)` → `information_schema.columns` query
- Schema switching → `SET search_path TO schema`
- Transactions → `BEGIN/COMMIT/ROLLBACK`
- Cancel → `CancelToken` from tokio-postgres

### MySQL Driver (`driver-mysql/`)

**Crate:** `mysql_async` (pure Rust, async)

```toml
[dependencies]
mysql_async = "0.34"
```

Key mappings from macOS `MySQLPluginDriver` (which uses libmariadb):
- `connect()` → `mysql_async::Pool::new(opts)`
- `execute(query)` → `conn.query(query)` → map rows
- `fetchTables()` → `SHOW TABLES` or `information_schema.tables`
- Geometry types → WKB parsing (port `GeometryWKBParser.swift`)

### SQL Server Driver (`driver-mssql/`)

**Crate:** `tiberius` (pure Rust, async, TDS protocol)

```toml
[dependencies]
tiberius = { version = "0.12", features = ["sql-browser-tokio", "rustls"] }
tokio-util = "0.7"
```

Key mappings from macOS `MSSQLPlugin`:
- `connect()` → `tiberius::Client::connect(config)`
- Windows Auth → `tiberius::AuthMethod::Integrated` (SSPI on Windows)
- Named instances → SQL Browser via `sql-browser-tokio` feature
- `USE database` for database switching
- `SET LOCK_TIMEOUT` for query timeouts

## Implementation Steps

### Week 1: Plugin SDK & Manager

- [ ] Create `plugin-sdk` crate with FFI types (`FfiStr`, `FfiResult`, `FfiQueryResult`, etc.)
- [ ] Define `PluginVTable` with all required function pointers
- [ ] Implement `FfiStr` ↔ `String` conversion (safe wrappers)
- [ ] Implement `PluginManager` with `discover_plugins()` and `create_driver()`
- [ ] Create `PluginDriverAdapter` that wraps C ABI calls into async Rust trait
- [ ] Create `DatabaseDriver` Rust trait (mirrors macOS `DatabaseDriver` protocol)
- [ ] Add Tokio runtime management (one runtime shared across all drivers)

### Week 2: PostgreSQL Driver

- [ ] Scaffold `driver-postgres` crate as `cdylib`
- [ ] Implement `connect()` with SSL/TLS modes (disable, require, verify-ca, verify-full)
- [ ] Implement `execute()` with column type mapping
- [ ] Implement schema queries (tables, columns, indexes, foreign keys, DDL)
- [ ] Implement `fetchDatabases()`, `fetchSchemas()`, `switchSchema()`
- [ ] Implement `cancelQuery()` via CancelToken
- [ ] Implement `ping()` for health monitoring
- [ ] **TEST**: Connect to local PG, run query, verify round-trip through plugin boundary
- [ ] **BENCHMARK**: Query overhead < 50ms vs direct tokio-postgres call

### Week 3: MySQL Driver

- [ ] Scaffold `driver-mysql` crate as `cdylib`
- [ ] Implement full connection lifecycle (connect, SSL, disconnect)
- [ ] Implement all schema queries
- [ ] Port `GeometryWKBParser` from Swift → Rust (hex WKB → WKT text)
- [ ] Implement `SHOW DATABASES`, `USE database`
- [ ] **TEST**: Connect to local MySQL 8, full schema introspection

### Week 4: SQL Server Driver + Integration

- [ ] Scaffold `driver-mssql` crate as `cdylib`
- [ ] Implement connection with SQL auth and Windows integrated auth
- [ ] Implement named instance support via SQL Browser
- [ ] Implement all schema queries (sys.tables, sys.columns, etc.)
- [ ] Wire all 3 drivers into Tauri IPC commands
- [ ] Frontend: ConnectionForm now shows real connection test results
- [ ] Frontend: Sidebar populates with real schema tree
- [ ] **GATE**: All 3 drivers connect + execute + return schema on Windows

## Connection Manager (Rust)

```rust
// src-tauri/src/services/connection_manager.rs

pub struct ConnectionManager {
    connections: HashMap<Uuid, ActiveConnection>,
    plugin_manager: Arc<PluginManager>,
}

struct ActiveConnection {
    id: Uuid,
    config: ConnectionConfig,
    driver: Box<dyn DatabaseDriver + Send + Sync>,
    status: ConnectionStatus,
    health_handle: Option<JoinHandle<()>>,
}

impl ConnectionManager {
    pub async fn connect(&mut self, config: ConnectionConfig) -> Result<Uuid> {
        let driver = self.plugin_manager.create_driver(&config.db_type, config.to_driver_config())?;
        driver.connect().await?;
        let id = Uuid::new_v4();
        // Start health monitor (30s ping interval, same as macOS)
        let health = self.spawn_health_monitor(id, driver.clone());
        self.connections.insert(id, ActiveConnection { id, config, driver, status: Connected, health_handle: Some(health) });
        Ok(id)
    }
}
```

## Mapping: macOS Protocol → Rust Trait

| macOS `PluginDatabaseDriver` | Rust `DatabaseDriver` | Notes |
|------------------------------|------------------------|-------|
| `connect()` | `async fn connect(&self)` | |
| `disconnect()` | `fn disconnect(&self)` | |
| `ping()` | `async fn ping(&self)` | |
| `execute(query:)` | `async fn execute(&self, query: &str)` | |
| `fetchTables(schema:)` | `async fn fetch_tables(&self, schema: Option<&str>)` | |
| `fetchColumns(table:schema:)` | `async fn fetch_columns(&self, table: &str, schema: Option<&str>)` | |
| `fetchIndexes(table:schema:)` | `async fn fetch_indexes(&self, table: &str, schema: Option<&str>)` | |
| `fetchForeignKeys(table:schema:)` | `async fn fetch_foreign_keys(&self, table: &str, schema: Option<&str>)` | |
| `fetchTableDDL(table:schema:)` | `async fn fetch_ddl(&self, table: &str, schema: Option<&str>)` | |
| `fetchDatabases()` | `async fn fetch_databases(&self)` | |
| `cancelQuery()` | `fn cancel_query(&self)` | Sync — must signal from any thread |
| `buildBrowseQuery(...)` | Not in trait | SQL building stays in core, not plugin |

## Success Criteria

1. `driver-postgres.dll` loads dynamically, connects to PG 14+, returns schema
2. `driver-mysql.dll` loads dynamically, connects to MySQL 8+, returns schema
3. `driver-mssql.dll` loads dynamically, connects to SQL Server 2019+, returns schema
4. Query overhead through FFI boundary < 50ms
5. Plugin crash isolation: bad plugin doesn't crash main process (catch panics at boundary)
