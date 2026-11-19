#!/usr/bin/env bash
# Farin PMIS — copy everything from the Supabase cloud project to this server's Supabase (installed by install.sh).
#
#   tables (structure + rows), user accounts (same e-mail and password), uploaded files, file owners,
#   storage access rules, the trigger that creates a profile for a new user, and the two scheduled jobs.
#
# The cloud project is only READ: nothing there is changed or deleted. Run it as root on the server:
#
#   bash /opt/farin-src/deploy/server/migrate-data.sh              first copy (or, later, a fresh copy of the data)
#   bash /opt/farin-src/deploy/server/migrate-data.sh --files-only copy only the files that are still missing
#
# It asks for two secrets of the cloud project, which you type on the server and which are not saved anywhere:
#   1. the database password       (supabase.com → project → Project Settings → Database)
#   2. the service_role / secret key (supabase.com → project → Project Settings → API Keys)
#
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
MODE=${1:-}

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    ✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    ! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✘ %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" = 0 ] || die "Run this script as root."
[ -f "$SUPA_DIR/.env" ] || die "Supabase is not installed on this server yet - run install.sh first."
docker ps --format '{{.Names}}' | grep -qx "$DB" || die "The database container ($DB) is not running. Run: cd $SUPA_DIR && docker compose up -d"
command -v python3 >/dev/null || apt-get install -y -qq python3 >/dev/null
envget() { grep "^$1=" "$SUPA_DIR/.env" | head -1 | cut -d= -f2-; }
SITE_URL=$(envget SITE_URL)
LOCAL_KEY=$(envget SERVICE_ROLE_KEY)
mkdir -p "$WORK" && chmod 700 "$WORK"

# this server's database, as the superuser (the container already holds its password)
dst()    { docker exec "$DB" psql -h localhost -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
dst_in() { docker exec -i "$DB" psql -h localhost -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }  # reads SQL from stdin
# the cloud database, through Supabase's connection pooler (session mode works with pg_dump and over IPv4)
src()      { docker exec -e PGPASSWORD="$SRC_PASS" "$DB" psql "$SRC_CONN" -X -q -v ON_ERROR_STOP=1 "$@"; }
src_dump() { docker exec -e PGPASSWORD="$SRC_PASS" "$DB" pg_dump "$SRC_CONN" "$@"; }

say "1/9 Connecting to the cloud database"
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
ok "connected ($(echo "$SRC_CONN" | sed 's/ .*//'))"

say "2/9 Checking the cloud storage key"
[ -n "${CLOUD_KEY:-}" ] || { read -rsp "    Cloud service_role / secret KEY (typing is hidden), then Enter: " CLOUD_KEY; echo; }
CLOUD_KEY=$(printf '%s' "$CLOUD_KEY" | tr -d '[:space:]')
auth_h=(-H "apikey: $CLOUD_KEY"); case "$CLOUD_KEY" in sb_*) ;; *) auth_h+=(-H "Authorization: Bearer $CLOUD_KEY") ;; esac
code=$(curl -s -m 30 -o /dev/null -w '%{http_code}' "${auth_h[@]}" "$CLOUD_URL/storage/v1/bucket" || true)
[ "$code" = 200 ] || die "The cloud did not accept the key (answer: $code). Use the service_role or secret key, not the anon/publishable one."
ok "key accepted"
export CLOUD_URL CLOUD_KEY LOCAL_URL LOCAL_KEY

# --- what is already on this server --------------------------------------------------------------------------------
tables_here=$(dst -tAc "select count(*) from pg_tables where schemaname='public'")
if [ "$MODE" = --files-only ]; then
  [ "$tables_here" -gt 0 ] || die "The tables have not been copied yet - run the script without --files-only first."
  FRESH=files
elif [ "$tables_here" -gt 0 ]; then
  echo
  warn "This server already has a copy of the data ($tables_here tables)."
  warn "Continuing REPLACES the server's rows and accounts with a fresh copy from the cloud."
  warn "(The cloud is not changed. Anything entered only on this server will be lost.)"
  read -rp "    Type RESYNC to continue, anything else to stop: " answer
  [ "$answer" = RESYNC ] || die "Stopped - nothing was changed."
  FRESH=no
else
  FRESH=yes
fi

