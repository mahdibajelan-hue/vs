#!/usr/bin/env bash
# Farin PMIS — keeps this server up to date with GitHub, by itself. Every change pushed to GitHub reaches the server
# within about five minutes: the app, the server-side functions and the new SQL of the database. Data is never removed.
#
#   bash /opt/farin-src/deploy/server/auto-update.sh --install   switch the automatic update on (and run it once now)
#   bash /opt/farin-src/deploy/server/auto-update.sh             check and update now, by hand
#   bash /opt/farin-src/deploy/server/auto-update.sh --status    what is installed, and the last runs
#   bash /opt/farin-src/deploy/server/auto-update.sh --remove    switch the automatic update off
#
# What one run does (nothing when GitHub has nothing new):
#   1. downloads the new code (only what changed: a few MB)
#   2. new SQL files of deploy/server/sql-updates.txt: a backup of the database first (/root/farin-backups, the last
#      5 are kept), then each file in one transaction. At the first error it stops and keeps the old app, so the app
#      never runs on a database it does not match; the error is in the log and the next run tries again.
#   3. the app built by GitHub (branch server-build): swapped in at once, never half copied
#   4. the server-side functions, when they changed
# Messages are in English: the Windows console that runs ssh cannot show Persian text.
set -euo pipefail

SRC_DIR=${SRC_DIR:-/opt/farin-src}
WEB_SRC=${WEB_SRC:-/opt/farin-web}
WEB_DIR=${WEB_DIR:-/var/www/farin}
SUPA_DIR=${SUPA_DIR:-/opt/supabase}
BRANCH=${BRANCH:-claude/piping-isometric-tracker-x8y5i1}
DB=${DB_CONTAINER:-supabase-db}
BACKUPS=${BACKUPS:-/root/farin-backups}
STATE=/var/lib/farin-update
SELF=$SRC_DIR/deploy/server/auto-update.sh

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }

case "${1:-}" in
  --install)
    cat > /etc/systemd/system/farin-update.service <<UNIT
[Unit]
Description=Farin PMIS: update from GitHub
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/bash $SELF
TimeoutStartSec=30min
UNIT
    cat > /etc/systemd/system/farin-update.timer <<'UNIT'
[Unit]
Description=Farin PMIS: check GitHub for updates every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
RandomizedDelaySec=30s

[Install]
WantedBy=timers.target
UNIT
    systemctl daemon-reload
    systemctl enable -q --now farin-update.timer
    echo "Automatic update is ON (every 5 minutes). Running it once now..."
    systemctl start farin-update.service || true
    journalctl -u farin-update.service -n 25 --no-pager -o cat
    exit 0 ;;
  --remove)
    systemctl disable -q --now farin-update.timer 2>/dev/null || true
    rm -f /etc/systemd/system/farin-update.timer /etc/systemd/system/farin-update.service
    systemctl daemon-reload
    echo "Automatic update is OFF."
    exit 0 ;;
  --status)
    systemctl is-active -q farin-update.timer && echo "Automatic update: ON" || echo "Automatic update: OFF"
    echo "Code:  $(git -C "$SRC_DIR" log -1 --format='%h %cd %s' --date=format:'%F %H:%M' 2>/dev/null | cut -c1-90)"
    echo "App:   $(git -C "$WEB_SRC" log -1 --format='%cd' --date=format:'%F %H:%M' 2>/dev/null)"
    echo "SQL:   $(docker exec "$DB" psql -h localhost -U supabase_admin -d postgres -X -tAc \
      "select count(*) || ' files applied, last: ' || coalesce((select file from farin_ops.applied_sql order by applied_at desc, file desc limit 1), '-') from farin_ops.applied_sql" 2>/dev/null || echo 'not run yet')"
    [ -f "$STATE/failed" ] && echo "LAST RUN FAILED: $(cat "$STATE/failed")"
    echo; echo "Last runs:"; journalctl -u farin-update.service -n 20 --no-pager -o cat
    exit 0 ;;
  "") ;;
  *) echo "Unknown option: $1"; exit 1 ;;
esac

mkdir -p "$STATE"
exec 9>"$STATE/lock"
flock -n 9 || { log "another update is running"; exit 0; }

