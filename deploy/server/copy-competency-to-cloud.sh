#!/usr/bin/env bash
# Farin PMIS — copy the competency assessments made on THIS server to the Supabase cloud project.
#
#   bash /opt/farin-src/deploy/server/copy-competency-to-cloud.sh           1. check: shows what would be copied, changes nothing
#   bash /opt/farin-src/deploy/server/copy-competency-to-cloud.sh --apply   2. copy
#
# What is copied (only from this server to the cloud; this server is only read):
#   - every table of the competency module (comp_*, personality_*): assessments, tests and answers, scores, interviews,
#     panels, development plans, question banks, settings
#   - the people who have an account only on this server (account and password, profile, module access, signature)
#   - the competency documents (storage bucket comp-docs) the cloud does not have yet
# Rows that are new here are added; rows changed here replace the cloud's (unless the cloud's copy was edited later);
# nothing in the cloud is removed, and no other module is touched. The database part is one transaction: it is all
# copied or nothing is. Running it again is safe: what is already in the cloud is skipped.
#
# It asks for the cloud database password, and with --apply also for the service_role / secret key (for the files);
# both are typed here and saved nowhere.
# Messages are in English: the Windows console that runs ssh cannot show Persian text.
set -euo pipefail

REF=${REF:-chtsobdbmszmxhlzeoxu}
REGION=${REGION:-eu-west-1}
CLOUD_URL=${CLOUD_URL:-https://$REF.supabase.co}
SUPA_DIR=${SUPA_DIR:-/opt/supabase}
WORK=${WORK:-/opt/farin-migrate}
DB=${DB_CONTAINER:-supabase-db}
LOCAL_URL=${LOCAL_URL:-http://127.0.0.1:8000}
HERE=$(cd "$(dirname "$0")" && pwd)
APPLY=0
case "${1:-}" in --apply) APPLY=1 ;; "") ;; *) echo "Unknown option: $1"; exit 1 ;; esac

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    ✔ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✘ %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" = 0 ] || die "Run this script as root."
[ -f "$SUPA_DIR/.env" ] || die "Supabase is not installed on this server."
docker ps --format '{{.Names}}' | grep -qx "$DB" || die "The database container ($DB) is not running."
command -v python3 >/dev/null || apt-get install -y -qq python3 >/dev/null
mkdir -p "$WORK" && chmod 700 "$WORK"
BUNDLE=$WORK/competency-copy.sql
trap 'rm -f "$BUNDLE" "$WORK"/comp-*.json' EXIT   # the bundle holds the rows and password hashes

here() { docker exec "$DB" psql -h localhost -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
cloud() { docker exec -e PGPASSWORD="$SRC_PASS" "$DB" psql "$SRC_CONN" -X -q -v ON_ERROR_STOP=1 "$@"; }
cloud_in() { docker exec -i -e PGPASSWORD="$SRC_PASS" "$DB" psql "$SRC_CONN" -X -q -v ON_ERROR_STOP=1 "$@"; }

say "1/4 Connecting to the cloud database"
[ -n "${SRC_PASS:-}" ] || { read -rsp "    Cloud DATABASE password (typing is hidden), then Enter: " SRC_PASS; echo; }
[ -n "$SRC_PASS" ] || die "No password was entered."
SRC_CONN=""
for h in ${SRC_HOST:-aws-1-$REGION.pooler.supabase.com aws-0-$REGION.pooler.supabase.com}; do
  c="host=$h port=${SRC_PORT:-5432} user=${SRC_USER:-postgres.$REF} dbname=postgres sslmode=${SRC_SSLMODE:-require} connect_timeout=20"
  if docker exec -e PGPASSWORD="$SRC_PASS" "$DB" psql "$c" -X -tAc 'select 1' >/dev/null 2>"$WORK/connect.err"; then SRC_CONN=$c; break; fi
done
if [ -z "$SRC_CONN" ]; then
  tail -2 "$WORK/connect.err" | sed 's/^/    /'
  grep -qi password "$WORK/connect.err" && die "The cloud database refused the password. Check it (or reset it) and run again."
  die "Could not reach the cloud database. The connection from Iran is sometimes down - try again in a few minutes."
fi
ok "connected"

if [ "$APPLY" = 1 ]; then
  say "Cloud storage key (for the documents)"
  [ -n "${CLOUD_KEY:-}" ] || { read -rsp "    Cloud service_role / secret KEY (typing is hidden), then Enter: " CLOUD_KEY; echo; }
  CLOUD_KEY=$(printf '%s' "$CLOUD_KEY" | tr -d '[:space:]')
  auth_h=(-H "apikey: $CLOUD_KEY"); case "$CLOUD_KEY" in sb_*) ;; *) auth_h+=(-H "Authorization: Bearer $CLOUD_KEY") ;; esac
  code=$(curl -s -m 30 -o /dev/null -w '%{http_code}' "${auth_h[@]}" "$CLOUD_URL/storage/v1/bucket" || true)
  [ "$code" = 200 ] || die "The cloud did not accept the key (answer: $code). Use the service_role or secret key, not the anon/publishable one."
  ok "key accepted"
