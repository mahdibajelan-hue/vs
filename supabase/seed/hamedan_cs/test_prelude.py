#!/usr/bin/env python3
"""TEST DATABASE ONLY: the live users, organisations, portfolio and program the Hamedan seed refers to (on the live
database they already exist). python3 test_prelude.py | docker exec -i farin-test psql …"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *
o = ["begin;"]
for uid, name in PEOPLE.items():
    o.append(f"insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_user_meta_data, created_at) values ('00000000-0000-0000-0000-000000000000', {q(uid)}, 'authenticated', 'authenticated', {q(uid[:8] + '@demo.test')}, '', '{{}}', now()) on conflict do nothing;")
    o.append(f"insert into profiles (id, email, full_name, account_status) values ({q(uid)}, {q(uid[:8] + '@demo.test')}, {q(name)}, 'active') on conflict (id) do nothing;")
for oid, name in [(ORG_EMP, 'کارفرمای نمونهٔ طرح‌های گاز'), (ORG_CTR, 'مشارکت پیمانکاری نمونهٔ گاما'), (ORG_SUP, 'مهندسین مشاور نمونهٔ دلتا'), (ORG_DES, 'مهندسین مشاور نمونهٔ آلفا')]:
    o.append(f"insert into organizations (id, name) values ({q(oid)}, {q(name)}) on conflict do nothing;")
o.append(f"insert into portfolios (id, name) values ({q(PORTFOLIO)}, 'پورتفوی نمونه') on conflict do nothing;")
o.append(f"insert into programs (id, name, portfolio_id) values ({q(PROGRAM)}, 'برنامهٔ نمونه', {q(PORTFOLIO)}) on conflict do nothing;")
# the stakeholder tables exist on the live database but not in the repo's SQL files: minimal stand-ins for the test load
o.append("create table if not exists sh_stakeholders (id uuid primary key default gen_random_uuid(), master_project_id uuid not null, code text not null, name text not null, organization text, role_title text, category text, side text, phone text, email text, power int, interest int, attitude text, engagement_current text, engagement_desired text, owner text, owner_email text, channel text, frequency_days int, expectations text, strategy text, note text, is_active boolean default true, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());")
o.append("create table if not exists sh_engagements (id uuid primary key default gen_random_uuid(), stakeholder_id uuid not null, master_project_id uuid not null, happened_on date not null, kind text, subject text not null, summary text, attendees text, sentiment text, next_action text, next_due date, next_owner text, next_owner_email text, next_done boolean default false, next_done_at timestamptz, created_by uuid, created_at timestamptz default now());")
o.append("create table if not exists sh_concerns (id uuid primary key default gen_random_uuid(), stakeholder_id uuid not null, master_project_id uuid not null, raised_on date, title text not null, description text, category text, priority text, status text, owner text, owner_email text, due_date date, resolution text, resolved_on date, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());")
o.append("commit;")
print("\n".join(o))
