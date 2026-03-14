//! DDL generation for the MSSQL driver.
#![allow(clippy::get_first)]

use tablepro_plugin_sdk::FfiString;

use crate::driver::MssqlDriver;
use crate::ffi::string_to_ffi;

fn escape_sq(s: &str) -> String {
    s.replace('\'', "''")
}

fn escape_bracket(s: &str) -> String {
    s.replace(']', "]]")
}

const FIXED_SIZE_TYPES: &[&str] = &[
    "int",
    "bigint",
    "smallint",
    "tinyint",
    "bit",
    "money",
    "smallmoney",
    "float",
    "real",
    "datetime",
    "datetime2",
    "smalldatetime",
    "date",
    "time",
    "uniqueidentifier",
    "text",
    "ntext",
    "image",
    "xml",
    "timestamp",
    "rowversion",
];

pub fn fetch_ddl(driver: &MssqlDriver, table: &str, schema: &str) -> FfiString {
    let schema = if schema.is_empty() { "dbo" } else { schema };
    let et = escape_sq(table);
    let es = escape_sq(schema);
    let bt = escape_bracket(table);
    let bs = escape_bracket(schema);

    let col_sql = format!(
        "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT, \
            COLUMNPROPERTY(OBJECT_ID('{es}.{et}'), COLUMN_NAME, 'IsIdentity') as is_identity \
         FROM INFORMATION_SCHEMA.COLUMNS \
         WHERE TABLE_NAME = '{et}' AND TABLE_SCHEMA = '{es}' \
         ORDER BY ORDINAL_POSITION"
    );

    let cols = match driver.execute_query(&col_sql) {
        Err(e) => return string_to_ffi(format!("-- Error: {e}")),
        Ok((_, rows, _)) => rows,
    };

    let pk_cols = fetch_pk_cols(driver, &et, &es);

    let mut ddl = format!("CREATE TABLE [{bs}].[{bt}] (\n");
    let col_defs: Vec<String> = cols.iter().filter_map(|row| build_col_def(row)).collect();

    let mut parts = col_defs;
    if !pk_cols.is_empty() {
        let pk_list = pk_cols
            .iter()
            .map(|c| format!("[{}]", escape_bracket(c)))
            .collect::<Vec<_>>()
            .join(", ");
        parts.push(format!(
            "    CONSTRAINT [PK_{bt}] PRIMARY KEY ({})",
            pk_list
        ));
    }

    ddl.push_str(&parts.join(",\n"));
    ddl.push_str("\n);");
    string_to_ffi(ddl)
}

fn fetch_pk_cols(driver: &MssqlDriver, et: &str, es: &str) -> Vec<String> {
    let sql = format!(
        "SELECT ku.COLUMN_NAME \
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc \
         JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME \
         WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_NAME = '{et}' AND tc.TABLE_SCHEMA = '{es}'"
    );
    match driver.execute_query(&sql) {
        Ok((_, rows, _)) => rows
            .into_iter()
            .filter_map(|row| row.into_iter().next()?.clone())
            .collect(),
        Err(_) => vec![],
    }
}

fn build_col_def(row: &[Option<String>]) -> Option<String> {
    let name = row.get(0)?.as_deref()?;
    let dtype = row.get(1)?.as_deref().unwrap_or("nvarchar");
    let char_len = row.get(2)?.as_deref();
    let nullable = row.get(3)?.as_deref() == Some("YES");
    let default_val = row.get(4)?.as_deref();
    let is_identity = row.get(5)?.as_deref() == Some("1");

    let lower = dtype.to_lowercase();
    let full_type = if FIXED_SIZE_TYPES.contains(&lower.as_str()) {
        dtype.to_uppercase()
    } else if char_len == Some("-1") {
        format!("{}(MAX)", dtype.to_uppercase())
    } else if let Some(len) = char_len.and_then(|l| l.parse::<i64>().ok()) {
        format!("{}({})", dtype.to_uppercase(), len)
    } else {
        dtype.to_uppercase()
    };

    let mut def = format!("    [{}] {}", name, full_type);
    if is_identity {
        def.push_str(" IDENTITY(1,1)");
    }
    def.push_str(if nullable { " NULL" } else { " NOT NULL" });
    if let Some(d) = default_val {
        def.push_str(&format!(" DEFAULT {}", d));
    }
    Some(def)
}
