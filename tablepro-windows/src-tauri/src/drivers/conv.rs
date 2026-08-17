//! Conversions between `driver_common` types/errors and the host's
//! `crate::models` equivalents. The structs are field-identical;
//! these helpers exist so the rest of the host can stay on its own
//! types (and `AppError`) without leaking `driver_common` everywhere.

use driver_common::{
    types as dc, ColumnInfo as DcColumnInfo, ForeignKeyInfo as DcForeignKeyInfo,
    IndexInfo as DcIndexInfo, QueryResult as DcQueryResult, TableInfo as DcTableInfo,
};

use crate::models::{
    AppError, ColumnInfo, ConnectionConfig, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo,
};

// ── Errors ──────────────────────────────────────────────────────────────────

pub fn driver_err_to_app(err: driver_common::DriverError) -> AppError {
    use driver_common::DriverError as E;
    match err {
        E::Connection(m) | E::Auth(m) => AppError::DatabaseError(m),
        E::Query(m) => AppError::DatabaseError(m),
        E::Timeout(m) => AppError::DatabaseError(format!("Timeout: {m}")),
        E::Unsupported(m) => AppError::Other(format!("Unsupported: {m}")),
        E::Other(m) => AppError::Other(m),
    }
}

// ── ConnectionConfig (host → driver_common) ─────────────────────────────────

pub fn cfg_to_driver_common(cfg: &ConnectionConfig) -> dc::ConnectionConfig {
    dc::ConnectionConfig {
        host: cfg.host.clone(),
        port: cfg.port,
        user: cfg.user.clone(),
        password: cfg.password.clone(),
        database: cfg.database.clone(),
        db_type: cfg.db_type.clone(),
        ssl_mode: cfg.ssl_mode.clone(),
        startup_commands: cfg.startup_commands.clone(),
        ssh_enabled: cfg.ssh_enabled,
        ssh_host: cfg.ssh_host.clone(),
        ssh_port: cfg.ssh_port,
        ssh_user: cfg.ssh_user.clone(),
        ssh_auth_method: cfg.ssh_auth_method.clone(),
        ssh_password: cfg.ssh_password.clone(),
        ssh_key_path: cfg.ssh_key_path.clone(),
        ssh_key_passphrase: cfg.ssh_key_passphrase.clone(),
    }
}

// ── Result-set & schema types (driver_common → host) ────────────────────────

pub fn col_from_dc(c: DcColumnInfo) -> ColumnInfo {
    ColumnInfo {
        name: c.name,
        type_name: c.type_name,
        nullable: c.nullable,
        is_primary_key: c.is_primary_key,
    }
}

pub fn query_result_from_dc(r: DcQueryResult) -> QueryResult {
    QueryResult {
        columns: r.columns.into_iter().map(col_from_dc).collect(),
        rows: r.rows,
        affected_rows: r.affected_rows,
        execution_time_ms: r.execution_time_ms,
        truncated: r.truncated,
        total_row_count: r.total_row_count,
    }
}

pub fn table_from_dc(t: DcTableInfo) -> TableInfo {
    TableInfo {
        name: t.name,
        schema: t.schema,
        table_type: t.table_type,
        row_count_estimate: t.row_count_estimate,
    }
}

pub fn index_from_dc(i: DcIndexInfo) -> IndexInfo {
    IndexInfo {
        name: i.name,
        columns: i.columns,
        is_unique: i.is_unique,
        index_type: i.index_type,
    }
}

pub fn fk_from_dc(f: DcForeignKeyInfo) -> ForeignKeyInfo {
    ForeignKeyInfo {
        name: f.name,
        column: f.column,
        referenced_table: f.referenced_table,
        referenced_column: f.referenced_column,
    }
}
