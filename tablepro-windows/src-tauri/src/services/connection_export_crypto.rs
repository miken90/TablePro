use crate::models::AppError;

const MAGIC: &[u8; 4] = b"TPRO";
const CURRENT_VERSION: u8 = 1;
const SALT_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
const PBKDF2_ITERATIONS: u32 = 600_000;
const HEADER_LEN: usize = 4 + 1 + SALT_LEN + NONCE_LEN; // 49 bytes
const TAG_LEN: usize = 16;

/// Returns true if the data starts with the TPRO magic header.
pub fn is_encrypted(data: &[u8]) -> bool {
    data.len() > HEADER_LEN && data.starts_with(MAGIC)
}

/// Encrypt plaintext bytes with AES-256-GCM + PBKDF2 key derivation.
pub fn encrypt(data: &[u8], passphrase: &str) -> Result<Vec<u8>, AppError> {
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
    use rand::RngCore;

    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);

    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);

    let key = derive_key(passphrase, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AppError::Other(format!("AES init failed: {e}")))?;

    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, data)
        .map_err(|e| AppError::Other(format!("Encryption failed: {e}")))?;

    let mut result = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    result.extend_from_slice(MAGIC);
    result.push(CURRENT_VERSION);
    result.extend_from_slice(&salt);
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext); // ciphertext includes GCM tag appended by aes-gcm
    Ok(result)
}

/// Decrypt TPRO-encrypted data with the given passphrase.
pub fn decrypt(data: &[u8], passphrase: &str) -> Result<Vec<u8>, AppError> {
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};

    if data.len() <= HEADER_LEN + TAG_LEN {
        return Err(AppError::ConfigError(
            "Encrypted file is corrupt or incomplete".to_string(),
        ));
    }
    if !data.starts_with(MAGIC) {
        return Err(AppError::ConfigError(
            "Not a valid encrypted TablePro file".to_string(),
        ));
    }

    let version = data[4];
    if version > CURRENT_VERSION {
        return Err(AppError::ConfigError(format!(
            "Unsupported encryption version {version}"
        )));
    }

    let salt = &data[5..37];
    let nonce_bytes = &data[37..49];
    let ciphertext_and_tag = &data[49..];

    let key = derive_key(passphrase, salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AppError::Other(format!("AES init failed: {e}")))?;

    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext_and_tag)
        .map_err(|_| AppError::ConfigError("Incorrect passphrase".to_string()))
}

fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; KEY_LEN], AppError> {
    use pbkdf2::pbkdf2_hmac;
    use sha2::Sha256;

    let mut key = [0u8; KEY_LEN];
    pbkdf2_hmac::<Sha256>(passphrase.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_round_trip() {
        let plaintext = b"Hello, TablePro!";
        let passphrase = "test-passphrase-123";

        let encrypted = encrypt(plaintext, passphrase).unwrap();
        assert!(is_encrypted(&encrypted));
        assert!(encrypted.len() > HEADER_LEN);

        let decrypted = decrypt(&encrypted, passphrase).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_wrong_passphrase_fails() {
        let plaintext = b"secret data";
        let encrypted = encrypt(plaintext, "correct").unwrap();
        let result = decrypt(&encrypted, "wrong");
        assert!(result.is_err());
    }

    #[test]
    fn test_is_encrypted_false_for_json() {
        let json = b"{\"formatVersion\": 1}";
        assert!(!is_encrypted(json));
    }

    #[test]
    fn test_decrypt_corrupt_data() {
        let result = decrypt(b"TPRO\x01short", "pass");
        assert!(result.is_err());
    }

    #[test]
    fn test_encrypt_large_payload() {
        let plaintext = vec![42u8; 100_000];
        let encrypted = encrypt(&plaintext, "bigpass").unwrap();
        let decrypted = decrypt(&encrypted, "bigpass").unwrap();
        assert_eq!(decrypted, plaintext);
    }
}
