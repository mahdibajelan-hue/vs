#!/bin/bash
# TEST DATABASE ONLY: rebuild the seed and load it into farin-test (after removing an earlier load of it)
cd "$(dirname "$0")"
python3 build.py > /tmp/hmd_stats.json || exit 1
docker exec -i farin-test psql -h localhost -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 < ../demo_hamedan_cs_cleanup.sql >/dev/null 2>&1
docker exec -i farin-test psql -h localhost -U postgres -d postgres -q -v ON_ERROR_STOP=1 < ../demo_hamedan_cs.sql 2>&1 | grep -v '^ \|^(\|^-\|^$' | head -8
