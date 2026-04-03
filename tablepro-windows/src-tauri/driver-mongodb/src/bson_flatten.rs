use mongodb::bson::{Bson, Document};

/// Flatten top-level BSON fields into string values for tabular display.
/// Nested objects and arrays are serialized as JSON strings.
/// ObjectId, DateTime, etc. are converted to their string representations.
pub fn bson_value_to_string(value: &Bson) -> Option<String> {
    match value {
        Bson::Null => None,
        Bson::String(s) => Some(s.clone()),
        Bson::Int32(n) => Some(n.to_string()),
        Bson::Int64(n) => Some(n.to_string()),
        Bson::Double(f) => Some(f.to_string()),
        Bson::Boolean(b) => Some(b.to_string()),
        Bson::ObjectId(oid) => Some(oid.to_hex()),
        Bson::DateTime(dt) => Some(dt.try_to_rfc3339_string().unwrap_or_else(|_| format!("{:?}", dt))),
        Bson::Timestamp(ts) => Some(format!("Timestamp({}, {})", ts.time, ts.increment)),
        Bson::Binary(bin) => Some(format!("Binary({} bytes)", bin.bytes.len())),
        Bson::RegularExpression(re) => Some(format!("/{}/{}", re.pattern, re.options)),
        Bson::Decimal128(d) => Some(d.to_string()),
        // Nested documents and arrays → JSON string
        Bson::Document(_) | Bson::Array(_) => {
            serde_json::to_string(value).ok()
        }
        // Catch-all for other BSON types
        _ => Some(format!("{:?}", value)),
    }
}

/// Discover all unique top-level field names from a set of documents,
/// preserving insertion order (first-seen order).
pub fn discover_fields(docs: &[Document]) -> Vec<String> {
    let mut fields: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for doc in docs {
        for key in doc.keys() {
            if seen.insert(key.clone()) {
                fields.push(key.clone());
            }
        }
    }

    fields
}

/// Infer a simple type name for a BSON value (for column metadata).
pub fn bson_type_name(value: &Bson) -> &'static str {
    match value {
        Bson::Null => "null",
        Bson::String(_) => "string",
        Bson::Int32(_) => "int32",
        Bson::Int64(_) => "int64",
        Bson::Double(_) => "double",
        Bson::Boolean(_) => "boolean",
        Bson::ObjectId(_) => "objectId",
        Bson::DateTime(_) => "date",
        Bson::Timestamp(_) => "timestamp",
        Bson::Binary(_) => "binary",
        Bson::RegularExpression(_) => "regex",
        Bson::Decimal128(_) => "decimal128",
        Bson::Document(_) => "object",
        Bson::Array(_) => "array",
        _ => "unknown",
    }
}
