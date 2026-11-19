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
# Messages are in English: the Windows console that runs ssh cannot show Persian text.
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
[ "$(id -u)" = 0 ] || die "Run this script as root."

export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

say "1/8 Installing prerequisites from Ubuntu (Docker, Caddy, Node.js, ...)"
apt-get update -qq
compose_pkg=docker-compose-v2; apt-cache show docker-compose-v2 >/dev/null 2>&1 || compose_pkg=docker-compose-plugin
apt-get install -y -qq docker.io "$compose_pkg" caddy git jq openssl ca-certificates curl ufw nodejs npm >/dev/null
docker compose version >/dev/null 2>&1 || die "docker compose was not installed."
# the override below needs compose ≥ 2.24.4 («!override»); the app's build tool (Vite 8) needs Node ≥ 20.19
printf '%s\n%s\n' 2.24.4 "$(docker compose version --short | tr -d v)" | sort -V -C || die "docker compose is older than 2.24.4."
[ "$(node -p 'process.versions.node.split(".").map(Number).reduce((a, b, i) => a + b * [1e6, 1e3, 1][i], 0)')" -ge 20019000 ] || die "Node.js $(node -v) is too old (20.19 or newer is needed)."
ok "Docker $(docker --version | awk '{print $3}' | tr -d ,) · Compose $(docker compose version --short) · Node $(node -v)"

say "2/8 Using the ArvanCloud Docker mirror (Docker Hub is blocked from Iran)"
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<JSON
{ "registry-mirrors": ["$MIRROR"], "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "3" } }
JSON
systemctl restart docker
ok "mirror: $MIRROR"

say "3/8 Fetching the official Supabase setup and generating passwords and keys"
if [ ! -f "$SUPA_DIR/.env" ]; then
  # Supabase's own setup.sh does a partial git clone of its repository, which fails from Iran; the same official files
  # ship with this repository (deploy/server/supabase-docker, release self-hosted/v0.8.4) and are set up the same way.
  mkdir -p "$SUPA_DIR"
  cp -r "$SRC_DIR/deploy/server/supabase-docker/." "$SUPA_DIR/"
  cd "$SUPA_DIR"
  cp .env.example .env
  sh utils/generate-keys.sh --update-env >/dev/null
  sh utils/add-new-auth-keys.sh --update-env >/dev/null
  printf '# Supabase self-hosted version stamp. Managed by setup.sh / update.sh.\nref=self-hosted/v0.8.4\n' > .supabase-version
  ok "passwords and keys created ($SUPA_DIR/.env)"
else
  ok "kept the existing settings ($SUPA_DIR/.env)"
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
ok "public address: $SITE_URL"

say "4/8 Downloading and starting Supabase (5-15 minutes the first time)"
docker compose pull -q
docker compose up -d
for i in $(seq 1 60); do
  [ "$(docker compose ps --format json | jq -s '[.[] | select(.Health=="unhealthy" or .State!="running")] | length')" = 0 ] && break
  sleep 5
done
docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Health}}'

say "5/8 Fetching the Farin code"
if [ -d "$SRC_DIR/.git" ]; then git -C "$SRC_DIR" fetch -q --depth 1 origin "$BRANCH" && git -C "$SRC_DIR" reset -q --hard FETCH_HEAD
else git clone -q --depth 1 -b "$BRANCH" "$REPO" "$SRC_DIR"; fi
ok "version: $(git -C "$SRC_DIR" log -1 --format='%h %s' | cut -c1-70)"

say "6/8 Building the Farin app for this server"
ANON=$(grep '^ANON_KEY=' "$SUPA_DIR/.env" | cut -d= -f2-)
cd "$SRC_DIR"
npm ci --no-audit --no-fund --loglevel=error
VITE_SUPABASE_URL="$SITE_URL" VITE_SUPABASE_ANON_KEY="$ANON" HOST_BUILD=true npx vite build --logLevel error
mkdir -p "$WEB_DIR" && rm -rf "${WEB_DIR:?}"/* && cp -r dist/. "$WEB_DIR"/
ok "app installed in $WEB_DIR"

say "7/8 Configuring Caddy (Farin pages + Supabase paths)"
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
ok "Caddy listening on port 80"

say "8/8 Firewall: only ports 22, 80 and 443"
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ok "$(ufw status | head -1)"

cat <<DONE

$(printf '\033[1;32m')DONE - installation finished.$(printf '\033[0m')
  Farin:   $SITE_URL
  (no data yet - moving the data over is the next step)

  Supabase Studio (admin panel) only from your own computer, through an SSH tunnel:
    ssh -L 8000:127.0.0.1:8000 root@$PUBLIC_IP
    then open in the browser: http://localhost:8000
    username and password:  cd $SUPA_DIR && sh run.sh secrets   (DASHBOARD_USERNAME / DASHBOARD_PASSWORD)

  Passwords and keys are in $SUPA_DIR/.env - keep a backup of this file and never share it.
DONE
