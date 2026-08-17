//! MongoDB query + collection-listing operations (async).

use futures_util::TryStreamExt;
use mongodb::bson::{Bson, Document};
use mongodb::Client;

use driver_common::{ColumnInfo, DriverError, QueryResult, TableInfo};

use crate::bson_flatten::{bson_type_name, bson_value_to_string, discover_fields};

/// Execute a MongoDB query. The `query` parameter is a JSON command:
/// `{"collection": "users", "filter": {...}, "sort": {...}, "limit": 100}`
pub async fn execute(
    client: &Client,
    db_name: &str,
    query: &str,
) -> Result<QueryResult, DriverError> {
    let cmd: serde_json::Value = serde_json::from_str(query)
        .map_err(|e| DriverError::Query(format!("Invalid JSON command: {e}")))?;

    let collection_name = cmd
        .get("collection")
        .and_then(|v| v.as_str())
        .ok_or_else(|| DriverError::Query("Missing \"collection\" field in command".to_string()))?
        .to_string();

    let db = client.database(db_name);
    let collection = db.collection::<Document>(&collection_name);

    let filter = parse_optional_doc(cmd.get("filter"), "filter")?;
    let sort = parse_optional_doc(cmd.get("sort"), "sort")?;
    let limit = cmd.get("limit").and_then(|v| v.as_i64()).unwrap_or(1000);

    let find_opts = mongodb::options::FindOptions::builder()
        .sort(sort)
        .limit(limit)
        .build();

    let cursor = collection
        .find(filter.unwrap_or_default())
        .with_options(find_opts)
        .await
        .map_err(|e| DriverError::Query(format!("find() failed: {e}")))?;

    let docs: Vec<Document> = cursor
        .try_collect()
        .await
        .map_err(|e| DriverError::Query(format!("Cursor error: {e}")))?;

    Ok(documents_to_query_result(&docs))
}

fn parse_optional_doc(
    value: Option<&serde_json::Value>,
    field_name: &str,
) -> Result<Option<Document>, DriverError> {
    match value {
        Some(serde_json::Value::Object(map)) => {
            let doc = mongodb::bson::to_document(&serde_json::Value::Object(map.clone()))
                .map_err(|e| DriverError::Query(format!("Invalid {field_name}: {e}")))?;
            Ok(Some(doc))
        }
        Some(serde_json::Value::Null) | None => Ok(None),
        _ => Err(DriverError::Query(format!(
            "\"{field_name}\" must be an object"
        ))),
    }
}

fn documents_to_query_result(docs: &[Document]) -> QueryResult {
    if docs.is_empty() {
        return QueryResult::empty();
    }

    let fields = discover_fields(docs);

    let columns: Vec<ColumnInfo> = fields
        .iter()
        .map(|field| {
            let type_name = docs
                .iter()
                .filter_map(|doc| doc.get(field))
                .find(|v| !matches!(v, Bson::Null))
                .map(bson_type_name)
                .unwrap_or("unknown")
                .to_string();
            let is_pk = field == "_id";
            ColumnInfo {
                name: field.clone(),
                type_name,
                nullable: !is_pk,
                is_primary_key: is_pk,
            }
        })
        .collect();

    let rows: Vec<Vec<Option<String>>> = docs
        .iter()
        .map(|doc| {
            fields
                .iter()
                .map(|field| doc.get(field).and_then(bson_value_to_string))
                .collect()
        })
        .collect();

    QueryResult {
        columns,
        rows,
        affected_rows: 0,
        execution_time_ms: 0.0,
        truncated: false,
        total_row_count: None,
    }
}

/// Fetch tables = list collections in the given database.
pub async fn fetch_tables(client: &Client, db_name: &str) -> Result<Vec<TableInfo>, DriverError> {
    let db = client.database(db_name);
    let names = db
        .list_collection_names()
        .await
        .map_err(|e| DriverError::Query(format!("Failed to list collections: {e}")))?;

    Ok(names
        .into_iter()
        .map(|name| TableInfo {
            name,
            schema: Some(db_name.to_string()),
            table_type: "COLLECTION".to_string(),
            row_count_estimate: None,
        })
        .collect())
}
