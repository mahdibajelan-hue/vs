-- PipePulse — Supabase schema + Row Level Security policies
-- Run this once in the Supabase project's SQL editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run, and safe to run even if you already ran an earlier version of this file —
-- every statement is guarded with IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS.

-- ============================================================================
-- 1. Extensions
-- ============================================================================
create extension if not exists "pgcrypto";

-- ============================================================================
-- 2. Profiles — one row per signed-up user, mirrors auth.users
-- ============================================================================
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null,
  created_at timestamptz not null default now()
);

-- Upgrade path if an earlier version of this file already created the table without these columns.
alter table profiles add column if not exists avatar_url text not null default '';
alter table profiles add column if not exists position_title text not null default '';
alter table profiles add column if not exists phone text not null default '';
-- Platform-wide admin flag — separate from the per-project 'owner' role. Only an admin can grant
-- the 'owner' role to someone (see project_members policies below). Nobody can set this on
-- themselves (see trg_prevent_self_admin_escalation) — the first admin must be set by hand:
--   update profiles set is_admin = true where email = 'you@example.com';
alter table profiles add column if not exists is_admin boolean not null default false;
-- Drives the forced "complete your profile" screen on first login.
alter table profiles add column if not exists profile_completed boolean not null default false;

alter table profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on profiles;
create policy "profiles_select_authenticated" on profiles
  for select using (auth.uid() is not null);

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- profiles_update_own lets a user update their own row (needed so they can save their name/
-- avatar/position), but with no column-level restriction that would also let them PATCH
-- is_admin=true on themselves directly via the REST API. This trigger silently reverts any
-- change to is_admin unless the actor already is an admin.
--
-- auth.uid() is only non-null inside a request made through the app (an authenticated PostgREST
-- call carrying a user JWT). A statement run directly in the Supabase SQL Editor — the only way
-- to bootstrap the very first admin — has no such JWT, so auth.uid() is null there. We only
-- enforce the block when auth.uid() is present (i.e. the app's own REST API), so SQL Editor
-- changes always go through untouched.
create or replace function prevent_self_admin_escalation()
returns trigger as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null
     and not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_self_admin_escalation on profiles;
create trigger trg_prevent_self_admin_escalation
  before update on profiles
  for each row execute function prevent_self_admin_escalation();

create or replace function is_admin_user()
returns boolean as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$ language sql security definer stable;

-- ============================================================================
-- 2b. Avatar storage — public bucket, each user may only write inside their own folder
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 3. Projects — core metadata plus JSONB blobs for data that's always read/
--    written as a whole array (schedules, milestones, risks, report config,
--    baseline planned curve). Lines and daily logs get real tables below
--    since those are the high-frequency, genuinely row-level collaborative data.
-- ============================================================================
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text not null default '',
  location text not null default '',
  unit text not null default '',
  svg_raw text,
  svg_file_name text,
  schedules jsonb not null default '[]'::jsonb,
  milestones jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  report_config jsonb not null default '{}'::jsonb,
  planned_curve jsonb not null default '[]'::jsonb,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- Upgrade path if an earlier version of this file already created the table without these columns.
alter table projects add column if not exists schedules jsonb not null default '[]'::jsonb;
alter table projects add column if not exists milestones jsonb not null default '[]'::jsonb;
alter table projects add column if not exists risks jsonb not null default '[]'::jsonb;
alter table projects add column if not exists report_config jsonb not null default '{}'::jsonb;
alter table projects add column if not exists planned_curve jsonb not null default '[]'::jsonb;
-- Valves/fittings/equipment placed in the schematic tool, kept as a flat list so they can be
-- listed (e.g. next to the line list in Schedule) after the drawing is saved.
alter table projects add column if not exists equipment jsonb not null default '[]'::jsonb;
-- Owner's sign-off on the whole schedule (all lines/activities) — separate columns rather than
-- part of the schedules array since it's a single whole-plan flag, not a per-row field.
alter table projects add column if not exists schedule_owner_approved_at timestamptz;
alter table projects add column if not exists schedule_owner_approved_by uuid references profiles (id);

-- Superseded by the JSONB columns above — drop if an earlier version of this file created them.
drop table if exists activity_schedules cascade;
drop table if exists planned_progress_points cascade;
drop table if exists milestones cascade;
drop table if exists risks cascade;
drop table if exists report_configs cascade;

alter table projects enable row level security;

-- ============================================================================
-- 4. Project membership — invite-based access control
-- ============================================================================
create table if not exists project_members (
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null check (role in ('contractor', 'consultant', 'owner')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table project_members enable row level security;

-- Pending invites: a project member invites by email before the invitee has an account,
-- or before they've accepted. Once the invited email signs in, the app converts this row into
-- a project_members row (see accept_pending_invites() below).
create table if not exists project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  email text not null,
  role text not null check (role in ('contractor', 'consultant', 'owner')),
  invited_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (project_id, email)
);

alter table project_invites enable row level security;

-- ============================================================================
-- 5. Helper functions (security definer — bypass RLS internally, used inside policies)
-- ============================================================================
create or replace function is_project_member(p_project_id uuid)
returns boolean as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$ language sql security definer stable;

create or replace function project_role(p_project_id uuid)
returns text as $$
  select role from project_members
  where project_id = p_project_id and user_id = auth.uid()
  limit 1;
$$ language sql security definer stable;

-- contractor + consultant may write project data; owner is read-only (mirrors src/lib/permissions.ts).
create or replace function can_edit_project(p_project_id uuid)
returns boolean as $$
  select project_role(p_project_id) in ('contractor', 'consultant');
$$ language sql security definer stable;

-- Called by the client right after sign-in to turn any pending invite matching the user's
-- email into an active membership.
create or replace function accept_pending_invites()
returns void as $$
begin
  insert into project_members (project_id, user_id, role)
  select pi.project_id, auth.uid(), pi.role
  from project_invites pi
  join profiles p on p.email = pi.email
  where p.id = auth.uid() and pi.accepted_at is null
  on conflict (project_id, user_id) do nothing;

  update project_invites
  set accepted_at = now()
  where accepted_at is null
    and email = (select email from profiles where id = auth.uid());
end;
$$ language plpgsql security definer;

-- Creates a project and its first membership row atomically, then returns the new project.
-- Needed because RLS gates INSERT ... RETURNING by the SELECT policy — without this, a plain
-- client-side "insert project, then insert membership" would return an empty row on step 1
-- (the creator isn't a member yet at that instant, so the just-inserted row isn't visible back).
create or replace function create_project_with_owner(
  p_name text,
  p_role text,
  p_client text default '',
  p_location text default '',
  p_unit text default '',
  p_svg_raw text default null,
  p_svg_file_name text default null,
  p_schedules jsonb default '[]'::jsonb,
  p_milestones jsonb default '[]'::jsonb,
  p_risks jsonb default '[]'::jsonb,
  p_report_config jsonb default '{}'::jsonb,
  p_planned_curve jsonb default '[]'::jsonb
)
returns projects as $$
declare
  new_project projects;
begin
  insert into projects (name, client, location, unit, svg_raw, svg_file_name, schedules, milestones, risks, report_config, planned_curve, created_by)
  values (p_name, p_client, p_location, p_unit, p_svg_raw, p_svg_file_name, p_schedules, p_milestones, p_risks, p_report_config, p_planned_curve, auth.uid())
  returning * into new_project;

  insert into project_members (project_id, user_id, role) values (new_project.id, auth.uid(), p_role);

  return new_project;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- 6. Policies — projects
-- ============================================================================
-- Admin can see every project — otherwise a project created solo by a contractor/consultant (no
-- owner yet) is invisible even to admin, since members_insert_owner_or_admin already lets admin
-- add members to it, but only once they can find/open it in the first place.
drop policy if exists "projects_select_member" on projects;
create policy "projects_select_member" on projects
  for select using (is_project_member(id) or is_admin_user());

drop policy if exists "projects_insert_any_authenticated" on projects;
create policy "projects_insert_any_authenticated" on projects
  for insert with check (auth.uid() is not null);

-- Owner/admin also get update — needed so an owner can approve/audit a milestone (stored inside
-- the milestones jsonb column on this same row); the UI only exposes that one narrow path to them.
drop policy if exists "projects_update_editor" on projects;
create policy "projects_update_editor" on projects
  for update using (can_edit_project(id) or project_role(id) = 'owner' or is_admin_user());

drop policy if exists "projects_delete_owner_role" on projects;
create policy "projects_delete_owner_role" on projects
  for delete using (project_role(id) = 'owner' or created_by = auth.uid());

-- ============================================================================
-- 7. Policies — project_members / project_invites
-- ============================================================================
drop policy if exists "members_select_member" on project_members;
create policy "members_select_member" on project_members
  for select using (is_project_member(project_id) or is_admin_user());

-- Only a platform admin may grant the 'owner' role. The project owner (or an admin) may add
-- contractor/consultant members. accept_pending_invites() inserting a row for the current user
-- (accepting their own pending invite) is always allowed regardless of role.
drop policy if exists "members_insert_owner_or_bootstrap" on project_members;
drop policy if exists "members_insert_owner_or_admin" on project_members;
create policy "members_insert_owner_or_admin" on project_members
  for insert with check (
    user_id = auth.uid()
    or is_admin_user()
    or (role in ('contractor', 'consultant') and project_role(project_id) = 'owner')
  );

drop policy if exists "members_delete_owner" on project_members;
create policy "members_delete_owner" on project_members
  for delete using (project_role(project_id) = 'owner' or is_admin_user());

drop policy if exists "members_update_owner" on project_members;
create policy "members_update_owner" on project_members
  for update
  using (project_role(project_id) = 'owner' or is_admin_user())
  with check (role <> 'owner' or is_admin_user());

drop policy if exists "invites_select_member_or_invitee" on project_invites;
create policy "invites_select_member_or_invitee" on project_invites
  for select using (
    is_project_member(project_id)
    or email = (select email from profiles where id = auth.uid())
    or is_admin_user()
  );

drop policy if exists "invites_insert_member" on project_invites;
create policy "invites_insert_member" on project_invites
  for insert with check (
    is_admin_user()
    or (role in ('contractor', 'consultant') and project_role(project_id) = 'owner')
  );

drop policy if exists "invites_delete_member" on project_invites;
create policy "invites_delete_member" on project_invites
  for delete using (is_project_member(project_id) and (project_role(project_id) = 'owner' or is_admin_user()));

-- ============================================================================
-- 8. Project-scoped data tables — high-frequency, genuinely row-level data
-- ============================================================================
create table if not exists lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  svg_element_id text not null,
  svg_element_ids text[] not null default '{}',
  size text not null default '',
  spec text not null default '',
  service text not null default '',
  contractor text not null default '',
  planned_length numeric not null default 0,
  total_welds integer not null default 0,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'testing', 'completed')),
  created_at timestamptz not null default now()
);

