use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::Rng;
use std::env;

pub fn encrypt_value(value: &str) -> Result<String, Box<dyn std::error::Error>> {
    let encryption_key_b64 = env::var("ENCRYPTION_KEY")
        .unwrap_or_else(|_| "EEdmGx2ZTjokTQ8XYm1Dfb1ZiqglEGAAoxguSq+dHW4=".to_string());
    
    let key_bytes = STANDARD.decode(&encryption_key_b64)?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| format!("Invalid key: {}", e))?;

    // Generate random nonce (12 bytes for GCM)
    let mut rng = rand::thread_rng();
    let nonce_bytes: [u8; 12] = rng.gen();
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt
    let ciphertext = cipher.encrypt(nonce, value.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Combine nonce + ciphertext and encode to base64
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    
    Ok(STANDARD.encode(&combined))
}

pub fn decrypt_value(encrypted: &str) -> Result<String, Box<dyn std::error::Error>> {
    let encryption_key_b64 = env::var("ENCRYPTION_KEY")
        .unwrap_or_else(|_| "EEdmGx2ZTjokTQ8XYm1Dfb1ZiqglEGAAoxguSq+dHW4=".to_string());
    
    let key_bytes = STANDARD.decode(&encryption_key_b64)?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| format!("Invalid key: {}", e))?;

    // Decode from base64
    let combined = STANDARD.decode(encrypted)?;

    if combined.len() < 12 {
        return Err("Invalid encrypted data".into());
    }

    // Extract nonce and ciphertext
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    // Decrypt
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;

    Ok(String::from_utf8(plaintext)?)
}
