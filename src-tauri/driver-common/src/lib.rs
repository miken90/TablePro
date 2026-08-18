//! Shared types and traits for TablePro database drivers.
//!
//! This crate is statically linked into both the host (`tablepro-windows`)
//! and each driver crate (`driver-postgres`, `driver-mysql`, ...). It contains
//! NO FFI types — drivers are compiled in, not loaded as DLLs.

pub mod driver;
pub mod error;
pub mod tls;
pub mod types;

mod columnar;

pub use columnar::{ColumnData, ColumnarResult};
pub use driver::DatabaseDriver;
pub use tls::ensure_crypto_provider;
pub use error::DriverError;
pub use types::{
    ColumnInfo, ConnectionConfig, ForeignKeyInfo, IndexInfo, QueryParameter, QueryResult,
    RowValue, TableDescription, TableInfo,
};
