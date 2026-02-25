use axum::{
    extract::{Path, State, Json},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use mongodb::Database;
use mongodb::bson::{oid::ObjectId, doc, DateTime, Document};
use rand::Rng;
use serde::{Deserialize, Serialize, Deserializer};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;

use crate::models::{MusteriKabul, CreateMusteriKabulRequest, MusteriKabulResponse, status_id_to_string, status_string_to_id, status_id_aliases};
use crate::crypto::{encrypt_value, decrypt_value};
use crate::sms::{send_sms, build_sms_message, build_montaj_ariza_sms_message, build_robot_kurulum_sms_message, build_tv_kurulum_sms_message, build_status_sms_message};
use crate::auth::{LoginRequest, LoginResponse, generate_token, verify_admin_password};
use crate::sms_queue::enqueue_status_sms;

const DELETE_OTP_PHONE_1: &str = "05300735686";
const DELETE_OTP_EXPIRE_MINUTES: i64 = 10;

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    #[serde(default)]
    pub ad_soyad: String,
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub theme_color: Option<String>,
    #[serde(default, deserialize_with = "deserialize_user_level")]
    pub level: Option<String>,
    pub created_at: Option<DateTime>,
}

fn deserialize_user_level<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;

    let normalized = match value {
        None => None,
        Some(serde_json::Value::String(text)) => normalize_user_level(&text).map(|v| v.to_string()),
        Some(serde_json::Value::Number(number)) => number
            .as_i64()
            .and_then(|n| normalize_user_level(&n.to_string()))
            .map(|v| v.to_string()),
        _ => None,
    };

    Ok(normalized)
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub ad_soyad: String,
    pub username: String,
    pub password: String,
    pub level: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserListItem {
    pub id: String,
    pub ad_soyad: String,
    pub username: String,
    pub theme_color: Option<String>,
    pub level: String,
    pub level_label: String,
    pub created_at_ms: i64,
    pub is_root: bool,
    pub can_delete: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub ad_soyad: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub theme_color: Option<String>,
    pub level: Option<String>,
}

fn normalize_user_level(value: &str) -> Option<&'static str> {
    let normalized = value.trim().to_lowercase().replace(' ', "");
    match normalized.as_str() {
        "level1" | "1" | "admin" => Some("level1"),
        "level2" | "2" | "teknisyen" | "teknisyenler" => Some("level2"),
        "level3" | "3" | "montaj" | "montajekibi" => Some("level3"),
        _ => None,
    }
}

fn level_to_label(level: &str) -> &'static str {
    match level {
        "level1" => "Admin",
        "level2" => "Teknisyen",
        "level3" => "Montaj Ekibi",
        _ => "Teknisyen",
    }
}

fn level_to_auth_role(level: &str) -> &'static str {
    match level {
        "level1" => "admin",
        "level2" => "teknisyen",
        "level3" => "montaj_ekibi",
        _ => "teknisyen",
    }
}

fn effective_user_level(username: &str, level: Option<&str>) -> String {
    if username == "admin" {
        return "level1".to_string();
    }

    level
        .and_then(normalize_user_level)
        .unwrap_or("level2")
        .to_string()
}

#[derive(Debug, Deserialize)]
pub struct PublicFaturaUploadRequest {
    pub belge_f: String,
    pub turnstile_token: String,
}

#[derive(Debug, Deserialize)]
struct TurnstileVerifyResponse {
    success: bool,
}

