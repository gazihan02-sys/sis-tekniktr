use mongodb::{
    bson::doc,
    options::IndexOptions,
    bson::Document,
    Client,
    Collection,
    Database,
    IndexModel,
};
use std::env;

fn is_index_conflict_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("indexoptionsconflict")
        || lower.contains("indexkeyspecsconflict")
        || lower.contains("index already exists with a different name")
}

async fn create_index_safe(
    collection: &Collection<Document>,
    index: IndexModel,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Err(err) = collection.create_index(index).await {
        let message = err.to_string();
        if is_index_conflict_error(&message) {
            println!("⚠️ Index conflict ignored: {}", message);
            return Ok(());
        }
        return Err(Box::new(err));
    }
    Ok(())
}

async fn drop_index_if_exists(
    collection: &Collection<Document>,
    index_name: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Err(err) = collection.drop_index(index_name).await {
        let message = err.to_string().to_lowercase();
        let is_missing = message.contains("indexnotfound")
            || message.contains("index not found")
            || message.contains("ns not found");

        if !is_missing {
            return Err(Box::new(err));
        }
    }

    Ok(())
}

async fn ensure_indexes(db: &Database) -> Result<(), Box<dyn std::error::Error>> {
    let musteri_collection = db.collection::<mongodb::bson::Document>("musteri_kabul");
    create_index_safe(
        &musteri_collection,
        IndexModel::builder()
            .keys(doc! { "status": 1, "_id": -1 })
            .options(
                IndexOptions::builder()
                    .name(Some("idx_musteri_status_id_desc".to_string()))
                    .build(),
            )
            .build(),
    )
    .await?;

    let users_collection = db.collection::<mongodb::bson::Document>("users");
    drop_index_if_exists(&users_collection, "idx_users_username").await?;
    drop_index_if_exists(&users_collection, "username_1").await?;

    create_index_safe(
        &users_collection,
        IndexModel::builder()
            .keys(doc! { "username": 1 })
            .options(
                IndexOptions::builder()
                    .name(Some("idx_users_username".to_string()))
                    .unique(Some(true))
                    .build(),
            )
            .build(),
    )
    .await?;

    drop_index_if_exists(&users_collection, "idx_users_username_password").await?;

    let sms_queue_collection = db.collection::<mongodb::bson::Document>("sms_queue");
    create_index_safe(
        &sms_queue_collection,
        IndexModel::builder()
            .keys(doc! { "due_at": 1 })
            .options(
                IndexOptions::builder()
                    .name(Some("idx_sms_queue_due_at_unsent".to_string()))
                    .partial_filter_expression(Some(doc! { "sent": false }))
                    .build(),
            )
            .build(),
    )
    .await?;

    drop_index_if_exists(&sms_queue_collection, "idx_sms_queue_sent_due_at").await?;

    let otp_collection = db.collection::<mongodb::bson::Document>("delete_otp_requests");
    create_index_safe(
        &otp_collection,
        IndexModel::builder()
            .keys(doc! { "expires_at": 1 })
            .options(
                IndexOptions::builder()
                    .name(Some("idx_delete_otp_expires_at_ttl".to_string()))
                    .expire_after(Some(std::time::Duration::from_secs(0)))
                    .build(),
            )
            .build(),
    )
    .await?;

    Ok(())
}

pub async fn connect_db() -> Result<Database, Box<dyn std::error::Error>> {
    let mongodb_uri = env::var("MONGODB_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let db_name = env::var("MONGODB_DATABASE").unwrap_or_else(|_| "sis_teknik".to_string());

    let client = Client::with_uri_str(&mongodb_uri).await?;
    
    // Test connection
    client.database("admin").run_command(doc! { "ping": 1 }).await?;
    println!("✓ MongoDB connected successfully");

    let db = client.database(&db_name);
    ensure_indexes(&db).await?;
    println!("✓ MongoDB indexes ensured");

    Ok(db)
}
