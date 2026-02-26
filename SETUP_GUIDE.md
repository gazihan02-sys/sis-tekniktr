# SIS Teknik - PostgreSQL + SMS Setup Talimatı

## 📋 Sistem Genel Bakış

Frontend (React + Vite) → API (Rust + Axum) → PostgreSQL + SMS API

## 🚀 Hızlı Başlangıç

### 1) PostgreSQL kontrol

```bash
systemctl is-active postgresql
```

Beklenen çıktı: `active`

### 2) API build + start

```bash
cd backend
cargo build --release -p api
systemctl restart sis-tekniktr-backend
systemctl status sis-tekniktr-backend --no-pager
```

### 3) Frontend start

```bash
cd frontend
npm run dev
```

## 🔐 Backend Environment

Servis PostgreSQL ile aşağıdaki değişkenle çalışır:

```env
DATABASE_URL=postgresql://sis_teknik_app:SisTeknikApp_2026!Pg@127.0.0.1:5432/sis_teknik
API_PORT=3001
FRONTEND_URL=https://tamir.sis-teknik.com.tr
TURNSTILE_SECRET_KEY=...
```

## 🗄️ PostgreSQL Şema ve Veri

### Şema yükleme

```bash
psql "postgresql://postgres:postgres@127.0.0.1:5432/sis_teknik" -f backend/postgresql/schema.sql
```

### Mongo dump'tan PostgreSQL'e import (tek seferlik migration)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/postgresql/requirements.txt
python3 backend/postgresql/import_from_mongodb.py \
  --dump-dir /var/www/sis-tekniktr/Mongodb/sis_teknik \
  --postgres-dsn 'postgresql://sis_teknik_app:SisTeknikApp_2026!Pg@127.0.0.1:5432/sis_teknik'
```

## 🧪 Kontrol Komutları

```bash
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/api/system/sync
```

## 📚 Temel API Endpointleri

- `GET /health`
- `POST /api/login`
- `GET /api/system/sync`
- `GET/POST /api/musteri-kabul`
- `GET/POST /api/montaj`
- `GET/POST/PUT/DELETE /api/users`

## 🐛 Hata Giderme

- Servis logları:

```bash
journalctl -u sis-tekniktr-backend -n 200 --no-pager
```

- PostgreSQL bağlantı testi:

```bash
PGPASSWORD='SisTeknikApp_2026!Pg' psql -h 127.0.0.1 -U sis_teknik_app -d sis_teknik -c 'SELECT 1;'
```

- Port dinleme kontrolü:

```bash
ss -ltnp | grep 3001
```
