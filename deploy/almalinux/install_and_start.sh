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

log "Done"
log "Frontend static: $APP_DIR/frontend/dist"
log "API local: http://127.0.0.1:$API_PORT"
log "If using OpenLiteSpeed, map /api -> http://127.0.0.1:$API_PORT"
