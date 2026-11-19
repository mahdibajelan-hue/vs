#!/usr/bin/env bash
# Runs the execution end-to-end check on the isolated test database; prints JSON results.
cd "$(dirname "$0")/../../.." && exec node --disable-warning=ExperimentalWarning \
  --import "data:text/javascript,import{register}from'node:module';import{pathToFileURL}from'node:url';register('./scripts/ts-resolve-hook.mjs',pathToFileURL('./'))" \
  supabase/tests/execution_e2e/e2e_check.mjs
