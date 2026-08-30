//! Helper to extract detailed error messages from `tokio_postgres::Error`.
//!
//! `tokio_postgres::Error` has a `Display` impl that outputs just "db error"
//! when wrapping a `DbError`. The actual message, detail, and hint are
//! accessible only via `.as_db_error()`. This module provides a helper that
//! extracts the full, human-readable error string.

use driver_common::DriverError;

/// Convert a `tokio_postgres::Error` into a `DriverError::Query` with a
/// detailed message that includes the PostgreSQL error message, detail, and hint.
pub fn pg_query_error(e: tokio_postgres::Error) -> DriverError {
    DriverError::Query(pg_error_message(&e))
}

/// Convert a `tokio_postgres::Error` into a `DriverError::Connection` with detail.
pub fn pg_conn_error(e: tokio_postgres::Error) -> DriverError {
    DriverError::Connection(pg_error_message(&e))
}

/// Whether a PostgreSQL server actually answered before this error.
///
/// A server-side error (authentication rejected, unknown database, too many
/// connections) proves the address reached a real server and that the answer
/// is final. Anything else — a refused or silently dropped connection — says
/// nothing about the other addresses the host resolved to.
pub fn server_answered(e: &tokio_postgres::Error) -> bool {
    e.as_db_error().is_some()
}

/// Extract a detailed error message from a `tokio_postgres::Error`.
///
/// If the error wraps a `DbError` (i.e. a server-side PostgreSQL error),
/// extracts the message, optional detail, and optional hint fields.
/// Otherwise falls back to the standard `Display` output.
fn pg_error_message(e: &tokio_postgres::Error) -> String {
    if let Some(db_err) = e.as_db_error() {
        let mut msg = db_err.message().to_string();
        if let Some(detail) = db_err.detail() {
            msg.push_str("\nDetail: ");
            msg.push_str(detail);
        }
        if let Some(hint) = db_err.hint() {
            msg.push_str("\nHint: ");
            msg.push_str(hint);
        }
        return msg;
    }
    e.to_string()
}
