#!/usr/bin/env bash
# Farin PMIS — secret keys for the server-side functions (AI services, notification gateways), like
# «Edge Functions → Secrets» on supabase.com. Kept in /opt/supabase/functions.env (readable by root only).
#
#   bash /opt/farin-src/deploy/server/function-secret.sh                 list the names that are set (never the values)
#   bash /opt/farin-src/deploy/server/function-secret.sh GEMINI_API_KEY  set one: the value is asked for, hidden
#   bash /opt/farin-src/deploy/server/function-secret.sh --remove NAME   remove one
#
# The functions container is restarted afterwards so the change takes effect.
set -euo pipefail
SUPA_DIR=${SUPA_DIR:-/opt/supabase}
FILE=$SUPA_DIR/functions.env

die() { printf '\033[1;31m✘ %s\033[0m\n' "$*"; exit 1; }
ok()  { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || die "Run this script as root."
[ -d "$SUPA_DIR" ] || die "Supabase is not installed on this server yet - run install.sh first."
touch "$FILE" && chmod 600 "$FILE"

restart() { (cd "$SUPA_DIR" && docker compose up -d functions >/dev/null 2>&1) && ok "functions restarted with the new settings"; }
without() { grep -v "^$1=" "$FILE" > "$FILE.tmp" || true; mv "$FILE.tmp" "$FILE"; chmod 600 "$FILE"; }

case "${1:-}" in
  "")
    if [ -s "$FILE" ]; then echo "Secrets that are set:"; cut -d= -f1 "$FILE" | sed 's/^/  /'; else echo "No secrets are set yet."; fi
    ;;
  --remove)
    name=${2:-}; [ -n "$name" ] || die "Which one? e.g.: --remove GEMINI_API_KEY"
    grep -q "^$name=" "$FILE" || die "$name is not set."
    without "$name"; ok "$name removed"; restart
    ;;
  *)
    name=$1
    [[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]] || die "A name has capital letters, digits and _ only (e.g. GEMINI_API_KEY)."
    case "$name" in SUPABASE_*|JWT_*|VERIFY_JWT|FUNCTIONS_NO_VERIFY_JWT|SV_PASSKEY_HOSTS) die "$name is set by the installation itself.";; esac
    read -rsp "Value for $name (typing is hidden), then Enter: " value; echo
    value=$(printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    [ -n "$value" ] || die "No value was entered - nothing changed."
    case "$value" in *"'"*|*$'\n'*) die "The value contains a ' or a line break, which this file cannot hold.";; esac
    without "$name"
    printf "%s='%s'\n" "$name" "$value" >> "$FILE"
    ok "$name set"; restart
    ;;
esac
