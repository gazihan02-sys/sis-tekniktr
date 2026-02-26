BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    source_mongo_id TEXT UNIQUE,
    ad_soyad TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL,
    password TEXT NOT NULL DEFAULT '',
    theme_color TEXT,
    level TEXT,
    created_at TIMESTAMPTZ,
    raw_doc JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username);

CREATE TABLE IF NOT EXISTS musteri_kabul (
    id BIGSERIAL PRIMARY KEY,
    source_mongo_id TEXT UNIQUE,
    ad_soyad TEXT NOT NULL,
    telefon TEXT NOT NULL,
    marka_model TEXT NOT NULL,
    servis_tipi TEXT,
    aksesuarlar TEXT NOT NULL DEFAULT '',
    musteri_sikayeti TEXT NOT NULL DEFAULT '',
    not_field TEXT,
    teknisyen_aciklamasi TEXT,
    tamir_fisi_no TEXT,
    sirala_dosya_url TEXT,
    belge_f TEXT,
    belge_g TEXT,
    belge_u TEXT,
    belge_a TEXT,
    status TEXT NOT NULL,
    fiyat_verilecek BOOLEAN NOT NULL DEFAULT FALSE,
    sms_gonderildi BOOLEAN NOT NULL DEFAULT FALSE,
    sms_mesaj TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw_doc JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_musteri_status_created ON musteri_kabul (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_musteri_created_at_desc ON musteri_kabul (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_musteri_source_mongo_id ON musteri_kabul (source_mongo_id) WHERE source_mongo_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS montaj_kayitlari (
    id BIGSERIAL PRIMARY KEY,
    source_mongo_id TEXT UNIQUE,
    rnu_is_emri_no TEXT,
    ad_soyad TEXT NOT NULL,
    model TEXT NOT NULL,
    telefon TEXT NOT NULL,
    adres TEXT,
    servis_tipi TEXT NOT NULL,
    atanan_kullanici_username TEXT,
    kapatildi BOOLEAN NOT NULL DEFAULT FALSE,
    kapatildi_at TIMESTAMPTZ,
    kurulum_tipi TEXT,
    kurulum_resimleri JSONB,
    belge_f TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw_doc JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_montaj_created ON montaj_kayitlari (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_montaj_source_mongo_id ON montaj_kayitlari (source_mongo_id) WHERE source_mongo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_montaj_assigned ON montaj_kayitlari (atanan_kullanici_username);

CREATE TABLE IF NOT EXISTS sms_queue (
    id BIGSERIAL PRIMARY KEY,
    source_mongo_id TEXT UNIQUE,
    customer_mongo_id TEXT,
    status_id INTEGER,
    phone TEXT,
    message TEXT,
    due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    sent BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    provider_message TEXT,
    raw_doc JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sms_queue_due_unsent ON sms_queue (due_at) WHERE sent = FALSE;

CREATE TABLE IF NOT EXISTS delete_otp_requests (
    id BIGSERIAL PRIMARY KEY,
    source_mongo_id TEXT UNIQUE,
    otp_code TEXT,
    action TEXT,
    resource_mongo_id TEXT,
    phone TEXT,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    raw_doc JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_delete_otp_expires ON delete_otp_requests (expires_at);

CREATE TABLE IF NOT EXISTS mongo_collection_archive (
    id BIGSERIAL PRIMARY KEY,
    collection_name TEXT NOT NULL,
    source_mongo_id TEXT,
    payload JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_archive_collection_mongo_id
    ON mongo_collection_archive (collection_name, source_mongo_id);

COMMIT;