#[derive(Debug, Serialize)]
pub struct SystemSyncResponse {
    pub fingerprint: String,
    pub musteri_total: u64,
    pub users_total: u64,
    pub latest_musteri_id: Option<String>,
    pub latest_user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDeleteOtpRequest {
    pub action: String,
    pub resource_id: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateMontajRequest {
    pub rnu_is_emri_no: Option<String>,
    pub ad_soyad: String,
    pub model: String,
    pub telefon: String,
    pub adres: Option<String>,
    pub servis_tipi: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMontajRequest {
    pub rnu_is_emri_no: Option<String>,
    pub ad_soyad: Option<String>,
    pub model: Option<String>,
    pub telefon: Option<String>,
    pub adres: Option<String>,
    pub servis_tipi: Option<String>,
    pub atanan_kullanici_username: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CloseMontajRequest {
    pub kurulum_tipi: String,
    pub resimler: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateDeleteOtpResponse {
    pub request_id: String,
    pub expires_in_seconds: i64,
}

async fn latest_doc_id_hex(collection: &mongodb::Collection<Document>) -> Result<Option<String>, (StatusCode, String)> {
    let mut cursor = collection
        .find(doc! {})
        .sort(doc! { "_id": -1 })
        .limit(1)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    if cursor.advance().await.unwrap_or(false) {
        let current = cursor.current();
        if let Ok(object_id) = current.get_object_id("_id") {
            return Ok(Some(object_id.to_hex()));
        }
    }

    Ok(None)
}

pub async fn get_system_sync(
    State(state): State<AppState>,
) -> Result<Json<SystemSyncResponse>, (StatusCode, String)> {
    let musteri_collection = state.db.collection::<Document>("musteri_kabul");
    let users_collection = state.db.collection::<Document>("users");

    let musteri_total = musteri_collection
        .count_documents(doc! {})
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    let users_total = users_collection
        .count_documents(doc! {})
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    let latest_musteri_id = latest_doc_id_hex(&musteri_collection).await?;
    let latest_user_id = latest_doc_id_hex(&users_collection).await?;

    let fingerprint = format!(
        "m:{}:{}|u:{}:{}",
        musteri_total,
        latest_musteri_id.as_deref().unwrap_or("-"),
        users_total,
        latest_user_id.as_deref().unwrap_or("-")
    );

    Ok(Json(SystemSyncResponse {
        fingerprint,
        musteri_total,
        users_total,
        latest_musteri_id,
        latest_user_id,
    }))
}

fn is_localhost_url(value: &str) -> bool {
    let lower = value.to_lowercase();
    lower.contains("localhost") || lower.contains("127.0.0.1")
}

fn header_value(headers: &HeaderMap, key: &str) -> Option<String> {
    headers
        .get(key)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.split(',').next().unwrap_or(v).trim().to_string())
        .filter(|v| !v.is_empty())
}

fn resolve_frontend_url(headers: &HeaderMap) -> String {
    let env_frontend = std::env::var("FRONTEND_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

    let forwarded_host = header_value(headers, "x-forwarded-host");
    let host = forwarded_host.or_else(|| header_value(headers, "host"));
    let proto = header_value(headers, "x-forwarded-proto").unwrap_or_else(|| "https".to_string());

    if let Some(host_value) = host {
        let request_based = format!("{}://{}", proto, host_value);
        if env_frontend.as_deref().map(is_localhost_url).unwrap_or(true) {
            return request_based;
        }
    }

    env_frontend.unwrap_or_else(|| "http://localhost:5173".to_string())
}

fn extract_client_ip(headers: &HeaderMap) -> Option<String> {
    header_value(headers, "cf-connecting-ip")
        .or_else(|| header_value(headers, "x-forwarded-for").map(|v| v.split(',').next().unwrap_or("").trim().to_string()))
        .filter(|v| !v.is_empty())
}

async fn verify_turnstile_token(token: &str, remote_ip: Option<String>) -> Result<bool, String> {
    let secret = std::env::var("TURNSTILE_SECRET_KEY")
        .or_else(|_| std::env::var("CLOUDFLARE_TURNSTILE_SECRET_KEY"))
        .map_err(|_| "Turnstile secret key tanımlı değil".to_string())?;

    let client = reqwest::Client::new();
    let mut form_data = vec![
        ("secret".to_string(), secret),
        ("response".to_string(), token.to_string()),
    ];

    if let Some(ip) = remote_ip {
        form_data.push(("remoteip".to_string(), ip));
    }

    let response = client
        .post("https://challenges.cloudflare.com/turnstile/v0/siteverify")
        .form(&form_data)
        .send()
        .await
        .map_err(|e| format!("Turnstile doğrulama isteği başarısız: {}", e))?;

    let parsed = response
        .json::<TurnstileVerifyResponse>()
        .await
        .map_err(|e| format!("Turnstile yanıtı okunamadı: {}", e))?;

    Ok(parsed.success)
}

pub async fn upload_fatura_public(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(req): Json<PublicFaturaUploadRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    if req.belge_f.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Fatura görseli boş olamaz".to_string()));
    }

    if req.turnstile_token.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Captcha doğrulaması gerekli".to_string()));
    }

    let is_valid_captcha = verify_turnstile_token(&req.turnstile_token, extract_client_ip(&headers))
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e))?;

    if !is_valid_captcha {
        return Err((StatusCode::UNAUTHORIZED, "Captcha doğrulaması başarısız".to_string()));
    }

    let object_id = ObjectId::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid ID format".to_string()))?;

    // First, try to find in montaj_kayitlari
    let montaj_collection = state.db.collection::<Document>("montaj_kayitlari");
    let montaj_result = montaj_collection
        .update_one(
            doc! { "_id": object_id },
            doc! {
                "$set": {
                    "belge_f": req.belge_f.clone(),
                    "updated_at": chrono::Utc::now().to_rfc3339(),
                }
            },
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    if montaj_result.matched_count > 0 {
        return Ok(StatusCode::NO_CONTENT);
    }

    // If not found in montaj_kayitlari, try musteri_kabul
    let collection = state.db.collection::<MusteriKabul>("musteri_kabul");
    let result = collection
        .update_one(
            doc! { "_id": object_id },
            doc! {
                "$set": {
                    "belge_f": req.belge_f,
                    "updated_at": chrono::Utc::now().to_rfc3339(),
                }
            },
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    if result.matched_count == 0 {
        return Err((StatusCode::NOT_FOUND, "Montaj kaydı veya müşteri bulunamadı".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

fn normalize_delete_action(action: &str) -> Option<&'static str> {
    let normalized = action.trim().to_lowercase();
    match normalized.as_str() {
        "musteri" | "customer" => Some("musteri"),
        "user" | "kullanici" => Some("user"),
        _ => None,
    }
}

fn normalize_service_type(value: &str) -> String {
    value
        .trim()
        .to_uppercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect::<String>()
}

fn detect_montaj_service_type(servis_tipi: Option<&str>, fallback_text: Option<&str>) -> Option<String> {
    let candidates = [servis_tipi, fallback_text];

    for candidate in candidates.into_iter().flatten() {
        let normalized = normalize_service_type(candidate);
        if normalized == "TV_KURULUM"
            || normalized == "TV_MONTAJ"
            || normalized == "ROBOT_KURULUM"
            || normalized == "TVKURULUM"
            || normalized == "TVMONTAJ"
            || normalized == "ROBOTKURULUM"
            || normalized == "TV_ARIZA"
            || normalized == "ROBOT_ARIZA"
            || normalized == "TVARIZA"
            || normalized == "ROBOTARIZA"
        {
            return Some(normalized);
        }
    }

    None
}

fn generate_otp_code() -> String {
    let mut rng = rand::thread_rng();
    let code: u32 = rng.gen_range(100000..=999999);
    format!("{:06}", code)
}

async fn verify_delete_otp(
    state: &AppState,
    headers: &HeaderMap,
    action: &str,
    resource_id: &str,
) -> Result<(), (StatusCode, String)> {
    let request_id = header_value(headers, "x-delete-otp-id")
        .ok_or((StatusCode::UNAUTHORIZED, "OTP isteği bulunamadı".to_string()))?;

    let code_1 = header_value(headers, "x-delete-otp-code-1")
        .ok_or((StatusCode::UNAUTHORIZED, "OTP kodu eksik".to_string()))?;

    let otp_id = ObjectId::parse_str(&request_id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Geçersiz OTP request id".to_string()))?;

    let otp_collection = state.db.collection::<Document>("delete_otp_requests");
    let otp_doc = otp_collection
        .find_one(doc! {
            "_id": otp_id,
            "action": action,
            "resource_id": resource_id,
            "used": false,
        })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
        .ok_or((StatusCode::UNAUTHORIZED, "OTP doğrulama kaydı bulunamadı".to_string()))?;

    let expires_at = otp_doc
        .get_datetime("expires_at")
        .map_err(|_| (StatusCode::UNAUTHORIZED, "OTP süresi dolmuş".to_string()))?;

    if *expires_at < DateTime::now() {
        return Err((StatusCode::UNAUTHORIZED, "OTP süresi dolmuş".to_string()));
    }

    let expected_code_1 = otp_doc
        .get_str("code_1")
        .map_err(|_| (StatusCode::UNAUTHORIZED, "OTP kodları bulunamadı".to_string()))?;

    if code_1 != expected_code_1 {
        return Err((StatusCode::UNAUTHORIZED, "OTP kodu hatalı".to_string()));
    }

    otp_collection
        .update_one(
            doc! { "_id": otp_id },
            doc! {
                "$set": {
                    "used": true,
                    "verified_at": DateTime::now(),
                }
            },
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    Ok(())
}

pub async fn create_delete_otp(
    State(state): State<AppState>,
    Json(req): Json<CreateDeleteOtpRequest>,
) -> Result<Json<CreateDeleteOtpResponse>, (StatusCode, String)> {
    let action = normalize_delete_action(&req.action)
        .ok_or((StatusCode::BAD_REQUEST, "Geçersiz silme aksiyonu".to_string()))?;

    ObjectId::parse_str(&req.resource_id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Geçersiz kayıt id".to_string()))?;

    let code_1 = generate_otp_code();
    let sms_1 = format!(
        "SIS Teknik silme onay kodunuz: {}. Bu kod 10 dakika geçerlidir.",
        code_1
    );

    send_sms(DELETE_OTP_PHONE_1, &sms_1)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("1. numaraya OTP gönderilemedi: {}", e)))?;

    let otp_id = ObjectId::new();
    let expires_at = DateTime::from_millis(
        (chrono::Utc::now() + chrono::Duration::minutes(DELETE_OTP_EXPIRE_MINUTES)).timestamp_millis(),
    );

    let otp_collection = state.db.collection::<Document>("delete_otp_requests");
    otp_collection
        .insert_one(doc! {
            "_id": otp_id,
            "action": action,
            "resource_id": req.resource_id,
            "code_1": code_1,
            "used": false,
            "created_at": DateTime::now(),
            "expires_at": expires_at,
        })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    Ok(Json(CreateDeleteOtpResponse {
        request_id: otp_id.to_hex(),
        expires_in_seconds: DELETE_OTP_EXPIRE_MINUTES * 60,
    }))
}

pub async fn create_montaj_kayit(
    State(state): State<AppState>,
    Json(req): Json<CreateMontajRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)> {
    let ad_soyad = req.ad_soyad.trim();
    let model = req.model.trim();
    let telefon = req.telefon.trim();
    let servis_tipi = req.servis_tipi.trim();

    if ad_soyad.is_empty() || model.is_empty() || telefon.is_empty() || servis_tipi.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Ad Soyad, Model, Telefon ve Servis Tipi zorunludur".to_string()));
    }

    let collection = state.db.collection::<Document>("montaj_kayitlari");

    let now = chrono::Utc::now().to_rfc3339();
    let doc = doc! {
        "rnu_is_emri_no": req.rnu_is_emri_no.unwrap_or_default().trim().to_uppercase(),
        "ad_soyad": ad_soyad.to_uppercase(),
        "model": model.to_uppercase(),
        "telefon": telefon.to_string(),
        "adres": req.adres.unwrap_or_default().trim().to_string(),
        "servis_tipi": servis_tipi.to_uppercase(),
        "created_at": now.clone(),
        "updated_at": now,
    };

    let result = collection
        .insert_one(doc)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    let id = result
        .inserted_id
        .as_object_id()
        .map(|oid| oid.to_hex())
        .unwrap_or_default();

    // Send SMS notification about montaj record creation
    let fatura_link = format!("https://tamir.sis-teknik.com.tr/fatura/{}", id);
    
    let sms_message = match servis_tipi.to_lowercase().as_str() {
        "tv kurulum" | "tv" => {
            format!(
                "SN : {}\nTV KURULUM KAYDI ALINDI.\nFATURA: {}\nFATURA YUKLENMEDEN HIZMET VERILMEZ.",
                ad_soyad, fatura_link
            )
        },
        "robot kurulum" | "robot" => {
            format!(
                "SN : {}\nROBOT KURULUM KAYDI ALINDI.\nFATURA: {}\nFATURA YUKLENMEDEN HIZMET VERILMEZ.",
                ad_soyad, fatura_link
            )
        },
        _ => {
            // Default for other servis_tipi values
            format!(
                "SN : {}\nMONTAJ KAYDI ALINDI.\nCİHAZ: {}\nFATURA: {}\nFATURA YUKLENMEDEN HIZMET VERILMEZ.",
                ad_soyad, model, fatura_link
            )
        }
    };
    
    match send_sms(telefon, &sms_message).await {
        Ok(response) => {
            println!("✅ SMS gönderildi - Montaj Kaydı: {}, Response: {:?}", id, response);
        }
        Err(e) => {
            println!("⚠️ SMS gönderilemedi - Montaj Kaydı: {}, Error: {}", id, e);
            // Don't fail the whole operation if SMS fails
        }
    }

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "success": true,
            "id": id,
            "message": "Montaj kaydı oluşturuldu"
        })),
    ))
}

pub async fn list_montaj_kayitlari(
    State(state): State<AppState>,
) -> Result<Json<Vec<serde_json::Value>>, (StatusCode, String)> {
    let collection = state.db.collection::<Document>("montaj_kayitlari");

    let mut cursor = collection
        .find(doc! {})
        .sort(doc! { "_id": -1 })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    let mut results = Vec::new();
    while cursor
        .advance()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Cursor error: {}", e)))?
    {
        let current: Document = cursor
            .deserialize_current()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Deserialize error: {}", e)))?;

        let id = current
            .get_object_id("_id")
            .ok()
            .map(|v| v.to_hex())
            .unwrap_or_default();

        results.push(serde_json::json!({
            "id": id,
            "rnu_is_emri_no": current.get_str("rnu_is_emri_no").ok().unwrap_or(""),
            "ad_soyad": current.get_str("ad_soyad").ok().unwrap_or(""),
            "model": current.get_str("model").ok().unwrap_or(""),
            "telefon": current.get_str("telefon").ok().unwrap_or(""),
            "adres": current.get_str("adres").ok().unwrap_or(""),
            "servis_tipi": current.get_str("servis_tipi").ok().unwrap_or(""),
            "atanan_kullanici_username": current.get_str("atanan_kullanici_username").ok().unwrap_or(""),
            "kapatildi": current.get_bool("kapatildi").ok().unwrap_or(false),
            "belge_f": current.get_str("belge_f").ok().map(|s| !s.is_empty()).unwrap_or(false),
            "created_at": current.get_str("created_at").ok().unwrap_or(""),
        }));
    }

    Ok(Json(results))
}

pub async fn update_montaj_kayit(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateMontajRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let object_id = ObjectId::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid ID format".to_string()))?;

    let collection = state.db.collection::<Document>("montaj_kayitlari");
    let users_collection = state.db.collection::<Document>("users");
    let mut update_doc = doc! {};

    if let Some(value) = req.rnu_is_emri_no {
        update_doc.insert("rnu_is_emri_no", value.trim().to_uppercase());
    }

    if let Some(value) = req.ad_soyad {
        let cleaned = value.trim().to_uppercase();
        if cleaned.is_empty() {
            return Err((StatusCode::BAD_REQUEST, "Ad Soyad boş olamaz".to_string()));
        }
        update_doc.insert("ad_soyad", cleaned);
    }

    if let Some(value) = req.model {
        let cleaned = value.trim().to_uppercase();
        if cleaned.is_empty() {
            return Err((StatusCode::BAD_REQUEST, "Model boş olamaz".to_string()));
        }
        update_doc.insert("model", cleaned);
    }

    if let Some(value) = req.telefon {
        let cleaned = value.trim().to_string();
        if cleaned.is_empty() {
            return Err((StatusCode::BAD_REQUEST, "Telefon boş olamaz".to_string()));
        }
        update_doc.insert("telefon", cleaned);
    }

    if let Some(value) = req.adres {
        update_doc.insert("adres", value.trim().to_string());
    }

    if let Some(value) = req.servis_tipi {
        let cleaned = value.trim().to_uppercase();
        if cleaned.is_empty() {
            return Err((StatusCode::BAD_REQUEST, "Servis Tipi boş olamaz".to_string()));
        }
        update_doc.insert("servis_tipi", cleaned);
    }

    if let Some(value) = req.atanan_kullanici_username {
        let cleaned = value.trim().to_lowercase();

        if cleaned.is_empty() {
            update_doc.insert("atanan_kullanici_username", "");
        } else {
            let assigned_user = users_collection
                .find_one(doc! { "username": &cleaned, "level": "level3" })
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

            if assigned_user.is_none() {
                return Err((StatusCode::BAD_REQUEST, "Atanacak kullanıcı level3 olmalı".to_string()));
            }

            update_doc.insert("atanan_kullanici_username", cleaned);
        }
    }

    if update_doc.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Güncellenecek alan yok".to_string()));
    }

