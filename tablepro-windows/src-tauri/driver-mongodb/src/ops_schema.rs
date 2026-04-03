use mongodb::bson::Document;
use tablepro_plugin_sdk::{
    DriverHandle, FfiColumnInfo, FfiColumnList, FfiForeignKeyList, FfiIndexInfo,
    FfiIndexList, FfiStr, FfiString, FfiStringList,
};

use crate::bson_flatten::bson_type_name;
use crate::driver::MongoDriver;
use crate::ffi_helpers::string_to_ffi;

/// Fetch columns = sample documents from a collection and discover fields + types.
/// `table` is the collection name, `schema` is the database name.
pub unsafe fn fetch_columns(
    handle: *mut DriverHandle,
    table: FfiStr,
    schema: FfiStr,
) -> FfiColumnList {
    let driver = &mut *(handle as *mut MongoDriver);
    let client = match &driver.client {
        Some(c) => c,
        None => {
            return FfiColumnList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi("Not connected".to_string()),
            }
        }
    };

    let collection_name = table.as_str().to_owned();
    let db_name = {
        let s = schema.as_str();
        if s.is_empty() {
            &driver.database_name
        } else {
            s
        }
    };

    let db = client.database(db_name);
    let collection = db.collection::<Document>(&collection_name);

    // Sample up to 100 documents to discover fields and types
    let find_opts = mongodb::options::FindOptions::builder().limit(100i64).build();
    let cursor = match collection.find(mongodb::bson::doc! {}).with_options(find_opts).run() {
        Ok(c) => c,
        Err(e) => {
            return FfiColumnList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi(format!("Failed to sample collection: {}", e)),
            }
        }
    };

    let docs: Vec<Document> = cursor.filter_map(|r| r.ok()).collect();
    if docs.is_empty() {
        return FfiColumnList {
            items: std::ptr::null_mut(),
            count: 0,
            error: FfiString::null(),
        };
    }

    // Discover fields and infer types
    let fields = crate::bson_flatten::discover_fields(&docs);
    let mut items: Vec<FfiColumnInfo> = fields
        .iter()
        .map(|field| {
            let type_name = docs
                .iter()
                .filter_map(|doc| doc.get(field))
                .find(|v| !matches!(v, mongodb::bson::Bson::Null))
                .map(bson_type_name)
                .unwrap_or("unknown")
                .to_string();
            let is_pk = field == "_id";
            FfiColumnInfo {
                name: string_to_ffi(field.clone()),
                type_name: string_to_ffi(type_name),
                nullable: !is_pk,
                is_primary_key: is_pk,
            }
        })
        .collect();

    let ptr = items.as_mut_ptr();
    let count = items.len();
    std::mem::forget(items);

    FfiColumnList {
        items: ptr,
        count,
        error: FfiString::null(),
    }
}

/// Fetch indexes for a collection using the listIndexes command.
pub unsafe fn fetch_indexes(
    handle: *mut DriverHandle,
    table: FfiStr,
    schema: FfiStr,
) -> FfiIndexList {
    let driver = &mut *(handle as *mut MongoDriver);
    let client = match &driver.client {
        Some(c) => c,
        None => {
            return FfiIndexList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi("Not connected".to_string()),
            }
        }
    };

    let collection_name = table.as_str().to_owned();
    let db_name = {
        let s = schema.as_str();
        if s.is_empty() {
            &driver.database_name
        } else {
            s
        }
    };

    let db = client.database(db_name);
    let collection = db.collection::<Document>(&collection_name);

    let cursor = match collection.list_indexes().run() {
        Ok(c) => c,
        Err(e) => {
            return FfiIndexList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi(format!("Failed to list indexes: {}", e)),
            }
        }
    };

    let mut items: Vec<FfiIndexInfo> = Vec::new();
    for result in cursor {
        let index_model = match result {
            Ok(m) => m,
            Err(_) => continue,
        };

        let name = index_model
            .options
            .as_ref()
            .and_then(|o| o.name.clone())
            .unwrap_or_default();
        let is_unique = index_model
            .options
            .as_ref()
            .and_then(|o| o.unique)
            .unwrap_or(false);

        // Extract column names from the key document (keys is already a Document)
        let col_names: Vec<String> = index_model.keys.keys().map(|k| k.to_string()).collect();

        let mut ffi_cols: Vec<FfiString> = col_names.into_iter().map(string_to_ffi).collect();
        let col_ptr = ffi_cols.as_mut_ptr();
        let col_count = ffi_cols.len();
        std::mem::forget(ffi_cols);

        items.push(FfiIndexInfo {
            name: string_to_ffi(name),
            columns: col_ptr,
            column_count: col_count,
            is_unique,
            index_type: string_to_ffi("MONGODB".to_string()),
        });
    }

    let ptr = items.as_mut_ptr();
    let count = items.len();
    std::mem::forget(items);

    FfiIndexList {
        items: ptr,
        count,
        error: FfiString::null(),
    }
}

/// MongoDB has no foreign keys — return empty list.
pub unsafe fn fetch_foreign_keys(
    _handle: *mut DriverHandle,
    _table: FfiStr,
    _schema: FfiStr,
) -> FfiForeignKeyList {
    FfiForeignKeyList {
        items: std::ptr::null_mut(),
        count: 0,
        error: FfiString::null(),
    }
}

/// Fetch databases = list all databases on the server.
pub unsafe fn fetch_databases(handle: *mut DriverHandle) -> FfiStringList {
    let driver = &mut *(handle as *mut MongoDriver);
    let client = match &driver.client {
        Some(c) => c,
        None => {
            return FfiStringList {
                items: std::ptr::null_mut(),
                count: 0,
                error: string_to_ffi("Not connected".to_string()),
            }
        }
    };

    match client.list_database_names().run() {
        Err(e) => FfiStringList {
            items: std::ptr::null_mut(),
            count: 0,
            error: string_to_ffi(format!("Failed to list databases: {}", e)),
        },
        Ok(names) => {
            let mut items: Vec<FfiString> = names.into_iter().map(string_to_ffi).collect();
            let ptr = items.as_mut_ptr();
            let count = items.len();
            std::mem::forget(items);
            FfiStringList {
                items: ptr,
                count,
                error: FfiString::null(),
            }
        }
    }
}

/// MongoDB has no DDL — return a descriptive message.
pub unsafe fn fetch_ddl(
    _handle: *mut DriverHandle,
    table: FfiStr,
    _schema: FfiStr,
) -> FfiString {
    let name = table.as_str();
    string_to_ffi(format!(
        "-- MongoDB collection '{}'\n-- DDL is not applicable for MongoDB collections.",
        name
    ))
}
