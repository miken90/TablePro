//! MongoDB schema introspection (async): columns by sampling, indexes, databases.

use futures_util::TryStreamExt;
use mongodb::bson::{doc, Bson, Document};
use mongodb::Client;

use driver_common::{ColumnInfo, DriverError, IndexInfo};

use crate::bson_flatten::{bson_type_name, discover_fields};

/// Sample up to 100 documents to discover top-level fields and infer types.
pub async fn fetch_columns(
    client: &Client,
    db_name: &str,
    collection_name: &str,
) -> Result<Vec<ColumnInfo>, DriverError> {
    let db = client.database(db_name);
    let collection = db.collection::<Document>(collection_name);

    let find_opts = mongodb::options::FindOptions::builder().limit(100i64).build();
    let cursor = collection
        .find(doc! {})
        .with_options(find_opts)
        .await
        .map_err(|e| DriverError::Query(format!("Failed to sample collection: {e}")))?;

    let docs: Vec<Document> = cursor
        .try_collect()
        .await
        .map_err(|e| DriverError::Query(format!("Cursor error: {e}")))?;

    if docs.is_empty() {
        return Ok(vec![]);
    }

    let fields = discover_fields(&docs);
    Ok(fields
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
        .collect())
}

/// Fetch indexes for a collection using `listIndexes`.
pub async fn fetch_indexes(
    client: &Client,
    db_name: &str,
    collection_name: &str,
) -> Result<Vec<IndexInfo>, DriverError> {
    let db = client.database(db_name);
    let collection = db.collection::<Document>(collection_name);

    let cursor = collection
        .list_indexes()
        .await
        .map_err(|e| DriverError::Query(format!("Failed to list indexes: {e}")))?;

    let models: Vec<mongodb::IndexModel> = cursor
        .try_collect()
        .await
        .map_err(|e| DriverError::Query(format!("Cursor error: {e}")))?;

    Ok(models
        .into_iter()
        .map(|m| {
            let name = m
                .options
                .as_ref()
                .and_then(|o| o.name.clone())
                .unwrap_or_default();
            let is_unique = m.options.as_ref().and_then(|o| o.unique).unwrap_or(false);
            let columns: Vec<String> = m.keys.keys().map(|k| k.to_string()).collect();
            IndexInfo {
                name,
                columns,
                is_unique,
                index_type: "MONGODB".to_string(),
            }
        })
        .collect())
}

/// List all databases on the server.
pub async fn fetch_databases(client: &Client) -> Result<Vec<String>, DriverError> {
    client
        .list_database_names()
        .await
        .map_err(|e| DriverError::Query(format!("Failed to list databases: {e}")))
}
