# Phase 0 — SSH Spike: Validate ssh2 on Windows MSVC

> Est. effort: 1 day
> Runs BEFORE all other phases
> Purpose: De-risk Phase 5 (SSH tunnel) by validating the core library

---

## Objective

Create a minimal Rust binary that:
1. Adds `ssh2 = { version = "0.9", features = ["vendored-openssl"] }` to a test crate
2. Compiles on Windows via MSVC (powershell.exe)
3. Connects to an SSH server (password auth)
4. Connects to an SSH server (key file auth)
5. Opens a `channel_direct_tcpip` for local port forwarding
6. Verifies bidirectional data through the forwarded channel

## Spike Structure

```
src-tauri/spike-ssh/
├── Cargo.toml
└── src/main.rs
```

**NOT added to workspace.** Standalone test crate, deleted after spike.

## Test Script

```rust
// src/main.rs (pseudocode)
fn main() {
    // 1. TCP connect to SSH server
    let tcp = TcpStream::connect("ssh-server:22").unwrap();
    let mut session = ssh2::Session::new().unwrap();
    session.set_tcp_stream(tcp);
    session.handshake().unwrap();

    // 2. Password auth
    session.userauth_password("user", "pass").unwrap();
    assert!(session.authenticated());

    // 3. Direct-tcpip channel (port forward)
    let channel = session.channel_direct_tcpip("db-host", 5432, None).unwrap();
    // Write/read a few bytes to verify channel works
    println!("SSH spike: all tests passed");
}
```

## Go/No-Go Criteria

| Check | Pass | Fail Action |
|-------|------|-------------|
| Compiles on MSVC | Required | Try `russh` crate |
| Password auth works | Required | Check libssh2 version |
| Key file auth works | Required | Check key format support |
| direct_tcpip channel opens | Required | Check firewall/SSH config |
| Build time < 60s | Nice to have | Acceptable if longer |
| No external DLL needed at runtime | Required | `vendored-openssl` must embed |

## Fallback: `russh`

If ssh2 fails, evaluate `russh` (pure Rust, async-native):
```toml
russh = "0.46"
russh-keys = "0.46"
```

**russh pros:** No C deps, async native (no spawn_blocking), ed25519 support.
**russh cons:** Less mature, fewer real-world Windows deployments, API more complex.

## Output

Save spike results to `plans/260316-p1-features-windows/reports/ssh-spike-result.md`:
- Build success/failure + error logs
- Auth test results
- Channel forwarding test results
- Recommendation: proceed with ssh2 or switch to russh
- Build time on Windows