colnames() { # $1=src|dst  $2=schema.table → the columns that can be written (generated columns excluded), sorted
  "$1" -tAc "select quote_ident(attname) from pg_attribute where attrelid='$2'::regclass and attnum>0 and not attisdropped and attgenerated='' order by 1"
}
copy_common() { # copy rows of one table, only the columns both sides have (the cloud's Auth may be a newer version)
  local cols; cols=$(comm -12 <(colnames src "$1") <(colnames dst "$1") | paste -sd, -)
  src -c "\\copy (select $cols from $1) to stdout" | dst_in -c "set session_replication_role = replica" -c "\\copy $1 ($cols) from stdin"
  ok "$1: $(dst -tAc "select count(*) from $1") rows"
}
count_rows() { # one line per table: "name rows"
  "$1" -tAc "select format('%s %s', table_name, (xpath('/row/n/text()', query_to_xml(format('select count(*) n from public.%I', table_name), false, true, '')))[1]::text) from information_schema.tables where table_schema='public' and table_type='BASE TABLE' union all select 'auth.users '||count(*) from auth.users order by 1"
}

if [ "$FRESH" != files ]; then
  if [ "$FRESH" = yes ]; then
    say "3/9 Copying the table structure (tables, functions, access rules)"
    src_dump --schema-only --schema=public > "$WORK/schema.sql"
    sed -i -E 's/^CREATE SCHEMA ("?public"?);/CREATE SCHEMA IF NOT EXISTS public;/' "$WORK/schema.sql"
    # roles the cloud has and this server does not (only those the structure mentions) are created without login
    for r in $(comm -23 <(src -tAc "select rolname from pg_roles where rolname !~ '^pg_' order by 1") <(dst -tAc "select rolname from pg_roles order by 1")); do
      if grep -qE "(TO|FROM|OWNER TO) \"?$r\"?[ ;,]" "$WORK/schema.sql"; then dst -c "create role \"$r\" nologin"; ok "role added: $r"; fi
    done
    dst_in --single-transaction -f - < "$WORK/schema.sql" 2>&1 >/dev/null | sed 's/^/    /' || true
    [ "$(dst -tAc "select count(*) from pg_tables where schemaname='public'")" -gt 0 ] || die "The table structure could not be created (see the messages above)."
    ok "$(dst -tAc "select count(*) from pg_tables where schemaname='public'") tables, $(dst -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'") functions, $(dst -tAc "select count(*) from pg_policies where schemaname='public'") access rules"
  else
    say "3/9 Emptying this server's copy before the fresh copy (structure is kept)"
    dst -c "do \$\$ declare t text; begin select string_agg(format('%I.%I', schemaname, tablename), ', ') into t from pg_tables where schemaname = 'public'; if t is not null then execute 'truncate table ' || t || ' cascade'; end if; end \$\$;" \
        -c "delete from auth.identities" -c "delete from auth.users"
    ok "emptied"
  fi

  say "4/9 Copying the user accounts (same e-mail and password as today)"
  copy_common auth.users
  copy_common auth.identities

  say "5/9 Copying the rows of all tables"
  src_dump --data-only --schema=public > "$WORK/data.sql"
  ok "downloaded $(du -h "$WORK/data.sql" | cut -f1)"
  { echo "set session_replication_role = replica;"; cat "$WORK/data.sql"; } | dst_in --single-transaction -f - >/dev/null
  # the one stored address that points at the cloud (a profile photo) now points at this server
  dst -c "update public.profiles set avatar_url = replace(avatar_url, '$CLOUD_URL', '$SITE_URL') where avatar_url like '$CLOUD_URL%'"
  ok "rows copied"
fi

# the app's own triggers on storage.objects (e.g. the 300 KB limit for new competency documents) must not judge files
# that were accepted in the cloud long ago; they are switched off for the copy and back on afterwards (step 7)
app_storage_triggers() { # $1=enable|disable
  dst -c "do \$\$ declare r record; begin for r in select t.tgname from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace where t.tgrelid = 'storage.objects'::regclass and pn.nspname = 'public' and not t.tgisinternal loop execute format('alter table storage.objects $1 trigger %I', r.tgname); end loop; end \$\$;"
}
trap 'app_storage_triggers enable >/dev/null 2>&1 || true' EXIT
app_storage_triggers disable

