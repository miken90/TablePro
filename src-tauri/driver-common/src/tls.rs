//! Process-wide rustls setup shared by the rustls-backed drivers.
//!
//! rustls 0.23 refuses to pick a cryptography backend on its own when more
//! than one is compiled in. This workspace ends up with exactly that: the
//! database drivers (`mysql_async`, `redis`, `mongodb`) enable `aws-lc-rs`,
//! while `reqwest`'s `rustls-tls` feature pulls `hyper-rustls` with `ring`.
//! Without an explicit choice the first TLS connection **panics** inside
//! rustls ("Could not automatically determine the process-level
//! CryptoProvider"), which in a release build (`panic = "abort"`) takes the
//! whole app down instead of surfacing a connection error.
//!
//! Every driver that opens a rustls connection calls
//! [`ensure_crypto_provider`] first. `reqwest` selects its provider
//! explicitly, so it is unaffected by the choice made here.

use std::sync::Once;

static INSTALL: Once = Once::new();

/// Install `aws-lc-rs` as the process-wide rustls crypto provider, once.
///
/// Safe to call from anywhere and as often as needed. If another component
/// already installed a provider, that one stays in place.
pub fn ensure_crypto_provider() {
    INSTALL.call_once(|| {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_is_available_after_ensure() {
        ensure_crypto_provider();
        // Repeat calls must not panic and must leave a provider installed.
        ensure_crypto_provider();
        assert!(
            rustls::crypto::CryptoProvider::get_default().is_some(),
            "no process-level rustls crypto provider installed"
        );
    }
}
