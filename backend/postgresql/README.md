# MongoDB → PostgreSQL Geçişi

Bu klasör MongoDB dump verisini PostgreSQL'e taşımak için gerekli dosyaları içerir.

## Dosyalar

- `schema.sql`: PostgreSQL tablo, index ve arşiv şeması
- `import_from_mongodb.py`: BSON dump dosyalarını PostgreSQL'e aktaran ETL scripti
- `requirements.txt`: ETL script bağımlılıkları

## 1) PostgreSQL şemasını oluştur

```bash
psql "postgresql://postgres:postgres@127.0.0.1:5432/sis_teknik" -f backend/postgresql/schema.sql
```

## 2) ETL bağımlılıklarını kur

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/postgresql/requirements.txt
```

## 3) BSON dump'ı içe aktar

```bash
python3 backend/postgresql/import_from_mongodb.py \
  --dump-dir /var/www/sis-tekniktr/Mongodb/sis_teknik \
  --postgres-dsn postgresql://postgres:postgres@127.0.0.1:5432/sis_teknik
```

## Opsiyonel: Sadece belirli koleksiyonları taşı

```bash
python3 backend/postgresql/import_from_mongodb.py \
  --dump-dir /var/www/sis-tekniktr/Mongodb/sis_teknik \
  --postgres-dsn postgresql://postgres:postgres@127.0.0.1:5432/sis_teknik \
  --only users musteri_kabul montaj_kayitlari sms_queue delete_otp_requests
```

## Notlar

- API'nin aktif kullandığı koleksiyonlar typed tablolara aktarılır:
  - `users`
  - `musteri_kabul`
  - `montaj_kayitlari`
  - `sms_queue`
  - `delete_otp_requests`
- Dump içindeki diğer koleksiyonlar veri kaybı olmaması için `mongo_collection_archive` tablosuna `JSONB` olarak alınır.
- `_id` alanı `source_mongo_id` olarak saklanır. Bu alanlar unique'tir ve script tekrar çalıştırıldığında upsert yapar.
- `created_at/updated_at` gibi alanlar mümkün oldukça `TIMESTAMPTZ` tipine çevrilir.

## Sonraki teknik adım

Bu geçiş paketi yalnızca veri katmanını PostgreSQL'e taşır. API kodundaki Mongo sorgularının (`handlers.rs`, `sms_queue.rs`, `db.rs`) `sqlx`/`Diesel` ile PostgreSQL sorgularına çevrilmesi bir sonraki adımdır.
