#!/usr/bin/env bash
# Farin PMIS — one-server install: self-hosted Supabase (Docker) + the Farin web app, behind Caddy.
#
# Written for a server in Iran (ArvanCloud, Ubuntu 24.04/26.04), where Docker Hub and download.docker.com refuse
# Iranian addresses: Docker comes from Ubuntu's own packages and images through ArvanCloud's registry mirror.
#
#   http://SERVER/            → the Farin app (static files in /var/www/farin)
#   http://SERVER/rest|auth|storage|functions|realtime/v1/…  → Supabase (API gateway on 127.0.0.1:8000)
#
# Only ports 22, 80 and 443 are open to the internet. The database, the API gateway and Supabase Studio listen on
# 127.0.0.1 only; Studio is reached through an SSH tunnel (see the end of this script).
#
# Run as root:   bash /opt/farin-src/deploy/server/install.sh
# Safe to run again: it keeps an existing Supabase .env (secrets) and only rebuilds what changed.
set -euo pipefail

SUPA_DIR=/opt/supabase
SRC_DIR=/opt/farin-src
WEB_DIR=/var/www/farin
REPO=https://github.com/mahdibajelan-hue/vs
BRANCH=claude/piping-isometric-tracker-x8y5i1
MIRROR=https://docker.arvancloud.ir
PUBLIC_IP=$(curl -s -m 10 https://api.ipify.org || hostname -I | awk '{print $1}')
SITE_URL=${SITE_URL:-http://$PUBLIC_IP}

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    ✔ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✘ %s\033[0m\n' "$*"; exit 1; }
[ "$(id -u)" = 0 ] || die "این اسکریپت باید با کاربر root اجرا شود."

export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

say "۱/۸ نصب پیش‌نیازها از مخزن Ubuntu (Docker، Caddy، Node.js، …)"
apt-get update -qq
compose_pkg=docker-compose-v2; apt-cache show docker-compose-v2 >/dev/null 2>&1 || compose_pkg=docker-compose-plugin
apt-get install -y -qq docker.io "$compose_pkg" caddy git jq openssl ca-certificates curl ufw nodejs npm >/dev/null
docker compose version >/dev/null 2>&1 || die "docker compose نصب نشد."
# the override below needs compose ≥ 2.24.4 («!override»); the app's build tool (Vite 8) needs Node ≥ 20.19
printf '%s\n%s\n' 2.24.4 "$(docker compose version --short | tr -d v)" | sort -V -C || die "نسخهٔ docker compose قدیمی است (کمتر از 2.24.4)."
[ "$(node -p 'process.versions.node.split(".").map(Number).reduce((a, b, i) => a + b * [1e6, 1e3, 1][i], 0)')" -ge 20019000 ] || die "نسخهٔ Node.js قدیمی است ($(node -v)؛ دست‌کم 20.19 لازم است)."
ok "Docker $(docker --version | awk '{print $3}' | tr -d ,) · Compose $(docker compose version --short) · Node $(node -v)"

say "۲/۸ تنظیم آینهٔ Docker ابرآروان (Docker Hub از ایران مسدود است)"
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<JSON
{ "registry-mirrors": ["$MIRROR"], "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "3" } }
JSON
systemctl restart docker
ok "آینه: $MIRROR"

say "۳/۸ دریافت تنظیمات رسمی Supabase و ساخت رمزها و کلیدها"
if [ ! -f "$SUPA_DIR/.env" ]; then
  cd /opt
  curl -fsSL https://raw.githubusercontent.com/supabase/supabase/master/docker/setup.sh -o /tmp/supabase-setup.sh \
    || git clone -q --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase /tmp/sb-src
  if [ -f /tmp/supabase-setup.sh ]; then
    sh /tmp/supabase-setup.sh --skip-deps -y --project-dir supabase
  else
    (cd /tmp/sb-src && git sparse-checkout set docker && cp -r docker "$SUPA_DIR" && cd "$SUPA_DIR" && cp .env.example .env \
      && sh utils/generate-keys.sh --update-env && sh utils/add-new-auth-keys.sh --update-env)
  fi
  ok "رمزها و کلیدها ساخته شد ($SUPA_DIR/.env)"
else
  ok "تنظیمات قبلی نگه داشته شد ($SUPA_DIR/.env)"
fi
cd "$SUPA_DIR"
setenv() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
setenv SUPABASE_PUBLIC_URL "$SITE_URL"
setenv API_EXTERNAL_URL "$SITE_URL/auth/v1"
setenv SITE_URL "$SITE_URL"
# the database, the pooler and the gateway listen on this machine only; Caddy is the one door in
cat > docker-compose.farin.yml <<'YAML'
services:
  api-gw:
    ports: !override
      - "127.0.0.1:8000:8000/tcp"
  supavisor:
    ports: !override
      - "127.0.0.1:${POSTGRES_PORT}:5432"
      - "127.0.0.1:${POOLER_PROXY_PORT_TRANSACTION}:6543"
YAML
case "$(grep '^COMPOSE_FILE=' .env | cut -d= -f2-)" in *docker-compose.farin.yml*) ;; *) sed -i 's|^COMPOSE_FILE=\(.*\)|COMPOSE_FILE=\1:docker-compose.farin.yml|' .env ;; esac
ok "آدرس عمومی: $SITE_URL"

say "۴/۸ دریافت و اجرای Supabase (بار اول ۵ تا ۱۵ دقیقه)"
docker compose pull -q
docker compose up -d
for i in $(seq 1 60); do
  [ "$(docker compose ps --format json | jq -s '[.[] | select(.Health=="unhealthy" or .State!="running")] | length')" = 0 ] && break
  sleep 5
done
docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Health}}'

