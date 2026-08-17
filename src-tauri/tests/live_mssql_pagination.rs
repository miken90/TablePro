//! Live probe: table browsing pages correctly on SQL Server.
//!
//! Ignored by default because it needs a reachable SQL Server, and it
//! creates/drops its own table — point it at a throwaway instance.
//!
//! Builds the pagination tail with the same `paginate_owned_query` the
//! `fetch_rows` command uses, then executes the resulting statement through the
//! real MSSQL driver, so a regression in either half fails the test.
//!
//! ```text
//! set TABLEPRO_MSSQL_HOST=127.0.0.1
//! set TABLEPRO_MSSQL_PORT=1434
//! set TABLEPRO_MSSQL_USER=sa
//! set TABLEPRO_MSSQL_PASSWORD=Probe#Pass123
//! cargo test -p tablepro-windows --test live_mssql_pagination -- --ignored --nocapture
//! ```

use driver_common::{ConnectionConfig, DatabaseDriver};
use driver_mssql::MssqlDriver;
use tablepro_windows::services::sql_generator::Dialect;
use tablepro_windows::services::sql_pagination::paginate_owned_query;

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

fn config() -> ConnectionConfig {
    ConnectionConfig {
        host: env_or("TABLEPRO_MSSQL_HOST", "127.0.0.1"),
        port: env_or("TABLEPRO_MSSQL_PORT", "1433").parse().unwrap_or(1433),
        user: env_or("TABLEPRO_MSSQL_USER", "sa"),
        password: env_or("TABLEPRO_MSSQL_PASSWORD", "Probe#Pass123"),
        database: env_or("TABLEPRO_MSSQL_DATABASE", "master"),
        db_type: "mssql".to_string(),
        ssl_mode: "prefer".to_string(),
        startup_commands: None,
        ssh_enabled: false,
        ssh_host: String::new(),
        ssh_port: 22,
        ssh_user: String::new(),
        ssh_auth_method: "password".to_string(),
        ssh_password: String::new(),
        ssh_key_path: String::new(),
        ssh_key_passphrase: String::new(),
    }
}

/// Mirror of what `fetch_rows` builds, minus the Tauri plumbing.
fn browse_sql(qualified: &str, order_by: Option<&str>, limit: u64, offset: u64) -> String {
    let tail = paginate_owned_query(order_by, limit, offset, Dialect::from_db_type("mssql"))
        .expect("mssql pagination tail");
    format!("SELECT * FROM {qualified}{tail}")
}

