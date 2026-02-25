use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use chrono::{Duration, Utc};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: i64,
    pub iat: i64,
    pub role: String,
}

const JWT_SECRET: &str = "sis_teknik_jwt_secret_key_2026";
const ADMIN_PASSWORD: &str = "123456";

pub fn generate_token(username: &str, role: &str) -> Result<String, String> {
    let now = Utc::now();
    let expiration = now + Duration::hours(24);
    
    let claims = Claims {
        sub: username.to_string(),
        exp: expiration.timestamp(),
        iat: now.timestamp(),
        role: role.to_string(),
    };
    
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(JWT_SECRET.as_ref()),
    )
    .map_err(|e| format!("Token generation failed: {}", e))
}

pub fn verify_token(token: &str) -> Result<Claims, String> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(JWT_SECRET.as_ref()),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .map_err(|e| format!("Token verification failed: {}", e))
}

pub fn verify_admin_password(password: &str) -> bool {
    password == ADMIN_PASSWORD
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginResponse {
    pub success: bool,
    pub token: Option<String>,
    pub theme_color: Option<String>,
    pub level: Option<String>,
    pub message: String,
}