-- How many of total_welds came from placed fittings/valves (2 each) rather than pipe butt welds —
-- fitting welds take much longer, so scheduling needs the breakdown, not just the total.
alter table lines add column if not exists fitting_weld_count integer not null default 0;

create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  line_id uuid not null references lines (id) on delete cascade,
  date date not null,
  length_done numeric not null default 0,
  weld_count integer not null default 0,
  weld_pass text not null check (weld_pass in ('root', 'hot', 'fill', 'cap', 'ndt', 'hydrotest')),
  contractor text not null default '',
  notes text not null default '',
  delay_reason text not null default '',
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references profiles (id),
  review_note text not null default '',
  created_at timestamptz not null default now()
);

-- Upgrade path: three-way audit trail (contractor's original entry, consultant's approved
-- snapshot, owner's own correction/confirmation) so reports can compare what each role recorded,
-- even after length_done/weld_count are later corrected by a more senior role.
alter table daily_logs add column if not exists contractor_length_done numeric;
alter table daily_logs add column if not exists contractor_weld_count integer;
alter table daily_logs add column if not exists consultant_length_done numeric;
alter table daily_logs add column if not exists consultant_weld_count integer;
alter table daily_logs add column if not exists owner_length_done numeric;
alter table daily_logs add column if not exists owner_weld_count integer;
alter table daily_logs add column if not exists owner_reviewed_at timestamptz;
alter table daily_logs add column if not exists owner_reviewed_by uuid references profiles (id);
alter table daily_logs add column if not exists owner_note text not null default '';
-- Backfill existing rows so old data has a contractor snapshot too.
update daily_logs set contractor_length_done = length_done where contractor_length_done is null;
update daily_logs set contractor_weld_count = weld_count where contractor_weld_count is null;
-- Rows already approved before this migration ran never went through the new approve() snapshot
-- logic, so give them a consultant snapshot too — otherwise the 3-way comparison chart looks
-- empty for all pre-existing data even after the migration runs.
update daily_logs set consultant_length_done = length_done where approval_status = 'approved' and consultant_length_done is null;
update daily_logs set consultant_weld_count = weld_count where approval_status = 'approved' and consultant_weld_count is null;

-- Repurpose weld_pass (root/hot/fill/cap/ndt/hydrotest — weld-pass granularity) as the broader
-- per-log "activity" tag matching the Schedule module's four activities (welding/ndt/coating/
-- hydrotest) — individual pass detail wasn't used for scheduling, so root/hot/fill/cap collapse
-- into 'welding'. This also lets the Schedule module auto-compute every activity's actual
-- progress from daily logs tagged with that same activity, not just welding.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'daily_logs' and column_name = 'activity') then
    if exists (select 1 from information_schema.columns where table_name = 'daily_logs' and column_name = 'weld_pass') then
      alter table daily_logs rename column weld_pass to activity;
    else
      alter table daily_logs add column activity text not null default 'welding';
    end if;
  end if;