async fn page_ids(driver: &MssqlDriver, order_by: Option<&str>, limit: u64, offset: u64) -> Vec<i64> {
    let sql = browse_sql("[dbo].[tp_paging]", order_by, limit, offset);
    println!("  {sql}");
    let result = driver.execute(&sql).await.expect("browse query failed");
    result
        .rows
        .iter()
        .map(|r| {
            r.first()
                .and_then(|v| v.as_deref())
                .and_then(|s| s.parse::<i64>().ok())
                .expect("id column")
        })
        .collect()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live SQL Server; creates and drops its own table"]
async fn table_browsing_pages_without_gaps_or_overlap() {
    let driver = MssqlDriver::new(tokio::runtime::Handle::current(), config());
    driver.connect().await.expect("connect failed");

    driver
        .execute("IF OBJECT_ID('dbo.tp_paging','U') IS NOT NULL DROP TABLE dbo.tp_paging")
        .await
        .expect("cleanup failed");
    driver
        .execute("CREATE TABLE dbo.tp_paging (id int PRIMARY KEY, label nvarchar(16))")
        .await
        .expect("create failed");
    driver
        .execute(
            "WITH n AS (SELECT TOP (25) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i \
             FROM sys.all_objects) \
             INSERT INTO dbo.tp_paging (id, label) SELECT i, CONCAT('row', i) FROM n",
        )
        .await
        .expect("seed failed");

    // The ordering `fetch_rows` derives for an unsorted browse is the primary
    // key; the explicit-sort path passes the grid's own clause through.
    let order = Some("[id]");

    let page1 = page_ids(&driver, order, 10, 0).await;
    let page2 = page_ids(&driver, order, 10, 10).await;
    let page3 = page_ids(&driver, order, 10, 20).await;
    println!("page1: {page1:?}\npage2: {page2:?}\npage3: {page3:?}");

    assert_eq!(page1, (1..=10).collect::<Vec<i64>>());
    assert_eq!(page2, (11..=20).collect::<Vec<i64>>());
    assert_eq!(page3, (21..=25).collect::<Vec<i64>>(), "last page is partial");

    // No gaps, no overlap, full coverage.
    let mut seen: Vec<i64> = [page1, page2, page3].concat();
    let total = seen.len();
    seen.sort_unstable();
    seen.dedup();
    assert_eq!(seen.len(), total, "pages overlapped");
    assert_eq!(seen, (1..=25).collect::<Vec<i64>>(), "pages skipped rows");

    // Descending sort, as the grid sends when a column header is clicked.
    let desc = page_ids(&driver, Some("[id] DESC"), 5, 0).await;
    assert_eq!(desc, vec![25, 24, 23, 22, 21]);

    driver
        .execute("DROP TABLE dbo.tp_paging")
        .await
        .expect("teardown failed");
}

/// Reading a non-character column used to panic the driver (and, under
/// `panic = "abort"`, the app). Every SQL Server type must now come back as a
/// display string.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a live SQL Server"]
async fn every_column_type_renders_without_panicking() {
    let driver = MssqlDriver::new(tokio::runtime::Handle::current(), config());
    driver.connect().await.expect("connect failed");

    let result = driver
        .execute(
            "SELECT CAST(42 AS int) AS i, \
                    CAST(1 AS bit) AS b, \
                    CAST(3.50 AS decimal(10,2)) AS d, \
                    CAST(2.5 AS float) AS f, \
                    CAST('2024-01-15' AS date) AS dt, \
                    CAST('2024-01-15 13:45:30.123' AS datetime) AS dtm, \
                    CAST('2024-01-15 13:45:30.1234567' AS datetime2) AS dt2, \
                    CAST('13:45:30' AS time) AS tm, \
                    CAST(0xDEADBEEF AS varbinary(4)) AS bin, \
                    CAST('6F9619FF-8B86-D011-B42D-00C04FC964FF' AS uniqueidentifier) AS g, \
                    CAST(NULL AS int) AS n, \
                    N'text' AS s",
        )
        .await
        .expect("typed select failed");

    let names: Vec<&str> = result.columns.iter().map(|c| c.name.as_str()).collect();
    let row = &result.rows[0];
    for (name, value) in names.iter().zip(row.iter()) {
        println!("  {name:>4} = {value:?}");
    }

    let cell = |name: &str| -> Option<String> {
        let idx = names.iter().position(|n| *n == name).expect("column present");
        row[idx].clone()
    };

    assert_eq!(cell("i").as_deref(), Some("42"));
    assert_eq!(cell("b").as_deref(), Some("1"));
    assert_eq!(cell("d").as_deref(), Some("3.50"));
    assert_eq!(cell("f").as_deref(), Some("2.5"));
    assert_eq!(cell("dt").as_deref(), Some("2024-01-15"));
    assert_eq!(cell("dtm").as_deref(), Some("2024-01-15 13:45:30.123"));
    assert_eq!(cell("dt2").as_deref(), Some("2024-01-15 13:45:30.1234567"));
    assert_eq!(cell("tm").as_deref(), Some("13:45:30.0000000"));
    assert_eq!(cell("bin").as_deref(), Some("0xDEADBEEF"));
    assert_eq!(cell("s").as_deref(), Some("text"));
    assert!(cell("g").is_some(), "guid rendered");
    assert_eq!(cell("n"), None, "NULL stays NULL");
}
