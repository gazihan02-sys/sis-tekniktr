use sqlx::{postgres::PgPoolOptions, PgPool};
use std::env;

async fn ensure_indexes(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query("ALTER TABLE musteri_kabul ADD COLUMN IF NOT EXISTS fiyat_verilecek BOOLEAN NOT NULL DEFAULT FALSE")
        .execute(pool)
        .await?;

    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_musteri_status_created ON musteri_kabul (status, created_at DESC)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_musteri_created_at_desc ON musteri_kabul (created_at DESC)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_musteri_source_mongo_id ON musteri_kabul (source_mongo_id) WHERE source_mongo_id IS NOT NULL")
        .execute(pool)
        .await?;

    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_montaj_source_mongo_id ON montaj_kayitlari (source_mongo_id) WHERE source_mongo_id IS NOT NULL")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_montaj_created ON montaj_kayitlari (created_at DESC)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_sms_queue_due_unsent ON sms_queue (due_at) WHERE sent = FALSE")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_delete_otp_expires ON delete_otp_requests (expires_at)")
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn connect_db() -> Result<PgPool, Box<dyn std::error::Error>> {
    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
        "postgresql://sis_teknik_app:SisTeknikApp_2026!Pg@127.0.0.1:5432/sis_teknik".to_string()
    });

    let pool = PgPoolOptions::new()
        .max_connections(20)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .connect(&database_url)
        .await?;

    sqlx::query("SELECT 1").execute(&pool).await?;
    println!("✓ PostgreSQL connected successfully");

    ensure_indexes(&pool).await?;
    println!("✓ PostgreSQL indexes ensured");

    Ok(pool)
}
