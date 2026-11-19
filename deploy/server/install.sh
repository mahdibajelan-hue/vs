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
# With a domain (HTTPS certificate is fetched and renewed automatically by Caddy; the domain is remembered for later runs):
#                DOMAIN=farin.example.ir bash /opt/farin-src/deploy/server/install.sh
# Safe to run again: it keeps an existing Supabase .env (secrets) and only rebuilds what changed.
set -euo pipefail

SUPA_DIR=/opt/supabase
SRC_DIR=/opt/farin-src
WEB_DIR=/var/www/farin
REPO=https://github.com/mahdibajelan-hue/vs
BRANCH=claude/piping-isometric-tracker-x8y5i1
MIRROR=https://docker.arvancloud.ir
PUBLIC_IP=$(curl -s -m 10 https://api.ipify.org || hostname -I | awk '{print $1}')
DOMAIN_FILE=/etc/farin-domain
DOMAIN=${DOMAIN:-$(cat "$DOMAIN_FILE" 2>/dev/null || true)}
DOMAIN=$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z' | sed -E 's#^https?://##; s#/.*$##')
if [ -n "$DOMAIN" ]; then SITE_URL=${SITE_URL:-https://$DOMAIN}; else SITE_URL=${SITE_URL:-http://$PUBLIC_IP}; fi

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    ✔ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✘ %s\033[0m\n' "$*"; exit 1; }
[ "$(id -u)" = 0 ] || die "Run this script as root."

export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

say "1/8 Installing prerequisites from Ubuntu (Docker, Caddy, Node.js, ...)"
apt-get update -qq
compose_pkg=docker-compose-v2; apt-cache show docker-compose-v2 >/dev/null 2>&1 || compose_pkg=docker-compose-plugin
apt-get install -y -qq docker.io "$compose_pkg" caddy git jq openssl ca-certificates curl ufw nodejs >/dev/null
docker compose version >/dev/null 2>&1 || die "docker compose was not installed."
# the override below needs compose ≥ 2.24.4 («!override»); Node runs Supabase's key generator
printf '%s\n%s\n' 2.24.4 "$(docker compose version --short | tr -d v)" | sort -V -C || die "docker compose is older than 2.24.4."
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
if [ -n "$DOMAIN" ]; then
  # Caddy can only get a certificate when the domain already points at this server
  dns_ip=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')
  [ "$dns_ip" = "$PUBLIC_IP" ] || die "The domain $DOMAIN points to '${dns_ip:-nothing}', not to this server ($PUBLIC_IP). Fix its DNS A record, wait a few minutes, run again."
  echo "$DOMAIN" > "$DOMAIN_FILE"
  ok "domain $DOMAIN points to this server"
fi
OLD_SITE_URL=$(grep '^SITE_URL=' .env | cut -d= -f2- || true)
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
# stored links to files (profile photos) follow the site to its new address
if [ -n "$OLD_SITE_URL" ] && [ "$OLD_SITE_URL" != "$SITE_URL" ]; then
  docker exec supabase-db psql -h localhost -U supabase_admin -d postgres -X -q -c \
    "do \$\$ begin if to_regclass('public.profiles') is not null then update public.profiles set avatar_url = replace(avatar_url, '$OLD_SITE_URL', '$SITE_URL') where avatar_url like '$OLD_SITE_URL%'; end if; end \$\$;" \
    && ok "stored file links moved from $OLD_SITE_URL to $SITE_URL"
fi

say "5/8 Fetching the Farin code"
if [ -d "$SRC_DIR/.git" ]; then git -C "$SRC_DIR" fetch -q --depth 1 origin "$BRANCH" && git -C "$SRC_DIR" reset -q --hard FETCH_HEAD
else git clone -q --depth 1 -b "$BRANCH" "$REPO" "$SRC_DIR"; fi
ok "version: $(git -C "$SRC_DIR" log -1 --format='%h %s' | cut -c1-70)"

say "6/8 Installing the Farin app (built by GitHub; the server only downloads it)"
# the build tools need CPU instructions this virtual server lacks («Illegal instruction»), so GitHub builds the app
# (.github/workflows/server-build.yml → branch server-build) and this step copies it and writes its config.js
ANON=$(grep '^ANON_KEY=' "$SUPA_DIR/.env" | cut -d= -f2-)
WEB_SRC=/opt/farin-web
if [ -d "$WEB_SRC/.git" ]; then git -C "$WEB_SRC" fetch -q --depth 1 origin server-build && git -C "$WEB_SRC" reset -q --hard FETCH_HEAD
else git clone -q --depth 1 -b server-build "$REPO" "$WEB_SRC"; fi
mkdir -p "$WEB_DIR" && find "$WEB_DIR" -mindepth 1 -delete
(cd "$WEB_SRC" && tar cf - --exclude=.git .) | tar xf - -C "$WEB_DIR"
printf 'window.__FARIN_CONFIG__ = { supabaseUrl: "%s", supabaseAnonKey: "%s" };\n' "$SITE_URL" "$ANON" > "$WEB_DIR/config.js"
ok "app installed in $WEB_DIR ($(git -C "$WEB_SRC" log -1 --format=%cd --date=short))"

say "7/8 Configuring Caddy (Farin pages + Supabase paths)"
if [ -n "$DOMAIN" ]; then
  SITE_BLOCK=$DOMAIN
  # the bare address still works: it sends the visitor to the secure domain
  REDIRECT_BLOCK="http://$PUBLIC_IP {
	redir https://$DOMAIN{uri} permanent
}"
else
  SITE_BLOCK=:80
  REDIRECT_BLOCK=""
fi
cat > /etc/caddy/Caddyfile <<CADDY
# Farin PMIS — written by deploy/server/install.sh
$SITE_BLOCK {
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
$REDIRECT_BLOCK
CADDY
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || die "The Caddy settings are not valid: caddy validate --config /etc/caddy/Caddyfile"
systemctl enable -q caddy && systemctl restart caddy
ok "Caddy restarted"

say "8/8 Firewall: only ports 22, 80 and 443"
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ok "$(ufw status | head -1)"

if [ -n "$DOMAIN" ]; then
  say "Waiting for the HTTPS certificate of $DOMAIN (up to 2 minutes)"
  code=000
  for i in $(seq 1 24); do
    code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "https://$DOMAIN/" || true)
    [ "$code" = 200 ] && break
    sleep 5
  done
  if [ "$code" = 200 ]; then
    ok "https://$DOMAIN works"
  else
    printf '\033[1;33m    ! no certificate yet. Last messages from Caddy:\033[0m\n'
    journalctl -u caddy --since "-5 min" --no-pager -o cat | grep -iE 'error|challenge|certificate' | tail -6 | cut -c1-220 | sed 's/^/      /'
    printf '\033[1;33m    ! Check that port 443 and 80 are open in the ArvanCloud panel (Security group / firewall) and run again.\033[0m\n'
  fi
fi

cat <<DONE

$(printf '\033[1;32m')DONE - installation finished.$(printf '\033[0m')
  Farin:   $SITE_URL

  Supabase Studio (admin panel) only from your own computer, through an SSH tunnel:
    ssh -L 8000:127.0.0.1:8000 root@$PUBLIC_IP
    then open in the browser: http://localhost:8000
    username and password:  cd $SUPA_DIR && sh run.sh secrets   (DASHBOARD_USERNAME / DASHBOARD_PASSWORD)

  Passwords and keys are in $SUPA_DIR/.env - keep a backup of this file and never share it.
DONE
