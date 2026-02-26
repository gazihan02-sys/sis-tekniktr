use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::crypto::decrypt_value;

pub fn status_id_to_string(id: i32) -> Option<String> {
    match id {
        1 => Some("MÜŞTERI_KABUL".to_string()),
        2 => Some("TEKNISYENE_VERİLDİ".to_string()),
        3 => Some("İŞLEM_BEKLİYOR".to_string()),
        4 => Some("PARÇA_BEKLİYOR".to_string()),
        5 => Some("MERKEZE_SEVK".to_string()),
        6 => Some("DEĞİŞİM".to_string()),
        7 => Some("TAMİR_TAMAMLANDI".to_string()),
        8 => Some("TESLİM_EDİLDİ".to_string()),
        9 => Some("İADE".to_string()),
        _ => None,
    }
}

pub fn status_string_to_id(status: &str) -> Option<i32> {
    match status {
        "MÜŞTERI_KABUL" => Some(1),
        "TEKNISYENE_VERİLDİ" => Some(2),
        "İŞLEM_BEKLİYOR" => Some(3),
        "PARÇA_BEKLİYOR" => Some(4),
        "MERKEZE_SEVK" => Some(5),
        "DEĞİŞİM" => Some(6),
        "TAMİR_TAMAMLANDI" => Some(7),
        "TESLİM_EDİLDİ" => Some(8),
        "İADE" => Some(9),
        _ => None,
    }
}

pub fn status_id_aliases(id: i32) -> Option<Vec<&'static str>> {
    match id {
        1 => Some(vec!["MÜŞTERI_KABUL", "MUSTERI_KABUL", "MÜŞTERİ_KABUL", "musteri_kabul"]),
        2 => Some(vec!["TEKNISYENE_VERİLDİ", "TEKNISYENE_VERILDI", "teknisyene_verildi"]),
        3 => Some(vec!["İŞLEM_BEKLİYOR", "ISLEM_BEKLIYOR", "islem_bekliyor"]),
        4 => Some(vec!["PARÇA_BEKLİYOR", "PARCA_BEKLIYOR", "parca_bekliyor"]),
        5 => Some(vec!["MERKEZE_SEVK", "merkeze_sevk"]),
        6 => Some(vec!["DEĞİŞİM", "DEGISIM", "degisim"]),
        7 => Some(vec!["TAMİR_TAMAMLANDI", "TAMIR_TAMAMLANDI", "tamir_tamamlandi"]),
        8 => Some(vec!["TESLİM_EDİLDİ", "TESLIM_EDILDI", "teslim_edildi"]),
        9 => Some(vec!["İADE", "IADE", "iade"]),
        _ => None,
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(crate = "serde")]
pub struct MusteriKabul {
    pub id: Option<String>,
    pub ad_soyad: String,
    pub telefon: String,
    pub marka_model: String,
    pub servis_tipi: Option<String>,
    pub aksesuarlar: String,
    pub musteri_sikayeti: String,
    pub not: Option<String>,
    pub teknisyen_aciklamasi: Option<String>,
    pub tamir_fisi_no: Option<String>,
    pub sirala_dosya_url: Option<String>,
    pub belge_f: Option<String>,
    pub belge_g: Option<String>,
    pub belge_u: Option<String>,
    pub belge_a: Option<String>,
    pub status: String,
    pub fiyat_verilecek: bool,
    pub sms_gonderildi: bool,
    pub sms_mesaj: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct CreateMusteriKabulRequest {
    pub ad_soyad: String,
    pub telefon: String,
    pub marka_model: String,
    pub servis_tipi: Option<String>,
    pub aksesuarlar: String,
    pub musteri_sikayeti: String,
    pub not: Option<String>,
    pub teknisyen_aciklamasi: Option<String>,
    pub tamir_fisi_no: Option<String>,
    pub status: Option<i32>,
    pub fiyat_verilecek: Option<bool>,
    pub belge_f: Option<String>,
    pub belge_g: Option<String>,
    pub belge_u: Option<String>,
    pub belge_a: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct UpdateMusteriKabulRequest {
    pub ad_soyad: Option<String>,
    pub telefon: Option<String>,
    pub marka_model: Option<String>,
    pub aksesuarlar: Option<String>,
    pub musteri_sikayeti: Option<String>,
    pub not: Option<String>,
    pub teknisyen_aciklamasi: Option<String>,
    pub tamir_fisi_no: Option<String>,
    pub status: Option<i32>,
    pub fiyat_verilecek: Option<bool>,
    pub belge_f: Option<String>,
    pub belge_g: Option<String>,
    pub belge_u: Option<String>,
    pub belge_a: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MusteriKabulResponse {
    pub id: String,
    pub ad_soyad: String,
    pub telefon: String,
    pub marka_model: String,
    pub servis_tipi: Option<String>,
    pub aksesuarlar: String,
    pub musteri_sikayeti: String,
    pub not: Option<String>,
    pub teknisyen_aciklamasi: Option<String>,
    pub tamir_fisi_no: Option<String>,
    pub belge_f: Option<String>,
    pub belge_g: Option<String>,
    pub belge_u: Option<String>,
    pub belge_a: Option<String>,
    pub status: String,
    pub fiyat_verilecek: bool,
    pub sms_gonderildi: bool,
    pub created_at: String,
}

impl MusteriKabul {
    pub fn new(req: CreateMusteriKabulRequest) -> Self {
        let now = Utc::now();
        let status_id = req.status.unwrap_or(1);
        let status_string = status_id_to_string(status_id).unwrap_or_else(|| "MÜŞTERI_KABUL".to_string());
        Self {
            id: None,
            ad_soyad: req.ad_soyad.to_uppercase(),
            telefon: req.telefon.to_uppercase(),
            marka_model: req.marka_model.to_uppercase(),
            servis_tipi: req.servis_tipi.map(|v| v.to_uppercase()),
            aksesuarlar: req.aksesuarlar.to_uppercase(),
            musteri_sikayeti: req.musteri_sikayeti.to_uppercase(),
            not: req.not.map(|n| n.to_uppercase()),
            teknisyen_aciklamasi: req.teknisyen_aciklamasi.map(|n| n.to_uppercase()),
            tamir_fisi_no: req.tamir_fisi_no,
            sirala_dosya_url: None,
            belge_f: req.belge_f,
            belge_g: req.belge_g,
            belge_u: req.belge_u,
            belge_a: req.belge_a,
            status: status_string,
            fiyat_verilecek: req.fiyat_verilecek.unwrap_or(false),
            sms_gonderildi: false,
            sms_mesaj: None,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn to_response(self) -> MusteriKabulResponse {
        let decrypted_phone = decrypt_value(&self.telefon).unwrap_or_else(|_| self.telefon.clone());

        MusteriKabulResponse {
            id: self.id.unwrap_or_default(),
            ad_soyad: self.ad_soyad,
            telefon: decrypted_phone,
            marka_model: self.marka_model,
            servis_tipi: self.servis_tipi,
            aksesuarlar: self.aksesuarlar,
            musteri_sikayeti: self.musteri_sikayeti,
            not: self.not,
            teknisyen_aciklamasi: self.teknisyen_aciklamasi,
            tamir_fisi_no: self.tamir_fisi_no,
            belge_f: self.belge_f,
            belge_g: self.belge_g,
            belge_u: self.belge_u,
            belge_a: self.belge_a,
            status: self.status,
            fiyat_verilecek: self.fiyat_verilecek,
            sms_gonderildi: self.sms_gonderildi,
            created_at: self.created_at.to_rfc3339(),
        }
    }
}
