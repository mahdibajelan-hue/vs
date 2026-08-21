#!/bin/bash
set -euo pipefail

# Only Claude Code on the web / remote sessions need this — a local desktop install of
# the plugin persists on its own machine and never hits this script.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

MARKETPLACE_NAME="ui-ux-pro-max-skill"
MARKETPLACE_SOURCE="nextlevelbuilder/ui-ux-pro-max-skill"
PLUGIN_NAME="ui-ux-pro-max"

if ! claude plugin marketplace list 2>/dev/null | grep -q "$MARKETPLACE_NAME"; then
  claude plugin marketplace add "$MARKETPLACE_SOURCE" || true
fi

if ! claude plugin list 2>/dev/null | grep -q "^  > ${PLUGIN_NAME}@"; then
  claude plugin install "${PLUGIN_NAME}@${MARKETPLACE_NAME}" || true
fi
