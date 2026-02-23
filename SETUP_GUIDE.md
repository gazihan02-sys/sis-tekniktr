# SIS Teknik - MongoDB + SMS Setup Talimatı

## 📋 Sistem Genel Bakış

Frontend (React+Vite) → API (Rust+Axum) → MongoDB + SMS API

## 🚀 Başlangıç

### 1️⃣ MongoDB Kurulumu

```bash
# Docker ile MongoDB başlat (önerilir)
docker run -d --name mongodb -p 27017:27017 mongo:latest

# Veya lokal MongoDB varsa sadece çalıştır
brew services start mongodb-community
```

### 2️⃣ Backend Başlatma

```bash
cd backend
cargo run  # veya cargo build --release
```

✓ Çıktı: `API listening on http://0.0.0.0:3000`

### 3️⃣ Frontend Başlatma

```bash
cd frontend
npm run dev
```

✓ Tarayıcı otomatik açılır: `http://localhost:5178`

---

## 🔄 Müşteri Kabul Akışı

```
1. Kullanıcı Müşteri Kabul formunu doldurur
   ↓
2. "Kaydet" butonu tıklanır
   ↓
3. Frontend → Backend POST /api/musteri-kabul
   {
     "ad_soyad": "Ahmet Yılmaz",
     "telefon": "+905001234567",
     "marka_model": "Samsung Galaxy S22",
     "aksesuarlar": "Şarj aleti, kutu",
     "musteri_sikayeti": "Ekran kırılı",
     "not": "Vardiye sonunda gös"
   }
   ↓
4. Backend:
   a) Telefon numarasını AES-256-GCM ile şifrele
   b) MongoDB'ye kaydet (ad_soyad, marka_model, etc. açık text)
   c) SMS gönder (arka plandaki async task)
      - Ali Telekomünikasyon API'ye bağlan
      - Mesaj: "Merhaba Ahmet Yılmaz, SIS Teknik'ye hoş geldiniz..."
   d) SMS gönderildiyse DB'yi güncelle (sms_gonderildi: true)
   ↓
5. Kullanıcı başarı mesajı görür: "Müşteri kaydedildi. SMS gönderimi başlatıldı."
```

---

## 🔐 Şifreleme Detayları

