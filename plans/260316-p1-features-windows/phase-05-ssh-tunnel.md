# Phase 5 — SSH Tunnel Support

> Est. effort: 4-6 days (single agent — de-risked by Phase 0 spike)
> Dependencies: Phase 0 (SSH spike must pass)
> Risk: MEDIUM (reduced from HIGH after spike validation)

---

## P1-1: SSH Tunnel

### Overview
SSH tunnel support for all database connections. User configures SSH host/port/user/auth in connection form. App establishes local port forward before connecting to database.

### Library: `russh` crate (pure Rust — updated after Phase 0 spike)

> **Spike result:** ssh2 compiles on MSVC but requires Strawberry Perl (344s build). `russh` builds in 21s with zero C deps. Decision: use `russh`.

**Why russh:**
- Pure Rust, no C deps — no Perl/OpenSSL on CI
- Async-native — integrates cleanly with Tauri's tokio runtime (no spawn_blocking)
- 16x faster build (21s vs 344s)
- Supports password, key file auth, direct-tcpip channel forwarding

**Cargo.toml:**
```toml
russh = "0.45"
russh-keys = "0.45"
```

### Architecture

```
┌──────────┐      ┌──────────────┐      ┌───────────────┐      ┌──────────┐
│ App      │      │ SSH Tunnel   │      │ SSH Server    │      │ Database │
│ (driver) │─TCP─→│ localhost:   │─SSH─→│ bastion:22    │─TCP─→│ db:5432  │
│          │      │ {local_port} │      │               │      │          │
└──────────┘      └──────────────┘      └───────────────┘      └──────────┘
```

1. App binds `127.0.0.1:{random_port}` locally
2. SSH session connects to bastion host
3. For each incoming TCP connection, open SSH channel forwarding to `db_host:db_port`
4. Driver connects to `127.0.0.1:{local_port}` instead of remote `db_host:db_port`

### Data Model

**`ConnectionConfig` extension (`models/connection.rs`):**
```rust
pub struct ConnectionConfig {
    // ... existing fields ...
    pub ssh_enabled: bool,
    pub ssh_host: String,
    pub ssh_port: u16,          // default 22
    pub ssh_user: String,
    pub ssh_auth_method: String, // "password" | "key"
    pub ssh_password: String,
    pub ssh_key_path: String,
    pub ssh_key_passphrase: String,
}
```

All SSH fields default to empty/false. Backward compatible — existing connections.json without SSH fields deserialize with defaults.

### Implementation

**New module: `services/ssh_tunnel.rs`**

```rust
pub struct SshTunnel {
    session: ssh2::Session,
    local_port: u16,
    listener_handle: JoinHandle<()>,
}

pub struct SshTunnelManager {
    tunnels: HashMap<String, SshTunnel>, // session_id → tunnel
}

impl SshTunnelManager {
    pub async fn create_tunnel(
        &mut self,
        session_id: &str,
        config: &ConnectionConfig,
    ) -> Result<u16, String> {
        // 1. Resolve SSH host
        // 2. TCP connect to ssh_host:ssh_port
        // 3. Handshake, authenticate
        // 4. Bind local listener on random port
        // 5. Spawn forwarding loop
        // 6. Return local_port
    }

    pub async fn close_tunnel(&mut self, session_id: &str) { ... }
}
```

**Forwarding loop (per connection):**
```rust
// Pseudocode — runs in spawn_blocking
loop {
    let (stream, _) = listener.accept()?;
    let channel = session.channel_direct_tcpip(db_host, db_port, None)?;
    // Spawn bidirectional copy: stream ↔ channel
    std::thread::spawn(move || {
        let mut stream_clone = stream.try_clone().unwrap();
        let mut channel_write = channel; // ssh2::Channel
        // Copy stream → channel and channel → stream concurrently
    });
}
```

**Authentication:**
```rust
match config.ssh_auth_method.as_str() {
    "password" => session.userauth_password(&config.ssh_user, &config.ssh_password)?,
    "key" => {
        let key_path = Path::new(&config.ssh_key_path);
        let passphrase = if config.ssh_key_passphrase.is_empty() {
            None
        } else {
            Some(config.ssh_key_passphrase.as_str())
        };
        session.userauth_pubkey_file(&config.ssh_user, None, key_path, passphrase)?;
    }
    _ => return Err("Unknown SSH auth method".into()),
}
```

**Integration with `ConnectionManager`:**

In `commands/connection.rs` `connect()`:
1. If `config.ssh_enabled`:
   a. Create SSH tunnel → get `local_port`
   b. Override `config.host = "127.0.0.1"`, `config.port = local_port`
   c. Proceed with normal driver connection
2. On disconnect: close tunnel

### Frontend

**Connection Form SSH tab (`components/connection/ConnectionForm.tsx`):**
- Toggle: "Use SSH Tunnel"
- When enabled, show fields: SSH Host, SSH Port (default 22), SSH User
- Auth method selector: Password / Private Key
- Password: SSH Password field
- Key: Key File path (with file picker button) + Passphrase field
- File picker for key: `open({ filters: [{ name: 'SSH Key', extensions: ['pem', 'key'] }], defaultPath: home + '/.ssh/' })`

**Test Connection:** Must test SSH tunnel + DB connection together.

### Files touched
- `src-tauri/Cargo.toml` — add `ssh2`
- `src-tauri/src/models/connection.rs` — SSH fields in `ConnectionConfig`
- `src-tauri/src/services/ssh_tunnel.rs` (new)
- `src-tauri/src/services/mod.rs` — add module
- `src-tauri/src/services/connection_manager.rs` — tunnel create/close integration
- `src-tauri/src/commands/connection.rs` — tunnel in connect/disconnect/test
- `src/types/connection.ts` — SSH fields
- `src/components/connection/ConnectionForm.tsx` — SSH tab

### Edge cases
- SSH connection timeout (5s default)
- SSH server key verification → skip for P1 (like macOS `StrictHostKeyChecking=no`), add known_hosts in P2
- SSH tunnel drops during query → driver gets TCP error, show reconnect message
- Multiple connections through same SSH server → separate tunnels (each with own local port)
- Key file permissions on Windows → not applicable (no chmod requirement)
- Key file format: OpenSSH format + PEM format → ssh2 handles both
- Local port conflict → bind with port 0, OS assigns available port
- Tunnel cleanup on app crash → OS cleans up TCP listeners

### Risk Mitigation

**Phase 0 spike (completed before this phase):**
- ssh2 crate build on MSVC validated
- Password auth + key auth tested
- direct_tcpip channel forwarding verified
- If spike failed → this phase uses `russh` instead (see phase-00-ssh-spike.md)

**Known ssh2 limitations on Windows:**
- SSH agent: `ssh2` supports `SSH_AUTH_SOCK` but Windows uses named pipes for ssh-agent → may not work. Skip agent auth for P1, add in P2.
- `vendored-openssl` builds fine on MSVC (tested in many Rust projects)

### Verification
- Connect to PostgreSQL via SSH tunnel (password auth)
- Connect to MySQL via SSH tunnel (key file auth)
- Test Connection with SSH → success/failure messages
- Disconnect → tunnel closes, local port freed
- Long-running query through tunnel → tunnel stays alive
- SSH server unreachable → clear error message within 5s
