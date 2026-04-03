use serde::{Deserialize, Serialize};

/// Capabilities advertised by a driver via its sidecar JSON file.
///
/// All fields default to `true` so that existing SQL drivers without a
/// sidecar file behave identically to today.  A future MongoDB driver
/// would set SQL-specific capabilities to `false`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DriverCapabilities {
    /// Can execute raw SQL queries in the editor.
    #[serde(default = "yes")]
    pub supports_sql_editor: bool,

    /// Has schema/namespace hierarchy (e.g. PostgreSQL public/private).
    #[serde(default = "yes")]
    pub supports_schemas: bool,

    /// Has collection-based browsing (e.g. MongoDB).
    #[serde(default)]
    pub supports_collections: bool,

    /// Can CREATE/ALTER/DROP tables via DDL.
    #[serde(default = "yes")]
    pub supports_ddl: bool,

    /// Supports cell-level inline editing in the data grid.
    #[serde(default = "yes")]
    pub supports_inline_edit: bool,

    /// Supports SQL import/export flows.
    #[serde(default = "yes")]
    pub supports_import_export: bool,

    /// Has a relational structure editor (columns, indexes, FKs).
    #[serde(default = "yes")]
    pub supports_structure_view: bool,
}

fn yes() -> bool {
    true
}

impl Default for DriverCapabilities {
    fn default() -> Self {
        Self {
            supports_sql_editor: true,
            supports_schemas: true,
            supports_collections: false,
            supports_ddl: true,
            supports_inline_edit: true,
            supports_import_export: true,
            supports_structure_view: true,
        }
    }
}

/// Top-level shape of a `<driver>.capabilities.json` sidecar file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverCapabilitySidecar {
    pub engine: String,
    pub display_name: String,
    pub capabilities: DriverCapabilities,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_capabilities_are_sql_oriented() {
        let caps = DriverCapabilities::default();
        assert!(caps.supports_sql_editor);
        assert!(caps.supports_schemas);
        assert!(!caps.supports_collections);
        assert!(caps.supports_ddl);
        assert!(caps.supports_inline_edit);
        assert!(caps.supports_import_export);
        assert!(caps.supports_structure_view);
    }

    #[test]
    fn serde_round_trip() {
        let caps = DriverCapabilities {
            supports_sql_editor: true,
            supports_schemas: false,
            supports_collections: true,
            supports_ddl: false,
            supports_inline_edit: true,
            supports_import_export: false,
            supports_structure_view: true,
        };
        let json = serde_json::to_string(&caps).unwrap();
        let deserialized: DriverCapabilities = serde_json::from_str(&json).unwrap();
        assert_eq!(caps, deserialized);
    }

    #[test]
    fn missing_fields_default_to_sql_true() {
        // Simulate a minimal JSON with only one field set
        let json = r#"{"supportsCollections": true}"#;
        let caps: DriverCapabilities = serde_json::from_str(json).unwrap();
        assert!(caps.supports_sql_editor);
        assert!(caps.supports_schemas);
        assert!(caps.supports_collections);
        assert!(caps.supports_ddl);
    }

    #[test]
    fn sidecar_file_round_trip() {
        let sidecar = DriverCapabilitySidecar {
            engine: "postgres".to_string(),
            display_name: "PostgreSQL".to_string(),
            capabilities: DriverCapabilities::default(),
        };
        let json = serde_json::to_string_pretty(&sidecar).unwrap();
        let deserialized: DriverCapabilitySidecar = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.engine, "postgres");
        assert_eq!(deserialized.capabilities, DriverCapabilities::default());
    }
}
