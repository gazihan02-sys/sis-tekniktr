# Backend Mimarisi ve Servisler

Bu klasör, projenin Rust ile geliştirilmiş, yüksek performanslı ve modüler arka uç (backend) servislerini içerir.

## 📦 Mimari Yapı (Cargo Workspace)

Sistem, bir **Cargo Workspace** olarak yapılandırılmıştır. Bu sayede kod tekrarı önlenir ve modüller birbirinden bağımsız geliştirilebilir.

### 📚 Paylaşılan Kütüphaneler (`crates/`)

Bu kütüphaneler tek başlarına çalışmazlar, servisler tarafından kullanılırlar.

*   **`crates/common`**: 
    *   **Amaç**: Sistemin "ortak dili". Veri modelleri, yapılandırma dosyaları ve evrensel yardımcılar.
    *   **Kullanım**: Tüm servisler `common` kütüphanesine bağımlıdır.
    *   *Örnek*: `Task` struct'ı burada tanımlıdır. 

*   **`crates/utils`**:
    *   **Amaç**: İş mantığı yardımcıları.
    *   **Kullanım**: Servislerin çağırdığı "helper" fonksiyonları.
    *   *Örnek*: `process_task` fonksiyonu.

### ⚙️ Servisler (`services/`)

Bu modüller bağımsız çalıştırılabilir uygulamalardır (`bin`).

*   **`services/automation_engine`**:
    *   **Amaç**: Arka planda çalışan ana motor. Uzun süreli işleri, zamanlanmış görevleri ve veri işlemlerini yönetir.
    *   *Çalıştırma*: `cargo run -p automation_engine`

*   **`services/api`**:
    *   **Amaç**: Dış dünya ile iletişim kuran REST API sunucusu. Frontend veya diğer sistemler buraya bağlanır.
    *   *Çalıştırma*: `cargo run -p api`

## 🛠 Geliştirme Kılavuzu

Hangi parçayı değiştirirseniz değiştirin, bağımlılıklar sayesinde diğer modüller de güncellenir.

1.  **Yeni bir model eklemek için**: `crates/common/src/models.rs` dosyasına ekleyin.
2.  **Yeni bir iş mantığı eklemek için**: `crates/utils/src/lib.rs` dosyasına fonksiyon yazın.
3.  **Serviste kullanmak için**: İlgili servisin `Cargo.toml` dosyasına bağımlılığı ekleyin (zaten ekli) ve kodu kullanın.

## 🧪 Test ve Derleme

Tüm sistemi kontrol etmek için:

```bash
cargo check --workspace
```
