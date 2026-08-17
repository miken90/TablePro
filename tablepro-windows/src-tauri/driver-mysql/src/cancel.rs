//! MySQL/MariaDB query cancellation.
//!
//! `mysql_async` exposes no client-side cancel: the connection is busy
//! streaming the result set, so nothing can be written on it. The engine's own
//! mechanism is `KILL QUERY <connection_id>`, issued from a *second*
//! connection, which aborts the running statement while leaving the session
//! (temp tables, transaction, session variables) intact — unlike bare `KILL`,
//! which drops the whole connection.

use driver_common::DriverError;
use mysql_async::prelude::Queryable;
use mysql_async::{Conn, OptsBuilder};

/// Build the `KILL QUERY` statement for a connection id.
///
/// The id is a `u32` straight from `Conn::id()`, so interpolation cannot
/// inject SQL.
pub(crate) fn kill_query_sql(connection_id: u32) -> String {
    format!("KILL QUERY {connection_id}")
}

/// Open a second connection with the same options and abort the statement
/// currently running on `connection_id`.
pub(crate) async fn kill_query(opts: OptsBuilder, connection_id: u32) -> Result<(), DriverError> {
    let mut conn = Conn::new(opts)
        .await
        .map_err(|e| DriverError::Connection(format!("Cancel connection failed: {e}")))?;
    let outcome = conn
        .query_drop(kill_query_sql(connection_id))
        .await
        .map_err(|e| DriverError::Query(format!("KILL QUERY failed: {e}")));
    // Close the helper connection regardless of the KILL outcome.
    let _ = conn.disconnect().await;
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kill_query_sql_targets_the_statement_not_the_session() {
        assert_eq!(kill_query_sql(42), "KILL QUERY 42");
        // Bare `KILL <id>` would drop the whole connection; we must not emit it.
        assert!(!kill_query_sql(42).starts_with("KILL 42"));
    }

    #[test]
    fn kill_query_sql_handles_boundary_ids() {
        assert_eq!(kill_query_sql(0), "KILL QUERY 0");
        assert_eq!(kill_query_sql(u32::MAX), format!("KILL QUERY {}", u32::MAX));
    }
}
