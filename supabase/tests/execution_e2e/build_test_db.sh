#!/usr/bin/env bash
# Builds the ISOLATED test database for the execution end-to-end check (a local Docker container, never the live database):
#   1. a fresh Supabase Postgres 17 container «farin-test»
#   2. minimal Auth/Storage pieces the app's SQL expects
#   3. every SQL file of the repo (supabase/schema.sql + module folders), applied in passes until it settles
#   4. live_overrides.sql: functions/triggers of the report flow whose live version differs from the repo files
#   5. the scenario of gen_scenario.py
set -euo pipefail
cd "$(dirname "$0")"; ROOT=../..
docker rm -f farin-test >/dev/null 2>&1 || true
docker run -d --name farin-test -e POSTGRES_PASSWORD=test -e PGPASSWORD=test -e POSTGRES_HOST=/var/run/postgresql supabase/postgres:17.6.1.136 postgres -c config_file=/etc/postgresql/postgresql.conf >/dev/null
until docker exec farin-test psql -h localhost -U supabase_admin -d postgres -tAc 'select 1' >/dev/null 2>&1; do sleep 2; done; sleep 8
db() { docker exec -i farin-test psql -h localhost -U "${1:-postgres}" -d postgres -q -v ON_ERROR_STOP=0; }
db supabase_admin < test_platform_stubs.sql >/dev/null 2>&1
files=$( { echo "$ROOT/schema.sql"; for d in $(ls -d $ROOT/*/ | grep -vE '/(seed|tests|functions)/$'); do ls $d*.sql 2>/dev/null | grep -vi rollback | grep -v RUN_BY_HAND | sort -V; done; } )
for pass in 1 2 3; do for f in $files; do db < "$f" >/dev/null 2>&1 || true; done; done
db supabase_admin < live_overrides.sql
python3 gen_scenario.py | docker exec -i farin-test psql -h localhost -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 >/dev/null
echo "test database ready: $(docker exec farin-test psql -h localhost -U postgres -d postgres -tAc "select count(*) from pg_tables where schemaname='public'") tables"
