-- S12: weld registry = an INDEX over the technical forms (rows keep their own text). Additive only.
create table if not exists ex_welds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  section_key text not null,
  weld_key text not null,
  section_raw text not null default '',
  weld_raw text not null default '',
  pipe_no text,
  status text not null default 'auto' check (status in ('auto','confirmed','merged','orphan')),
  merged_into uuid references ex_welds(id),
  first_report_id uuid references ex_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, section_key, weld_key)
);
create table if not exists ex_line_welds (
  line_id uuid primary key references ex_report_lines(id) on delete cascade,
  weld_id uuid not null references ex_welds(id),
  project_id uuid not null,
  raw_section text not null default '',
  raw_weld text not null default '',
  raw_pipe text not null default '',
  linked_at timestamptz not null default now()
);
create index if not exists idx_ex_line_welds_weld on ex_line_welds (weld_id);
create table if not exists ex_weld_conflicts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  weld_id uuid not null references ex_welds(id) on delete cascade,
  kind text not null check (kind in ('pipe','size','thickness','front')),
  detail text not null default '',
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(), resolved_by uuid, resolved_at timestamptz, note text not null default ''
);
create unique index if not exists ex_weld_conflicts_open_uq on ex_weld_conflicts (weld_id, kind) where status = 'open';
create table if not exists ex_weld_merges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  from_weld uuid not null references ex_welds(id),
  into_weld uuid not null references ex_welds(id),
  moved_lines uuid[] not null default '{}',
  reason text not null default '',
  by uuid default auth.uid(), at timestamptz not null default now(), undone_at timestamptz, undone_by uuid
);
create table if not exists ex_weld_dismissals (
  project_id uuid not null, n2 text not null, by uuid default auth.uid(), at timestamptz not null default now(), primary key (project_id, n2)
);

create index if not exists idx_ex_line_welds_weld on ex_line_welds (weld_id);
create unique index if not exists ex_weld_conflicts_open_uq on ex_weld_conflicts (weld_id, kind) where status = 'open';
alter table ex_welds enable row level security; alter table ex_line_welds enable row level security; alter table ex_weld_conflicts enable row level security; alter table ex_weld_merges enable row level security; alter table ex_weld_dismissals enable row level security;
create policy ex_welds_sel on ex_welds for select to authenticated using (true);
create policy ex_line_welds_sel on ex_line_welds for select to authenticated using (true);
create policy ex_weld_conflicts_sel on ex_weld_conflicts for select to authenticated using (true);
create policy ex_weld_merges_sel on ex_weld_merges for select to authenticated using (true);
create policy ex_weld_dismissals_sel on ex_weld_dismissals for select to authenticated using (true);
-- all writes go through the SECURITY DEFINER functions below (no write policies)

-- N1 = safe normalisation (matching key); N2 = suspicion only (never merges)
create or replace function ex_weld_n1(v text) returns text language sql immutable as $f$
  select upper(btrim(regexp_replace(regexp_replace(regexp_replace(
    replace(replace(translate(coalesce(v, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), 'ي', 'ی'), 'ك', 'ک'),
    '[​-‏‪-‮⁦-⁩﻿]', '', 'g'), '[‐-―−﹘﹣－]', '-', 'g'), '\s+', ' ', 'g')))
$f$;
create or replace function ex_weld_n2(v text) returns text language sql immutable as $f$
  select regexp_replace(regexp_replace(ex_weld_n1(v), '[^[:alnum:]]', '', 'g'), '(^|[^0-9])0+([0-9])', '\1\2', 'g')
$f$;
-- conflict scan, sync (idempotent; rescans the weld a line moved away from), merge/unmerge (reversible, logged), status, dismissals, conflict resolution
-- The function bodies were applied live from the definitions kept in the database: use  select pg_get_functiondef('ex_weld_sync'::regproc)  etc. as the source of truth.
-- Functions: ex_weld_conflict_scan(uuid), ex_weld_sync(uuid), ex_weld_merge(uuid,uuid,text), ex_weld_unmerge(uuid), ex_weld_set_status(uuid,text), ex_weld_dismiss_suspect(uuid,text), ex_weld_conflict_resolve(uuid,text,text); view ex_weld_suspects.
