#!/usr/bin/env python3
"""Uploads demo_hamedan_cs.sql in numbered parts into demo_seed_staging (see staging.sql) as an admin user.
   SUPABASE_URL=… SUPABASE_ANON_KEY=… PW_USER=… PW_PASS=… python3 upload.py
Credentials come from the environment only. The parts are then executed in one transaction by the database owner."""
import json, os, ssl, urllib.request

URL, KEY = os.environ['SUPABASE_URL'].rstrip('/'), os.environ['SUPABASE_ANON_KEY']
ctx = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE') or '/root/.ccr/ca-bundle.crt')
def call(path, body, token=None, prefer=None):
    h = {'apikey': KEY, 'Content-Type': 'application/json', 'Authorization': f'Bearer {token or KEY}'}
    if prefer: h['Prefer'] = prefer
    r = urllib.request.urlopen(urllib.request.Request(URL + path, data=json.dumps(body).encode(), headers=h, method='POST'), context=ctx, timeout=120)
    t = r.read(); return json.loads(t) if t else None

tok = call('/auth/v1/token?grant_type=password', {'email': os.environ['PW_USER'], 'password': os.environ['PW_PASS']})['access_token']
sql = open(os.path.join(os.path.dirname(__file__), '..', 'demo_hamedan_cs.sql')).read()
# the body only: the transaction and the RPC flags are added when the parts are executed
stmts = [s for s in sql.split(';\n') if s.strip() and not s.strip().startswith('--') or '\n' in s.strip()]
body = [s.strip() for s in stmts if s.strip() not in ('begin', 'commit') and not s.strip().startswith('select set_config') and not s.strip().startswith('-- Demo project')]
parts, cur = [], ''
for s in body:
    if cur and len(cur) + len(s) > 200_000: parts.append(cur); cur = ''
    cur += s + ';\n'
if cur: parts.append(cur)
for i, p in enumerate(parts):
    call('/rest/v1/demo_seed_staging', {'id': int(os.environ.get('OFFSET', '0')) + i + 1, 'part': p}, tok, 'return=minimal')
print(json.dumps({'parts': len(parts), 'bytes': sum(len(p.encode()) for p in parts)}))
