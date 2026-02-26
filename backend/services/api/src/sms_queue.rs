use std::time::Duration;

use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::sms::send_sms;

#[derive(Debug, FromRow, Clone)]
pub struct SmsQueueItem {
    pub source_mongo_id: String,
    pub customer_mongo_id: Option<String>,
    pub status_id: Option<i32>,
    pub phone: Option<String>,
    pub message: Option<String>,
    pub sent: bool,
    pub attempts: i32,
}

pub async fn enqueue_status_sms(
    db: &PgPool,
    customer_source_id: String,
    phone: String,
    message: String,
    status_id: i32,
) -> Result<(), String> {
    sqlx::query(
        r#"
        INSERT INTO sms_queue
        (source_mongo_id, customer_mongo_id, status_id, phone, message, due_at, created_at, sent, attempts)
        VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 hour', NOW(), FALSE, 0)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(customer_source_id)
    .bind(status_id)
    .bind(phone)
    .bind(message)
    .execute(db)
    .await
    .map_err(|e| format!("Queue insert error: {}", e))?;

    Ok(())
}

pub fn start_sms_queue_worker(db: PgPool) {
    tokio::spawn(async move {
        loop {
            if let Err(e) = process_due_sms_queue(&db).await {
                tracing::error!("SMS queue worker error: {}", e);
            }
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    });
}

async fn process_due_sms_queue(db: &PgPool) -> Result<(), String> {
    let items = sqlx::query_as::<_, SmsQueueItem>(
        r#"
        SELECT source_mongo_id, customer_mongo_id, status_id, phone, message, sent, attempts
        FROM sms_queue
        WHERE sent = FALSE AND due_at <= NOW()
        ORDER BY due_at ASC
        LIMIT 25
        "#,
    )
    .fetch_all(db)
    .await
    .map_err(|e| format!("Queue find error: {}", e))?;

    for item in items {
        let Some(phone) = item.phone.clone() else {
            continue;
        };
        let Some(message) = item.message.clone() else {
            continue;
        };

        match send_sms(&phone, &message).await {
            Ok(response) => {
                sqlx::query(
                    r#"
                    UPDATE sms_queue
                    SET sent = TRUE,
                        sent_at = NOW(),
                        attempts = attempts + 1,
                        last_error = NULL,
                        provider_message = $2
                    WHERE source_mongo_id = $1
                    "#,
                )
                .bind(&item.source_mongo_id)
                .bind(response.message)
                .execute(db)
                .await
                .map_err(|e| format!("Queue success update error: {}", e))?;

                if let Some(customer_id) = item.customer_mongo_id {
                    let _ = sqlx::query(
                        r#"
                        UPDATE musteri_kabul
                        SET sms_gonderildi = TRUE,
                            sms_mesaj = $2,
                            updated_at = NOW()
                        WHERE source_mongo_id = $1
                        "#,
                    )
                    .bind(customer_id)
                    .bind(message)
                    .execute(db)
                    .await;
                }
            }
            Err(err) => {
                sqlx::query(
                    r#"
                    UPDATE sms_queue
                    SET attempts = attempts + 1,
                        last_error = $2,
                        due_at = NOW() + INTERVAL '5 minute'
                    WHERE source_mongo_id = $1
                    "#,
                )
                .bind(&item.source_mongo_id)
                .bind(err)
                .execute(db)
                .await
                .map_err(|e| format!("Queue failure update error: {}", e))?;
            }
        }
    }

    Ok(())
}
