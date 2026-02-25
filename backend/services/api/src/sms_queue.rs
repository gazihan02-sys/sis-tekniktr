use std::time::Duration;

use mongodb::{
    bson::{doc, oid::ObjectId, Bson, DateTime},
    Database,
};
use serde::{Deserialize, Serialize};

use crate::sms::send_sms;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SmsQueueItem {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub customer_id: ObjectId,
    pub status_id: i32,
    pub phone: String,
    pub message: String,
    pub due_at: DateTime,
    pub created_at: DateTime,
    pub sent: bool,
    pub sent_at: Option<DateTime>,
    pub attempts: i32,
    pub last_error: Option<String>,
}

pub async fn enqueue_status_sms(
    db: &Database,
    customer_id: ObjectId,
    phone: String,
    message: String,
    status_id: i32,
) -> Result<(), String> {
    let collection = db.collection::<SmsQueueItem>("sms_queue");
    let due_millis = (chrono::Utc::now() + chrono::Duration::hours(1)).timestamp_millis();

    let item = SmsQueueItem {
        id: None,
        customer_id,
        status_id,
        phone,
        message,
        due_at: DateTime::from_millis(due_millis),
        created_at: DateTime::now(),
        sent: false,
        sent_at: None,
        attempts: 0,
        last_error: None,
    };

    collection
        .insert_one(item)
        .await
        .map_err(|e| format!("Queue insert error: {}", e))?;

    Ok(())
}

pub fn start_sms_queue_worker(db: Database) {
    tokio::spawn(async move {
        loop {
            if let Err(e) = process_due_sms_queue(&db).await {
                tracing::error!("SMS queue worker error: {}", e);
            }
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    });
}

async fn process_due_sms_queue(db: &Database) -> Result<(), String> {
    let queue_collection = db.collection::<SmsQueueItem>("sms_queue");
    let customer_collection = db.collection::<mongodb::bson::Document>("musteri_kabul");

    let now = DateTime::now();
    let mut cursor = queue_collection
        .find(doc! {
            "sent": false,
            "due_at": { "$lte": now }
        })
        .sort(doc! { "due_at": 1 })
        .limit(25)
        .await
        .map_err(|e| format!("Queue find error: {}", e))?;

    while cursor
        .advance()
        .await
        .map_err(|e| format!("Queue cursor error: {}", e))?
    {
        let item: SmsQueueItem = cursor
            .deserialize_current()
            .map_err(|e| format!("Queue deserialize error: {}", e))?;

        let Some(queue_id) = item.id else {
            continue;
        };

        let queue_filter = doc! { "_id": queue_id };

        match send_sms(&item.phone, &item.message).await {
            Ok(response) => {
                queue_collection
                    .update_one(
                        queue_filter,
                        doc! {
                            "$set": {
                                "sent": true,
                                "sent_at": DateTime::now(),
                                "last_error": Bson::Null,
                                "provider_message": response.message,
                            },
                            "$inc": {
                                "attempts": 1,
                            }
                        },
                    )
                    .await
                    .map_err(|e| format!("Queue success update error: {}", e))?;

                let _ = customer_collection
                    .update_one(
                        doc! { "_id": item.customer_id },
                        doc! {
                            "$set": {
                                "sms_gonderildi": true,
                                "sms_mesaj": item.message,
                            }
                        },
                    )
                    .await;
            }
            Err(err) => {
                let retry_millis = (chrono::Utc::now() + chrono::Duration::minutes(5)).timestamp_millis();
                queue_collection
                    .update_one(
                        queue_filter,
                        doc! {
                            "$set": {
                                "last_error": err,
                                "due_at": DateTime::from_millis(retry_millis),
                            },
                            "$inc": {
                                "attempts": 1,
                            }
                        },
                    )
                    .await
                    .map_err(|e| format!("Queue failure update error: {}", e))?;
            }
        }
    }

    Ok(())
}