say "۵/۸ دریافت کد فرین"
if [ -d "$SRC_DIR/.git" ]; then git -C "$SRC_DIR" fetch -q --depth 1 origin "$BRANCH" && git -C "$SRC_DIR" reset -q --hard FETCH_HEAD
else git clone -q --depth 1 -b "$BRANCH" "$REPO" "$SRC_DIR"; fi
ok "نسخه: $(git -C "$SRC_DIR" log -1 --format='%h %s' | cut -c1-70)"

say "۶/۸ ساخت برنامهٔ فرین برای این سرور"
ANON=$(grep '^ANON_KEY=' "$SUPA_DIR/.env" | cut -d= -f2-)
cd "$SRC_DIR"
npm ci --no-audit --no-fund --loglevel=error
VITE_SUPABASE_URL="$SITE_URL" VITE_SUPABASE_ANON_KEY="$ANON" HOST_BUILD=true npx vite build --logLevel error
mkdir -p "$WEB_DIR" && rm -rf "${WEB_DIR:?}"/* && cp -r dist/. "$WEB_DIR"/
ok "برنامه در $WEB_DIR"

say "۷/۸ تنظیم Caddy (صفحات فرین + مسیرهای Supabase)"
cat > /etc/caddy/Caddyfile <<CADDY
# Farin PMIS — written by deploy/server/install.sh
${CADDY_SITE:-:80} {
	encode zstd gzip
	@supabase path /rest/v1/* /auth/v1/* /storage/v1/* /functions/v1/* /realtime/v1/* /graphql/v1/*
	handle @supabase {
		reverse_proxy 127.0.0.1:8000
	}
	handle {
		root * $WEB_DIR
		@assets path /assets/*
		header @assets Cache-Control "public, max-age=31536000, immutable"
		try_files {path} /index.html
		file_server
	}
}
CADDY
systemctl enable -q caddy && systemctl restart caddy
ok "Caddy روی درگاه ۸۰"

say "۸/۸ دیوار آتش: فقط درگاه‌های ۲۲، ۸۰ و ۴۴۳"
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ok "$(ufw status | head -1)"

cat <<DONE

$(printf '\033[1;32m')✔ نصب تمام شد.$(printf '\033[0m')
  سامانه:  $SITE_URL
  (هنوز داده‌ای ندارد — انتقال داده‌ها قدم بعدی است.)

  پنل مدیریت Supabase (Studio) فقط از کامپیوتر خودتان، با تونل SSH:
    ssh -L 8000:127.0.0.1:8000 root@$PUBLIC_IP
    سپس در مرورگر: http://localhost:8000
    نام کاربری و رمز:  cd $SUPA_DIR && sh run.sh secrets   (DASHBOARD_USERNAME / DASHBOARD_PASSWORD)

  رمزها و کلیدها در $SUPA_DIR/.env هستند — از این فایل نسخهٔ پشتیبان بگیرید و به کسی ندهید.
DONE
