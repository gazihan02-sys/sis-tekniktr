use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Serialize)]
pub struct SmsRequest {
    #[serde(rename = "type")]
    pub msg_type: i32,
    #[serde(rename = "sendingType")]
    pub sending_type: i32,
    pub title: String,
    pub content: String,
    pub number: String,
    pub encoding: i32,
    pub sender: String,
    #[serde(rename = "periodicSettings")]
    pub periodic_settings: Option<serde_json::Value>,
    #[serde(rename = "sendingDate")]
    pub sending_date: Option<serde_json::Value>,
    pub validity: i32,
    #[serde(rename = "pushSettings")]
    pub push_settings: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct SmsErrorResponse {
    pub status: i32,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct SmsApiResponse {
    pub err: Option<SmsErrorResponse>,
    pub data: Option<serde_json::Value>,
    pub status: Option<String>,
    pub message: Option<String>,
    pub message_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SmsResponse {
    pub status: String,
    pub message: String,
    #[serde(default)]
    pub message_id: Option<String>,
}

pub async fn send_sms(phone: &str, message: &str) -> Result<SmsResponse, String> {
    // Hardcoded SMS credentials
    let sms_username = "rifaterdinc";
    let sms_password = "KgVaD5Gr";
    let sms_sender = "RIFATERDINC";
    let sms_api_url = "https://smsvt.voicetelekom.com:9588/sms/create";

    // Telefon numarasını normalize et
    let normalized_phone = normalize_phone(phone);
    println!("📱 SMS API Request - Phone: {} → {}", phone, normalized_phone);

    // Create client with SSL verification disabled and timeout
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
    
    // Create payload matching VoiceTelekom API format
    let payload = SmsRequest {
        msg_type: 1,
        sending_type: 0,
        title: "SIS Teknik SMS".to_string(),
        content: message.to_string(),
        number: normalized_phone.clone(),
        encoding: 0,
        sender: sms_sender.to_string(),
        periodic_settings: None,
        sending_date: None,
        validity: 60,
        push_settings: None,
    };
    
    println!("📱 SMS API Method: POST with JSON (VoiceTelekom format)");
    println!("📱 API URL: {}", sms_api_url);
    println!("📱 JSON Payload: {}", serde_json::to_string(&payload).unwrap_or_default());
    
    match client
        .post(sms_api_url)
        .basic_auth(sms_username, Some(sms_password))
        .json(&payload)
        .header("Content-Type", "application/json")
        .header("User-Agent", "SIS-Teknik/1.0")
        .send()
        .await
    {
        Ok(response_body) => {
            println!("📱 SMS API Response Status: {}", response_body.status());
            let response_text = response_body.text().await.unwrap_or_default();
            println!("📱 SMS API Response Body: {}", response_text);
            
            // Parse API response (nested format)
            match serde_json::from_str::<SmsApiResponse>(&response_text) {
                Ok(api_response) => {
                    println!("✅ SMS Response Parsed: {:?}", api_response);
                    
                    // Check if there's an error
                    if let Some(err) = api_response.err {
                        let error_msg = format!("SMS API Error [{}]: {} - {}", err.status, err.code, err.message);
                        println!("❌ {}", error_msg);
                        return Err(error_msg);
                    }
                    
                    // Return success response
                    Ok(SmsResponse {
                        status: api_response.status.unwrap_or_else(|| "success".to_string()),
                        message: api_response.message.unwrap_or_else(|| "SMS sent".to_string()),
                        message_id: api_response.message_id,
                    })
                }
                Err(e) => {
                    let error_msg = format!("SMS response parse error: {} | Body: {}", e, response_text);
                    println!("❌ {}", error_msg);
                    Err(error_msg)
                }
            }
        }
        Err(e) => {
            let error_msg = format!("SMS API request error: {}", e);
            println!("❌ {}", error_msg);
            Err(error_msg)
        }
    }
}

fn normalize_phone(phone: &str) -> String {
    // Tüm boşlukları, tireleri, parantezleri kaldır
    let cleaned = phone
        .chars()
        .filter(|c| c.is_numeric())
        .collect::<String>();

    // Eğer 90 ile başlıyorsa koru, yoksa başına 90 ekle
    if cleaned.starts_with("90") {
        cleaned
    } else if cleaned.starts_with("0") {
        // 0 ile başlıyorsa 0'ı kaldır ve 90 ekle
        format!("90{}", &cleaned[1..])
    } else {
        // Sadece rakamlara sahipse 90 ekle
        format!("90{}", cleaned)
    }
}


pub fn build_sms_message(customer_name: &str, device_model: &str) -> String {
    let upper_name = customer_name.to_uppercase();
    let upper_model = device_model.to_uppercase();
    format!(
        "SN : {}
{} CİHAZININ İNCELENMEK ÜZERE ATÖLYEMIZE KABUL EDİLMİŞTİR.
TEKNİK ELEKTRONİK 04162161262",
        upper_name, upper_model
    )
}

pub fn build_montaj_kurulum_sms_message(customer_name: &str, upload_link: &str) -> String {
    let upper_name = customer_name.to_uppercase();
    format!(
        "SN : {} MÜŞTERİ KAYDINIZ ALINMIŞTIR. FATURANIZI YÜKLEDİKTEN SONRA HİZMET VERİLECEKTİR.\n\nRESİM YÜKLEME LİNKİ:\n{}",
        upper_name, upload_link
    )
}

pub fn build_tv_kurulum_sms_message(customer_name: &str, upload_link: &str) -> String {
    let upper_name = customer_name.to_uppercase();
    format!(
        "SN : {}\nTV KURULUM KAYDI ALINDI.\nFATURA: {}\nFATURA YUKLENMEDEN HIZMET VERILMEZ.",
        upper_name, upload_link
    )
}

pub fn build_robot_kurulum_sms_message(customer_name: &str, upload_link: &str) -> String {
    let upper_name = customer_name.to_uppercase();
    format!(
        "SN : {}\nROBOT KURULUM KAYDI ALINDI.\nFATURA: {}\nFATURA YUKLENMEDEN HIZMET VERILMEZ.",
        upper_name, upload_link
    )
}

pub fn build_montaj_ariza_sms_message(customer_name: &str, device_model: &str) -> String {
    let upper_name = customer_name.to_uppercase();
    let upper_model = device_model.to_uppercase();
    format!(
        "SN : {}\n{} CIHAZININ INCELENMEK UZERE ATOLYEMIZE KABUL EDILMISTIR.\nTEKNIK ELEKTRONIK 04162161262",
        upper_name, upper_model
    )
}

pub fn build_status_sms_message(status_id: i32, customer_name: &str, device_model: &str) -> Option<String> {
    let upper_name = customer_name.to_uppercase();
    let upper_model = device_model.to_uppercase();
    
    match status_id {
        2 => Some(format!(
            "SN : {}\n{} CIHAZINIZ İNCELENMEK ÜZERE TEKNİSYENE VERİLMİŞTİR.\nTEKNİK ELEKTRONİK 04162161262",
            upper_name, upper_model
        )),
        3 => Some(format!(
            "SN : {}\n{} CIHAZINIZ İŞLEM BEKLEMEKTEDİR. SİSTEMSEL KAYITLAR TAMAMLANDIĞINDA BİLGİ VERİLECEKTİR.\nTEKNİK ELEKTRONİK 04162161262",
            upper_name, upper_model
        )),
        4 => Some(format!(
            "SN : {}\n{} CIHAZINIZ PARÇA BEKLEMEKTEDİR. EN KISA SÜREDE İŞLEMLERİ TAMAMLANACAKTIR.\nTEKNİK ELEKTRONİK 04162161262",
            upper_name, upper_model
        )),
        5 => Some(format!(
            "SN : {}\n{} CIHAZINIZ MERKEZE SEVK EDİLMİŞTİR. EN KISA SÜREDE ULAŞINCA BİLGİ VERİLECEKTİR.\nTEKNİK ELEKTRONİK 04162161262",
            upper_name, upper_model
        )),
        6 => Some(format!(
            "SN : {}\n{} CIHAZINIZIN DEĞİŞİM İŞLEMLERİ YAPILACAKTIR. EN KISA SÜREDE TARAFINIZA BİLGİ SAĞLANACAKTIR.\nTEKNİK ELEKTRONİK 04162161262",
            upper_name, upper_model
        )),
        7 => Some(format!(
            "SN : {}\n{} CIHAZINIZIN TAMİRİ TAMAMLANDI EN KISA SÜREDE TESLİM ALMANIZI RİCA EDERİZ. 20 İŞ GÜNÜ İÇERİSİNDE ALINMAYAN ÜRÜNLER İÇİN SORUMLULUK KABUL EDİLMEYECEKTİR.\nTEKNİK ELEKTRONİK 04162161262",
            upper_name, upper_model
        )),
        8 => Some(format!(
            "SN : {}\n{} CIHAZINIZ TESLİM EDİLDİ GÜLE GÜLE KULLANMANIZ DİLEĞİYLE\nTEKNİK ELEKTRONİK 04162161262",
            upper_name, upper_model
        )),
        9 => Some(format!(
            "SN : {}\n{} CIHAZINIZ İADE EDİLMEK ÜZERE İADE KÖŞESİNE ALINMIŞTIR EN KISA SÜREDE İADE ALINIZ 20 GÜNÜ GEÇEN ÜRÜNLERİN KAYBOLMASI DURUMUNDA SORUMLULUK KABUL EDİLMEYECEKTİR.\nTEKNİK ELEKTRONİK 04162161262",
            upper_name, upper_model
        )),
        _ => None,
    }
}