    update_doc.insert("updated_at", chrono::Utc::now().to_rfc3339());

    let result = collection
        .update_one(doc! { "_id": object_id }, doc! { "$set": update_doc })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    if result.matched_count == 0 {
        return Err((StatusCode::NOT_FOUND, "Montaj kaydı bulunamadı".to_string()));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Montaj kaydı güncellendi"
    })))
}

pub async fn get_montaj_kayit(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let object_id = ObjectId::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid ID format".to_string()))?;

    let collection = state.db.collection::<Document>("montaj_kayitlari");

    let doc = collection
        .find_one(doc! { "_id": object_id })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Montaj kaydı bulunamadı".to_string()))?;

    let result = serde_json::json!({
        "id": id,
        "rnu_is_emri_no": doc.get_str("rnu_is_emri_no").ok().unwrap_or(""),
        "ad_soyad": doc.get_str("ad_soyad").ok().unwrap_or(""),
        "model": doc.get_str("model").ok().unwrap_or(""),
        "telefon": doc.get_str("telefon").ok().unwrap_or(""),
        "adres": doc.get_str("adres").ok().unwrap_or(""),
        "servis_tipi": doc.get_str("servis_tipi").ok().unwrap_or(""),
        "atanan_kullanici_username": doc.get_str("atanan_kullanici_username").ok().unwrap_or(""),
        "kapatildi": doc.get_bool("kapatildi").ok().unwrap_or(false),
        "belge_f": doc.get_str("belge_f").ok().unwrap_or(""),
        "created_at": doc.get_str("created_at").ok().unwrap_or(""),
    });

    Ok(Json(result))
}

