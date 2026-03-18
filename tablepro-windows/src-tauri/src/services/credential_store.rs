use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};

use crate::models::AppError;

const DPAPI_PREFIX: &str = "dpapi:";

pub fn is_encrypted(secret: &str) -> bool {
    secret.starts_with(DPAPI_PREFIX)
}

pub fn encrypt_secret(secret: &str) -> Result<String, AppError> {
    if secret.is_empty() {
        return Ok(String::new());
    }

    if is_encrypted(secret) {
        return Ok(secret.to_string());
    }

    #[cfg(windows)]
    {
        let encrypted =
            windows_dpapi::encrypt_data(secret.as_bytes(), windows_dpapi::Scope::User, None)
                .map_err(|e| AppError::ConfigError(format!("DPAPI encrypt failed: {e}")))?;
        let encoded = BASE64_STANDARD.encode(encrypted);
        Ok(format!("{DPAPI_PREFIX}{encoded}"))
    }

    #[cfg(not(windows))]
    {
        Ok(secret.to_string())
    }
}

pub fn decrypt_secret(secret: &str) -> Result<String, AppError> {
    if secret.is_empty() {
        return Ok(String::new());
    }

    if !is_encrypted(secret) {
        return Ok(secret.to_string());
    }

    let encoded = secret.trim_start_matches(DPAPI_PREFIX);
    let encrypted = BASE64_STANDARD
        .decode(encoded)
        .map_err(|e| AppError::ConfigError(format!("Invalid DPAPI base64 payload: {e}")))?;

    #[cfg(windows)]
    {
        let decrypted = windows_dpapi::decrypt_data(&encrypted, windows_dpapi::Scope::User, None)
            .map_err(|e| AppError::ConfigError(format!("DPAPI decrypt failed: {e}")))?;
        String::from_utf8(decrypted)
            .map_err(|e| AppError::ConfigError(format!("DPAPI payload is not UTF-8 text: {e}")))
    }

    #[cfg(not(windows))]
    {
        String::from_utf8(encrypted)
            .map_err(|e| AppError::ConfigError(format!("DPAPI payload is not UTF-8 text: {e}")))
    }
}

#[cfg(test)]
mod tests {
    use super::{decrypt_secret, encrypt_secret, is_encrypted, DPAPI_PREFIX};

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let plain = "my-secret-password";
        let encrypted = encrypt_secret(plain).expect("encrypt should succeed");

        #[cfg(windows)]
        assert!(encrypted.starts_with(DPAPI_PREFIX));

        #[cfg(not(windows))]
        assert_eq!(encrypted, plain);

        let decrypted = decrypt_secret(&encrypted).expect("decrypt should succeed");
        assert_eq!(decrypted, plain);
    }

    #[test]
    fn test_roundtrip_empty_and_special_chars() {
        let empty = "";
        let empty_encrypted = encrypt_secret(empty).expect("empty encrypt should succeed");
        assert_eq!(empty_encrypted, "");
        let empty_decrypted =
            decrypt_secret(&empty_encrypted).expect("empty decrypt should succeed");
        assert_eq!(empty_decrypted, "");

        let special = "pässw😀rd\n!@#$%^&*()_+-=[]{}|;':\",./<>?`~";
        let encrypted = encrypt_secret(special).expect("special encrypt should succeed");
        let decrypted = decrypt_secret(&encrypted).expect("special decrypt should succeed");
        assert_eq!(decrypted, special);
    }

    #[test]
    fn test_legacy_plaintext_passthrough() {
        let plain = "legacy-plaintext";
        let decrypted = decrypt_secret(plain).expect("plaintext passthrough should succeed");
        assert_eq!(decrypted, plain);
        assert!(!is_encrypted(plain));
    }

    #[test]
    fn test_invalid_base64_payload_errors() {
        let invalid = format!("{DPAPI_PREFIX}not_base64!!");
        let result = decrypt_secret(&invalid);
        assert!(result.is_err());
    }
}
