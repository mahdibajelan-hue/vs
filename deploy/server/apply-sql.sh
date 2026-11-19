#!/usr/bin/env bash
# Applies SQL files from the repository to this server's database (for changes made after the data was copied):
#   bash /opt/farin-src/deploy/server/apply-sql.sh supabase/execution/046_statement_server_quantities.sql ...
# Paths are relative to /opt/farin-src. Each file runs in one transaction; the first error stops everything.
set -euo pipefail
SRC_DIR=${SRC_DIR:-/opt/farin-src}
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
[ $# -gt 0 ] || { echo "Give one or more SQL files."; exit 1; }
for f in "$@"; do
  p="$SRC_DIR/$f"; [ -f "$p" ] || { echo "Not found: $p"; exit 1; }
  docker exec -i "${DB_CONTAINER:-supabase-db}" psql -h localhost -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 --single-transaction < "$p" >/dev/null
  echo "✔ $f"
done
docker exec "${DB_CONTAINER:-supabase-db}" psql -h localhost -U supabase_admin -d postgres -X -q -c "notify pgrst, 'reload schema';" >/dev/null
echo "done"
