use mongodb::{Client, Database};
use mongodb::bson::doc;
use std::env;

pub async fn connect_db() -> Result<Database, Box<dyn std::error::Error>> {
    let mongodb_uri = env::var("MONGODB_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let db_name = env::var("MONGODB_DATABASE").unwrap_or_else(|_| "sis_teknik".to_string());

    let client = Client::with_uri_str(&mongodb_uri).await?;
    
    // Test connection
    client.database("admin").run_command(doc! { "ping": 1 }).await?;
    println!("✓ MongoDB connected successfully");

    Ok(client.database(&db_name))
}