end $$;
-- Drop the old check (still enforcing the 6-value pass list, just renamed onto the 'activity'
-- column by the rename above) BEFORE backfilling — otherwise the backfill's own 'welding' value
-- would itself violate the not-yet-replaced old constraint and abort the whole migration.
alter table daily_logs drop constraint if exists daily_logs_weld_pass_check;
alter table daily_logs drop constraint if exists daily_logs_activity_check;
update daily_logs set activity = 'welding' where activity in ('root', 'hot', 'fill', 'cap');
alter table daily_logs add constraint daily_logs_activity_check check (activity in ('welding', 'ndt', 'coating', 'hydrotest'));
alter table daily_logs alter column activity set default 'welding';

alter table lines enable row level security;
alter table daily_logs enable row level security;

drop policy if exists "lines_select_member" on lines;
create policy "lines_select_member" on lines
  for select using (is_project_member(project_id) or is_admin_user());

-- Owner may also draw/save the schematic and its extracted lines — it isn't part of the
-- contractor->consultant daily-progress approval chain, so the owner isn't limited to read-only here.
drop policy if exists "lines_write_editor" on lines;
create policy "lines_write_editor" on lines
  for all
  using (can_edit_project(project_id) or project_role(project_id) = 'owner' or is_admin_user())
  with check (can_edit_project(project_id) or project_role(project_id) = 'owner' or is_admin_user());

drop policy if exists "daily_logs_select_member" on daily_logs;
create policy "daily_logs_select_member" on daily_logs
  for select using (is_project_member(project_id) or is_admin_user());

-- Contractor/consultant create entries as before. Owner/admin can also insert — not exposed in
-- the normal entry form, but needed so they can restore a deleted row from its audit_log
-- snapshot (see restoreLogSnapshot in the client).
drop policy if exists "daily_logs_write_editor" on daily_logs;
drop policy if exists "daily_logs_insert_editor" on daily_logs;
create policy "daily_logs_insert_editor" on daily_logs
  for insert with check (can_edit_project(project_id) or project_role(project_id) = 'owner' or is_admin_user());

drop policy if exists "daily_logs_update_editor_or_owner" on daily_logs;
create policy "daily_logs_update_editor_or_owner" on daily_logs
  for update
  using (can_edit_project(project_id) or project_role(project_id) = 'owner' or is_admin_user())
  with check (can_edit_project(project_id) or project_role(project_id) = 'owner' or is_admin_user());

drop policy if exists "daily_logs_delete_editor" on daily_logs;
create policy "daily_logs_delete_editor" on daily_logs
  for delete using (can_edit_project(project_id));

-- ============================================================================
-- 8b. Audit log — full before/after snapshot of every insert/update/delete on
--     daily_logs and lines, with who made the change. Lets an admin or owner see
--     exactly which user changed or deleted a value, and restore it.
-- ============================================================================
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  project_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references profiles (id),
  changed_at timestamptz not null default now()
);

alter table audit_log enable row level security;

-- Only the trigger (security definer, below) ever writes to this table — no INSERT/UPDATE/DELETE
-- policy is granted to clients, so nobody can tamper with or erase their own history.
drop policy if exists "audit_log_select_member_or_admin" on audit_log;
create policy "audit_log_select_member_or_admin" on audit_log
  for select using (is_admin_user() or (project_id is not null and project_role(project_id) = 'owner'));

create or replace function log_audit_event()
returns trigger as $$
declare
  v_project_id uuid;
