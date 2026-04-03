use mongodb::sync::{Client, Database};

/// Internal MongoDB driver state — boxed and cast to *mut DriverHandle.
pub struct MongoDriver {
    pub connection_string: String,
    pub database_name: String,
    pub client: Option<Client>,
}

impl MongoDriver {
    pub fn new(
        host: String,
        port: u16,
        user: String,
        password: String,
        database: String,
        _ssl_mode: String,
    ) -> Result<Box<Self>, String> {
        let connection_string = build_connection_string(&host, port, &user, &password, &database);
        Ok(Box::new(MongoDriver {
            connection_string,
            database_name: database,
            client: None,
        }))
    }

    /// Get the current database handle. Falls back to "admin" if no database specified.
    pub fn current_db(&self) -> Option<Database> {
        let client = self.client.as_ref()?;
        let db_name = if self.database_name.is_empty() {
            "admin"
        } else {
            &self.database_name
        };
        Some(client.database(db_name))
    }
}

/// Build a MongoDB connection string from individual components.
///
/// If the host already looks like a full URI (starts with `mongodb://` or
/// `mongodb+srv://`), use it directly — only appending the database if needed.
fn build_connection_string(
    host: &str,
    port: u16,
    user: &str,
    password: &str,
    database: &str,
) -> String {
    // If the host is already a full connection URI, return it as-is.
    if host.starts_with("mongodb://") || host.starts_with("mongodb+srv://") {
        return host.to_string();
    }

    let mut uri = String::from("mongodb://");

    // Credentials
    if !user.is_empty() {
        uri.push_str(&percent_encode(user));
        if !password.is_empty() {
            uri.push(':');
            uri.push_str(&percent_encode(password));
        }
        uri.push('@');
    }

    // Host and port
    uri.push_str(host);
    if port != 0 {
        uri.push(':');
        uri.push_str(&port.to_string());
    }

    // Database
    uri.push('/');
    if !database.is_empty() {
        uri.push_str(database);
    }

    uri
}

/// Minimal percent-encoding for URI user/password components.
fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}