say "6/9 Copying the uploaded files (about 250 MB - this takes a while)"
src -tAc "select coalesce(json_agg(json_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit, 'allowed_mime_types', allowed_mime_types) order by id), '[]') from storage.buckets" > "$WORK/buckets.json"
src -tAc "select coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name, 'mime', metadata->>'mimetype', 'cache', metadata->>'cacheControl', 'size', (metadata->>'size')::bigint) order by bucket_id, name), '[]') from storage.objects" > "$WORK/objects.json"
dst -tAc "select coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name, 'size', (metadata->>'size')::bigint)), '[]') from storage.objects" > "$WORK/local.json"
files_ok=yes
BUCKETS_JSON=$WORK/buckets.json OBJECTS_JSON=$WORK/objects.json LOCAL_JSON=$WORK/local.json FAILED_TXT=$WORK/failed-files.txt \
  python3 "$HERE/migrate_storage.py" || files_ok=no

say "7/9 File owners, storage access rules, new-user trigger, scheduled jobs"
{
  echo "set client_min_messages = warning;"
  # who uploaded each file (the copy above uploads as the server itself)
  src -tAc "select format('update storage.objects set owner = %L, owner_id = %L, user_metadata = %L where bucket_id = %L and name = %L;', owner, owner_id, user_metadata, bucket_id, name) from storage.objects where owner_id is not null or user_metadata is not null"
  # storage access rules (who may read / upload in each bucket)
  src -tAc "select format('drop policy if exists %I on %I.%I; create policy %I on %I.%I as %s for %s to %s%s%s;', policyname, schemaname, tablename, policyname, schemaname, tablename, permissive, cmd, (select string_agg(quote_ident(r), ', ') from unnest(roles) r), coalesce(' using (' || qual || ')', ''), coalesce(' with check (' || with_check || ')', '')) from pg_policies where schemaname = 'storage'"
  # triggers the app put on Auth and Storage tables (profile for a new user, upload rules for competency documents)
  src -tAc "select replace(pg_get_triggerdef(t.oid), 'CREATE TRIGGER', 'CREATE OR REPLACE TRIGGER') || ';' from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace where n.nspname in ('auth', 'storage') and pn.nspname = 'public' and not t.tgisinternal"
  echo "create extension if not exists pg_cron;"
  src -tAc "select format('select cron.schedule(%L, %L, %L);', jobname, schedule, command) from cron.job order by jobid"
  echo "notify pgrst, 'reload schema';"
} > "$WORK/extra.sql"
dst_in --single-transaction -f - < "$WORK/extra.sql" >/dev/null
app_storage_triggers enable
ok "$(dst -tAc "select count(*) from pg_policies where schemaname='storage'") storage rules, $(dst -tAc "select count(*) from cron.job") scheduled jobs"

say "8/9 Comparing the cloud and this server"
count_rows src > "$WORK/count-cloud.txt"
count_rows dst > "$WORK/count-server.txt"
echo "files $(src -tAc 'select count(*) from storage.objects')" >> "$WORK/count-cloud.txt"
echo "files $(dst -tAc 'select count(*) from storage.objects')" >> "$WORK/count-server.txt"
if diff -q "$WORK/count-cloud.txt" "$WORK/count-server.txt" >/dev/null; then
  ok "every table has the same number of rows ($(wc -l < "$WORK/count-cloud.txt") checked), and the same number of files"
  same=yes
else
  warn "differences (cloud | server) - a few are normal if someone was using the system during the copy:"
  diff "$WORK/count-cloud.txt" "$WORK/count-server.txt" | grep '^[<>]' | head -20 | sed 's/^/      /'
  same=no
fi

say "9/9 Cleaning up"
rm -f "$WORK/data.sql"   # holds every row and password hash; not needed any more
ok "temporary copy of the data removed"

cat <<DONE

$(printf '\033[1;32m')DONE - the data is on this server.$(printf '\033[0m')
  Open $SITE_URL and sign in with your usual e-mail and password.
$( [ "$files_ok" = yes ] || printf '\n  Some files were not copied (the cloud was unreachable for a moment). Copy the rest with:\n    bash %s/migrate-data.sh --files-only\n' "$HERE")
$( [ "$same" = yes ] || printf '\n  Row counts differ for the tables listed above - send a screenshot of this screen.\n')
  Nothing was changed in the cloud project. The cloud keeps working as before.
DONE
