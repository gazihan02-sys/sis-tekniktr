use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Json, Path, Query, State,
    },
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, QueryBuilder};
use std::io::{Cursor, Write};
use tokio::sync::broadcast;
use uuid::Uuid;
use zip::write::SimpleFileOptions;

use crate::auth::{generate_token, verify_admin_password, LoginRequest, LoginResponse};
use crate::crypto::{decrypt_value, encrypt_value};
use crate::models::{
    status_id_aliases, status_id_to_string, status_string_to_id, CreateMusteriKabulRequest,
    MusteriKabul, MusteriKabulResponse, UpdateMusteriKabulRequest,
};
use crate::sms::{
    build_montaj_ariza_sms_message, build_robot_kurulum_sms_message, build_sms_message,
    build_status_sms_message, build_tv_kurulum_sms_message, send_sms,
};
use crate::sms_queue::enqueue_status_sms;

const DELETE_OTP_PHONE_1: &str = "05300735686";
const DELETE_OTP_EXPIRE_MINUTES: i64 = 10;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub live_tx: broadcast::Sender<()>,
}

pub async fn live_ws(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_live_ws_socket(socket, state.live_tx.subscribe()))
}

async fn handle_live_ws_socket(mut socket: WebSocket, mut receiver: broadcast::Receiver<()>) {
    let _ = socket
        .send(Message::Text(r#"{\"type\":\"connected\"}"#.to_string()))
        .await;

    loop {
        tokio::select! {
            recv_result = receiver.recv() => {
                match recv_result {
                    Ok(_) => {
                        if socket.send(Message::Text(r#"{\"type\":\"refresh\"}"#.to_string())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        continue;
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
            ws_message = socket.next() => {
                match ws_message {
                    Some(Ok(Message::Ping(payload))) => {
                        if socket.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        break;
                    }
                    Some(Ok(_)) => {}
                    Some(Err(_)) => {
                        break;
                    }
                }
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct User {
    pub source_mongo_id: Option<String>,
    pub ad_soyad: String,
    pub username: String,
    pub password: String,
    pub theme_color: Option<String>,
    pub level: Option<String>,
    pub created_at: Option<chrono::DateTime<Utc>>,
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
    pub belge_f: Option<String>,
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

#[derive(Debug, FromRow)]
struct MusteriRow {
    source_mongo_id: Option<String>,
    ad_soyad: String,
    telefon: String,
    marka_model: String,
    servis_tipi: Option<String>,
    aksesuarlar: String,
    musteri_sikayeti: String,
    not_field: Option<String>,
    teknisyen_aciklamasi: Option<String>,
    tamir_fisi_no: Option<String>,
    belge_f: Option<String>,
    belge_g: Option<String>,
    belge_u: Option<String>,
    belge_a: Option<String>,
    status: String,
    fiyat_verilecek: bool,
    sms_gonderildi: bool,
    created_at: Option<chrono::DateTime<Utc>>,
    updated_at: Option<chrono::DateTime<Utc>>,
}

#[derive(Debug, FromRow)]
struct MontajRow {
    source_mongo_id: Option<String>,
    rnu_is_emri_no: Option<String>,
    ad_soyad: String,
    model: String,
    telefon: String,
    adres: Option<String>,
    servis_tipi: String,
    atanan_kullanici_username: Option<String>,
    kapatildi: bool,
    belge_f: Option<String>,
    created_at: Option<chrono::DateTime<Utc>>,
    kurulum_resimleri: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

fn db_error(e: impl std::fmt::Display) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e))
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
    level.and_then(normalize_user_level).unwrap_or("level2").to_string()
}

fn header_value(headers: &HeaderMap, key: &str) -> Option<String> {
    headers
        .get(key)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.split(',').next().unwrap_or(v).trim().to_string())
        .filter(|v| !v.is_empty())
}

fn is_localhost_url(value: &str) -> bool {
    let lower = value.to_lowercase();
    lower.contains("localhost") || lower.contains("127.0.0.1")
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
        if [
            "TV_KURULUM",
            "TV_MONTAJ",
            "ROBOT_KURULUM",
            "TVKURULUM",
            "TVMONTAJ",
            "ROBOTKURULUM",
            "TV_ARIZA",
            "ROBOT_ARIZA",
            "TVARIZA",
            "ROBOTARIZA",
        ]
        .contains(&normalized.as_str())
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

fn sanitize_zip_name(value: &str) -> String {
    let normalized = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect::<String>();
    let trimmed = normalized.trim_matches('_').to_string();
    if trimmed.is_empty() { "kayit".to_string() } else { trimmed }
}

fn decode_data_url_image(payload: &str) -> Result<Vec<u8>, String> {
    let content = payload.trim();
    if content.is_empty() {
        return Err("Boş dosya içeriği".to_string());
    }
    let encoded = if let Some(idx) = content.find(',') {
        &content[(idx + 1)..]
    } else {
        content
    };
    BASE64_STANDARD
        .decode(encoded)
        .map_err(|_| "Base64 görsel decode edilemedi".to_string())
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

fn row_to_response(row: MusteriRow) -> MusteriKabulResponse {
    let phone = decrypt_value(&row.telefon).unwrap_or(row.telefon);
    MusteriKabulResponse {
        id: row.source_mongo_id.unwrap_or_default(),
        ad_soyad: row.ad_soyad,
        telefon: phone,
        marka_model: row.marka_model,
        servis_tipi: row.servis_tipi,
        aksesuarlar: row.aksesuarlar,
        musteri_sikayeti: row.musteri_sikayeti,
        not: row.not_field,
        teknisyen_aciklamasi: row.teknisyen_aciklamasi,
        tamir_fisi_no: row.tamir_fisi_no,
        belge_f: row.belge_f,
        belge_g: row.belge_g,
        belge_u: row.belge_u,
        belge_a: row.belge_a,
        status: row.status,
        fiyat_verilecek: row.fiyat_verilecek,
        sms_gonderildi: row.sms_gonderildi,
        created_at: row.created_at.unwrap_or_else(Utc::now).to_rfc3339(),
    }
}

pub async fn get_system_sync(State(state): State<AppState>) -> Result<Json<SystemSyncResponse>, (StatusCode, String)> {
    let musteri_total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM musteri_kabul")
        .fetch_one(&state.db)
        .await
        .map_err(db_error)?;
    let users_total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await
        .map_err(db_error)?;

    let latest_musteri_id: Option<String> = sqlx::query_scalar(
        "SELECT source_mongo_id FROM musteri_kabul ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(db_error)?
    .flatten();

    let latest_user_id: Option<String> = sqlx::query_scalar(
        "SELECT source_mongo_id FROM users ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(db_error)?
    .flatten();

    let latest_musteri_update_at: Option<chrono::DateTime<Utc>> = sqlx::query_scalar(
        "SELECT MAX(updated_at) FROM musteri_kabul",
    )
    .fetch_one(&state.db)
    .await
    .map_err(db_error)?;

    let latest_user_update_at: Option<chrono::DateTime<Utc>> = sqlx::query_scalar(
        "SELECT MAX(created_at) FROM users",
    )
    .fetch_one(&state.db)
    .await
    .map_err(db_error)?;

    let latest_montaj_update_at: Option<chrono::DateTime<Utc>> = sqlx::query_scalar(
        "SELECT MAX(updated_at) FROM montaj_kayitlari",
    )
    .fetch_one(&state.db)
    .await
    .map_err(db_error)?;

    let musteri_update_fingerprint = latest_musteri_update_at
        .map(|value| value.timestamp_millis().to_string())
        .unwrap_or_else(|| "-".to_string());

    let user_update_fingerprint = latest_user_update_at
        .map(|value| value.timestamp_millis().to_string())
        .unwrap_or_else(|| "-".to_string());

    let montaj_update_fingerprint = latest_montaj_update_at
        .map(|value| value.timestamp_millis().to_string())
        .unwrap_or_else(|| "-".to_string());

    let fingerprint = format!(
        "m:{}:{}:{}|u:{}:{}:{}|mo:{}",
        musteri_total,
        latest_musteri_id.as_deref().unwrap_or("-"),
        musteri_update_fingerprint,
        users_total,
        latest_user_id.as_deref().unwrap_or("-"),
        user_update_fingerprint,
        montaj_update_fingerprint
    );

    Ok(Json(SystemSyncResponse {
        fingerprint,
        musteri_total: musteri_total as u64,
        users_total: users_total as u64,
        latest_musteri_id,
        latest_user_id,
    }))
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

    let montaj_result = sqlx::query(
        "UPDATE montaj_kayitlari SET belge_f = $2, updated_at = NOW() WHERE source_mongo_id = $1",
    )
    .bind(&id)
    .bind(&req.belge_f)
    .execute(&state.db)
    .await
    .map_err(db_error)?;

    if montaj_result.rows_affected() > 0 {
        return Ok(StatusCode::NO_CONTENT);
    }

    let musteri_result = sqlx::query(
        "UPDATE musteri_kabul SET belge_f = $2, updated_at = NOW() WHERE source_mongo_id = $1",
    )
    .bind(&id)
    .bind(&req.belge_f)
    .execute(&state.db)
    .await
    .map_err(db_error)?;

    if musteri_result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Montaj kaydı veya müşteri bulunamadı".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_delete_otp(
    State(state): State<AppState>,
    Json(req): Json<CreateDeleteOtpRequest>,
) -> Result<Json<CreateDeleteOtpResponse>, (StatusCode, String)> {
    let action = normalize_delete_action(&req.action)
        .ok_or((StatusCode::BAD_REQUEST, "Geçersiz silme aksiyonu".to_string()))?;

    if req.resource_id.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Geçersiz kayıt id".to_string()));
    }

    let code_1 = generate_otp_code();
    let sms_1 = format!(
        "SIS Teknik silme onay kodunuz: {}. Bu kod 10 dakika geçerlidir.",
        code_1
    );

    send_sms(DELETE_OTP_PHONE_1, &sms_1)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("OTP gönderilemedi: {}", e)))?;

    let otp_id = Uuid::new_v4().to_string();

    sqlx::query(
        r#"
        INSERT INTO delete_otp_requests
        (source_mongo_id, action, resource_mongo_id, otp_code, used, created_at, expires_at)
        VALUES ($1, $2, $3, $4, FALSE, NOW(), NOW() + ($5 || ' minute')::interval)
        "#,
    )
    .bind(&otp_id)
    .bind(action)
    .bind(&req.resource_id)
    .bind(&code_1)
    .bind(DELETE_OTP_EXPIRE_MINUTES)
    .execute(&state.db)
    .await
    .map_err(db_error)?;

    Ok(Json(CreateDeleteOtpResponse {
        request_id: otp_id,
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

    let id = Uuid::new_v4().to_string();

    sqlx::query(
        r#"
        INSERT INTO montaj_kayitlari
        (source_mongo_id, rnu_is_emri_no, ad_soyad, model, telefon, adres, servis_tipi, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        "#,
    )
    .bind(&id)
    .bind(req.rnu_is_emri_no.unwrap_or_default().trim().to_uppercase())
    .bind(ad_soyad.to_uppercase())
    .bind(model.to_uppercase())
    .bind(telefon.to_string())
    .bind(req.adres.unwrap_or_default().trim().to_string())
    .bind(servis_tipi.to_uppercase())
    .execute(&state.db)
    .await
    .map_err(db_error)?;

    let fatura_link = format!("https://tamir.sis-teknik.com.tr/fatura/{}", id);
    let sms_message = match servis_tipi.to_lowercase().as_str() {
        "tv kurulum" | "tv" => format!(
            "SN : {}\nTV KURULUM KAYDI ALINDI.\nFATURA: {}\nFATURA YUKLENMEDEN HIZMET VERILMEZ.",
            ad_soyad, fatura_link
        ),
        "robot kurulum" | "robot" => format!(
            "SN : {}\nROBOT KURULUM KAYDI ALINDI.\nFATURA: {}\nFATURA YUKLENMEDEN HIZMET VERILMEZ.",
            ad_soyad, fatura_link
        ),
        _ => format!(
            "SN : {}\nMONTAJ KAYDI ALINDI.\nCİHAZ: {}\nFATURA: {}\nFATURA YUKLENMEDEN HIZMET VERILMEZ.",
            ad_soyad, model, fatura_link
        ),
    };

    let _ = send_sms(telefon, &sms_message).await;

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
    let rows = sqlx::query_as::<_, MontajRow>(
        r#"
        SELECT source_mongo_id, rnu_is_emri_no, ad_soyad, model, telefon, adres, servis_tipi,
               atanan_kullanici_username, kapatildi, belge_f, created_at, kurulum_resimleri
        FROM montaj_kayitlari
        ORDER BY created_at DESC NULLS LAST, id DESC
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(db_error)?;

    let results = rows
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "id": r.source_mongo_id.unwrap_or_default(),
                "rnu_is_emri_no": r.rnu_is_emri_no.unwrap_or_default(),
                "ad_soyad": r.ad_soyad,
                "model": r.model,
                "telefon": r.telefon,
                "adres": r.adres.unwrap_or_default(),
                "servis_tipi": r.servis_tipi,
                "atanan_kullanici_username": r.atanan_kullanici_username.unwrap_or_default(),
                "kapatildi": r.kapatildi,
                "belge_f": r.belge_f.as_ref().map(|s| !s.is_empty()).unwrap_or(false),
                "created_at": r.created_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
            })
        })
        .collect();

    Ok(Json(results))
}

pub async fn update_montaj_kayit(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateMontajRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let rnu_is_emri_no = req
        .rnu_is_emri_no
        .map(|value| value.trim().to_uppercase());

    let ad_soyad = match req.ad_soyad {
        Some(value) => {
            let cleaned = value.trim().to_uppercase();
            if cleaned.is_empty() {
                return Err((StatusCode::BAD_REQUEST, "Ad Soyad boş olamaz".to_string()));
            }
            Some(cleaned)
        }
        None => None,
    };

    let model = match req.model {
        Some(value) => {
            let cleaned = value.trim().to_uppercase();
            if cleaned.is_empty() {
                return Err((StatusCode::BAD_REQUEST, "Model boş olamaz".to_string()));
            }
            Some(cleaned)
        }
        None => None,
    };

    let telefon = match req.telefon {
        Some(value) => {
            let cleaned = value.trim().to_string();
            if cleaned.is_empty() {
                return Err((StatusCode::BAD_REQUEST, "Telefon boş olamaz".to_string()));
            }
            Some(cleaned)
        }
        None => None,
    };

    let adres = req.adres.map(|value| value.trim().to_string());

    let servis_tipi = match req.servis_tipi {
        Some(value) => {
            let cleaned = value.trim().to_uppercase();
            if cleaned.is_empty() {
                return Err((StatusCode::BAD_REQUEST, "Servis Tipi boş olamaz".to_string()));
            }
            Some(cleaned)
        }
        None => None,
    };

    let mut set_assigned = false;
    let mut assigned_value: Option<String> = None;
    if let Some(value) = req.atanan_kullanici_username {
        set_assigned = true;

        let parsed_usernames: Vec<String> = value
            .split(',')
            .map(|part| part.trim().to_lowercase())
            .filter(|part| !part.is_empty())
            .fold(Vec::<String>::new(), |mut acc, username| {
                if !acc.contains(&username) {
                    acc.push(username);
                }
                acc
            });

        if !parsed_usernames.is_empty() {
            let valid_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM users WHERE level = 'level3' AND username = ANY($1)",
            )
            .bind(&parsed_usernames)
            .fetch_one(&state.db)
            .await
            .map_err(db_error)?;

            if valid_count != parsed_usernames.len() as i64 {
                return Err((StatusCode::BAD_REQUEST, "Atanacak tüm kullanıcılar level3 olmalı".to_string()));
            }

            assigned_value = Some(parsed_usernames.join(","));
        }
    }

    let mut set_belge = false;
    let mut belge_value: Option<String> = None;
    if let Some(value) = req.belge_f {
        set_belge = true;
        let cleaned = value.trim().to_string();
        if !cleaned.is_empty() {
            belge_value = Some(cleaned);
        }
    }

    let changed = rnu_is_emri_no.is_some()
        || ad_soyad.is_some()
        || model.is_some()
        || telefon.is_some()
        || adres.is_some()
        || servis_tipi.is_some()
        || set_assigned
        || set_belge;

    if !changed {
        return Err((StatusCode::BAD_REQUEST, "Güncellenecek alan yok".to_string()));
    }

    let result = sqlx::query(
        r#"
        UPDATE montaj_kayitlari
        SET rnu_is_emri_no = COALESCE($2, rnu_is_emri_no),
            ad_soyad = COALESCE($3, ad_soyad),
            model = COALESCE($4, model),
            telefon = COALESCE($5, telefon),
            adres = COALESCE($6, adres),
            servis_tipi = COALESCE($7, servis_tipi),
            atanan_kullanici_username = CASE WHEN $8 THEN $9 ELSE atanan_kullanici_username END,
            belge_f = CASE WHEN $10 THEN $11 ELSE belge_f END,
            updated_at = NOW()
        WHERE source_mongo_id = $1
        "#,
    )
    .bind(&id)
    .bind(rnu_is_emri_no)
    .bind(ad_soyad)
    .bind(model)
    .bind(telefon)
    .bind(adres)
    .bind(servis_tipi)
    .bind(set_assigned)
    .bind(assigned_value)
    .bind(set_belge)
    .bind(belge_value)
    .execute(&state.db)
    .await
    .map_err(db_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Montaj kaydı bulunamadı".to_string()));
    }

    Ok(Json(serde_json::json!({"success": true, "message": "Montaj kaydı güncellendi"})))
}

pub async fn get_montaj_kayit(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let row = sqlx::query_as::<_, MontajRow>(
        r#"
        SELECT source_mongo_id, rnu_is_emri_no, ad_soyad, model, telefon, adres, servis_tipi,
               atanan_kullanici_username, kapatildi, belge_f, created_at, kurulum_resimleri
        FROM montaj_kayitlari
        WHERE source_mongo_id = $1
        "#,
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(db_error)?
    .ok_or((StatusCode::NOT_FOUND, "Montaj kaydı bulunamadı".to_string()))?;

    Ok(Json(serde_json::json!({
        "id": row.source_mongo_id.unwrap_or_default(),
        "rnu_is_emri_no": row.rnu_is_emri_no.unwrap_or_default(),
        "ad_soyad": row.ad_soyad,
        "model": row.model,
        "telefon": row.telefon,
        "adres": row.adres.unwrap_or_default(),
        "servis_tipi": row.servis_tipi,
        "atanan_kullanici_username": row.atanan_kullanici_username.unwrap_or_default(),
        "kapatildi": row.kapatildi,
        "belge_f": row.belge_f.unwrap_or_default(),
        "created_at": row.created_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
    })))
}

pub async fn delete_montaj_kayit(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let result = sqlx::query("DELETE FROM montaj_kayitlari WHERE source_mongo_id = $1")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(db_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Montaj kaydı bulunamadı".to_string()));
    }

    Ok(Json(serde_json::json!({"success": true, "message": "Montaj kaydı silindi"})))
}

pub async fn close_montaj_kayit(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<CloseMontajRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let kurulum_tipi = req.kurulum_tipi.trim().to_uppercase();
    if kurulum_tipi != "DUVAR" && kurulum_tipi != "SEHPA" {
        return Err((StatusCode::BAD_REQUEST, "Kurulum tipi DUVAR veya SEHPA olmalıdır".to_string()));
    }

    let images: Vec<String> = req
        .resimler
        .into_iter()
        .map(|img| img.trim().to_string())
        .filter(|img| !img.is_empty())
        .collect();

    if images.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "En az bir resim yüklenmelidir".to_string()));
    }

    let result = sqlx::query(
        r#"
        UPDATE montaj_kayitlari
        SET kapatildi = TRUE,
            kapatildi_at = NOW(),
            kurulum_tipi = $2,
            kurulum_resimleri = $3,
            updated_at = NOW()
        WHERE source_mongo_id = $1
        "#,
    )
    .bind(&id)
    .bind(kurulum_tipi)
    .bind(serde_json::json!(images))
    .execute(&state.db)
    .await
    .map_err(db_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Montaj kaydı bulunamadı".to_string()));
    }

    Ok(Json(serde_json::json!({"success": true, "message": "Montaj kaydı kapatıldı"})))
}

pub async fn download_montaj_files_zip(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, (StatusCode, String)> {
    let row = sqlx::query_as::<_, MontajRow>(
        r#"
        SELECT source_mongo_id, rnu_is_emri_no, ad_soyad, model, telefon, adres, servis_tipi,
               atanan_kullanici_username, kapatildi, belge_f, created_at, kurulum_resimleri
        FROM montaj_kayitlari
        WHERE source_mongo_id = $1
        "#,
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(db_error)?
    .ok_or((StatusCode::NOT_FOUND, "Montaj kaydı bulunamadı".to_string()))?;

    let images = row
        .kurulum_resimleri
        .unwrap_or_else(|| serde_json::json!([]))
        .as_array()
        .cloned()
        .unwrap_or_default();

    if images.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Bu kayıtta indirilecek dosya yok".to_string()));
    }

    let mut zip_buffer = Cursor::new(Vec::<u8>::new());
    let mut zip_writer = zip::ZipWriter::new(&mut zip_buffer);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut added_count = 0usize;
    for (index, image_value) in images.iter().enumerate() {
        let Some(image_text) = image_value.as_str() else {
            continue;
        };
        let bytes = match decode_data_url_image(image_text) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let entry_name = format!("{}_{}.jpg", sanitize_zip_name(&row.ad_soyad), index + 1);
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
    let filename = format!("xx_{}_.zip", sanitize_zip_name(&row.ad_soyad));
    let content_disposition = HeaderValue::from_str(&format!("attachment; filename=\"{}\"", filename))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Header oluşturulamadı".to_string()))?;

    Ok((
        [
            (header::CONTENT_TYPE, HeaderValue::from_static("application/zip")),
            (header::CONTENT_DISPOSITION, content_disposition),
        ],
        zip_bytes,
    )
        .into_response())
}

pub async fn create_musteri_kabul(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CreateMusteriKabulRequest>,
) -> Result<(StatusCode, Json<MusteriKabulResponse>), (StatusCode, String)> {
    let frontend_base_url = resolve_frontend_url(&headers);

    let phone_for_sms = req.telefon.clone();
    let customer_name_for_sms = req.ad_soyad.clone();
    let device_model_for_sms = req.marka_model.clone();
    let service_type_for_sms = req.servis_tipi.clone();
    let service_type_fallback_for_sms = req.aksesuarlar.clone();

    let mut musteri = MusteriKabul::new(req);
    musteri.id = Some(Uuid::new_v4().to_string());

    let encrypted_phone = encrypt_value(&musteri.telefon)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Encryption error: {}", e)))?;
    musteri.telefon = encrypted_phone;

    sqlx::query(
        r#"
        INSERT INTO musteri_kabul
        (source_mongo_id, ad_soyad, telefon, marka_model, servis_tipi, aksesuarlar, musteri_sikayeti,
         not_field, teknisyen_aciklamasi, tamir_fisi_no, sirala_dosya_url, belge_f, belge_g, belge_u,
         belge_a, status, fiyat_verilecek, sms_gonderildi, sms_mesaj, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
        "#,
    )
    .bind(musteri.id.clone())
    .bind(&musteri.ad_soyad)
    .bind(&musteri.telefon)
    .bind(&musteri.marka_model)
    .bind(&musteri.servis_tipi)
    .bind(&musteri.aksesuarlar)
    .bind(&musteri.musteri_sikayeti)
    .bind(&musteri.not)
    .bind(&musteri.teknisyen_aciklamasi)
    .bind(&musteri.tamir_fisi_no)
    .bind(&musteri.sirala_dosya_url)
    .bind(&musteri.belge_f)
    .bind(&musteri.belge_g)
    .bind(&musteri.belge_u)
    .bind(&musteri.belge_a)
    .bind(&musteri.status)
    .bind(musteri.fiyat_verilecek)
    .bind(musteri.sms_gonderildi)
    .bind(&musteri.sms_mesaj)
    .execute(&state.db)
    .await
    .map_err(db_error)?;

    let db_clone = state.db.clone();
    let id_clone = musteri.id.clone().unwrap_or_default();
    tokio::spawn(async move {
        let frontend_url = frontend_base_url.trim_end_matches('/').to_string();
        let fatura_link = format!("{}/fatura/{}", frontend_url, id_clone);

        let normalized_service_type = detect_montaj_service_type(
            service_type_for_sms.as_deref(),
            Some(service_type_fallback_for_sms.as_str()),
        )
        .unwrap_or_default();

        let mut full_sms_msg = if ["TV_KURULUM", "TV_MONTAJ", "TVKURULUM", "TVMONTAJ"]
            .contains(&normalized_service_type.as_str())
        {
            build_tv_kurulum_sms_message(&customer_name_for_sms, &fatura_link)
        } else if ["ROBOT_KURULUM", "ROBOTKURULUM"].contains(&normalized_service_type.as_str()) {
            build_robot_kurulum_sms_message(&customer_name_for_sms, &fatura_link)
        } else if ["TV_ARIZA", "ROBOT_ARIZA", "TVARIZA", "ROBOTARIZA"]
            .contains(&normalized_service_type.as_str())
        {
            build_montaj_ariza_sms_message(&customer_name_for_sms, &device_model_for_sms)
        } else {
            let sms_msg = build_sms_message(&customer_name_for_sms, &device_model_for_sms);
            format!("{}\n\nFatura Yükleme:\n{}", sms_msg, fatura_link)
        };

        let is_kurulum_service = [
            "TV_KURULUM",
            "TV_MONTAJ",
            "TVKURULUM",
            "TVMONTAJ",
            "ROBOT_KURULUM",
            "ROBOTKURULUM",
        ]
        .contains(&normalized_service_type.as_str());

        if is_kurulum_service && !full_sms_msg.contains("/fatura/") {
            full_sms_msg = format!("{}\n\nFatura Yükleme:\n{}", full_sms_msg, fatura_link);
        }

        if send_sms(&phone_for_sms, &full_sms_msg).await.is_ok() {
            let _ = sqlx::query(
                "UPDATE musteri_kabul SET sms_gonderildi = TRUE, sms_mesaj = $2, updated_at = NOW() WHERE source_mongo_id = $1",
            )
            .bind(&id_clone)
            .bind(&full_sms_msg)
            .execute(&db_clone)
            .await;
        }
    });

    Ok((StatusCode::CREATED, Json(musteri.to_response())))
}

pub async fn get_musteri_kabul(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<MusteriKabulResponse>, (StatusCode, String)> {
    let row = sqlx::query_as::<_, MusteriRow>(
        r#"
        SELECT source_mongo_id, ad_soyad, telefon, marka_model, servis_tipi, aksesuarlar, musteri_sikayeti,
               not_field, teknisyen_aciklamasi, tamir_fisi_no, belge_f, belge_g, belge_u, belge_a,
             status, fiyat_verilecek, sms_gonderildi, created_at, updated_at
        FROM musteri_kabul
        WHERE source_mongo_id = $1
        "#,
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(db_error)?
    .ok_or((StatusCode::NOT_FOUND, "Müşteri not found".to_string()))?;

    Ok(Json(row_to_response(row)))
}

pub async fn list_musteri_kabul(
    State(state): State<AppState>,
) -> Result<Json<Vec<MusteriKabulResponse>>, (StatusCode, String)> {
    let rows = sqlx::query_as::<_, MusteriRow>(
        r#"
        SELECT source_mongo_id, ad_soyad, telefon, marka_model, servis_tipi, aksesuarlar, musteri_sikayeti,
               not_field, teknisyen_aciklamasi, tamir_fisi_no,
               CASE WHEN COALESCE(belge_f, '') <> '' THEN '__HAS_BELGE__' ELSE NULL END AS belge_f,
               CASE WHEN COALESCE(belge_g, '') <> '' THEN '__HAS_BELGE__' ELSE NULL END AS belge_g,
               CASE WHEN COALESCE(belge_u, '') <> '' THEN '__HAS_BELGE__' ELSE NULL END AS belge_u,
               CASE WHEN COALESCE(belge_a, '') <> '' THEN '__HAS_BELGE__' ELSE NULL END AS belge_a,
             status, fiyat_verilecek, sms_gonderildi, created_at, updated_at
        FROM musteri_kabul
        ORDER BY created_at DESC NULLS LAST, id DESC
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(db_error)?;

    Ok(Json(rows.into_iter().map(row_to_response).collect()))
}

pub async fn get_musteri_kabul_stats(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut stats_map = serde_json::Map::new();
    for id in 1..=9 {
        stats_map.insert(id.to_string(), serde_json::json!(0));
    }

    let rows = sqlx::query_as::<_, (String, i64)>(
        "SELECT status, COUNT(*)::bigint FROM musteri_kabul GROUP BY status",
    )
    .fetch_all(&state.db)
    .await
    .map_err(db_error)?;

    for (status_value, count_value) in rows {
        let mapped_id = status_string_to_id(&status_value).or_else(|| {
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
    Query(pagination): Query<PaginationQuery>,
) -> Result<Json<Vec<MusteriKabulResponse>>, (StatusCode, String)> {
    let aliases = status_id_aliases(status_id)
        .ok_or((StatusCode::BAD_REQUEST, format!("Invalid status ID: {}", status_id)))?;
    let aliases: Vec<String> = aliases.into_iter().map(|s| s.to_string()).collect();

    let page_size = pagination.page_size.unwrap_or(10).clamp(1, 10);
    let page = pagination.page.unwrap_or(1).max(1);
    let offset = (page - 1) * page_size;

    let rows = sqlx::query_as::<_, MusteriRow>(
        r#"
        SELECT source_mongo_id, ad_soyad, telefon, marka_model, servis_tipi, aksesuarlar, musteri_sikayeti,
                             not_field, teknisyen_aciklamasi, tamir_fisi_no,
                             CASE WHEN COALESCE(belge_f, '') <> '' THEN '__HAS_BELGE__' ELSE NULL END AS belge_f,
                             CASE WHEN COALESCE(belge_g, '') <> '' THEN '__HAS_BELGE__' ELSE NULL END AS belge_g,
                             CASE WHEN COALESCE(belge_u, '') <> '' THEN '__HAS_BELGE__' ELSE NULL END AS belge_u,
                             CASE WHEN COALESCE(belge_a, '') <> '' THEN '__HAS_BELGE__' ELSE NULL END AS belge_a,
             status, fiyat_verilecek, sms_gonderildi, created_at, updated_at
        FROM musteri_kabul
        WHERE status = ANY($1)
        ORDER BY created_at DESC NULLS LAST, id DESC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(&aliases)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(db_error)?;

    Ok(Json(rows.into_iter().map(row_to_response).collect()))
}

pub async fn delete_musteri_kabul(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let result = sqlx::query("DELETE FROM musteri_kabul WHERE source_mongo_id = $1")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(db_error)?;

    if result.rows_affected() > 0 {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err((StatusCode::NOT_FOUND, "Müşteri bulunamadı".to_string()))
    }
}

pub async fn update_musteri_kabul(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateMusteriKabulRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let existing = sqlx::query_as::<_, MusteriRow>(
        r#"
        SELECT source_mongo_id, ad_soyad, telefon, marka_model, servis_tipi, aksesuarlar, musteri_sikayeti,
               not_field, teknisyen_aciklamasi, tamir_fisi_no, belge_f, belge_g, belge_u, belge_a,
             status, fiyat_verilecek, sms_gonderildi, created_at, updated_at
        FROM musteri_kabul
        WHERE source_mongo_id = $1
        "#,
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(db_error)?
    .ok_or((StatusCode::NOT_FOUND, "Müşteri bulunamadı".to_string()))?;

    let ad_soyad = req.ad_soyad.map(|v| v.to_uppercase());
    let telefon = match req.telefon {
        Some(value) => Some(
            encrypt_value(&value)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Encryption error: {}", e)))?,
        ),
        None => None,
    };
    let marka_model = req.marka_model.map(|v| v.to_uppercase());
    let aksesuarlar = req.aksesuarlar.map(|v| v.to_uppercase());
    let musteri_sikayeti = req.musteri_sikayeti.map(|v| v.to_uppercase());
    let note_text = req.not.map(|v| v.to_uppercase());
    let teknisyen_aciklamasi = req.teknisyen_aciklamasi.map(|v| v.to_uppercase());
    let tamir_fisi_no = req.tamir_fisi_no;
    let belge_f = req.belge_f;
    let belge_g = req.belge_g;
    let belge_u = req.belge_u;
    let belge_a = req.belge_a;
    let fiyat_verilecek = req.fiyat_verilecek;

    let mut queued_status_sms: Option<(String, String, i32)> = None;
    let status_pair = match req.status {
        Some(status_id) => {
            let status_str = status_id_to_string(status_id)
                .ok_or((StatusCode::BAD_REQUEST, format!("Invalid status ID: {}", status_id)))?;
            if existing.status != status_str {
                if let Ok(phone) = decrypt_value(&existing.telefon) {
                    if let Some(sms_message) =
                        build_status_sms_message(status_id, &existing.ad_soyad, &existing.marka_model)
                    {
                        queued_status_sms = Some((phone, sms_message, status_id));
                    }
                }
            }
            Some((status_id, status_str))
        }
        None => None,
    };
    let status_str = status_pair.as_ref().map(|(_, status_str)| status_str.clone());

    let changed = ad_soyad.is_some()
        || telefon.is_some()
        || marka_model.is_some()
        || aksesuarlar.is_some()
        || musteri_sikayeti.is_some()
        || note_text.is_some()
        || teknisyen_aciklamasi.is_some()
        || tamir_fisi_no.is_some()
        || belge_f.is_some()
        || belge_g.is_some()
        || belge_u.is_some()
        || belge_a.is_some()
        || status_str.is_some()
        || fiyat_verilecek.is_some();

    if !changed {
        return Err((StatusCode::BAD_REQUEST, "Güncellenecek alan yok".to_string()));
    }

    let result = sqlx::query(
        r#"
        UPDATE musteri_kabul
        SET ad_soyad = COALESCE($2, ad_soyad),
            telefon = COALESCE($3, telefon),
            marka_model = COALESCE($4, marka_model),
            aksesuarlar = COALESCE($5, aksesuarlar),
            musteri_sikayeti = COALESCE($6, musteri_sikayeti),
            not_field = COALESCE($7, not_field),
            teknisyen_aciklamasi = COALESCE($8, teknisyen_aciklamasi),
            tamir_fisi_no = COALESCE($9, tamir_fisi_no),
            belge_f = COALESCE($10, belge_f),
            belge_g = COALESCE($11, belge_g),
            belge_u = COALESCE($12, belge_u),
            belge_a = COALESCE($13, belge_a),
            status = COALESCE($14, status),
            fiyat_verilecek = COALESCE($15, fiyat_verilecek),
            updated_at = NOW()
        WHERE source_mongo_id = $1
        "#,
    )
    .bind(&id)
    .bind(ad_soyad)
    .bind(telefon)
    .bind(marka_model)
    .bind(aksesuarlar)
    .bind(musteri_sikayeti)
    .bind(note_text)
    .bind(teknisyen_aciklamasi)
    .bind(tamir_fisi_no)
    .bind(belge_f)
    .bind(belge_g)
    .bind(belge_u)
    .bind(belge_a)
    .bind(status_str)
    .bind(fiyat_verilecek)
    .execute(&state.db)
    .await
    .map_err(db_error)?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Müşteri bulunamadı".to_string()));
    }

    if let Some((phone, sms_message, status_id)) = queued_status_sms {
        enqueue_status_sms(&state.db, id.clone(), phone, sms_message, status_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("SMS queue error: {}", e)))?;
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn resend_musteri_sms(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let row = sqlx::query_as::<_, MusteriRow>(
        r#"
        SELECT source_mongo_id, ad_soyad, telefon, marka_model, servis_tipi, aksesuarlar, musteri_sikayeti,
               not_field, teknisyen_aciklamasi, tamir_fisi_no, belge_f, belge_g, belge_u, belge_a,
             status, fiyat_verilecek, sms_gonderildi, created_at, updated_at
        FROM musteri_kabul
        WHERE source_mongo_id = $1
        "#,
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(db_error)?
    .ok_or((StatusCode::NOT_FOUND, "Müşteri bulunamadı".to_string()))?;

    let phone_candidate = decrypt_value(&row.telefon).unwrap_or(row.telefon.clone());
    let phone_digits = phone_candidate.chars().filter(|c| c.is_ascii_digit()).count();
    if phone_digits < 10 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Telefon numarası geçersiz görünüyor. Önce müşteri telefonunu güncelleyip tekrar deneyin.".to_string(),
        ));
    }

    let sms_msg = build_sms_message(&row.ad_soyad, &row.marka_model);
    let frontend_url = resolve_frontend_url(&headers).trim_end_matches('/').to_string();
    let fatura_link = format!("{}/fatura/{}", frontend_url, id);
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

    sqlx::query(
        "UPDATE musteri_kabul SET sms_gonderildi = TRUE, sms_mesaj = $2, updated_at = NOW() WHERE source_mongo_id = $1",
    )
    .bind(&id)
    .bind(&stored_sms_message)
    .execute(&state.db)
    .await
    .map_err(db_error)?;

    Ok(Json(serde_json::json!({"success": true, "message": "SMS tekrar gönderildi"})))
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, String)> {
    let username = req.username.trim().to_lowercase();
    let password = req.password.trim().to_string();

    let matched_user = sqlx::query_as::<_, User>(
        r#"
        SELECT source_mongo_id, ad_soyad, username, password, theme_color, level, created_at
        FROM users
        WHERE username = $1
        LIMIT 1
        "#,
    )
    .bind(&username)
    .fetch_optional(&state.db)
    .await
    .map_err(db_error)?;

    let matched_user_exists = matched_user.is_some();
    let matched_user_with_password = matched_user.filter(|user| user.password == password);

    let user_level = matched_user_with_password
        .as_ref()
        .map(|user| effective_user_level(&user.username, user.level.as_deref()));
    let user_role = user_level
        .as_deref()
        .map(level_to_auth_role)
        .unwrap_or("admin");

    let has_admin_in_db = if username == "admin" {
        matched_user_exists
            || sqlx::query_scalar::<_, i32>("SELECT 1 FROM users WHERE username = 'admin' LIMIT 1")
                .fetch_optional(&state.db)
                .await
                .map_err(db_error)?
                .is_some()
    } else {
        false
    };

    let fallback_admin = username == "admin" && verify_admin_password(&password) && !has_admin_in_db;
    let is_valid_user = matched_user_with_password.is_some() || fallback_admin;

    if !is_valid_user {
        return Err((StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()));
    }

    let token = generate_token(&username, user_role)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Token generation failed".to_string()))?;

    Ok(Json(LoginResponse {
        success: true,
        token: Some(token),
        theme_color: matched_user_with_password
            .as_ref()
            .and_then(|user| user.theme_color.clone()),
        level: user_level,
        message: "Login successful".to_string(),
    }))
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

    let existing = sqlx::query_scalar::<_, i32>("SELECT 1 FROM users WHERE username = $1 LIMIT 1")
        .bind(&username)
        .fetch_optional(&state.db)
        .await
        .map_err(db_error)?;

    if existing.is_some() {
        return Err((StatusCode::CONFLICT, "Bu kullanıcı adı zaten kullanılıyor".to_string()));
    }

    sqlx::query(
        "INSERT INTO users (source_mongo_id, ad_soyad, username, password, level, created_at) VALUES ($1,$2,$3,$4,$5,NOW())",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&ad_soyad)
    .bind(&username)
    .bind(&password)
    .bind(&level)
    .execute(&state.db)
    .await
    .map_err(db_error)?;

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
    let admin_exists = sqlx::query_scalar::<_, i32>("SELECT 1 FROM users WHERE username = 'admin' LIMIT 1")
        .fetch_optional(&state.db)
        .await
        .map_err(db_error)?
        .is_some();

    if !admin_exists {
        sqlx::query(
            "INSERT INTO users (source_mongo_id, ad_soyad, username, password, level, created_at) VALUES ($1,'ADMIN','admin','123456','level1',NOW())",
        )
        .bind(Uuid::new_v4().to_string())
        .execute(&state.db)
        .await
        .map_err(db_error)?;
    }

    let users = sqlx::query_as::<_, User>(
        r#"
        SELECT source_mongo_id, ad_soyad, username, password, theme_color, level, created_at
        FROM users
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(db_error)?;

    let mut results = Vec::new();
    for user in users {
        let is_root_user = user.username == "admin";
        let level = effective_user_level(&user.username, user.level.as_deref());
        results.push(UserListItem {
            id: user.source_mongo_id.unwrap_or_default(),
            ad_soyad: if user.ad_soyad.is_empty() {
                user.username.to_uppercase()
            } else {
                user.ad_soyad
            },
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
    let existing = sqlx::query_as::<_, User>(
        r#"
        SELECT source_mongo_id, ad_soyad, username, password, theme_color, level, created_at
        FROM users
        WHERE source_mongo_id = $1
        LIMIT 1
        "#,
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(db_error)?
    .ok_or((StatusCode::NOT_FOUND, "Kullanıcı bulunamadı".to_string()))?;

    let mut qb = QueryBuilder::new("UPDATE users SET ");
    let mut separated = qb.separated(", ");
    let mut changed = 0usize;

    if let Some(ad_soyad) = req.ad_soyad {
        let value = ad_soyad.trim().to_uppercase();
        if !value.is_empty() {
            separated.push("ad_soyad = ").push_bind(value);
            changed += 1;
        }
    }

    if let Some(username) = req.username {
        let value = username.trim().to_lowercase();
        if !value.is_empty() {
            if existing.username == "admin" && value != "admin" {
                return Err((StatusCode::BAD_REQUEST, "Kök kullanıcının kullanıcı adı değiştirilemez".to_string()));
            }

            let duplicate = sqlx::query_scalar::<_, i32>(
                "SELECT 1 FROM users WHERE username = $1 AND source_mongo_id <> $2 LIMIT 1",
            )
            .bind(&value)
            .bind(&id)
            .fetch_optional(&state.db)
            .await
            .map_err(db_error)?;

            if duplicate.is_some() {
                return Err((StatusCode::CONFLICT, "Bu kullanıcı adı zaten kullanılıyor".to_string()));
            }

            separated.push("username = ").push_bind(value);
            changed += 1;
        }
    }

    if let Some(password) = req.password {
        let value = password.trim().to_string();
        if !value.is_empty() {
            separated.push("password = ").push_bind(value);
            changed += 1;
        }
    }

    if let Some(level) = req.level {
        let value = normalize_user_level(&level)
            .ok_or((StatusCode::BAD_REQUEST, "Geçersiz kullanıcı seviyesi".to_string()))?
            .to_string();

        if existing.username == "admin" && value != "level1" {
            return Err((StatusCode::BAD_REQUEST, "Admin kullanıcı sadece level1 olabilir".to_string()));
        }

        separated.push("level = ").push_bind(value);
        changed += 1;
    }

    if let Some(theme_color) = req.theme_color {
        let value = theme_color.trim().to_uppercase();
        let is_valid_hex = value.len() == 7
            && value.starts_with('#')
            && value.chars().skip(1).all(|c| c.is_ascii_hexdigit());

        if !is_valid_hex {
            return Err((StatusCode::BAD_REQUEST, "Geçersiz tema rengi".to_string()));
        }

        separated.push("theme_color = ").push_bind(value);
        changed += 1;
    }

    if changed == 0 {
        return Err((StatusCode::BAD_REQUEST, "Güncellenecek alan yok".to_string()));
    }

    drop(separated);
    qb.push(" WHERE source_mongo_id = ").push_bind(&id);
    qb.build().execute(&state.db).await.map_err(db_error)?;

    Ok(Json(serde_json::json!({"success": true, "message": "Kullanıcı güncellendi"})))
}

pub async fn delete_user(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let existing = sqlx::query_as::<_, User>(
        r#"
        SELECT source_mongo_id, ad_soyad, username, password, theme_color, level, created_at
        FROM users
        WHERE source_mongo_id = $1
        LIMIT 1
        "#,
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(db_error)?
    .ok_or((StatusCode::NOT_FOUND, "Kullanıcı bulunamadı".to_string()))?;

    if existing.username == "admin" {
        return Err((StatusCode::FORBIDDEN, "Kök kullanıcı silinemez".to_string()));
    }

    sqlx::query("DELETE FROM users WHERE source_mongo_id = $1")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(db_error)?;

    Ok(Json(serde_json::json!({"success": true, "message": "Kullanıcı silindi"})))
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
    let result = sqlx::query(
        r#"
        UPDATE musteri_kabul
        SET teknisyen_aciklamasi = TRIM(not_field),
            updated_at = NOW()
        WHERE (teknisyen_aciklamasi IS NULL OR TRIM(teknisyen_aciklamasi) = '')
          AND not_field IS NOT NULL
          AND TRIM(not_field) <> ''
        "#,
    )
    .execute(&state.db)
    .await
    .map_err(db_error)?;

    Ok(Json(serde_json::json!({
        "success": true,
        "migrated": result.rows_affected(),
    })))
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

    let row = sqlx::query_as::<_, (String, bool, Option<chrono::DateTime<Utc>>)>(
        "SELECT otp_code, used, expires_at FROM delete_otp_requests WHERE source_mongo_id = $1 AND action = $2 AND resource_mongo_id = $3 LIMIT 1",
    )
    .bind(&request_id)
    .bind(action)
    .bind(resource_id)
    .fetch_optional(&state.db)
    .await
    .map_err(db_error)?
    .ok_or((StatusCode::UNAUTHORIZED, "OTP doğrulama kaydı bulunamadı".to_string()))?;

    if row.1 {
        return Err((StatusCode::UNAUTHORIZED, "OTP daha önce kullanıldı".to_string()));
    }

    if row.2.map(|v| v < Utc::now()).unwrap_or(true) {
        return Err((StatusCode::UNAUTHORIZED, "OTP süresi dolmuş".to_string()));
    }

    if code_1 != row.0 {
        return Err((StatusCode::UNAUTHORIZED, "OTP kodu hatalı".to_string()));
    }

    sqlx::query("UPDATE delete_otp_requests SET used = TRUE WHERE source_mongo_id = $1")
        .bind(&request_id)
        .execute(&state.db)
        .await
        .map_err(db_error)?;

    Ok(())
}
