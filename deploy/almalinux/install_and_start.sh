#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/gazihan02-sys/siste.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/sis-teknik}"
API_PORT="${API_PORT:-3000}"
MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017}"
MONGODB_DATABASE="${MONGODB_DATABASE:-sis_teknik}"
FRONTEND_URL="${FRONTEND_URL:-https://tamir.sis-teknik.com.tr}"

if [[ "$(id -u)" -eq 0 ]]; then
  RUN_USER="${SUDO_USER:-root}"
else
  RUN_USER="$(id -un)"
fi

SERVICE_USER="${SERVICE_USER:-$RUN_USER}"
SERVICE_GROUP="${SERVICE_GROUP:-$(id -gn "$SERVICE_USER" 2>/dev/null || echo "$SERVICE_USER")}" 

if [[ "$RUN_USER" == "root" ]]; then
  RUN_HOME="/root"
else
  RUN_HOME="$(eval echo "~$RUN_USER")"
fi

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  SUDO="sudo"
fi

log() {
  echo "[sis-teknik] $*"
}

log "System packages installing"
$SUDO dnf -y update
$SUDO dnf -y install git curl gcc gcc-c++ make openssl-devel pkgconfig tar nodejs npm

if ! command -v cargo >/dev/null 2>&1; then
  log "Rust toolchain installing"
  curl https://sh.rustup.rs -sSf | sh -s -- -y
fi

if [[ -f "$RUN_HOME/.cargo/env" ]]; then
  # shellcheck source=/dev/null
  source "$RUN_HOME/.cargo/env"
fi

if ! command -v cargo >/dev/null 2>&1; then
  log "cargo not found after install. Run: source $RUN_HOME/.cargo/env"
  exit 1
fi

log "Project directory preparing: $APP_DIR"
$SUDO mkdir -p "$APP_DIR"
$SUDO chown -R "$RUN_USER":"$(id -gn "$RUN_USER")" "$APP_DIR"

if [[ -d "$APP_DIR/.git" ]]; then
  log "Repository updating"
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  log "Repository cloning"
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

log "Frontend build"
cd "$APP_DIR/frontend"
npm ci || npm i
npm run build

log "Backend build"
cd "$APP_DIR/backend"
cargo build --release --bin api

log "Systemd service writing"
$SUDO tee /etc/systemd/system/sis-teknik-api.service >/dev/null <<EOF
[Unit]
Description=Sis Teknik API (Rust Axum)
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/backend/target/release/api
Restart=always
RestartSec=3
Environment=API_PORT=$API_PORT
Environment=MONGODB_URI=$MONGODB_URI
Environment=MONGODB_DATABASE=$MONGODB_DATABASE
Environment=FRONTEND_URL=$FRONTEND_URL

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now sis-teknik-api
$SUDO systemctl restart sis-teknik-api
$SUDO systemctl --no-pager --full status sis-teknik-api | sed -n '1,20p'

log "OpenLiteSpeed installing and configuring"
$SUDO dnf -y install openlitespeed

# Kill existing OLS processes
pkill -9 lshttpd 2>/dev/null || true
pkill -9 openlitespeed 2>/dev/null || true
sleep 2

# Main OLS config
$SUDO tee /usr/local/lsws/conf/httpd_config.conf >/dev/null <<'EOLOSL'
user nobody
group nobody
priority -1
autoRestart 1
gracefulRestartTimeout 300
mime /usr/local/lsws/conf/mime.properties
showVersionNumber 1
useIpInProxyHeader 1
enableLVE 0

errorLog {
  filename /usr/local/lsws/logs/error.log
  logLevel 8
  rollingSize 10485760
}

accessLog {
  filename /usr/local/lsws/logs/access.log
  logFormat %a %t "%r" %s %b "%{Referer}i" "%{User-Agent}i"
  rollingSize 104857600
  keepDays 30
  compressArchive 1
}

listener Default {
  address 0.0.0.0:80
  secure 0
  enableHttp2 1
}

listener HTTPS {
  address 0.0.0.0:443
  secure 1
  certFile /usr/local/lsws/conf/sample.crt
  keyFile /usr/local/lsws/conf/sample.key
  enableHttp2 1
  sslProtocol TLSv1.2 TLSv1.3
}

virtualhost tamir {
  vhRoot __APPDIR_REPLACE__/frontend/dist/
  configFile /usr/local/lsws/conf/vhosts/tamir/httpd_config.conf
  listeners Default HTTPS
  enableExpires 1
}

serverName sis-teknik
maxConnections 10000
connTimeout 60
EOLOSL

# Replace APP_DIR placeholder in main config
$SUDO sed -i "s|__APPDIR_REPLACE__|$APP_DIR|g" /usr/local/lsws/conf/httpd_config.conf

# Vhost config
$SUDO mkdir -p /usr/local/lsws/conf/vhosts/tamir
$SUDO tee /usr/local/lsws/conf/vhosts/tamir/httpd_config.conf >/dev/null <<'EOLVHOST'
docRoot __APPDIR_REPLACE__/frontend/dist/
enableExpires 1
expiresByType text/html=3600
indexFiles index.html

context / {
  location __APPDIR_REPLACE__/frontend/dist/
  allowBrowse 1
  handlers static
}

context /api {
  location /api
  handler proxy
  proxyAddress 127.0.0.1:3000
  proxyProtocol http
}
EOLVHOST

# Replace APP_DIR placeholder in vhost config
$SUDO sed -i "s|__APPDIR_REPLACE__|$APP_DIR|g" /usr/local/lsws/conf/vhosts/tamir/httpd_config.conf

# Set permissions
$SUDO chown -R nobody:nobody "$APP_DIR/frontend/dist/"
$SUDO chmod -R 755 "$APP_DIR/frontend/dist/"

# Start OLS
/usr/local/lsws/bin/lshttpd -r 2>&1 | head -5 || true
sleep 3

log "Done"
log "Frontend static: $APP_DIR/frontend/dist"
log "API local: http://127.0.0.1:$API_PORT"
log "OpenLiteSpeed: http://IP:80 -> $APP_DIR/frontend/dist/ (static)"
log "OpenLiteSpeed: http://IP/api -> http://127.0.0.1:$API_PORT (proxy)"
log ""
log "Test:"
log "  curl -I http://127.0.0.1/"
log "  curl -I http://127.0.0.1/api/login"