pub async fn delete_montaj_kayit(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let object_id = ObjectId::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid ID format".to_string()))?;

    let collection = state.db.collection::<Document>("montaj_kayitlari");

    let result = collection
        .delete_one(doc! { "_id": object_id })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    if result.deleted_count == 0 {
        return Err((StatusCode::NOT_FOUND, "Montaj kaydı bulunamadı".to_string()));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Montaj kaydı silindi"
    })))
}

pub async fn close_montaj_kayit(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<CloseMontajRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let object_id = ObjectId::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid ID format".to_string()))?;

    let kurulum_tipi = req.kurulum_tipi.trim().to_uppercase();
    if kurulum_tipi != "DUVAR" && kurulum_tipi != "SEHPA" {
        return Err((StatusCode::BAD_REQUEST, "Kurulum tipi DUVAR veya SEHPA olmalıdır".to_string()));
    }

    if req.resimler.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "En az bir resim yüklenmelidir".to_string()));
    }

    let images: Vec<String> = req
        .resimler
        .into_iter()
        .map(|img| img.trim().to_string())
        .filter(|img| !img.is_empty())
        .collect();

    if images.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Geçerli resim bulunamadı".to_string()));
    }

    let collection = state.db.collection::<Document>("montaj_kayitlari");

    let result = collection
        .update_one(
            doc! { "_id": object_id },
            doc! {
                "$set": {
                    "kapatildi": true,
                    "kapatildi_at": chrono::Utc::now().to_rfc3339(),
                    "kurulum_tipi": kurulum_tipi,
                    "kurulum_resimleri": images,
                    "updated_at": chrono::Utc::now().to_rfc3339(),
                }
            },
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    if result.matched_count == 0 {
        return Err((StatusCode::NOT_FOUND, "Montaj kaydı bulunamadı".to_string()));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Montaj kaydı kapatıldı"
    })))
}

fn sanitize_zip_name(value: &str) -> String {
    let normalized = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect::<String>();

    let trimmed = normalized.trim_matches('_').to_string();
    if trimmed.is_empty() {
        "kayit".to_string()
    } else {
        trimmed
    }
}

fn decode_data_url_image(payload: &str) -> Result<Vec<u8>, String> {
    let content = payload.trim();
    if content.is_empty() {
        return Err("Boş dosya içeriği".to_string());
    }

    let encoded = if let Some(idx) = content.find(",") {
        &content[(idx + 1)..]
    } else {
        content
    };

    BASE64_STANDARD
        .decode(encoded)
        .map_err(|_| "Base64 görsel decode edilemedi".to_string())
}

