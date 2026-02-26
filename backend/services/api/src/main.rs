mod db;
mod models;
mod handlers;
mod crypto;
mod sms;
mod auth;
mod sms_queue;

use axum::{
    extract::{DefaultBodyLimit, Request, State},
    http::Method,
    middleware::{from_fn_with_state, Next},
    routing::{get, post, delete, put},
    Router,
    response::Response,
};
use tower_http::cors::CorsLayer;
use std::env;
use dotenvy::dotenv;
use tokio::sync::broadcast;

use db::connect_db;
use handlers::{AppState, create_montaj_kayit, create_musteri_kabul, get_musteri_kabul, list_montaj_kayitlari, list_musteri_kabul, get_musteri_kabul_stats, list_musteri_kabul_by_status, delete_musteri_kabul, update_musteri_kabul, resend_musteri_sms, login, get_bing_daily_image, create_user, list_users, update_user, delete_user, migrate_teknisyen_notes, get_system_sync, upload_fatura_public, update_montaj_kayit, delete_montaj_kayit, get_montaj_kayit, close_montaj_kayit, download_montaj_files_zip, live_ws};
use sms_queue::start_sms_queue_worker;

async fn broadcast_mutation_updates(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let response = next.run(request).await;

    let is_mutation = matches!(method, Method::POST | Method::PUT | Method::PATCH | Method::DELETE);
    let is_api_request = path.starts_with("/api/");
    let is_ws_path = path == "/api/live/ws";

    if is_api_request && !is_ws_path && is_mutation && response.status().is_success() {
        let _ = state.live_tx.send(());
    }

    response
}

#[tokio::main]
async fn main() {
    dotenv().ok();
    tracing_subscriber::fmt::init();

    // PostgreSQL connection
    let database = match connect_db().await {
        Ok(db) => {
            println!("✓ Database connected");
            db
        }
        Err(e) => {
            eprintln!("✗ Database connection failed: {}", e);
            std::process::exit(1);
        }
    };

    start_sms_queue_worker(database.clone());
    let (live_tx, _) = broadcast::channel::<()>(1024);
    let state = AppState { db: database, live_tx };
    let middleware_state = state.clone();

    // Routes
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/login", post(login))
        .route("/api/live/ws", get(live_ws))
        .route("/api/users", get(list_users).post(create_user))
        .route("/api/users/:id", put(update_user).delete(delete_user))
        .route("/api/migrations/fix-teknisyen-notes", post(migrate_teknisyen_notes))
        .route("/api/bing/daily-image", get(get_bing_daily_image))
        .route("/api/montaj", get(list_montaj_kayitlari).post(create_montaj_kayit))
        .route("/api/montaj/:id", get(get_montaj_kayit).put(update_montaj_kayit).delete(delete_montaj_kayit))
        .route("/api/montaj/:id/kapat", post(close_montaj_kayit))
        .route("/api/montaj/:id/download-zip", get(download_montaj_files_zip))
        .route("/api/musteri-kabul", post(create_musteri_kabul))
        .route("/api/musteri-kabul", get(list_musteri_kabul))
        .route("/api/musteri-kabul/stats", get(get_musteri_kabul_stats))
        .route("/api/system/sync", get(get_system_sync))
        .route("/api/musteri-kabul/by-status/:status", get(list_musteri_kabul_by_status))
        .route("/api/fatura-upload/:id", put(upload_fatura_public))
        .route("/api/musteri-kabul/:id/resend-sms", post(resend_musteri_sms))
        .route("/api/musteri-kabul/:id", get(get_musteri_kabul).delete(delete_musteri_kabul).put(update_musteri_kabul))
        .with_state(state)
        .layer(from_fn_with_state(middleware_state, broadcast_mutation_updates))
        .layer(DefaultBodyLimit::max(15 * 1024 * 1024))
        .layer(CorsLayer::permissive());

    let port = env::var("API_PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    
    println!("✓ API listening on http://{}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> &'static str {
    "OK"
}
