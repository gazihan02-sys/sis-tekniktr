mod db;
mod models;
mod handlers;
mod crypto;
mod sms;
mod auth;

use axum::{
    routing::{get, post, delete, put},
    Router,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use tower_http::cors::CorsLayer;
use std::env;
use dotenvy::dotenv;

use db::connect_db;
use handlers::{AppState, create_musteri_kabul, get_musteri_kabul, list_musteri_kabul, get_musteri_kabul_stats, list_musteri_kabul_by_status, delete_musteri_kabul, update_musteri_kabul, login, get_bing_daily_image, create_user, list_users, update_user, delete_user, migrate_teknisyen_notes};

#[tokio::main]
async fn main() {
    dotenv().ok();
    tracing_subscriber::fmt::init();

    // MongoDB connection
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

    let state = AppState { db: database };

    // Routes
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/login", post(login))
        .route("/api/users", get(list_users).post(create_user))
        .route("/api/users/:id", put(update_user).delete(delete_user))
        .route("/api/migrations/fix-teknisyen-notes", post(migrate_teknisyen_notes))
        .route("/api/bing/daily-image", get(get_bing_daily_image))
        .route("/api/musteri-kabul", post(create_musteri_kabul))
        .route("/api/musteri-kabul", get(list_musteri_kabul))
        .route("/api/musteri-kabul/stats", get(get_musteri_kabul_stats))
        .route("/api/musteri-kabul/by-status/:status", get(list_musteri_kabul_by_status))
        .route("/api/musteri-kabul/:id", get(get_musteri_kabul).delete(delete_musteri_kabul).put(update_musteri_kabul))
        .with_state(state)
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