pub async fn download_montaj_files_zip(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, (StatusCode, String)> {
    let object_id = ObjectId::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid ID format".to_string()))?;

    let collection = state.db.collection::<Document>("montaj_kayitlari");
    let doc = collection
        .find_one(doc! { "_id": object_id })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
        .ok_or((StatusCode::NOT_FOUND, "Montaj kaydı bulunamadı".to_string()))?;

    let ad_soyad = doc.get_str("ad_soyad").ok().unwrap_or("kayit");
    let images_bson = doc.get_array("kurulum_resimleri")
        .map_err(|_| (StatusCode::BAD_REQUEST, "Bu kayıtta indirilecek dosya yok".to_string()))?;

    if images_bson.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Bu kayıtta indirilecek dosya yok".to_string()));
    }

    let mut zip_buffer = Cursor::new(Vec::<u8>::new());
    let mut zip_writer = zip::ZipWriter::new(&mut zip_buffer);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut added_count = 0usize;

    for (index, image_value) in images_bson.iter().enumerate() {
        let image_text = match image_value.as_str() {
            Some(v) => v,
            None => continue,
        };

        let bytes = match decode_data_url_image(image_text) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let entry_name = format!("{}_{}.jpg", sanitize_zip_name(ad_soyad), index + 1);
        zip_writer
            .start_file(entry_name, options)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("ZIP oluşturulamadı: {}", e)))?;
        zip_writer
            .write_all(&bytes)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("ZIP yazımı başarısız: {}", e)))?;

        added_count += 1;
    }

    if added_count == 0 {
        return Err((StatusCode::BAD_REQUEST, "Dosyalar okunamadı".to_string()));
    }

    zip_writer
        .finish()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("ZIP finalize başarısız: {}", e)))?;

    let zip_bytes = zip_buffer.into_inner();
    let filename = format!("xx_{}_.zip", sanitize_zip_name(ad_soyad));
    let content_disposition = HeaderValue::from_str(&format!("attachment; filename=\"{}\"", filename))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Header oluşturulamadı".to_string()))?;

    Ok((
        [
            (header::CONTENT_TYPE, HeaderValue::from_static("application/zip")),
            (header::CONTENT_DISPOSITION, content_disposition),
        ],
        zip_bytes,
    ).into_response())
}

pub async fn create_musteri_kabul(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CreateMusteriKabulRequest>,
) -> Result<(StatusCode, Json<MusteriKabulResponse>), (StatusCode, String)> {
    let collection = state.db.collection::<MusteriKabul>("musteri_kabul");
    let frontend_base_url = resolve_frontend_url(&headers);
    
    // Debug logging
    println!("📝 Create request received:");
    println!("  - Ad Soyad: {}", req.ad_soyad);
    println!("  - Belge F: {}", if req.belge_f.is_some() { "✓ VAR" } else { "✗ YOK" });
    if let Some(ref belge) = req.belge_f {
        println!("    - Size: {} bytes", belge.len());
        println!("    - Preview: {}...", &belge[..std::cmp::min(50, belge.len())]);
    }
    
    // Orijinal telefon numarasını SMS için kopyala
    let phone_for_sms = req.telefon.clone();
    let customer_name_for_sms = req.ad_soyad.clone();
    let device_model_for_sms = req.marka_model.clone();
    let service_type_for_sms = req.servis_tipi.clone();
    let service_type_fallback_for_sms = req.aksesuarlar.clone();
    
    let mut musteri = MusteriKabul::new(req);
    
    println!("💾 Musteri created - Belge_f: {}", if musteri.belge_f.is_some() { "✓ VAR" } else { "✗ YOK" });
    
    // Telefon numarasını şifrele
    let encrypted_phone = encrypt_value(&musteri.telefon)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Encryption error: {}", e)))?;
    
    musteri.telefon = encrypted_phone;
    
    match collection.insert_one(&musteri).await {
        Ok(result) => {
            musteri.id = Some(result.inserted_id.as_object_id().unwrap().clone());
            
            // SMS gönder - async olarak arka planda
            let collection_clone = state.db.collection::<MusteriKabul>("musteri_kabul");
            let id_clone = result.inserted_id.as_object_id().unwrap().clone();
            
            tokio::spawn(async move {
                println!("📱 SMS Task Started for phone: {}", phone_for_sms);
                let frontend_url = frontend_base_url.trim_end_matches('/').to_string();
                let fatura_link = format!("{}/fatura/{}", frontend_url, id_clone.to_hex());

                let normalized_service_type = detect_montaj_service_type(
                    service_type_for_sms.as_deref(),
                    Some(service_type_fallback_for_sms.as_str()),
                ).unwrap_or_default();

                let mut full_sms_msg = if normalized_service_type == "TV_KURULUM"
                    || normalized_service_type == "TV_MONTAJ"
                    || normalized_service_type == "TVKURULUM"
                    || normalized_service_type == "TVMONTAJ"
                {
                    build_tv_kurulum_sms_message(&customer_name_for_sms, &fatura_link)
                } else if normalized_service_type == "ROBOT_KURULUM"
                    || normalized_service_type == "ROBOTKURULUM"
                {
                    build_robot_kurulum_sms_message(&customer_name_for_sms, &fatura_link)
                } else if normalized_service_type == "TV_ARIZA"
                    || normalized_service_type == "ROBOT_ARIZA"
                    || normalized_service_type == "TVARIZA"
                    || normalized_service_type == "ROBOTARIZA"
                {
                    build_montaj_ariza_sms_message(&customer_name_for_sms, &device_model_for_sms)
                } else {
                    let sms_msg = build_sms_message(&customer_name_for_sms, &device_model_for_sms);
                    format!("{}\n\nFatura Yükleme:\n{}", sms_msg, fatura_link)
                };

                let is_kurulum_service = normalized_service_type == "TV_KURULUM"
                    || normalized_service_type == "TV_MONTAJ"
                    || normalized_service_type == "TVKURULUM"
                    || normalized_service_type == "TVMONTAJ"
                    || normalized_service_type == "ROBOT_KURULUM"
                    || normalized_service_type == "ROBOTKURULUM";

                if is_kurulum_service && !full_sms_msg.contains("/fatura/") {
                    full_sms_msg = format!("{}\n\nFatura Yükleme:\n{}", full_sms_msg, fatura_link);
                }
                
                println!("📱 SMS Message: {}", full_sms_msg);
                
                match send_sms(&phone_for_sms, &full_sms_msg).await {
                    Ok(response) => {
                        println!("✅ SMS sent successfully: {}", response.message);
                        tracing::info!("SMS sent successfully: {}", response.message);
                        
                        if let Err(e) = collection_clone.update_one(
                            doc! { "_id": id_clone },
                            doc! {
                                "$set": {
                                    "sms_gonderildi": true,
                                    "sms_mesaj": full_sms_msg
                                }
                            }
                        ).await {
                            println!("❌ Failed to update SMS status: {}", e);
                            tracing::error!("Failed to update SMS status: {}", e);
                        }
                    }
                    Err(e) => {
                        println!("❌ SMS failed: {}", e);
                        tracing::error!("SMS failed: {}", e);
                    }
                }
            });
            
            Ok((StatusCode::CREATED, Json(musteri.to_response())))
        }
        Err(e) => {
            Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))
        }
    }
}
pub async fn get_musteri_kabul(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<MusteriKabulResponse>, (StatusCode, String)> {
    let collection = state.db.collection::<MusteriKabul>("musteri_kabul");
    
    let object_id = ObjectId::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid ID format".to_string()))?;
    
    match collection.find_one(doc! { "_id": object_id }).await {
        Ok(Some(musteri)) => Ok(Json(musteri.to_response())),
        Ok(None) => Err((StatusCode::NOT_FOUND, "Müşteri not found".to_string())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e))),
    }
}

