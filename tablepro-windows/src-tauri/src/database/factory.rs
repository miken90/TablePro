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

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config(db_type: DatabaseType) -> ConnectionConfig {
        ConnectionConfig {
            id: "test".to_string(),
            name: "Test".to_string(),
            host: "localhost".to_string(),
            port: db_type.default_port(),
            database: "testdb".to_string(),
            username: "user".to_string(),
            db_type,
            ssl_config: SslConfig::default(),
            ssh_config: SshConfig::default(),
            is_read_only: false,
            color: None,
        }
    }

    #[test]
    fn create_driver_mysql() {
        let driver = create_driver(test_config(DatabaseType::Mysql));
        assert_eq!(driver.db_type(), &DatabaseType::Mysql);
    }

    #[test]
    fn create_driver_mariadb() {
        let driver = create_driver(test_config(DatabaseType::Mariadb));
        assert_eq!(driver.db_type(), &DatabaseType::Mariadb);
    }

    #[test]
    fn create_driver_postgresql() {
        let driver = create_driver(test_config(DatabaseType::Postgresql));
        assert_eq!(driver.db_type(), &DatabaseType::Postgresql);
    }

    #[test]
    fn create_driver_sqlite() {
        let driver = create_driver(test_config(DatabaseType::Sqlite));
        assert_eq!(driver.db_type(), &DatabaseType::Sqlite);
    }

    #[test]
    #[should_panic(expected = "MongoDB driver not yet implemented")]
    fn create_driver_mongodb_panics() {
        create_driver(test_config(DatabaseType::Mongodb));
    }
}
