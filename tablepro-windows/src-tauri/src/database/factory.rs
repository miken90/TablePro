use crate::models::*;

use super::driver::DatabaseDriver;
use super::mysql::MySqlDriver;
use super::postgres::PostgresDriver;
use super::sqlite::SqliteDriver;

pub fn create_driver(config: ConnectionConfig) -> Box<dyn DatabaseDriver> {
    match config.db_type {
        DatabaseType::Mysql | DatabaseType::Mariadb => Box::new(MySqlDriver::new(config)),
        DatabaseType::Postgresql => Box::new(PostgresDriver::new(config)),
        DatabaseType::Sqlite => Box::new(SqliteDriver::new(config)),
        DatabaseType::Mongodb => {
            // MongoDB not yet implemented
            panic!("MongoDB driver not yet implemented")
        }
    }
}