pub async fn list_musteri_kabul(
    State(state): State<AppState>,
) -> Result<Json<Vec<MusteriKabulResponse>>, (StatusCode, String)> {
    let collection = state.db.collection::<MusteriKabul>("musteri_kabul");
    
    match collection.find(doc! {}).sort(doc! { "_id": -1 }).await {
        Ok(mut cursor) => {
            let mut results = Vec::new();
            while cursor.advance().await.unwrap_or(false) {
                if let Ok(doc) = cursor.deserialize_current() {
                    results.push(doc.to_response());
                }
            }
            Ok(Json(results))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e))),
    }
}

pub async fn get_musteri_kabul_stats(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let collection = state.db.collection::<MusteriKabul>("musteri_kabul");

    let mut stats_map = serde_json::Map::new();
    for id in 1..=9 {
        stats_map.insert(id.to_string(), serde_json::json!(0));
    }

    let mut cursor = collection
        .aggregate(vec![doc! {
            "$group": {
                "_id": "$status",
                "count": { "$sum": 1 }
            }
        }])
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    while cursor
        .advance()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Cursor error: {}", e)))?
    {
        let row: Document = cursor
            .deserialize_current()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Deserialize error: {}", e)))?;

        let status_value = row.get_str("_id").unwrap_or("");
        let count_value = match row.get("count") {
            Some(mongodb::bson::Bson::Int32(v)) => i64::from(*v),
            Some(mongodb::bson::Bson::Int64(v)) => *v,
            Some(mongodb::bson::Bson::Double(v)) => *v as i64,
            _ => 0,
        };

        let mapped_id = status_string_to_id(status_value).or_else(|| {
            let normalized = status_value.trim().to_uppercase();
            for id in 1..=9 {
                if let Some(aliases) = status_id_aliases(id) {
                    if aliases.iter().any(|alias| alias.to_uppercase() == normalized) {
                        return Some(id);
                    }
                }
            }
            None
        });

        if let Some(id) = mapped_id {
            stats_map.insert(id.to_string(), serde_json::json!(count_value));
        }
    }

    Ok(Json(serde_json::Value::Object(stats_map)))
}

pub async fn list_musteri_kabul_by_status(
    State(state): State<AppState>,
    Path(status_id): Path<i32>,
) -> Result<Json<Vec<MusteriKabulResponse>>, (StatusCode, String)> {
    let collection = state.db.collection::<MusteriKabul>("musteri_kabul");

    let aliases = status_id_aliases(status_id)
        .ok_or((StatusCode::BAD_REQUEST, format!("Invalid status ID: {}", status_id)))?;
    let aliases: Vec<String> = aliases.into_iter().map(|s| s.to_string()).collect();

    match collection.find(doc! { "status": { "$in": aliases } }).sort(doc! { "_id": -1 }).await {
        Ok(mut cursor) => {
            let mut results = Vec::new();
            while cursor.advance().await.unwrap_or(false) {
                if let Ok(doc) = cursor.deserialize_current() {
                    results.push(doc.to_response());
                }
            }
            Ok(Json(results))
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e))),
    }
}

pub async fn delete_musteri_kabul(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let collection = state.db.collection::<MusteriKabul>("musteri_kabul");
    
    let object_id = ObjectId::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid ID format".to_string()))?;
    
    match collection.delete_one(doc! { "_id": object_id }).await {
        Ok(result) => {
            if result.deleted_count > 0 {
                println!("🗑️ Müşteri silindi: {}", id);
                Ok(StatusCode::NO_CONTENT)
            } else {
                Err((StatusCode::NOT_FOUND, "Müşteri bulunamadı".to_string()))
            }
        }
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e))),
    }
}

pub async fn update_musteri_kabul(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<crate::models::UpdateMusteriKabulRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let collection = state.db.collection::<MusteriKabul>("musteri_kabul");
    
    let object_id = ObjectId::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid ID format".to_string()))?;
    
    // Fetch customer data before update to send SMS if status changes
    let existing_customer = collection
        .find_one(doc! { "_id": object_id.clone() })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Müşteri bulunamadı".to_string()))?;
    
    let mut update_doc = doc! {};
    
    if let Some(ad_soyad) = req.ad_soyad {
        update_doc.insert("ad_soyad", ad_soyad.to_uppercase());
    }
    if let Some(telefon) = req.telefon {
        let encrypted_phone = encrypt_value(&telefon)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Encryption error: {}", e)))?;
        update_doc.insert("telefon", encrypted_phone);
    }
    if let Some(marka_model) = req.marka_model {
        update_doc.insert("marka_model", marka_model.to_uppercase());
    }
    if let Some(aksesuarlar) = req.aksesuarlar {
        update_doc.insert("aksesuarlar", aksesuarlar.to_uppercase());
    }
    if let Some(musteri_sikayeti) = req.musteri_sikayeti {
        update_doc.insert("musteri_sikayeti", musteri_sikayeti.to_uppercase());
    }
    if let Some(not) = req.not {
        update_doc.insert("not", not.to_uppercase());
    }
    if let Some(teknisyen_aciklamasi) = req.teknisyen_aciklamasi {
        update_doc.insert("teknisyen_aciklamasi", teknisyen_aciklamasi.to_uppercase());
    }
    if let Some(tamir_fisi_no) = req.tamir_fisi_no {
        update_doc.insert("tamir_fisi_no", tamir_fisi_no);
    }
    if let Some(belge_f) = req.belge_f {
        update_doc.insert("belge_f", belge_f);
    }
    if let Some(belge_g) = req.belge_g {
        update_doc.insert("belge_g", belge_g);
    }
    if let Some(belge_u) = req.belge_u {
        update_doc.insert("belge_u", belge_u);
    }
    if let Some(belge_a) = req.belge_a {
        update_doc.insert("belge_a", belge_a);
    }
    
    let mut queued_status_sms: Option<(String, String, i32)> = None;

    // Handle status change and queue SMS
    if let Some(status_id) = req.status {
        if let Some(status_str) = status_id_to_string(status_id) {
            let status_changed = existing_customer.status != status_str;
            update_doc.insert("status", status_str);
            
            if status_changed {
                // Queue SMS with +1 hour delay if status actually changed
                if let Ok(phone) = decrypt_value(&existing_customer.telefon) {
                    if let Some(sms_message) = build_status_sms_message(status_id, &existing_customer.ad_soyad, &existing_customer.marka_model) {
                        queued_status_sms = Some((phone, sms_message, status_id));
                    }
                }
            }
        } else {
            return Err((StatusCode::BAD_REQUEST, format!("Invalid status ID: {}", status_id)));
        }
    }
    
    let now = chrono::Utc::now();
    update_doc.insert("updated_at", now.to_rfc3339());
    
    match collection.update_one(
        doc! { "_id": object_id.clone() },
        doc! { "$set": update_doc }
    ).await {
        Ok(result) => {
            if result.matched_count > 0 {
                if let Some((phone, sms_message, status_id)) = queued_status_sms {
                    enqueue_status_sms(&state.db, object_id.clone(), phone, sms_message, status_id)
                        .await
                        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("SMS queue error: {}", e)))?;
                }

                println!("✏️ Müşteri güncellendi: {}", id);
                Ok(StatusCode::NO_CONTENT)
            } else {
                Err((StatusCode::NOT_FOUND, "Müşteri bulunamadı".to_string()))
            }
        },
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e))),
    }
}

