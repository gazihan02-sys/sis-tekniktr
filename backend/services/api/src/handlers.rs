use axum::{
    extract::{Path, State, Json},
    http::StatusCode,
};
use mongodb::Database;
use mongodb::bson::{oid::ObjectId, doc, DateTime, Document};
use serde::{Deserialize, Serialize};

use crate::models::{MusteriKabul, CreateMusteriKabulRequest, MusteriKabulResponse, status_id_to_string, status_string_to_id};
use crate::crypto::{encrypt_value, decrypt_value};
use crate::sms::{send_sms, build_sms_message, build_status_sms_message};
use crate::auth::{LoginRequest, LoginResponse, generate_token, verify_admin_password};

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
    pub created_at: Option<DateTime>,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub ad_soyad: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserListItem {
    pub id: String,
    pub ad_soyad: String,
    pub username: String,
    pub created_at_ms: i64,
    pub is_root: bool,
    pub can_delete: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub ad_soyad: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
}

pub async fn create_musteri_kabul(
    State(state): State<AppState>,
    Json(req): Json<CreateMusteriKabulRequest>,
) -> Result<(StatusCode, Json<MusteriKabulResponse>), (StatusCode, String)> {
    let collection = state.db.collection::<MusteriKabul>("musteri_kabul");
    
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
                let sms_msg = build_sms_message(&customer_name_for_sms, &device_model_for_sms);
                
                // Fatura yükleme linkini SMS'e ekle
                let frontend_url = std::env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:5173".to_string());
                let fatura_link = format!("{}/fatura/{}", frontend_url, id_clone.to_hex());
                let full_sms_msg = format!("{}\n\nFatura Yükleme:\n{}", sms_msg, fatura_link);
                
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
    
    match collection.find(doc! {}).await {
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
    
    let mut stats = serde_json::json!({});
    
    for id in 1..=9 {
        if let Some(status_str) = status_id_to_string(id) {
            let count = collection.count_documents(
                doc! { "status": &status_str }
            ).await.unwrap_or(0);
            stats[id.to_string()] = serde_json::json!(count);
        }
    }
    
    Ok(Json(stats))
}

pub async fn list_musteri_kabul_by_status(
    State(state): State<AppState>,
    Path(status_id): Path<i32>,
) -> Result<Json<Vec<MusteriKabulResponse>>, (StatusCode, String)> {
    let collection = state.db.collection::<MusteriKabul>("musteri_kabul");
    
    let status_str = status_id_to_string(status_id)
        .ok_or((StatusCode::BAD_REQUEST, format!("Invalid status ID: {}", status_id)))?;
    
    match collection.find(doc! { "status": &status_str }).await {
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
    
    // Handle status change and send SMS
    if let Some(status_id) = req.status {
        if let Some(status_str) = status_id_to_string(status_id) {
            update_doc.insert("status", status_str);
            
            // Send SMS with status-specific message if phone exists
            if let Ok(phone) = decrypt_value(&existing_customer.telefon) {
                if let Some(sms_message) = build_status_sms_message(status_id, &existing_customer.ad_soyad, &existing_customer.marka_model) {
                    let customer_id = id.clone();
                    
                    tokio::spawn(async move {
                        match send_sms(&phone, &sms_message).await {
                            Ok(_) => println!("✅ SMS gönderildi - Status: {} - ID: {}", status_id, customer_id),
                            Err(e) => println!("❌ SMS gönderilemedi - Status: {} - Hata: {}", status_id, e),
                        }
                    });
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
                println!("✏️ Müşteri güncellendi: {}", id);
                Ok(StatusCode::NO_CONTENT)
            } else {
                Err((StatusCode::NOT_FOUND, "Müşteri bulunamadı".to_string()))
            }
        },
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e))),
    }
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, String)> {
    let username = req.username.trim().to_lowercase();
    let password = req.password.trim().to_string();

    let users = state.db.collection::<User>("users");

    let matched_user = users
        .find_one(doc! { "username": &username, "password": &password })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    let has_admin_in_db = users
        .find_one(doc! { "username": "admin" })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
        .is_some();

    let fallback_admin = username == "admin" && verify_admin_password(&password) && !has_admin_in_db;

    let is_valid_user = matched_user.is_some() || fallback_admin;

    if !is_valid_user {
        return Err((StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()));
    }
    
    // Generate JWT token
    match generate_token(&username, "admin") {
        Ok(token) => {
            println!("🔐 Login successful for user: {}", username);
            Ok(Json(LoginResponse {
                success: true,
                token: Some(token),
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
        created_at: Some(DateTime::now()),
    };

    users.insert_one(user)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Kullanıcı başarıyla eklendi",
        "username": username
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

        results.push(UserListItem {
            id: user.id.map(|id| id.to_hex()).unwrap_or_default(),
            ad_soyad: if user.ad_soyad.is_empty() { user.username.to_uppercase() } else { user.ad_soyad },
            username: user.username,
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
