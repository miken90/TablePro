//! Static driver registry.
//!
//! All six engine driver crates are compiled in (rlib) and instantiated
//! on demand. Capabilities are loaded from the embedded
//! `driver-capabilities/*.json` sidecar files at build time.

use driver_common::DatabaseDriver as DcDriver;
use tokio::runtime::Handle;

use crate::drivers::adapter::HostDriverAdapter;
use crate::drivers::conv::cfg_to_driver_common;
use crate::models::{
    AppError, ConnectionConfig, DriverCapabilities, DriverCapabilitySidecar,
};
use crate::drivers::{DatabaseDriver, PluginMetadataInfo};

/// Compiled-in engine kinds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DriverKind {
    Postgres,
    MySql,
    Mssql,
    Sqlite,
    MongoDb,
    Redis,
}

impl DriverKind {
    /// Map a host `db_type` string to a `DriverKind`.
    pub fn from_db_type(s: &str) -> Result<Self, AppError> {
        match s.to_lowercase().as_str() {
            "postgres" | "postgresql" => Ok(Self::Postgres),
            "mysql" | "mariadb" => Ok(Self::MySql),
            "mssql" | "sqlserver" => Ok(Self::Mssql),
            "sqlite" => Ok(Self::Sqlite),
            "mongodb" | "mongo" => Ok(Self::MongoDb),
            "redis" => Ok(Self::Redis),
            other => Err(AppError::PluginError(format!(
                "No driver compiled in for db_type '{other}'"
            ))),
        }
    }

    /// Canonical type id reported back to the frontend.
    pub fn type_id(&self) -> &'static str {
        match self {
            Self::Postgres => "postgres",
            Self::MySql => "mysql",
            Self::Mssql => "mssql",
            Self::Sqlite => "sqlite",
            Self::MongoDb => "mongodb",
            Self::Redis => "redis",
        }
    }

    pub fn default_port(&self) -> u16 {
        match self {
            Self::Postgres => 5432,
            Self::MySql => 3306,
            Self::Mssql => 1433,
            Self::Sqlite => 0,
            Self::MongoDb => 27017,
            Self::Redis => 6379,
        }
    }

    pub fn all() -> &'static [DriverKind] {
        &[
            Self::Postgres,
            Self::MySql,
            Self::Mssql,
            Self::Sqlite,
            Self::MongoDb,
            Self::Redis,
        ]
    }
}

// Embedded capability sidecars (parsed once at registry construction).
const CAP_POSTGRES: &str = include_str!("../../driver-capabilities/driver-postgres.capabilities.json");
const CAP_MYSQL: &str = include_str!("../../driver-capabilities/driver-mysql.capabilities.json");
const CAP_MSSQL: &str = include_str!("../../driver-capabilities/driver-mssql.capabilities.json");
const CAP_SQLITE: &str = include_str!("../../driver-capabilities/driver-sqlite.capabilities.json");
const CAP_MONGODB: &str = include_str!("../../driver-capabilities/driver-mongodb.capabilities.json");
const CAP_REDIS: &str = include_str!("../../driver-capabilities/driver-redis.capabilities.json");

/// Every embedded sidecar paired with its engine id, for whole-set assertions.
pub const EMBEDDED_CAPABILITY_SIDECARS: &[(&str, &str)] = &[
    ("postgres", CAP_POSTGRES),
    ("mysql", CAP_MYSQL),
    ("mssql", CAP_MSSQL),
    ("sqlite", CAP_SQLITE),
    ("mongodb", CAP_MONGODB),
    ("redis", CAP_REDIS),
];

fn parse_sidecar(raw: &str, kind: DriverKind) -> DriverCapabilitySidecar {
    serde_json::from_str(raw).unwrap_or_else(|e| {
        tracing::warn!(
            "Failed to parse embedded capabilities for {:?}: {e} — using defaults",
            kind
        );
        DriverCapabilitySidecar {
            engine: kind.type_id().to_string(),
            display_name: default_display_name(kind).to_string(),
            capabilities: DriverCapabilities::default(),
        }
    })
}

fn default_display_name(kind: DriverKind) -> &'static str {
    match kind {
        DriverKind::Postgres => "PostgreSQL",
        DriverKind::MySql => "MySQL",
        DriverKind::Mssql => "Microsoft SQL Server",
        DriverKind::Sqlite => "SQLite",
        DriverKind::MongoDb => "MongoDB",
        DriverKind::Redis => "Redis",
    }
}

fn sidecar_for(kind: DriverKind) -> DriverCapabilitySidecar {
    let raw = match kind {
        DriverKind::Postgres => CAP_POSTGRES,
        DriverKind::MySql => CAP_MYSQL,
        DriverKind::Mssql => CAP_MSSQL,
        DriverKind::Sqlite => CAP_SQLITE,
        DriverKind::MongoDb => CAP_MONGODB,
        DriverKind::Redis => CAP_REDIS,
    };
    parse_sidecar(raw, kind)
}

