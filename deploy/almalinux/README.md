# AlmaLinux + LiteSpeed Deployment (tamir.sis-teknik.com.tr)

## 1) Sunucu hazırlığı

```bash
sudo dnf -y update
sudo dnf -y install git curl gcc gcc-c++ make openssl-devel pkgconfig tar
curl https://sh.rustup.rs -sSf | sh -s -- -y
source "$HOME/.cargo/env"
```

## 2) Proje kurulumu

```bash
sudo mkdir -p /opt/sis-teknik
sudo chown -R $USER:$USER /opt/sis-teknik
cd /opt/sis-teknik
git clone https://github.com/gazihan02-sys/siste.git .
```

## 3) Frontend build

```bash
cd /opt/sis-teknik/frontend
npm ci || npm i
npm run build
```

## 4) Backend build

```bash
cd /opt/sis-teknik/backend
cargo build --release --bin api
```

## 5) Systemd servis

```bash
sudo cp /opt/sis-teknik/deploy/almalinux/api.service /etc/systemd/system/sis-teknik-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now sis-teknik-api
sudo systemctl status sis-teknik-api --no-pager
```

## 6) LiteSpeed reverse proxy

- Domain: `tamir.sis-teknik.com.tr`
- Document root: `/opt/sis-teknik/frontend/dist`
- Reverse proxy rule: `/api/*` -> `http://127.0.0.1:3000/api/*`

OpenLiteSpeed WebAdmin içinde:
1. Virtual Host oluştur (tamir.sis-teknik.com.tr)
2. Context (Static) root: `/opt/sis-teknik/frontend/dist`
3. Context (Proxy) URI: `/api/` Address: `http://127.0.0.1:3000/`
4. Listener 443 + SSL certificate (Let's Encrypt)

## 7) SSL (LetsEncrypt)

CyberPanel varsa panelden tek tık SSL kur.
OpenLiteSpeed native kurulumda certbot ile sertifika alıp vhost'a bağla.

## 8) Kontrol

```bash
curl -I https://tamir.sis-teknik.com.tr
curl -I https://tamir.sis-teknik.com.tr/api/login
```