fi

say "2/4 Reading the competency data of this server"
DB=$DB SRC_CONN=$SRC_CONN PGPASSWORD=$SRC_PASS OUT=$BUNDLE APPLY=$APPLY python3 "$HERE/copy_competency.py"
chmod 600 "$BUNDLE"
ok "read ($(du -h "$BUNDLE" | cut -f1))"

if [ "$APPLY" = 1 ]; then say "3/4 Copying the rows to the cloud (one transaction)"; else say "3/4 Comparing with the cloud (CHECK ONLY - nothing is changed)"; fi
cloud_in -f - < "$BUNDLE" || die "Stopped by the error above. Nothing was changed in the cloud."

# documents: the files of comp-docs that the cloud does not have (or has with another size)
here -tAc "select coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name, 'mime', metadata->>'mimetype', 'cache', metadata->>'cacheControl', 'size', (metadata->>'size')::bigint) order by name), '[]') from storage.objects where bucket_id = 'comp-docs'" > "$WORK/comp-here.json"
cloud -tAc "select coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name, 'size', (metadata->>'size')::bigint)), '[]') from storage.objects where bucket_id = 'comp-docs'" > "$WORK/comp-cloud.json"
missing=$(python3 -c 'import json,sys; h=json.load(open(sys.argv[1])); c={o["name"]:o["size"] for o in json.load(open(sys.argv[2]))}; print(sum(1 for o in h if c.get(o["name"]) is None or c[o["name"]]!=o["size"]))' "$WORK/comp-here.json" "$WORK/comp-cloud.json")
if [ "$APPLY" = 0 ]; then
  say "4/4 Documents"
  ok "$missing document(s) of this server are not in the cloud yet"
  printf '\n\033[1;32mCHECK FINISHED - nothing was changed.\033[0m If the numbers look right, copy with:\n  bash %s --apply\n' "$HERE/copy-competency-to-cloud.sh"
  exit 0
fi

say "4/4 Copying $missing document(s)"
files_ok=yes
if [ "$missing" -gt 0 ]; then
  echo '[]' > "$WORK/comp-buckets.json"
  # migrate_storage.py copies from CLOUD_* to LOCAL_*: here the other way round, from this server to the cloud
  CLOUD_URL=$LOCAL_URL CLOUD_KEY=$(grep '^SERVICE_ROLE_KEY=' "$SUPA_DIR/.env" | cut -d= -f2-) LOCAL_URL=$CLOUD_URL LOCAL_KEY=$CLOUD_KEY \
  FROM_NAME="this server" TO_NAME="the cloud" \
  BUCKETS_JSON=$WORK/comp-buckets.json OBJECTS_JSON=$WORK/comp-here.json LOCAL_JSON=$WORK/comp-cloud.json FAILED_TXT=$WORK/comp-failed-files.txt \
    python3 "$HERE/migrate_storage.py" || files_ok=no
  # who uploaded each document (the copy uploads as the service key)
  here -tAc "select format('update storage.objects set owner = %L, owner_id = %L, user_metadata = %L where bucket_id = %L and name = %L;', owner, owner_id, user_metadata, bucket_id, name) from storage.objects where bucket_id = 'comp-docs' and (owner_id is not null or user_metadata is not null)" \
    | cloud_in --single-transaction -f - >/dev/null && ok "document owners set"
fi
cloud -c "notify pgrst, 'reload schema';" >/dev/null

if [ "$files_ok" = yes ]; then
  printf '\n\033[1;32mDONE - the competency data of this server is now in the cloud.\033[0m\n'
else
  printf '\n\033[1;33mThe rows are copied, but some documents are not (list above). Run the same command again: what is already there is skipped.\033[0m\n'
  exit 2
fi
