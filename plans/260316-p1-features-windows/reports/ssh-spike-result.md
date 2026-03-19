# SSH Spike Result

> Date: 2026-03-16

## Build Result — ssh2 (vendored-openssl)

- **Status:** PASS (with prerequisite)
- **Build time:** 344s (5m 43s) — first build compiles OpenSSL from source
- **Prerequisite:** Requires **Strawberry Perl** (`C:\Strawberry\perl\bin`) in PATH. Build fails without it.
- **Errors:** None after adding Strawberry Perl to PATH. Without Perl: `Command 'perl' not found` / `perl reported failure with exit code: 2`

## Build Result — russh (pure Rust alternative)

- **Status:** PASS
- **Build time:** ~21s (first build; 0.2s incremental)
- **Prerequisites:** None — pure Rust, zero C dependencies
- **Errors:** None

## API Validation — ssh2

| API | Compiles |
|-----|----------|
| Session::new() | yes |
| session.set_tcp_stream() | yes |
| session.handshake() | yes |
| session.userauth_password() | yes |
| session.userauth_pubkey_file() | yes |
| session.channel_direct_tcpip() | yes |

## API Validation — russh

| API | Compiles |
|-----|----------|
| client::Config::default() | yes |
| client::connect_stream() | yes |
| session.authenticate_password() | yes |
| session.channel_open_direct_tcpip() | yes |
| Handler::check_server_key() trait | yes |

## Runtime Validation

Both binaries execute correctly when SSH_HOST is not set:
```
SSH spike: compilation successful
ssh2 crate with vendored-openssl linked correctly on Windows MSVC
SSH_HOST not set — skipping live connection test
```

```
russh spike: compilation successful
russh crate (pure Rust) linked correctly on Windows MSVC
SSH_HOST not set — skipping live connection test
```

## Recommendation

**Proceed with `russh` as primary implementation**, with `ssh2` as fallback option.

### Rationale

| Factor | ssh2 | russh |
|--------|------|-------|
| Build time (first) | ~344s | ~21s |
| Build time (incremental) | ~2s | ~0.2s |
| CI/CD impact | High — needs Perl on build agent | None |
| Perl dependency | Required (Strawberry Perl for MSVC) | None |
| Pure Rust | No (C: libssh2 + OpenSSL) | Yes |
| Maintenance | Stable, mature | Active development |
| API style | Synchronous (blocking) | Async/await native |
| tokio integration | Requires spawn_blocking | Native async |
| Windows MSVC compat | Yes (with Perl) | Yes (zero deps) |

### ssh2 risks for CI/CD
- GitHub Actions Windows runners do NOT have Strawberry Perl by default
- Would require `actions/setup-perl` or manual install step in every CI job
- Adds ~6 minutes to clean build times

### russh advantages
- No C FFI, no OpenSSL, no Perl needed anywhere
- Async-native: integrates cleanly with Tauri's tokio runtime
- Faster iteration: 21s vs 344s first build
- Simpler GitHub Actions: just `cargo build` works

## Notes

- Spike crates located at:
  - `tablepro-windows/src-tauri/spike-ssh/` — ssh2 + vendored-openssl
  - `tablepro-windows/src-tauri/spike-russh/` — russh pure Rust
- Both use `[workspace]` in Cargo.toml to stay isolated from the main workspace
- The ssh2 vendored-openssl build downloads `openssl-src v300.5.5+3.5.5` (~3.5MB) and compiles it fully
- If using ssh2 in CI: add `chocolatey install strawberryperl` or `actions/setup-perl@v1` before `cargo build`
- russh v0.45.0 is the pinned version (v0.57.1 is latest but v0.45.0 resolved cleanly)
- Consider upgrading to russh v0.50+ which has improved API ergonomics before production implementation