struct EngineMeta {
    kind: DriverKind,
    info: PluginMetadataInfo,
}

/// Static registry of all compiled-in driver engines.
///
/// Holds the Tokio runtime `Handle` shared with the rest of the app so
/// drivers don't spin up their own runtimes (Validation Q2).
pub struct DriverRegistry {
    rt: Handle,
    engines: Vec<EngineMeta>,
}

impl DriverRegistry {
    /// Build the registry. Must be called from inside the Tokio runtime
    /// (or with an explicit `Handle`) so drivers can share it.
    pub fn new(rt: Handle) -> Self {
        let engines = DriverKind::all()
            .iter()
            .map(|&kind| {
                let sidecar = sidecar_for(kind);
                EngineMeta {
                    kind,
                    info: PluginMetadataInfo {
                        type_id: kind.type_id().to_string(),
                        display_name: sidecar.display_name,
                        default_port: kind.default_port(),
                        capabilities: sidecar.capabilities,
                    },
                }
            })
            .collect();
        Self { rt, engines }
    }

    /// Construct a driver instance for a given db_type + config.
    pub fn create_driver(
        &self,
        type_id: &str,
        config: &ConnectionConfig,
    ) -> Result<Box<dyn DatabaseDriver>, AppError> {
        let kind = DriverKind::from_db_type(type_id)?;
        let dc_cfg = cfg_to_driver_common(config);
        let inner: Box<dyn DcDriver> = match kind {
            DriverKind::Postgres => {
                Box::new(driver_postgres::PostgresDriver::new(self.rt.clone(), dc_cfg))
            }
            DriverKind::MySql => {
                Box::new(driver_mysql::MysqlDriver::new(self.rt.clone(), dc_cfg))
            }
            DriverKind::Mssql => {
                Box::new(driver_mssql::MssqlDriver::new(self.rt.clone(), dc_cfg))
            }
            DriverKind::Sqlite => {
                Box::new(driver_sqlite::SqliteDriver::new(self.rt.clone(), dc_cfg))
            }
            DriverKind::MongoDb => {
                Box::new(driver_mongodb::MongoDriver::new(self.rt.clone(), dc_cfg))
            }
            DriverKind::Redis => {
                Box::new(driver_redis::RedisDriver::new(self.rt.clone(), dc_cfg))
            }
        };
        Ok(Box::new(HostDriverAdapter::new(inner)))
    }

    /// Metadata for all compiled-in engines.
    pub fn list_plugins(&self) -> Vec<PluginMetadataInfo> {
        self.engines.iter().map(|e| e.info.clone()).collect()
    }

    /// Capabilities for a specific engine, or default if unknown.
    pub fn get_capabilities(&self, type_id: &str) -> DriverCapabilities {
        let want = type_id.to_lowercase();
        self.engines
            .iter()
            .find(|e| e.info.type_id == want || matches_alias(e.kind, &want))
            .map(|e| e.info.capabilities.clone())
            .unwrap_or_default()
    }
}

fn matches_alias(kind: DriverKind, db_type: &str) -> bool {
    DriverKind::from_db_type(db_type)
        .map(|k| k == kind)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_db_type_aliases() {
        assert_eq!(DriverKind::from_db_type("postgres").unwrap(), DriverKind::Postgres);
        assert_eq!(DriverKind::from_db_type("postgresql").unwrap(), DriverKind::Postgres);
        assert_eq!(DriverKind::from_db_type("MySQL").unwrap(), DriverKind::MySql);
        assert_eq!(DriverKind::from_db_type("sqlserver").unwrap(), DriverKind::Mssql);
        assert_eq!(DriverKind::from_db_type("mongo").unwrap(), DriverKind::MongoDb);
        assert!(DriverKind::from_db_type("oracle").is_err());
    }

    #[test]
    fn registry_lists_all_engines() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let reg = DriverRegistry::new(rt.handle().clone());
        let list = reg.list_plugins();
        assert_eq!(list.len(), 6);
        let ids: Vec<&str> = list.iter().map(|e| e.type_id.as_str()).collect();
        assert!(ids.contains(&"postgres"));
        assert!(ids.contains(&"mongodb"));
    }

    #[test]
    fn capabilities_lookup_by_alias() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let reg = DriverRegistry::new(rt.handle().clone());
        let pg = reg.get_capabilities("postgresql");
        assert!(pg.supports_sql_editor);
        let mongo = reg.get_capabilities("mongo");
        assert!(mongo.supports_collections);
    }
}