begin
  v_project_id := coalesce(new.project_id, old.project_id);
  insert into audit_log (table_name, row_id, project_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    v_project_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_audit_daily_logs on daily_logs;
create trigger trg_audit_daily_logs
  after insert or update or delete on daily_logs
  for each row execute function log_audit_event();

drop trigger if exists trg_audit_lines on lines;
create trigger trg_audit_lines
  after insert or update or delete on lines
  for each row execute function log_audit_event();

-- ============================================================================
-- 9. Indexes
-- ============================================================================
create index if not exists idx_project_members_user on project_members (user_id);
create index if not exists idx_lines_project on lines (project_id);
create index if not exists idx_daily_logs_project on daily_logs (project_id);
create index if not exists idx_daily_logs_line on daily_logs (line_id);
create index if not exists idx_project_invites_email on project_invites (email);
create index if not exists idx_audit_log_row on audit_log (table_name, row_id);
create index if not exists idx_audit_log_project on audit_log (project_id);

-- ============================================================================
-- 10. Risk Management module — a separate product reached from the module hub,
--     sharing auth/profiles with the piping tracker above but with its own project
--     registry and full risk lifecycle (identify -> assess -> plan response ->
--     monitor -> reassess -> escalate -> mitigate -> close). Phase 1: register,
--     assessment history, actions. Dashboard/heatmap/trend analytics/reports/AI
--     assistant are later phases built on top of this data model.
-- ============================================================================
create table if not exists rm_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text not null default '',
  project_manager_id uuid references profiles (id),
  start_date date,
  finish_date date,
  status text not null default 'active' check (status in ('active', 'on_hold', 'closed')),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table rm_projects enable row level security;

create table if not exists rm_project_members (
  project_id uuid not null references rm_projects (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null check (role in ('project_manager', 'risk_manager', 'risk_owner', 'team_member', 'management')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table rm_project_members enable row level security;

-- Risk Master. initial_probability/impact are frozen at creation — the baseline every later
-- review is compared against; current/residual state lives in rm_risk_assessments (a fresh row
-- per review, never an overwrite) so the full history survives.
create table if not exists rm_risks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references rm_projects (id) on delete cascade,
  code text not null,
  title text not null,
  description text not null default '',
  category text not null default 'other' check (category in ('technical', 'schedule', 'cost', 'hse', 'procurement', 'quality', 'external', 'other')),
  risk_type text not null default 'threat' check (risk_type in ('threat', 'opportunity')),
  owner_id uuid references profiles (id),
  identified_date date not null default current_date,
  status text not null default 'open' check (status in ('open', 'monitoring', 'escalated', 'closed')),
  response_strategy text not null default 'mitigate' check (response_strategy in ('avoid', 'mitigate', 'transfer', 'accept', 'exploit')),
  project_phase text check (project_phase in ('engineering', 'procurement', 'construction', 'commissioning')),
  time_to_impact_days integer,
  initial_probability smallint not null check (initial_probability between 1 and 5),
  initial_impact smallint not null check (initial_impact between 1 and 5),
  initial_score smallint generated always as (initial_probability * initial_impact) stored,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rm_risks enable row level security;

-- Auto-assigns the next R-### code within its project — the client never computes/sends one.
create or replace function rm_assign_risk_code()
returns trigger as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'R-' || lpad((
      select coalesce(max(split_part(code, '-', 2)::int), 0) + 1
      from rm_risks where project_id = new.project_id
    )::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_rm_assign_risk_code on rm_risks;
create trigger trg_rm_assign_risk_code
  before insert on rm_risks
  for each row execute function rm_assign_risk_code();

create table if not exists rm_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references rm_risks (id) on delete cascade,
  review_date date not null default current_date,
  current_probability smallint not null check (current_probability between 1 and 5),
  current_impact smallint not null check (current_impact between 1 and 5),
  current_score smallint generated always as (current_probability * current_impact) stored,
  residual_probability smallint not null check (residual_probability between 1 and 5),
  residual_impact smallint not null check (residual_impact between 1 and 5),
  residual_score smallint generated always as (residual_probability * residual_impact) stored,
  trend text not null default 'stable' check (trend in ('improving', 'stable', 'worsening')),
  reviewer_comment text not null default '',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table rm_risk_assessments enable row level security;

create table if not exists rm_risk_actions (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references rm_risks (id) on delete cascade,
  description text not null,
  owner_id uuid references profiles (id),
  due_date date,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  completion_percentage smallint not null default 0 check (completion_percentage between 0 and 100),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rm_risk_actions enable row level security;

-- Comments + lightweight audit trail (one row per notable event: created, status change,
-- assessment added, action added/completed, comment).
create table if not exists rm_risk_history (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references rm_risks (id) on delete cascade,
  user_id uuid references profiles (id),
  activity text not null,
  previous_value jsonb,
  new_value jsonb,
  comment text not null default '',
  created_at timestamptz not null default now()
);

alter table rm_risk_history enable row level security;

-- ----------------------------------------------------------------------------
-- Helper functions
-- ----------------------------------------------------------------------------
create or replace function rm_is_project_member(p_project_id uuid)
returns boolean as $$
  select exists (
    select 1 from rm_project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$ language sql security definer stable;

create or replace function rm_project_role(p_project_id uuid)
returns text as $$
  select role from rm_project_members
  where project_id = p_project_id and user_id = auth.uid()
  limit 1;
$$ language sql security definer stable;

-- Everyone except the read-only "management" (steering committee) role may register risks, log
-- actions and comment.
create or replace function rm_can_edit(p_project_id uuid)
returns boolean as $$
  select rm_project_role(p_project_id) in ('project_manager', 'risk_manager', 'risk_owner', 'team_member');
$$ language sql security definer stable;

-- Project Manager / Risk Manager (PMO) run formal reviews, approvals and escalation.
create or replace function rm_can_manage(p_project_id uuid)
returns boolean as $$
  select rm_project_role(p_project_id) in ('project_manager', 'risk_manager');
$$ language sql security definer stable;

-- Mirrors create_project_with_owner — creates the project and the creator's first membership
-- row atomically so RLS's SELECT policy doesn't hide the just-inserted row from its own RETURNING.
create or replace function create_rm_project_with_manager(
  p_name text,
  p_role text,
  p_client text default '',
  p_start_date date default null,
  p_finish_date date default null
)
returns rm_projects as $$
declare
  new_project rm_projects;
begin
  insert into rm_projects (name, client, start_date, finish_date, project_manager_id, created_by)
  values (p_name, p_client, p_start_date, p_finish_date, case when p_role = 'project_manager' then auth.uid() else null end, auth.uid())
  returning * into new_project;

  insert into rm_project_members (project_id, user_id, role) values (new_project.id, auth.uid(), p_role);

  return new_project;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Policies
-- ----------------------------------------------------------------------------
drop policy if exists "rm_projects_select_member" on rm_projects;
create policy "rm_projects_select_member" on rm_projects
  for select using (rm_is_project_member(id) or is_admin_user());

drop policy if exists "rm_projects_insert_any_authenticated" on rm_projects;
create policy "rm_projects_insert_any_authenticated" on rm_projects
  for insert with check (auth.uid() is not null);

drop policy if exists "rm_projects_update_manager" on rm_projects;
create policy "rm_projects_update_manager" on rm_projects
  for update using (rm_can_manage(id) or is_admin_user());

drop policy if exists "rm_projects_delete_manager" on rm_projects;
create policy "rm_projects_delete_manager" on rm_projects
  for delete using (rm_project_role(id) = 'project_manager' or is_admin_user());

drop policy if exists "rm_members_select_member" on rm_project_members;
create policy "rm_members_select_member" on rm_project_members
  for select using (rm_is_project_member(project_id) or is_admin_user());

drop policy if exists "rm_members_insert_manager_or_admin" on rm_project_members;
create policy "rm_members_insert_manager_or_admin" on rm_project_members
  for insert with check (
    user_id = auth.uid()
    or is_admin_user()
    or rm_project_role(project_id) = 'project_manager'
  );

drop policy if exists "rm_members_delete_manager" on rm_project_members;
create policy "rm_members_delete_manager" on rm_project_members
  for delete using (rm_project_role(project_id) = 'project_manager' or is_admin_user());

drop policy if exists "rm_members_update_manager" on rm_project_members;
create policy "rm_members_update_manager" on rm_project_members
  for update using (rm_project_role(project_id) = 'project_manager' or is_admin_user());

drop policy if exists "rm_risks_select_member" on rm_risks;
create policy "rm_risks_select_member" on rm_risks
  for select using (rm_is_project_member(project_id) or is_admin_user());

drop policy if exists "rm_risks_insert_editor" on rm_risks;
create policy "rm_risks_insert_editor" on rm_risks
  for insert with check (rm_can_edit(project_id) or is_admin_user());

drop policy if exists "rm_risks_update_editor_or_owner" on rm_risks;
create policy "rm_risks_update_editor_or_owner" on rm_risks
  for update using (rm_can_edit(project_id) or owner_id = auth.uid() or is_admin_user());

drop policy if exists "rm_risks_delete_manager" on rm_risks;
create policy "rm_risks_delete_manager" on rm_risks
  for delete using (rm_can_manage(project_id) or is_admin_user());

-- Assessment history — read by any project member; only PM/Risk Manager add reviews (formal
-- reassessment is their job, not ad-hoc team edits).
drop policy if exists "rm_assessments_select_member" on rm_risk_assessments;
create policy "rm_assessments_select_member" on rm_risk_assessments
  for select using (
    exists (select 1 from rm_risks r where r.id = risk_id and (rm_is_project_member(r.project_id) or is_admin_user()))
  );

drop policy if exists "rm_assessments_insert_manager" on rm_risk_assessments;
create policy "rm_assessments_insert_manager" on rm_risk_assessments
  for insert with check (
    exists (select 1 from rm_risks r where r.id = risk_id and (rm_can_manage(r.project_id) or is_admin_user()))
  );

drop policy if exists "rm_actions_select_member" on rm_risk_actions;
create policy "rm_actions_select_member" on rm_risk_actions
  for select using (
    exists (select 1 from rm_risks r where r.id = risk_id and (rm_is_project_member(r.project_id) or is_admin_user()))
  );

drop policy if exists "rm_actions_write_editor" on rm_risk_actions;
create policy "rm_actions_write_editor" on rm_risk_actions
  for all
  using (
    exists (select 1 from rm_risks r where r.id = risk_id and (rm_can_edit(r.project_id) or r.owner_id = auth.uid() or is_admin_user()))
  )
  with check (
    exists (select 1 from rm_risks r where r.id = risk_id and (rm_can_edit(r.project_id) or r.owner_id = auth.uid() or is_admin_user()))
  );

drop policy if exists "rm_history_select_member" on rm_risk_history;
create policy "rm_history_select_member" on rm_risk_history
  for select using (
    exists (select 1 from rm_risks r where r.id = risk_id and (rm_is_project_member(r.project_id) or is_admin_user()))
  );

drop policy if exists "rm_history_insert_member" on rm_risk_history;
create policy "rm_history_insert_member" on rm_risk_history
  for insert with check (
    exists (select 1 from rm_risks r where r.id = risk_id and (rm_is_project_member(r.project_id) or is_admin_user()))
  );

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_rm_project_members_user on rm_project_members (user_id);
create index if not exists idx_rm_risks_project on rm_risks (project_id);
create index if not exists idx_rm_risk_assessments_risk on rm_risk_assessments (risk_id);
create index if not exists idx_rm_risk_actions_risk on rm_risk_actions (risk_id);
create index if not exists idx_rm_risk_history_risk on rm_risk_history (risk_id);

-- ============================================================================
-- 11. Issue Management module ("رصد") — a third product reached from the module hub,
--     sharing auth/profiles with the products above. Each issue has an assigned pursuer
--     (does the work) and approver (signs it off); status moves
--     open -> in_progress -> pending_approval -> approved/rejected. Ported design/feature
--     set from a self-hosted reference build, rebuilt on Supabase + RLS to fit this app.
-- ============================================================================
create table if not exists im_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table im_projects enable row level security;

create table if not exists im_project_members (
  project_id uuid not null references im_projects (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'pursuer', 'approver')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table im_project_members enable row level security;

create table if not exists im_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references im_projects (id) on delete cascade,
  title text not null,
  description text not null default '',
  pursuer_id uuid references profiles (id),
  approver_id uuid references profiles (id),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  deadline_days smallint not null default 3 check (deadline_days > 0),
  deadline_date date generated always as (((created_at at time zone 'utc')::date) + deadline_days) stored,
  action_date date,
  status text not null default 'open' check (status in ('open', 'in_progress', 'pending_approval', 'approved', 'rejected')),
  closed_at date,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table im_issues enable row level security;

-- ----------------------------------------------------------------------------
-- Helper functions
-- ----------------------------------------------------------------------------
create or replace function im_is_project_member(p_project_id uuid)
returns boolean as $$
  select exists (
    select 1 from im_project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$ language sql security definer stable;

create or replace function im_project_role(p_project_id uuid)
returns text as $$
  select role from im_project_members
  where project_id = p_project_id and user_id = auth.uid()
  limit 1;
$$ language sql security definer stable;

create or replace function im_can_manage(p_project_id uuid)
returns boolean as $$
  select im_project_role(p_project_id) = 'admin';
$$ language sql security definer stable;

-- Mirrors create_rm_project_with_manager — creates the project and the creator's own
-- admin membership row atomically so RLS's SELECT policy doesn't hide the just-inserted row.
create or replace function create_im_project_with_admin(
  p_name text,
  p_description text default ''
)
returns im_projects as $$
declare
  new_project im_projects;
begin
  insert into im_projects (name, description, created_by)
  values (p_name, p_description, auth.uid())
  returning * into new_project;

  insert into im_project_members (project_id, user_id, role) values (new_project.id, auth.uid(), 'admin');

  return new_project;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Policies
-- ----------------------------------------------------------------------------
drop policy if exists "im_projects_select_member" on im_projects;
create policy "im_projects_select_member" on im_projects
  for select using (im_is_project_member(id) or is_admin_user());

drop policy if exists "im_projects_insert_any_authenticated" on im_projects;
create policy "im_projects_insert_any_authenticated" on im_projects
  for insert with check (auth.uid() is not null);

drop policy if exists "im_projects_update_manager" on im_projects;
create policy "im_projects_update_manager" on im_projects
  for update using (im_can_manage(id) or is_admin_user());

drop policy if exists "im_projects_delete_manager" on im_projects;
create policy "im_projects_delete_manager" on im_projects
  for delete using (im_can_manage(id) or is_admin_user());

drop policy if exists "im_members_select_member" on im_project_members;
create policy "im_members_select_member" on im_project_members
  for select using (im_is_project_member(project_id) or is_admin_user());

drop policy if exists "im_members_insert_manager_or_admin" on im_project_members;
create policy "im_members_insert_manager_or_admin" on im_project_members
  for insert with check (
    user_id = auth.uid()
    or is_admin_user()
    or im_can_manage(project_id)
  );

drop policy if exists "im_members_delete_manager" on im_project_members;
create policy "im_members_delete_manager" on im_project_members
  for delete using (im_can_manage(project_id) or is_admin_user());

drop policy if exists "im_members_update_manager" on im_project_members;
create policy "im_members_update_manager" on im_project_members
  for update using (im_can_manage(project_id) or is_admin_user());

drop policy if exists "im_issues_select_member" on im_issues;
create policy "im_issues_select_member" on im_issues
  for select using (im_is_project_member(project_id) or is_admin_user());

drop policy if exists "im_issues_insert_member" on im_issues;
create policy "im_issues_insert_member" on im_issues
  for insert with check (im_is_project_member(project_id) or is_admin_user());

-- Any project member may edit an issue (mirrors the reference app's un-gated "new issue"
-- form); the assigned pursuer/approver additionally always keep write access to their own
-- assignments even if their project role changes later.
drop policy if exists "im_issues_update_member_or_assignee" on im_issues;
create policy "im_issues_update_member_or_assignee" on im_issues
  for update using (
    im_is_project_member(project_id) or pursuer_id = auth.uid() or approver_id = auth.uid() or is_admin_user()
  );

drop policy if exists "im_issues_delete_manager" on im_issues;
create policy "im_issues_delete_manager" on im_issues
  for delete using (im_can_manage(project_id) or is_admin_user());

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_im_project_members_user on im_project_members (user_id);
create index if not exists idx_im_issues_project on im_issues (project_id);

-- ============================================================================
-- 12. RASTA Master Data — Organization / Portfolio / Program / Project hierarchy
--     shared by every module ("Project Name is for humans. Project ID is for the
--     system."). This is Phase 1-6 of the Master Data & Access Architecture:
--     centralized reference data, purely additive — nothing above is touched, and
--     Risk/Issue/PipePulse keep their own project registries for now. Migrating
--     them onto master_projects.id (via a project_mapping/alias layer) and the
--     full Role/Permission/Scope model are later phases, deferred.
--
--     Access model for this phase: master data is shared reference data readable
--     by any authenticated user (so every module can look up names/hierarchy),
--     writable only by is_admin_user() — the same admin flag already gating
--     UnifiedAdminPage. A dedicated RBAC model (roles/permissions/project scope)
--     is Phase 8+ of the plan and intentionally not built yet.
-- ============================================================================

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null default '',
  org_type text not null default 'other' check (org_type in ('employer', 'consultant', 'contractor', 'partner', 'internal', 'other')),
  description text not null default '',
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table organizations enable row level security;

drop policy if exists "organizations_select_authenticated" on organizations;
create policy "organizations_select_authenticated" on organizations
  for select using (auth.uid() is not null);

drop policy if exists "organizations_write_admin" on organizations;
create policy "organizations_write_admin" on organizations
  for all using (is_admin_user()) with check (is_admin_user());

create table if not exists portfolios (
  id uuid primary key default gen_random_uuid(),
  code text not null default '',
  name text not null,
  description text not null default '',
  owner_id uuid references profiles (id),
  organization_id uuid references organizations (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'on_hold', 'closed')),
  start_date date,
  end_date date,
  strategic_objectives text not null default '',
  is_active boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table portfolios enable row level security;

drop policy if exists "portfolios_select_authenticated" on portfolios;
create policy "portfolios_select_authenticated" on portfolios
  for select using (auth.uid() is not null);

drop policy if exists "portfolios_write_admin" on portfolios;
create policy "portfolios_write_admin" on portfolios
  for all using (is_admin_user()) with check (is_admin_user());

create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  code text not null default '',
  name text not null,
  description text not null default '',
  portfolio_id uuid references portfolios (id) on delete set null,
  program_manager_id uuid references profiles (id),
  sponsor_id uuid references profiles (id),
  status text not null default 'active' check (status in ('active', 'on_hold', 'closed')),
  start_date date,
  planned_finish date,
  strategic_objectives text not null default '',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table programs enable row level security;

drop policy if exists "programs_select_authenticated" on programs;
create policy "programs_select_authenticated" on programs
  for select using (auth.uid() is not null);

drop policy if exists "programs_write_admin" on programs;
create policy "programs_write_admin" on programs
  for all using (is_admin_user()) with check (is_admin_user());

-- Sequential, immutable, RASTA-generated identifier (PRJ-000001, ...) — "Project Name is for
-- humans, Project ID is for the system." Distinct from project_code (an org-defined identifier
-- admins may edit) and from id (the uuid actually used for every foreign key).
create sequence if not exists master_projects_seq;

create table if not exists master_projects (
  id uuid primary key default gen_random_uuid(),
  project_id_code text not null unique,
  project_code text not null default '',
  official_name text not null,
  short_name text not null default '',
  description text not null default '',
  project_type text not null default '',
  project_category text not null default '',
  portfolio_id uuid references portfolios (id) on delete set null,
  program_id uuid references programs (id) on delete set null,
  status text not null default 'idea' check (status in (
    'idea', 'proposed', 'approved', 'planning', 'executing', 'on_hold', 'completed', 'closed', 'archived', 'cancelled'
  )),

  -- Contract
  contract_number text not null default '',
  contract_type text not null default '',
  contract_value numeric,
  currency text not null default 'IRR',
  contract_start_date date,
  contractual_completion_date date,
  revised_completion_date date,
  employer_org_id uuid references organizations (id) on delete set null,
  consultant_org_id uuid references organizations (id) on delete set null,
  contractor_org_id uuid references organizations (id) on delete set null,
  partner_org_id uuid references organizations (id) on delete set null,

  -- Management — reference real users, not free text (spec section 9).
  sponsor_id uuid references profiles (id),
  project_manager_id uuid references profiles (id),
  project_director_id uuid references profiles (id),
  program_manager_id uuid references profiles (id),
  portfolio_manager_id uuid references profiles (id),
  pmo_owner_id uuid references profiles (id),

  -- Schedule — baseline/actual/forecast triad (spec section 10).
  planned_start_date date,
  planned_finish_date date,
  actual_start_date date,
  actual_finish_date date,
  forecast_finish_date date,
  baseline_version text not null default 'Baseline 0',
  schedule_status text not null default 'on_track' check (schedule_status in ('on_track', 'at_risk', 'delayed', 'ahead', 'unknown')),

  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

create or replace function assign_master_project_id_code()
returns trigger as $$
begin
  if new.project_id_code is null or new.project_id_code = '' then
    new.project_id_code := 'PRJ-' || lpad(nextval('master_projects_seq')::text, 6, '0');
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_assign_master_project_id_code on master_projects;
create trigger trg_assign_master_project_id_code
  before insert on master_projects
  for each row execute function assign_master_project_id_code();

-- Users must not be allowed to change ProjectID after creation (spec section 6) — enforced here,
-- not just by omitting an editor in the UI, so it holds even against a direct API call.
create or replace function prevent_project_id_code_change()
returns trigger as $$
begin
  if new.project_id_code is distinct from old.project_id_code then
    new.project_id_code := old.project_id_code;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_project_id_code_change on master_projects;
create trigger trg_prevent_project_id_code_change
  before update on master_projects
  for each row execute function prevent_project_id_code_change();

alter table master_projects enable row level security;

drop policy if exists "master_projects_select_authenticated" on master_projects;
create policy "master_projects_select_authenticated" on master_projects
  for select using (auth.uid() is not null);

drop policy if exists "master_projects_write_admin" on master_projects;
create policy "master_projects_write_admin" on master_projects
  for all using (is_admin_user()) with check (is_admin_user());

create table if not exists project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  name text not null,
  code text not null default '',
  sequence smallint not null default 0,
  planned_start date,
  planned_finish date,
  actual_start date,
  actual_finish date,
  forecast_finish date,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'on_hold')),
  progress smallint not null default 0 check (progress between 0 and 100),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table project_phases enable row level security;

drop policy if exists "project_phases_select_authenticated" on project_phases;
create policy "project_phases_select_authenticated" on project_phases
  for select using (auth.uid() is not null);

drop policy if exists "project_phases_write_admin" on project_phases;
create policy "project_phases_write_admin" on project_phases
  for all using (is_admin_user()) with check (is_admin_user());

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_portfolios_organization on portfolios (organization_id);
create index if not exists idx_programs_portfolio on programs (portfolio_id);
create index if not exists idx_master_projects_portfolio on master_projects (portfolio_id);
create index if not exists idx_master_projects_program on master_projects (program_id);
create index if not exists idx_master_projects_status on master_projects (status);
create index if not exists idx_project_phases_project on project_phases (project_id);

-- ============================================================================
-- 13. RASTA Access Control (Phases 8-10 of the Master Data & Access
--     Architecture) — a real, centralized Role/Permission/Scope model that
--     admins can define and assign. This is deliberately built as a PARALLEL,
--     additive layer: nothing below alters is_admin_user() or any existing
--     policy on projects/rm_projects/im_projects/lines/daily_logs/rm_risks/
--     im_issues/etc. Those tables keep working exactly as they do today.
--
--     Rewiring those policies to consult this model instead of (or alongside)
--     the current admin-flag/per-project-role checks is real, separate,
--     higher-risk work — it changes who can already do what in three live
--     products — and isn't done here. What IS real: the data model, the
--     is_admin_user()-gated management UI, and rasta_has_permission() /
--     rasta_project_scope_ok() helper functions, ready for that later wiring.
-- ============================================================================

create table if not exists rasta_modules (
  key text primary key,
  label_fa text not null,
  is_active boolean not null default true
);

insert into rasta_modules (key, label_fa) values
  ('risk', 'مدیریت ریسک'),
  ('issues', 'مدیریت مسائل'),
  ('pipepulse', 'PipePulse'),
  ('reporting', 'گزارش‌گیری هوشمند'),
  ('admin', 'مدیریت کاربران')
on conflict (key) do nothing;

alter table rasta_modules enable row level security;
drop policy if exists "rasta_modules_select_authenticated" on rasta_modules;
create policy "rasta_modules_select_authenticated" on rasta_modules for select using (auth.uid() is not null);
drop policy if exists "rasta_modules_write_admin" on rasta_modules;
create policy "rasta_modules_write_admin" on rasta_modules for all using (is_admin_user()) with check (is_admin_user());

create table if not exists rasta_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  is_system boolean not null default false,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table rasta_roles enable row level security;
drop policy if exists "rasta_roles_select_authenticated" on rasta_roles;
create policy "rasta_roles_select_authenticated" on rasta_roles for select using (auth.uid() is not null);
drop policy if exists "rasta_roles_write_admin" on rasta_roles;
create policy "rasta_roles_write_admin" on rasta_roles for all using (is_admin_user()) with check (is_admin_user());

create table if not exists rasta_permissions (
  id uuid primary key default gen_random_uuid(),
  module_key text not null references rasta_modules (key) on delete cascade,
  action text not null check (action in ('view', 'create', 'edit', 'delete', 'submit', 'review', 'approve', 'reject', 'export', 'configure')),
  unique (module_key, action)
);

-- Seed the full action set (spec section 20) for every module — admins turn individual
-- ones on per role rather than the app having to guess which actions exist.
insert into rasta_permissions (module_key, action)
select m.key, a.action
from rasta_modules m
cross join (values ('view'), ('create'), ('edit'), ('delete'), ('submit'), ('review'), ('approve'), ('reject'), ('export'), ('configure')) as a(action)
on conflict (module_key, action) do nothing;

alter table rasta_permissions enable row level security;
drop policy if exists "rasta_permissions_select_authenticated" on rasta_permissions;
create policy "rasta_permissions_select_authenticated" on rasta_permissions for select using (auth.uid() is not null);
drop policy if exists "rasta_permissions_write_admin" on rasta_permissions;
create policy "rasta_permissions_write_admin" on rasta_permissions for all using (is_admin_user()) with check (is_admin_user());

create table if not exists rasta_role_permissions (
  role_id uuid not null references rasta_roles (id) on delete cascade,
  permission_id uuid not null references rasta_permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

alter table rasta_role_permissions enable row level security;
drop policy if exists "rasta_role_permissions_select_authenticated" on rasta_role_permissions;
create policy "rasta_role_permissions_select_authenticated" on rasta_role_permissions for select using (auth.uid() is not null);
drop policy if exists "rasta_role_permissions_write_admin" on rasta_role_permissions;
create policy "rasta_role_permissions_write_admin" on rasta_role_permissions for all using (is_admin_user()) with check (is_admin_user());

-- A user may hold several roles at once (spec: "A user can have multiple roles").
create table if not exists rasta_user_roles (
  user_id uuid not null references profiles (id) on delete cascade,
  role_id uuid not null references rasta_roles (id) on delete cascade,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

alter table rasta_user_roles enable row level security;
drop policy if exists "rasta_user_roles_select_self_or_admin" on rasta_user_roles;
create policy "rasta_user_roles_select_self_or_admin" on rasta_user_roles
  for select using (is_admin_user() or user_id = auth.uid());
drop policy if exists "rasta_user_roles_write_admin" on rasta_user_roles;
create policy "rasta_user_roles_write_admin" on rasta_user_roles for all using (is_admin_user()) with check (is_admin_user());

-- Project Data Scope (spec section 19) — what slice of the hierarchy a user's roles apply to.
-- scope_level='all' ignores the id columns; otherwise exactly the matching id column is set.
create table if not exists rasta_user_project_scope (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  scope_level text not null check (scope_level in ('all', 'portfolio', 'program', 'project', 'phase')),
  portfolio_id uuid references portfolios (id) on delete cascade,
  program_id uuid references programs (id) on delete cascade,
  project_id uuid references master_projects (id) on delete cascade,
  phase_id uuid references project_phases (id) on delete cascade,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table rasta_user_project_scope enable row level security;
drop policy if exists "rasta_user_project_scope_select_self_or_admin" on rasta_user_project_scope;
create policy "rasta_user_project_scope_select_self_or_admin" on rasta_user_project_scope
  for select using (is_admin_user() or user_id = auth.uid());
drop policy if exists "rasta_user_project_scope_write_admin" on rasta_user_project_scope;
create policy "rasta_user_project_scope_write_admin" on rasta_user_project_scope for all using (is_admin_user()) with check (is_admin_user());

-- Project Role Assignment (spec section 22) — who's on a given project's team and in what
-- capacity. Distinct from rasta_roles/permissions above: this is descriptive team-roster
-- data (Project Manager, Consultant, Contractor PM, ...), not an access grant.
create table if not exists rasta_project_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_system boolean not null default false
);

insert into rasta_project_roles (name, is_system) values
  ('مدیر پروژه', true),
  ('مدیر ارشد پروژه', true),
  ('مدیر کنترل پروژه', true),
  ('مدیر ریسک', true),
  ('مدیر مسائل', true),
  ('نماینده PMO', true),
  ('مشاور', true),
  ('پیمانکار', true),
  ('بازرس کارفرما', true)
on conflict (name) do nothing;

alter table rasta_project_roles enable row level security;
drop policy if exists "rasta_project_roles_select_authenticated" on rasta_project_roles;
create policy "rasta_project_roles_select_authenticated" on rasta_project_roles for select using (auth.uid() is not null);
drop policy if exists "rasta_project_roles_write_admin" on rasta_project_roles;
create policy "rasta_project_roles_write_admin" on rasta_project_roles for all using (is_admin_user()) with check (is_admin_user());

create table if not exists rasta_project_role_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  project_role_id uuid not null references rasta_project_roles (id),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (project_id, user_id, project_role_id)
);

alter table rasta_project_role_assignments enable row level security;
drop policy if exists "rasta_project_role_assignments_select_authenticated" on rasta_project_role_assignments;
create policy "rasta_project_role_assignments_select_authenticated" on rasta_project_role_assignments
  for select using (auth.uid() is not null);
drop policy if exists "rasta_project_role_assignments_write_admin" on rasta_project_role_assignments;
create policy "rasta_project_role_assignments_write_admin" on rasta_project_role_assignments
  for all using (is_admin_user()) with check (is_admin_user());

-- Project Mapping & Alias (spec sections 28-31) — links a source-module project (Risk/Issue/
-- PipePulse's own registry) to its authoritative master_projects row. Never auto-merges;
-- status starts 'suggested' for anything the matcher proposes and only becomes 'confirmed'
-- once an admin says so (see rasta_project_mapping_status_change_by below).
create table if not exists rasta_project_mappings (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  source_module text not null check (source_module in ('risk', 'issues', 'pipepulse')),
  source_project_id uuid not null,
  alias_name text not null default '',
  status text not null default 'confirmed' check (status in ('suggested', 'confirmed', 'rejected', 'pending_review')),
  match_confidence smallint check (match_confidence between 0 and 100),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  unique (source_module, source_project_id)
);

alter table rasta_project_mappings enable row level security;
drop policy if exists "rasta_project_mappings_select_admin" on rasta_project_mappings;
create policy "rasta_project_mappings_select_admin" on rasta_project_mappings for select using (is_admin_user());
drop policy if exists "rasta_project_mappings_write_admin" on rasta_project_mappings;
create policy "rasta_project_mappings_write_admin" on rasta_project_mappings for all using (is_admin_user()) with check (is_admin_user());

-- ----------------------------------------------------------------------------
-- Helper functions — not yet consulted by any existing table's RLS (see the
-- section-13 header comment), but ready for that follow-up: given a user,
-- module and action, would their roles grant it, and does a project fall
-- inside one of their assigned scopes.
-- ----------------------------------------------------------------------------
create or replace function rasta_has_permission(p_user_id uuid, p_module_key text, p_action text)
returns boolean as $$
  select exists (
    select 1
    from rasta_user_roles ur
    join rasta_role_permissions rp on rp.role_id = ur.role_id
    join rasta_permissions p on p.id = rp.permission_id
    where ur.user_id = p_user_id and p.module_key = p_module_key and p.action = p_action
  );
$$ language sql security definer stable;

create or replace function rasta_project_scope_ok(p_user_id uuid, p_project_id uuid)
returns boolean as $$
  select exists (
    select 1
    from rasta_user_project_scope s
    left join master_projects mp on mp.id = p_project_id
    where s.user_id = p_user_id
      and (
        s.scope_level = 'all'
        or (s.scope_level = 'portfolio' and s.portfolio_id = mp.portfolio_id)
        or (s.scope_level = 'program' and s.program_id = mp.program_id)
        or (s.scope_level = 'project' and s.project_id = p_project_id)
      )
  );
$$ language sql security definer stable;

-- Silently ignore a user attempting to hand-edit these audit columns — decided_by/decided_at
-- are only ever set by rasta_decide_project_mapping() below, mirroring how project_id_code's
-- immutability on master_projects is enforced with a trigger rather than by UI omission alone.
create or replace function prevent_project_mapping_decision_tamper()
returns trigger as $$
begin
  if new.decided_by is distinct from old.decided_by or new.decided_at is distinct from old.decided_at then
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_project_mapping_decision_tamper on rasta_project_mappings;
create trigger trg_prevent_project_mapping_decision_tamper
  before update on rasta_project_mappings
  for each row execute function prevent_project_mapping_decision_tamper();

create or replace function rasta_decide_project_mapping(p_mapping_id uuid, p_status text)
returns void as $$
begin
  if p_status not in ('confirmed', 'rejected') then
    raise exception 'invalid status for a mapping decision: %', p_status;
  end if;
  update rasta_project_mappings
  set status = p_status, decided_by = auth.uid(), decided_at = now()
  where id = p_mapping_id;
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_rasta_permissions_module on rasta_permissions (module_key);
create index if not exists idx_rasta_role_permissions_role on rasta_role_permissions (role_id);
create index if not exists idx_rasta_user_roles_user on rasta_user_roles (user_id);
create index if not exists idx_rasta_user_project_scope_user on rasta_user_project_scope (user_id);
create index if not exists idx_rasta_project_role_assignments_project on rasta_project_role_assignments (project_id);
create index if not exists idx_rasta_project_role_assignments_user on rasta_project_role_assignments (user_id);
create index if not exists idx_rasta_project_mappings_master on rasta_project_mappings (master_project_id);
create index if not exists idx_rasta_project_mappings_source on rasta_project_mappings (source_module, source_project_id);