psql_q()  { docker exec "$DB" psql -h localhost -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
psql_in() { docker exec -i "$DB" psql -h localhost -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
docker ps --format '{{.Names}}' | grep -qx "$DB" || die "the database container ($DB) is not running"
[ -d "$SRC_DIR/.git" ] && [ -d "$WEB_SRC/.git" ] || die "run install.sh once first"

# 1. the code
git -C "$SRC_DIR" fetch -q --depth 1 origin "$BRANCH" || die "GitHub could not be reached (code)"
git -C "$WEB_SRC" fetch -q --depth 1 origin server-build || die "GitHub could not be reached (app)"
if [ "$(git -C "$SRC_DIR" rev-parse HEAD)" != "$(git -C "$SRC_DIR" rev-parse FETCH_HEAD)" ]; then
  git -C "$SRC_DIR" reset -q --hard FETCH_HEAD
  log "code: $(git -C "$SRC_DIR" log -1 --format='%h %s' | cut -c1-80)"
fi

# 2. the database: the files of sql-updates.txt not applied yet, in order (not before the data was copied: the files
#    change tables that migrate-data.sh brings)
if [ -z "$(psql_q -tA -c "select to_regclass('public.ex_reports')")" ]; then
  log "database: no Farin tables yet (run migrate-data.sh first): SQL files wait"
else
psql_q -c "set client_min_messages = warning; create schema if not exists farin_ops; revoke all on schema farin_ops from public;
  create table if not exists farin_ops.applied_sql (file text primary key, applied_at timestamptz not null default now(), commit text);" >/dev/null
applied=$(psql_q -tA -c "select file from farin_ops.applied_sql")
pending=()
while IFS= read -r f; do
  f=${f%%#*}; f=$(echo "$f" | xargs); [ -n "$f" ] || continue
  grep -qxF "$f" <<<"$applied" || pending+=("$f")
done < "$SRC_DIR/deploy/server/sql-updates.txt"
if [ ${#pending[@]} -gt 0 ]; then
  log "database: ${#pending[@]} new SQL file(s)"
  mkdir -p "$BACKUPS" && chmod 700 "$BACKUPS"
  bk="$BACKUPS/before-update-$(date +%F-%H%M%S).dump"
  docker exec "$DB" pg_dump -h localhost -U supabase_admin -d postgres -Fc > "$bk" || { rm -f "$bk"; die "backup failed: nothing was changed"; }
  log "backup: $bk ($(du -h "$bk" | cut -f1))"
  ls -1t "$BACKUPS"/before-update-*.dump 2>/dev/null | tail -n +6 | xargs -r rm -f
  commit=$(git -C "$SRC_DIR" rev-parse --short HEAD)
  for f in "${pending[@]}"; do
    [ -f "$SRC_DIR/$f" ] || { echo "$f is missing" > "$STATE/failed"; die "$f is listed but missing"; }
    if out=$( { cat "$SRC_DIR/$f"; printf "\ninsert into farin_ops.applied_sql (file, commit) values ('%s', '%s');\n" "$f" "$commit"; } \
              | psql_in --single-transaction 2>&1 >/dev/null ); then
      log "  ok $f"
    else
      printf '%s\n%s\n' "$f" "$out" > "$STATE/failed"
      log "  FAILED $f — nothing of this file was kept; the app stays on the old version"
      printf '%s\n' "$out" | tail -5 | sed 's/^/    /'
      exit 1
    fi
  done
  psql_q -c "notify pgrst, 'reload schema';" >/dev/null
fi
fi
rm -f "$STATE/failed"

# 3. the app (swapped in one step: the old folder stays whole until the new one is complete)
if [ "$(git -C "$WEB_SRC" rev-parse HEAD)" != "$(git -C "$WEB_SRC" rev-parse FETCH_HEAD)" ] || [ ! -f "$WEB_DIR/index.html" ]; then
  git -C "$WEB_SRC" reset -q --hard FETCH_HEAD
  SITE_URL=$(grep '^SITE_URL=' "$SUPA_DIR/.env" | head -1 | cut -d= -f2-)
  ANON=$(grep '^ANON_KEY=' "$SUPA_DIR/.env" | head -1 | cut -d= -f2-)
  rm -rf "$WEB_DIR.new" && mkdir -p "$WEB_DIR.new"
  (cd "$WEB_SRC" && tar cf - --exclude=.git .) | tar xf - -C "$WEB_DIR.new"
  printf 'window.__FARIN_CONFIG__ = { supabaseUrl: "%s", supabaseAnonKey: "%s" };\n' "$SITE_URL" "$ANON" > "$WEB_DIR.new/config.js"
  [ -f "$WEB_DIR.new/index.html" ] || die "the downloaded app has no index.html; the old app stays"
  rm -rf "$WEB_DIR.old"
  [ -d "$WEB_DIR" ] && mv "$WEB_DIR" "$WEB_DIR.old"
  mv "$WEB_DIR.new" "$WEB_DIR" && rm -rf "$WEB_DIR.old"
  log "app: updated (built $(git -C "$WEB_SRC" log -1 --format=%cd --date=format:'%F %H:%M'))"
fi

# 4. the server-side functions
# (compared with what was last copied, so a run that stopped earlier does not skip them)
fn_new=$(git -C "$SRC_DIR" rev-parse -q --verify HEAD:supabase/functions || true)
if [ -n "$fn_new" ] && [ "$fn_new" != "$(cat "$STATE/functions" 2>/dev/null)" ]; then
  for d in "$SRC_DIR"/supabase/functions/*/; do
    n=$(basename "$d"); rm -rf "$SUPA_DIR/volumes/functions/$n" && cp -r "$d" "$SUPA_DIR/volumes/functions/$n"
  done
  cp "$SRC_DIR/deploy/server/supabase-docker/volumes/functions/main/index.ts" "$SUPA_DIR/volumes/functions/main/index.ts"
  (cd "$SUPA_DIR" && docker compose restart functions >/dev/null 2>&1)
  echo "$fn_new" > "$STATE/functions"
  log "functions: updated"
fi