### Şifrelenen Alanlar
- `telefon` - AES-256-GCM (MongoDB'de şifreli saklanır)

### Açık Text Alanlar (DB'de)
- `ad_soyad`
- `marka_model`
- `aksesuarlar`
- `musteri_sikayeti`
- `not`
- `status` - "teknisyene_verildi"
- `sms_gonderildi` - boolean
- `sms_mesaj` - gönderilen mesaj kayıdı

---

## 📱 SMS API Entegrasyonu

**Provider:** VoiceTelekom (Ali Telekomünikasyon)
**API URL:** https://smsvt.voicetelekom.com:9588/sms/create

**Gerekli Ayarlar (.env dosyasında):**
```
SMS_USERNAME=rifaterdinc
SMS_PASSWORD=KgVaD5Gr
SMS_SENDER=RIFATERDINC
SMS_API_URL=https://smsvt.voicetelekom.com:9588/sms/create
```

**İstek Formatı:**
```json
POST /sms/create
{
  "username": "rifaterdinc",
  "password": "KgVaD5Gr",
  "sender": "RIFATERDINC",
  "message": "Merhaba Ahmet, SIS Teknik'ye hoş geldiniz...",
  "mobile": "+905001234567"
}
```

---

## 🛠️ Teknik Detaylar

### Frontend (React)
- **Form türü:** Controlled components (state-based)
- **Gönderme:** async/await ile fetch API
- **Yüklenme durumu:** Button disabled + "Gönderiliyor..." metni
- **Hata yönetimi:** Success/Error alert box gösteriyor

### Backend (Rust + Axum)
- **Database:** MongoDB 3.5 driver
- **Şifreleme:** aes-gcm crate (256-bit AES)
- **SMS:** reqwest ile async HTTP POST
- **Async Task:** tokio::spawn ile arka planda SMS gönderimi
- **CORS:** tower-http ile permissive CORS açık

### Database Collections
**Name:** `musteri_kabul`

**Döküman Örneği:**
```json
{
  "_id": ObjectId(".."),
  "ad_soyad": "Ahmet Yılmaz",
  "telefon": "encrypted_string_base64",
  "marka_model": "Samsung Galaxy S22",
  "aksesuarlar": "Şarj aleti, kutu",
  "musteri_sikayeti": "Ekran kırılı",
  "not": "Vardiye sonunda gös",
  "status": "teknisyene_verildi",
  "sirala_dosya_url": null,
  "sms_gonderildi": true,
  "sms_mesaj": "Merhaba Ahmet Yılmaz, SIS Teknik'ye hoş geldiniz...",
  "created_at": "2026-02-21T14:30:00Z",
  "updated_at": "2026-02-21T14:30:05Z"
}
```

---

## 🧪 Test

### Backend Kontrolü
```bash
curl http://localhost:3000/health
# Çıktı: OK
```

### Form Testi
1. Tarayıcı: http://localhost:5178
2. Sol menüden "Müşteri Kabul" tıkla
3. Formu doldur
4. "Kaydet" tıkla
5. Sonuç:
   - ✓ Form temizlenir
   - ✓ "Başarılı" mesajı görünür
   - ✓ MongoDB'de yeni döküman
   - ✓ SMS gönderilir (eğer credentials doğruysa)

### Hata Testi
**Eğer SMS gönderimi başarısız olursa:**
- Backend log: `SMS failed: ...`
- DB'ye yine yazılır ama `sms_gonderildi: false`
- Tekrar SMS gönderme için handler yazılabilir

---

## 📚 API Endpoints

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/health` | Health check |
| POST | `/api/musteri-kabul` | Yeni müşteri ekle (+ SMS gönder) |
| GET | `/api/musteri-kabul` | Tüm müşterileri listele |
| GET | `/api/musteri-kabul/:id` | Spesifik müşteri getir |

---

## ⚙️ Kurulum Kontrol Listesi

- [ ] MongoDB çalışıyor mu? (`docker ps` veya `brew services list`)
- [ ] `.env` dosyası backend klasöründe mı? (`backend/.env`)
- [ ] SMS credentials doğru mu? (USERNAME, PASSWORD, SENDER)
- [ ] Frontend dev server çalışıyor mı? (`npm run dev`)
- [ ] Backend listen edebiliyor mu? (`cargo run`)
- [ ] CORS açık mı? (Frontend localhost:5178 erişebilir mi?)

---

## 🐛 Debugging

**SMS neden gönderilmiyor?**
1. Backend logs kontrol et: `SMS failed: ...`
2. `SMS_API_URL` ve credentials doğru mu?
3. İnternet bağlantısı var mı?
4. Ali Telekomünikasyon API'ye erişilebiliyor mu?

**Frontend forma neden submit olunmuyor?**
1. Browser console: `F12 → Console` tab
2. Network tab'da POST isteği görülüyor mu?
3. Backend `http://localhost:3000/api/musteri-kabul` erişebiliyor mu?

**MongoDB bağlantısı başarısız?**
1. `docker ps` ile container çalışıyor mu?
2. Port 27017 açı mı?
3. `.env` dosyasında `MONGODB_URI` doğru mu?

---

## 🎯 Sonraki Adımlar

1. **Diğer Formlar:** Montaj Ekle, İrsaliye Oluştur
2. **Dosya Upload:** Invoice dosyasını S3/local storage'a kaydet
3. **Authentication:** Müşteri/Teknisyen login sistemi
4. **Status Tracking:** Misafir izleme linki (SMS'te)
5. **Ödemeler:** Stripe/PayTR entegrasyonu

---

**Sorular? Kodları kontrol et:**
- Backend: `/backend/services/api/src/`
- Frontend: `/frontend/src/App.jsx`

Başarılar! 🚀
