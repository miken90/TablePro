use mongodb::bson::{doc, Document};
use mongodb::sync::Client;
use tablepro_plugin_sdk::{
    DriverHandle, FfiQueryResult, FfiResult, FfiStr, FfiString, FfiTableInfo, FfiTableList,
};

use crate::bson_flatten::{bson_value_to_string, discover_fields};
use crate::driver::MongoDriver;
use crate::ffi_helpers::{
    build_query_result, err_query_result, err_result, ok_result, string_to_ffi,
};

pub unsafe fn connect(handle: *mut DriverHandle) -> FfiResult {
    let driver = &mut *(handle as *mut MongoDriver);

    match Client::with_uri_str(&driver.connection_string) {
        Ok(client) => {
            // Verify connectivity by pinging the server
            let db = if driver.database_name.is_empty() {
                client.database("admin")
            } else {
                client.database(&driver.database_name)
            };
            match db.run_command(doc! { "ping": 1 }).run() {
                Ok(_) => {
                    driver.client = Some(client);
                    ok_result()
                }
                Err(e) => err_result(format!("MongoDB ping failed: {}", e)),
            }
        }
        Err(e) => err_result(format!("MongoDB connection failed: {}", e)),
    }
}

pub unsafe fn disconnect(handle: *mut DriverHandle) {
    let driver = &mut *(handle as *mut MongoDriver);
    driver.client = None;
}

pub unsafe fn ping(handle: *mut DriverHandle) -> FfiResult {
    let driver = &mut *(handle as *mut MongoDriver);
    let db = match driver.current_db() {
        Some(db) => db,
        None => return err_result("Not connected".to_string()),
    };
    match db.run_command(doc! { "ping": 1 }).run() {
        Ok(_) => ok_result(),
        Err(e) => err_result(format!("Ping failed: {}", e)),
    }
}

/// Execute a MongoDB query. The `sql` parameter is interpreted as a JSON command:
/// `{"collection": "users", "filter": {...}, "sort": {...}, "limit": 100}`
///
/// If the input is not valid JSON or missing "collection", returns an error.
pub unsafe fn execute(handle: *mut DriverHandle, sql: FfiStr) -> FfiQueryResult {
    let driver = &mut *(handle as *mut MongoDriver);
    let input = sql.as_str().to_owned();

    let db = match driver.current_db() {
        Some(db) => db,
        None => return err_query_result("Not connected".to_string()),
    };

    // Parse the JSON command
    let cmd: serde_json::Value = match serde_json::from_str(&input) {
        Ok(v) => v,
        Err(e) => return err_query_result(format!("Invalid JSON command: {}", e)),
    };

    let collection_name = match cmd.get("collection").and_then(|v| v.as_str()) {
        Some(name) => name.to_string(),
        None => return err_query_result("Missing \"collection\" field in command".to_string()),
    };

    let collection = db.collection::<Document>(&collection_name);

    // Parse filter
    let filter: Option<Document> = match cmd.get("filter") {
        Some(serde_json::Value::Object(map)) => {
            match mongodb::bson::to_document(&serde_json::Value::Object(map.clone())) {
                Ok(doc) => Some(doc),
                Err(e) => return err_query_result(format!("Invalid filter: {}", e)),
            }
        }
        Some(serde_json::Value::Null) | None => None,
        _ => return err_query_result("\"filter\" must be an object".to_string()),
    };

    // Parse sort
    let sort: Option<Document> = match cmd.get("sort") {
        Some(serde_json::Value::Object(map)) => {
            match mongodb::bson::to_document(&serde_json::Value::Object(map.clone())) {
                Ok(doc) => Some(doc),
                Err(e) => return err_query_result(format!("Invalid sort: {}", e)),
            }
        }
        Some(serde_json::Value::Null) | None => None,
        _ => return err_query_result("\"sort\" must be an object".to_string()),
    };

    // Parse limit (default 1000 to prevent unbounded reads)
    let limit = cmd
        .get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(1000);

    // Build find options
    let mut find_opts = mongodb::options::FindOptions::default();
    find_opts.sort = sort;
    find_opts.limit = Some(limit);

    // Execute find
    let cursor = match collection.find(filter.unwrap_or_default()).with_options(find_opts).run() {
        Ok(c) => c,
        Err(e) => return err_query_result(format!("find() failed: {}", e)),
    };

    // Collect documents
    let mut docs: Vec<Document> = Vec::new();
    for result in cursor {
        match result {
            Ok(doc) => docs.push(doc),
            Err(e) => return err_query_result(format!("Cursor error: {}", e)),
        }
    }

    // Flatten to tabular form
    documents_to_query_result(&docs)
}

/// Convert a list of BSON documents into an FfiQueryResult with flattened columns.
fn documents_to_query_result(docs: &[Document]) -> FfiQueryResult {
    if docs.is_empty() {
        return build_query_result(vec![], vec![], 0);
    }

    let fields = discover_fields(docs);

    // Build column metadata: (name, type_name, nullable, is_pk)
    // Infer types from the first non-null value across documents
    let columns: Vec<(String, String, bool, bool)> = fields
        .iter()
        .map(|field| {
            let type_name = docs
                .iter()
                .filter_map(|doc| doc.get(field))
                .find(|v| !matches!(v, mongodb::bson::Bson::Null))
                .map(crate::bson_flatten::bson_type_name)
                .unwrap_or("unknown")
                .to_string();
            let is_pk = field == "_id";
            (field.clone(), type_name, true, is_pk)
        })
        .collect();

    // Build rows
    let rows: Vec<Vec<Option<String>>> = docs
        .iter()
        .map(|doc| {
            fields
                .iter()
                .map(|field| {
                    doc.get(field)
                        .and_then(bson_value_to_string)
                })
                .collect()
        })
        .collect();

    build_query_result(columns, rows, 0)
}

/// Fetch tables = list collections in the current database.
/// Returns them as FfiTableList with table_type = "COLLECTION".
pub unsafe fn fetch_tables(handle: *mut DriverHandle) -> FfiTableList {
    let driver = &mut *(handle as *mut MongoDriver);
    let db = match driver.current_db() {
        Some(db) => db,
        None => {
            return FfiTableList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi("Not connected".to_string()),
            }
        }
    };

    match db.list_collection_names().run() {
        Err(e) => FfiTableList {
            items: std::ptr::null_mut(),
            count: 0,
            error: string_to_ffi(format!("Failed to list collections: {}", e)),
        },
        Ok(names) => {
            let mut items: Vec<FfiTableInfo> = names
                .into_iter()
                .map(|name| FfiTableInfo {
                    name: string_to_ffi(name),
                    schema: string_to_ffi(driver.database_name.clone()),
                    table_type: string_to_ffi("COLLECTION".to_string()),
                    row_count_estimate: 0,
                    has_row_count: false,
                })
                .collect();
            let ptr = items.as_mut_ptr();
            let count = items.len();
            std::mem::forget(items);
            FfiTableList {
                items: ptr,
                count,
                error: FfiString::null(),
            }
        }
    }
}

pub unsafe fn cancel(_handle: *mut DriverHandle) -> FfiResult {
    err_result("Cancel not supported for MongoDB".to_string())
}
