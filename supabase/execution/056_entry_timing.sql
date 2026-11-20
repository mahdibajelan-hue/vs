-- 056 — how long it takes site staff to enter a daily report, measured in the app (open the editor → save / send /
-- close). One row per editing session: active time (the editor visible and touched within the last 30 s), wall time,
-- how many edits, how many work lines, the device class and the outcome. Nothing in the report itself is stored.
-- Rows are written once by the person who edited and never changed. Everyone sees their own rows; people who can
-- configure or review the project's execution see all its rows (for the entry-time page).
-- Additive only. Rollback: rollback/056_rollback.sql (run by hand).
create table if not exists public.ex_entry_timings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  report_id uuid references public.ex_reports(id) on delete set null,
  user_id uuid not null default auth.uid(),
  form_key text not null default 'work',
  outcome text not null check (outcome in ('saved', 'submitted', 'closed')),
  new_report boolean not null default false,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  active_sec integer not null check (active_sec between 0 and 86400),
  wall_sec integer not null check (wall_sec between 0 and 604800),
  edits integer not null default 0 check (edits >= 0),
  lines integer not null default 0 check (lines >= 0),
  device text not null default 'desktop' check (device in ('mobile', 'tablet', 'desktop')),
  created_at timestamptz not null default now(),
  check (ended_at >= started_at)
);
create index if not exists ex_entry_timings_project_idx on public.ex_entry_timings (project_id, started_at desc);
create index if not exists ex_entry_timings_user_idx on public.ex_entry_timings (user_id, started_at desc);
alter table public.ex_entry_timings enable row level security;
revoke all on public.ex_entry_timings from anon;
grant select, insert on public.ex_entry_timings to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ex_entry_timings' and policyname = 'ex_entry_timings_read') then
    create policy ex_entry_timings_read on public.ex_entry_timings for select to authenticated
      using (user_id = (select auth.uid()) or ex_can_configure(project_id) or ex_allows(project_id, 'review'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ex_entry_timings' and policyname = 'ex_entry_timings_insert') then
    create policy ex_entry_timings_insert on public.ex_entry_timings for insert to authenticated
      with check (user_id = (select auth.uid()) and ex_can_view(project_id)
        and (report_id is null or exists (select 1 from public.ex_reports r where r.id = report_id and r.project_id = ex_entry_timings.project_id)));
  end if;
end $$;
comment on table public.ex_entry_timings is 'daily-report entry sessions measured in the app (time, edits, device) — no report content';