pub async fn resend_musteri_sms(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let collection = state.db.collection::<MusteriKabul>("musteri_kabul");

    let object_id = ObjectId::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid ID format".to_string()))?;

    let musteri = collection
        .find_one(doc! { "_id": object_id.clone() })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Müşteri bulunamadı".to_string()))?;

    let phone_candidate = match decrypt_value(&musteri.telefon) {
        Ok(value) => value,
        Err(_) => musteri.telefon.clone(),
    };

    let phone_digits = phone_candidate.chars().filter(|c| c.is_ascii_digit()).count();
    if phone_digits < 10 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Telefon numarası geçersiz görünüyor. Önce müşteri telefonunu güncelleyip tekrar deneyin.".to_string(),
        ));
    }

    let sms_msg = build_sms_message(&musteri.ad_soyad, &musteri.marka_model);
    let frontend_url = resolve_frontend_url(&headers).trim_end_matches('/').to_string();
    let fatura_link = format!("{}/fatura/{}", frontend_url, object_id.to_hex());
    let full_sms_msg = format!("{}\n\nFatura Yükleme:\n{}", sms_msg, fatura_link);

    let stored_sms_message = match send_sms(&phone_candidate, &full_sms_msg).await {
        Ok(_) => full_sms_msg,
        Err(primary_error) => {
            send_sms(&phone_candidate, &sms_msg)
                .await
                .map_err(|fallback_error| {
                    (
                        StatusCode::BAD_GATEWAY,
                        format!(
                            "SMS gönderilemedi. İlk hata: {} | İkinci deneme: {}",
                            primary_error, fallback_error
                        ),
                    )
                })?;
            sms_msg
        }
    };

    collection
        .update_one(
            doc! { "_id": object_id },
            doc! {
                "$set": {
                    "sms_gonderildi": true,
                    "sms_mesaj": &stored_sms_message,
                    "updated_at": chrono::Utc::now().to_rfc3339(),
                }
            },
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "SMS tekrar gönderildi"
    })))
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, String)> {
    let username = req.username.trim().to_lowercase();
    let password = req.password.trim().to_string();

    let users = state.db.collection::<User>("users");

    let matched_user = users
        .find_one(doc! { "username": &username })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    let matched_user_exists = matched_user.is_some();
    let matched_user_with_password = matched_user
        .filter(|user| user.password == password);

    let user_level = matched_user_with_password
        .as_ref()
        .map(|user| effective_user_level(&user.username, user.level.as_deref()));
    let user_role = user_level
        .as_deref()
        .map(level_to_auth_role)
        .unwrap_or("admin");

    let has_admin_in_db = if username == "admin" {
        matched_user_exists || users
            .find_one(doc! { "username": "admin" })
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
            .is_some()
    } else {
        false
    };

    let fallback_admin = username == "admin" && verify_admin_password(&password) && !has_admin_in_db;

    let is_valid_user = matched_user_with_password.is_some() || fallback_admin;

    if !is_valid_user {
        return Err((StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()));
    }
    
    // Generate JWT token
    match generate_token(&username, user_role) {
        Ok(token) => {
            println!("🔐 Login successful for user: {}", username);
            Ok(Json(LoginResponse {
                success: true,
                token: Some(token),
                theme_color: matched_user_with_password.as_ref().and_then(|user| user.theme_color.clone()),
                level: user_level,
                message: "Login successful".to_string(),
            }))
        },
        Err(e) => {
            eprintln!("❌ Token generation failed: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, "Token generation failed".to_string()))
        }
    }
}

pub async fn create_user(
    State(state): State<AppState>,
    Json(req): Json<CreateUserRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let ad_soyad = req.ad_soyad.trim().to_uppercase();
    let username = req.username.trim().to_lowercase();
    let password = req.password.trim().to_string();

    if ad_soyad.is_empty() || username.is_empty() || password.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Tüm alanlar zorunludur".to_string()));
    }

    let requested_level = req.level.as_deref().unwrap_or("level2");
    let level = normalize_user_level(requested_level)
        .ok_or((StatusCode::BAD_REQUEST, "Geçersiz kullanıcı seviyesi".to_string()))?
        .to_string();

    if username == "admin" && level != "level1" {
        return Err((StatusCode::BAD_REQUEST, "Admin kullanıcı sadece level1 olabilir".to_string()));
    }

    let users = state.db.collection::<User>("users");

    let existing = users
        .find_one(doc! { "username": &username })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    if existing.is_some() {
        return Err((StatusCode::CONFLICT, "Bu kullanıcı adı zaten kullanılıyor".to_string()));
    }

    let user = User {
        id: None,
        ad_soyad,
        username: username.clone(),
        password,
        theme_color: None,
        level: Some(level.clone()),
        created_at: Some(DateTime::now()),
    };

    users.insert_one(user)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Kullanıcı başarıyla eklendi",
        "username": username,
        "level": level,
        "level_label": level_to_label(&level)
    })))
}

pub async fn list_users(
    State(state): State<AppState>,
) -> Result<Json<Vec<UserListItem>>, (StatusCode, String)> {
    let users = state.db.collection::<User>("users");

    let admin_exists = users
        .find_one(doc! { "username": "admin" })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
        .is_some();

    if !admin_exists {
        let admin_user = User {
            id: None,
            ad_soyad: "ADMIN".to_string(),
            username: "admin".to_string(),
            password: "123456".to_string(),
            theme_color: None,
            level: Some("level1".to_string()),
            created_at: Some(DateTime::now()),
        };

        users.insert_one(admin_user)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;
    }

    let mut cursor = users
        .find(doc! {})
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    let mut results: Vec<UserListItem> = Vec::new();

    while cursor
        .advance()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
    {
        let user: User = cursor
            .deserialize_current()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Deserialize error: {}", e)))?;

        let is_root_user = user.username == "admin";
        let level = effective_user_level(&user.username, user.level.as_deref());

        results.push(UserListItem {
            id: user.id.map(|id| id.to_hex()).unwrap_or_default(),
            ad_soyad: if user.ad_soyad.is_empty() { user.username.to_uppercase() } else { user.ad_soyad },
            username: user.username,
            theme_color: user.theme_color,
            level: level.clone(),
            level_label: level_to_label(&level).to_string(),
            created_at_ms: user.created_at.map(|d| d.timestamp_millis()).unwrap_or(0),
            is_root: is_root_user,
            can_delete: !is_root_user,
        });
    }

    results.sort_by(|a, b| {
        if a.is_root == b.is_root {
            a.username.cmp(&b.username)
        } else if a.is_root {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(Json(results))
}

pub async fn update_user(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateUserRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let users = state.db.collection::<User>("users");

    let object_id = ObjectId::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid ID format".to_string()))?;

    let existing = users
        .find_one(doc! { "_id": object_id })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
        .ok_or((StatusCode::NOT_FOUND, "Kullanıcı bulunamadı".to_string()))?;

    let mut update_doc = doc! {};

    if let Some(ad_soyad) = req.ad_soyad {
        let value = ad_soyad.trim().to_uppercase();
        if !value.is_empty() {
            update_doc.insert("ad_soyad", value);
        }
    }

    if let Some(username) = req.username {
        let value = username.trim().to_lowercase();
        if !value.is_empty() {
            if existing.username == "admin" && value != "admin" {
                return Err((StatusCode::BAD_REQUEST, "Kök kullanıcının kullanıcı adı değiştirilemez".to_string()));
            }

            let duplicate = users
                .find_one(doc! { "username": &value, "_id": { "$ne": object_id } })
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

            if duplicate.is_some() {
                return Err((StatusCode::CONFLICT, "Bu kullanıcı adı zaten kullanılıyor".to_string()));
            }

            update_doc.insert("username", value);
        }
    }

    if let Some(password) = req.password {
        let value = password.trim().to_string();
        if !value.is_empty() {
            update_doc.insert("password", value);
        }
    }

    if let Some(level) = req.level {
        let value = normalize_user_level(&level)
            .ok_or((StatusCode::BAD_REQUEST, "Geçersiz kullanıcı seviyesi".to_string()))?
            .to_string();

        if existing.username == "admin" && value != "level1" {
            return Err((StatusCode::BAD_REQUEST, "Admin kullanıcı sadece level1 olabilir".to_string()));
        }

        update_doc.insert("level", value);
    }

    if let Some(theme_color) = req.theme_color {
        let value = theme_color.trim().to_uppercase();
        let is_valid_hex = value.len() == 7
            && value.starts_with('#')
            && value.chars().skip(1).all(|c| c.is_ascii_hexdigit());

        if !is_valid_hex {
            return Err((StatusCode::BAD_REQUEST, "Geçersiz tema rengi".to_string()));
        }

        update_doc.insert("theme_color", value);
    }

    if update_doc.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Güncellenecek alan yok".to_string()));
    }

    users.update_one(doc! { "_id": object_id }, doc! { "$set": update_doc })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Kullanıcı güncellendi"
    })))
}

pub async fn delete_user(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let users = state.db.collection::<User>("users");

    let object_id = ObjectId::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid ID format".to_string()))?;

    let existing = users
        .find_one(doc! { "_id": object_id })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
        .ok_or((StatusCode::NOT_FOUND, "Kullanıcı bulunamadı".to_string()))?;

    if existing.username == "admin" {
        return Err((StatusCode::FORBIDDEN, "Kök kullanıcı silinemez".to_string()));
    }

    users.delete_one(doc! { "_id": object_id })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Kullanıcı silindi"
    })))
}

pub async fn get_bing_daily_image() -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let bing_api = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=tr-TR";

    let response = reqwest::get(bing_api)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Bing request failed: {}", e)))?;

    let payload = response
        .text()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Bing response read failed: {}", e)))?;

    let parsed: serde_json::Value = serde_json::from_str(&payload)
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Bing JSON parse failed: {}", e)))?;

    let daily_path = parsed
        .get("images")
        .and_then(|images| images.get(0))
        .and_then(|first| first.get("url"))
        .and_then(|url| url.as_str())
        .ok_or((StatusCode::BAD_GATEWAY, "Bing daily image url not found".to_string()))?;

    let image_url = format!("https://www.bing.com{}", daily_path);

    Ok(Json(serde_json::json!({
        "image_url": image_url,
        "raw_url": daily_path,
    })))
}

pub async fn migrate_teknisyen_notes(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let collection = state.db.collection::<Document>("musteri_kabul");

    let mut cursor = collection
        .find(doc! {})
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    let mut scanned: i64 = 0;
    let mut migrated: i64 = 0;

    while cursor
        .advance()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Cursor error: {}", e)))?
    {
        let current: Document = cursor
            .deserialize_current()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Deserialize error: {}", e)))?;

        scanned += 1;

        let id = match current.get_object_id("_id") {
            Ok(value) => value,
            Err(_) => continue,
        };

        let note_text = current
            .get_str("not")
            .ok()
            .map(|v| v.trim())
            .filter(|v| !v.is_empty());

        let teknisyen_text = current
            .get_str("teknisyen_aciklamasi")
            .ok()
            .map(|v| v.trim())
            .unwrap_or("");

        if let Some(note_value) = note_text {
            if teknisyen_text.is_empty() {
                collection
                    .update_one(
                        doc! { "_id": id },
                        doc! {
                            "$set": {
                                "teknisyen_aciklamasi": note_value.to_uppercase(),
                                "updated_at": chrono::Utc::now().to_rfc3339()
                            },
                            "$unset": {
                                "not": ""
                            }
                        },
                    )
                    .await
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Update error: {}", e)))?;

                migrated += 1;
            }
        }
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Teknisyen açıklaması alanı düzeltildi",
        "scanned": scanned,
        "migrated": migrated
    })))
}
