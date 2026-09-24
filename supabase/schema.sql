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
  response_strategy text not null default 'mitigate' check (response_strategy in ('avoid', 'mitigate', 'transfer', 'accept', 'escalate', 'exploit', 'enhance', 'share')),
  project_phase text check (project_phase in ('engineering', 'procurement', 'construction', 'commissioning')),
  time_to_impact_days integer,
  initial_probability smallint not null check (initial_probability between 1 and 5),
  initial_impact smallint not null check (initial_impact between 1 and 5),
  initial_score smallint generated always as (initial_probability * initial_impact) stored,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade path: original 5-value list ('avoid','mitigate','transfer','accept','exploit') didn't
-- distinguish Threat vs Opportunity strategies — 'exploit' was being offered to Threats too, and
-- there was no 'escalate' (shared by both) or 'enhance'/'share' (Opportunity-only). Widen the
-- live constraint to the full 8-value set; the client now filters which ones it offers based on
-- risk_type.
alter table rm_risks drop constraint if exists rm_risks_response_strategy_check;
alter table rm_risks add constraint rm_risks_response_strategy_check
  check (response_strategy in ('avoid', 'mitigate', 'transfer', 'accept', 'escalate', 'exploit', 'enhance', 'share'));

-- Strategy-specific context fields (spec's "dynamic response strategy form") — shape depends on
-- risk_type + response_strategy, kept as a flexible key/value bag rather than dozens of nullable
-- columns since only one strategy's fields are ever populated for a given risk at a time.
alter table rm_risks add column if not exists strategy_details jsonb not null default '{}'::jsonb;

-- Escalation Management (spec: "escalation is NOT simply a Risk Status" — an organizational
-- routing mechanism that can apply to a risk regardless of its chosen response strategy).
alter table rm_risks add column if not exists escalation_level text check (escalation_level in ('project_team', 'project_manager', 'management'));
alter table rm_risks add column if not exists escalated_to text not null default '';
alter table rm_risks add column if not exists escalation_reason text not null default '';
alter table rm_risks add column if not exists escalation_date date;
alter table rm_risks add column if not exists required_decision text not null default '';
alter table rm_risks add column if not exists escalation_decision text not null default '';
alter table rm_risks add column if not exists escalation_decision_date date;
alter table rm_risks add column if not exists escalation_status text not null default 'none' check (escalation_status in ('none', 'recommended', 'escalated', 'decided'));

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

-- Snapshot of the risk's response strategy at the moment of this review — the spec's review
-- record must show "Current Response Strategy" as it stood then, not whatever it's been changed
-- to since. Lifecycle stage isn't stored the same way; it's cheap to recompute from a risk's own
-- current fields, so the client derives it instead of freezing it per review.
alter table rm_risk_assessments add column if not exists response_strategy text;

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
-- Was admin-only; widened to any authenticated user (read-only linkage metadata, no sensitive
-- data) so per-module three-level Portfolio/Program/Project rollups (e.g. Risk Management) can
-- resolve their own project's master_project_id without needing admin access.
drop policy if exists "rasta_project_mappings_select_admin" on rasta_project_mappings;
drop policy if exists "rasta_project_mappings_select_authenticated" on rasta_project_mappings;
create policy "rasta_project_mappings_select_authenticated" on rasta_project_mappings for select using (auth.uid() is not null);
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

-- ============================================================================
-- 14. RASTA Reporting & Management Intelligence — consumes Risk/Issue/PipePulse
--     data (via rasta_project_mappings above) without duplicating it. Only this
--     module's own entities live here: saved Report Profiles (which widgets, in
--     which order), immutable Report Snapshots (a point-in-time payload once a
--     report is generated — never re-queries source data after that), and the
--     Decision Center (rasta_decisions/rasta_actions).
--
--     Unlike Master Data/Access Control (admin-write, section 12-13), these are
--     operational entities any authenticated user works with day to day — insert
--     is open to any authenticated user, matching im_issues' pattern; update/
--     delete is restricted to the row's creator/owner or an admin.
-- ============================================================================

create table if not exists rasta_report_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  report_type text not null check (report_type in ('daily', 'weekly', 'monthly', 'management')),
  description text not null default '',
  widget_ids text[] not null default '{}',
  is_system boolean not null default false,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rasta_report_profiles enable row level security;

drop policy if exists "rasta_report_profiles_select_authenticated" on rasta_report_profiles;
create policy "rasta_report_profiles_select_authenticated" on rasta_report_profiles
  for select using (auth.uid() is not null);

drop policy if exists "rasta_report_profiles_insert_authenticated" on rasta_report_profiles;
create policy "rasta_report_profiles_insert_authenticated" on rasta_report_profiles
  for insert with check (auth.uid() is not null and (is_system = false or is_admin_user()));

drop policy if exists "rasta_report_profiles_update_owner_or_admin" on rasta_report_profiles;
create policy "rasta_report_profiles_update_owner_or_admin" on rasta_report_profiles
  for update using (created_by = auth.uid() or is_admin_user());

drop policy if exists "rasta_report_profiles_delete_owner_or_admin" on rasta_report_profiles;
create policy "rasta_report_profiles_delete_owner_or_admin" on rasta_report_profiles
  for delete using ((created_by = auth.uid() and is_system = false) or is_admin_user());

-- Sequential, human-readable report number (RPT-000001, ...), same pattern as
-- master_projects.project_id_code — system-generated, immutable.
create sequence if not exists rasta_report_snapshots_seq;

create table if not exists rasta_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  report_type text not null check (report_type in ('daily', 'weekly', 'monthly', 'management')),
  profile_id uuid references rasta_report_profiles (id) on delete set null,
  report_number text not null unique,
  revision int not null default 0,
  status text not null default 'draft' check (status in ('draft', 'under_review', 'approved', 'issued', 'revised', 'archived')),
  period_start date,
  period_end date,
  -- Full computed widget output at generation time — the immutable part. Later changes to
  -- the underlying Risk/Issue/PipePulse data must never alter an already-issued report.
  payload jsonb not null,
  widget_ids text[] not null default '{}',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  reviewed_by uuid references profiles (id),
  reviewed_at timestamptz,
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  issued_at timestamptz
);

create or replace function assign_report_number()
returns trigger as $$
begin
  if new.report_number is null or new.report_number = '' then
    new.report_number := 'RPT-' || lpad(nextval('rasta_report_snapshots_seq')::text, 6, '0');
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_assign_report_number on rasta_report_snapshots;
create trigger trg_assign_report_number
  before insert on rasta_report_snapshots
  for each row execute function assign_report_number();

-- Guards the "immutable snapshot" promise (spec section 16-17): once generated, the payload
-- and its identifying fields can never change — only the review/approve/issue workflow fields
-- (status + the reviewed_by/approved_by/*_at columns) may still be updated on the same row.
create or replace function prevent_report_snapshot_payload_tamper()
returns trigger as $$
begin
  if new.payload is distinct from old.payload
     or new.widget_ids is distinct from old.widget_ids
     or new.report_number is distinct from old.report_number
     or new.master_project_id is distinct from old.master_project_id
     or new.report_type is distinct from old.report_type
     or new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end
     or new.revision is distinct from old.revision then
    new.payload := old.payload;
    new.widget_ids := old.widget_ids;
    new.report_number := old.report_number;
    new.master_project_id := old.master_project_id;
    new.report_type := old.report_type;
    new.period_start := old.period_start;
    new.period_end := old.period_end;
    new.revision := old.revision;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_report_snapshot_payload_tamper on rasta_report_snapshots;
create trigger trg_prevent_report_snapshot_payload_tamper
  before update on rasta_report_snapshots
  for each row execute function prevent_report_snapshot_payload_tamper();

alter table rasta_report_snapshots enable row level security;

drop policy if exists "rasta_report_snapshots_select_authenticated" on rasta_report_snapshots;
create policy "rasta_report_snapshots_select_authenticated" on rasta_report_snapshots
  for select using (auth.uid() is not null);

drop policy if exists "rasta_report_snapshots_insert_authenticated" on rasta_report_snapshots;
create policy "rasta_report_snapshots_insert_authenticated" on rasta_report_snapshots
  for insert with check (auth.uid() is not null);

drop policy if exists "rasta_report_snapshots_update_owner_or_admin" on rasta_report_snapshots;
create policy "rasta_report_snapshots_update_owner_or_admin" on rasta_report_snapshots
  for update using (created_by = auth.uid() or is_admin_user());

drop policy if exists "rasta_report_snapshots_delete_admin" on rasta_report_snapshots;
create policy "rasta_report_snapshots_delete_admin" on rasta_report_snapshots
  for delete using (is_admin_user());

create table if not exists rasta_decisions (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  title text not null,
  description text not null default '',
  reason text not null default '',
  required_by date,
  impact text not null default '',
  recommended_action text not null default '',
  decision_owner_id uuid references profiles (id),
  status text not null default 'pending' check (status in ('pending', 'in_review', 'approved', 'rejected', 'deferred')),
  final_decision text not null default '',
  decided_at timestamptz,
  related_risk_id uuid references rm_risks (id) on delete set null,
  related_issue_id uuid references im_issues (id) on delete set null,
  related_milestone_label text not null default '',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rasta_decisions enable row level security;

drop policy if exists "rasta_decisions_select_authenticated" on rasta_decisions;
create policy "rasta_decisions_select_authenticated" on rasta_decisions
  for select using (auth.uid() is not null);

drop policy if exists "rasta_decisions_insert_authenticated" on rasta_decisions;
create policy "rasta_decisions_insert_authenticated" on rasta_decisions
  for insert with check (auth.uid() is not null);

drop policy if exists "rasta_decisions_update_owner_or_admin" on rasta_decisions;
create policy "rasta_decisions_update_owner_or_admin" on rasta_decisions
  for update using (created_by = auth.uid() or decision_owner_id = auth.uid() or is_admin_user());

drop policy if exists "rasta_decisions_delete_owner_or_admin" on rasta_decisions;
create policy "rasta_decisions_delete_owner_or_admin" on rasta_decisions
  for delete using (created_by = auth.uid() or is_admin_user());

create table if not exists rasta_actions (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  title text not null,
  owner_id uuid references profiles (id),
  due_date date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'cancelled')),
  source text not null default 'management_report' check (source in ('risk', 'issue', 'decision', 'management_report')),
  source_decision_id uuid references rasta_decisions (id) on delete set null,
  related_risk_id uuid references rm_risks (id) on delete set null,
  related_issue_id uuid references im_issues (id) on delete set null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rasta_actions enable row level security;

drop policy if exists "rasta_actions_select_authenticated" on rasta_actions;
create policy "rasta_actions_select_authenticated" on rasta_actions
  for select using (auth.uid() is not null);

drop policy if exists "rasta_actions_insert_authenticated" on rasta_actions;
create policy "rasta_actions_insert_authenticated" on rasta_actions
  for insert with check (auth.uid() is not null);

drop policy if exists "rasta_actions_update_owner_or_admin" on rasta_actions;
create policy "rasta_actions_update_owner_or_admin" on rasta_actions
  for update using (created_by = auth.uid() or owner_id = auth.uid() or is_admin_user());

drop policy if exists "rasta_actions_delete_owner_or_admin" on rasta_actions;
create policy "rasta_actions_delete_owner_or_admin" on rasta_actions
  for delete using (created_by = auth.uid() or is_admin_user());

-- ============================================================================
-- 16. Portfolio/Program-scoped read access — wires rasta_user_project_scope (section 13,
--     previously modeled in the schema and the Roles & Permissions UI but never consumed by any
--     module's own RLS) into the actual per-module SELECT policies. Every change below is
--     strictly additive ("... or rasta_scope_ok_for_source(...)" appended to the policy's
--     existing condition) — a user's current membership-based access never narrows. This only
--     grants portfolio/program-scoped users read access to the projects/records under their
--     assigned scope; a user with a 'project'-level scope row only matches that one project, so
--     this does not give project-scoped users access to sibling projects (spec: "A Project-level
--     user must NOT automatically gain access to other Projects"). Write access is untouched —
--     scope grants visibility, not edit rights; a scoped-only user with no module membership row
--     sees a read-only view because rmCanEdit/imCanManage/canEdit still key off membership.
-- ============================================================================

create or replace function rasta_scope_ok_for_source(p_source_module text, p_source_project_id uuid)
returns boolean as $$
  select exists (
    select 1
    from rasta_project_mappings m
    where m.source_module = p_source_module
      and m.source_project_id = p_source_project_id
      and m.status = 'confirmed'
      and rasta_project_scope_ok(auth.uid(), m.master_project_id)
  );
$$ language sql security definer stable;

-- PipePulse
drop policy if exists "projects_select_member" on projects;
create policy "projects_select_member" on projects
  for select using (is_project_member(id) or is_admin_user() or rasta_scope_ok_for_source('pipepulse', id));

drop policy if exists "lines_select_member" on lines;
create policy "lines_select_member" on lines
  for select using (is_project_member(project_id) or is_admin_user() or rasta_scope_ok_for_source('pipepulse', project_id));

drop policy if exists "daily_logs_select_member" on daily_logs;
create policy "daily_logs_select_member" on daily_logs
  for select using (is_project_member(project_id) or is_admin_user() or rasta_scope_ok_for_source('pipepulse', project_id));

-- Risk Management
drop policy if exists "rm_projects_select_member" on rm_projects;
create policy "rm_projects_select_member" on rm_projects
  for select using (rm_is_project_member(id) or is_admin_user() or rasta_scope_ok_for_source('risk', id));

drop policy if exists "rm_risks_select_member" on rm_risks;
create policy "rm_risks_select_member" on rm_risks
  for select using (rm_is_project_member(project_id) or is_admin_user() or rasta_scope_ok_for_source('risk', project_id));

drop policy if exists "rm_assessments_select_member" on rm_risk_assessments;
create policy "rm_assessments_select_member" on rm_risk_assessments
  for select using (
    exists (select 1 from rm_risks r where r.id = risk_id and (rm_is_project_member(r.project_id) or is_admin_user() or rasta_scope_ok_for_source('risk', r.project_id)))
  );

drop policy if exists "rm_actions_select_member" on rm_risk_actions;
create policy "rm_actions_select_member" on rm_risk_actions
  for select using (
    exists (select 1 from rm_risks r where r.id = risk_id and (rm_is_project_member(r.project_id) or is_admin_user() or rasta_scope_ok_for_source('risk', r.project_id)))
  );

drop policy if exists "rm_history_select_member" on rm_risk_history;
create policy "rm_history_select_member" on rm_risk_history
  for select using (
    exists (select 1 from rm_risks r where r.id = risk_id and (rm_is_project_member(r.project_id) or is_admin_user() or rasta_scope_ok_for_source('risk', r.project_id)))
  );

-- Issue Management
drop policy if exists "im_projects_select_member" on im_projects;
create policy "im_projects_select_member" on im_projects
  for select using (im_is_project_member(id) or is_admin_user() or rasta_scope_ok_for_source('issues', id));

drop policy if exists "im_issues_select_member" on im_issues;
create policy "im_issues_select_member" on im_issues
  for select using (im_is_project_member(project_id) or is_admin_user() or rasta_scope_ok_for_source('issues', project_id));

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_rasta_report_snapshots_project on rasta_report_snapshots (master_project_id);
create index if not exists idx_rasta_report_snapshots_type on rasta_report_snapshots (report_type);
create index if not exists idx_rasta_report_snapshots_status on rasta_report_snapshots (status);
create index if not exists idx_rasta_decisions_project on rasta_decisions (master_project_id);
create index if not exists idx_rasta_decisions_status on rasta_decisions (status);
create index if not exists idx_rasta_actions_project on rasta_actions (master_project_id);
create index if not exists idx_rasta_actions_status on rasta_actions (status);
create index if not exists idx_rasta_actions_decision on rasta_actions (source_decision_id);

-- ============================================================================
-- 17. Phase 1 audit remediation — critical security & data-integrity fixes
--     from the 2026-08-11 independent audit. Every change below is additive/
--     corrective to existing tables — nothing here introduces new modules.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 17a. Self-role-insertion — the same RLS hole existed independently in three
--      modules: an INSERT policy meant to let a user accept their own pending
--      invite was written as `user_id = auth.uid()` with no further condition,
--      letting anyone insert themselves into ANY project as ANY role. The two
--      legitimate self-insert paths (initial project creation via
--      create_project_with_owner/create_rm_project_with_manager/
--      create_im_project_with_admin, and accepting an invite via
--      accept_pending_invites()) are all `security definer` and already bypass
--      RLS entirely — no client code path ever relies on this branch, so it is
--      removed outright rather than merely narrowed.
-- ----------------------------------------------------------------------------
drop policy if exists "members_insert_owner_or_admin" on project_members;
create policy "members_insert_owner_or_admin" on project_members
  for insert with check (
    is_admin_user()
    or (role in ('contractor', 'consultant') and project_role(project_id) = 'owner')
  );

drop policy if exists "rm_members_insert_manager_or_admin" on rm_project_members;
create policy "rm_members_insert_manager_or_admin" on rm_project_members
  for insert with check (
    is_admin_user()
    or rm_project_role(project_id) = 'project_manager'
  );

drop policy if exists "im_members_insert_manager_or_admin" on im_project_members;
create policy "im_members_insert_manager_or_admin" on im_project_members
  for insert with check (
    is_admin_user()
    or im_can_manage(project_id)
  );

-- ----------------------------------------------------------------------------
-- 17b. rasta_decide_project_mapping() had no caller check at all — any
--      authenticated user could confirm/reject any cross-module project
--      mapping, which then feeds read-access grants (rasta_scope_ok_for_source)
--      and every portfolio/program rollup. The client already only calls this
--      from an admin-only page, but that was the only gate.
-- ----------------------------------------------------------------------------
create or replace function rasta_decide_project_mapping(p_mapping_id uuid, p_status text)
returns void as $$
begin
  if not is_admin_user() then
    raise exception 'only an admin may decide a project mapping';
  end if;
  if p_status not in ('confirmed', 'rejected') then
    raise exception 'invalid status for a mapping decision: %', p_status;
  end if;
  update rasta_project_mappings
  set status = p_status, decided_by = auth.uid(), decided_at = now()
  where id = p_mapping_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ----------------------------------------------------------------------------
-- 17c. Reporting module — SELECT/INSERT on rasta_report_snapshots/
--      rasta_decisions/rasta_actions were simply `auth.uid() is not null`,
--      meaning any authenticated user could read every project's report
--      snapshots (which embed full risk/issue payloads) and forge decisions/
--      actions against a project they have no relationship to. Scope both to
--      the same access model already used for portfolio/program-scoped reads
--      elsewhere in this file: project membership in a confirmed mapped
--      source project, an explicit rasta_user_project_scope grant, or admin.
-- ----------------------------------------------------------------------------
create or replace function rasta_user_can_access_master_project(p_master_project_id uuid)
returns boolean as $$
  select
    is_admin_user()
    or rasta_project_scope_ok(auth.uid(), p_master_project_id)
    or exists (
      select 1 from rasta_project_mappings m
      where m.master_project_id = p_master_project_id
        and m.status = 'confirmed'
        and (
          (m.source_module = 'risk' and rm_is_project_member(m.source_project_id))
          or (m.source_module = 'issues' and im_is_project_member(m.source_project_id))
          or (m.source_module = 'pipepulse' and is_project_member(m.source_project_id))
        )
    );
$$ language sql security definer stable set search_path = public;

drop policy if exists "rasta_report_snapshots_select_authenticated" on rasta_report_snapshots;
drop policy if exists "rasta_report_snapshots_select_scoped" on rasta_report_snapshots;
create policy "rasta_report_snapshots_select_scoped" on rasta_report_snapshots
  for select using (rasta_user_can_access_master_project(master_project_id));

drop policy if exists "rasta_report_snapshots_insert_authenticated" on rasta_report_snapshots;
drop policy if exists "rasta_report_snapshots_insert_scoped" on rasta_report_snapshots;
create policy "rasta_report_snapshots_insert_scoped" on rasta_report_snapshots
  for insert with check (rasta_user_can_access_master_project(master_project_id));

drop policy if exists "rasta_decisions_select_authenticated" on rasta_decisions;
drop policy if exists "rasta_decisions_select_scoped" on rasta_decisions;
create policy "rasta_decisions_select_scoped" on rasta_decisions
  for select using (rasta_user_can_access_master_project(master_project_id));

drop policy if exists "rasta_decisions_insert_authenticated" on rasta_decisions;
drop policy if exists "rasta_decisions_insert_scoped" on rasta_decisions;
create policy "rasta_decisions_insert_scoped" on rasta_decisions
  for insert with check (rasta_user_can_access_master_project(master_project_id));

drop policy if exists "rasta_actions_select_authenticated" on rasta_actions;
drop policy if exists "rasta_actions_select_scoped" on rasta_actions;
create policy "rasta_actions_select_scoped" on rasta_actions
  for select using (rasta_user_can_access_master_project(master_project_id));

drop policy if exists "rasta_actions_insert_authenticated" on rasta_actions;
drop policy if exists "rasta_actions_insert_scoped" on rasta_actions;
create policy "rasta_actions_insert_scoped" on rasta_actions
  for insert with check (rasta_user_can_access_master_project(master_project_id));

-- ----------------------------------------------------------------------------
-- 17d. PipePulse's contractor -> consultant -> owner approval chain was
--      enforced only by which buttons the UI happened to render — the RLS
--      policies let any project member PATCH approval_status/reviewed_by
--      directly. Add server-side role checks plus a created_by column so a
--      log's own entrant can be identified and blocked from approving it.
-- ----------------------------------------------------------------------------
alter table daily_logs add column if not exists created_by uuid references profiles (id);
alter table daily_logs alter column created_by set default auth.uid();

alter table lines add column if not exists created_by uuid references profiles (id);
alter table lines alter column created_by set default auth.uid();

create or replace function enforce_daily_log_approval_transition()
returns trigger as $$
declare
  v_role text;
begin
  if new.approval_status is distinct from old.approval_status
     or new.reviewed_by is distinct from old.reviewed_by
     or new.owner_reviewed_at is distinct from old.owner_reviewed_at
     or new.owner_reviewed_by is distinct from old.owner_reviewed_by then

    v_role := project_role(new.project_id);

    if new.approval_status = 'approved' and old.approval_status is distinct from new.approval_status then
      if not (v_role in ('consultant', 'owner') or is_admin_user()) then
        raise exception 'only a consultant or owner may approve a daily log';
      end if;
      if new.created_by is not null and new.created_by = auth.uid() and not is_admin_user() then
        raise exception 'the log''s own entrant cannot approve it';
      end if;
    end if;

    if new.reviewed_by is not null and new.reviewed_by is distinct from old.reviewed_by
       and new.reviewed_by <> auth.uid() and not is_admin_user() then
      raise exception 'reviewed_by must be the acting user';
    end if;

    if new.owner_reviewed_at is not null and new.owner_reviewed_at is distinct from old.owner_reviewed_at then
      if not (v_role = 'owner' or is_admin_user()) then
        raise exception 'only the owner may record an owner audit';
      end if;
      if new.owner_reviewed_by is distinct from auth.uid() and not is_admin_user() then
        raise exception 'owner_reviewed_by must be the acting user';
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_daily_log_approval on daily_logs;
create trigger trg_enforce_daily_log_approval
  before update on daily_logs
  for each row execute function enforce_daily_log_approval_transition();

-- The owner's whole-plan schedule sign-off (schedule_owner_approved_at/by) was writable by
-- any editor via the general projects UPDATE policy. Per-activity consultant approval and
-- milestone approval live inside the schedules/milestones JSONB arrays and are not covered
-- here — validating forged values inside a JSONB array generically is a larger, separate
-- effort (tracked as a Strategic follow-up, not a mechanical Phase 1 fix).
create or replace function enforce_schedule_owner_approval()
returns trigger as $$
begin
  if new.schedule_owner_approved_at is distinct from old.schedule_owner_approved_at
     or new.schedule_owner_approved_by is distinct from old.schedule_owner_approved_by then
    if new.schedule_owner_approved_at is not null then
      if project_role(new.id) <> 'owner' and not is_admin_user() then
        raise exception 'only the project owner may approve the whole schedule';
      end if;
      if new.schedule_owner_approved_by is distinct from auth.uid() and not is_admin_user() then
        raise exception 'schedule_owner_approved_by must be the acting user';
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_schedule_owner_approval on projects;
create trigger trg_enforce_schedule_owner_approval
  before update on projects
  for each row execute function enforce_schedule_owner_approval();

-- ----------------------------------------------------------------------------
-- 17e. Report snapshots: the creator (or admin) could review/approve/issue
--      their own report — no separation of duties. Whoever the row says
--      reviewed/approved it must be the acting user (no forging someone
--      else's sign-off either), and it cannot be the report's own author.
-- ----------------------------------------------------------------------------
create or replace function prevent_report_snapshot_self_approval()
returns trigger as $$
begin
  if new.reviewed_by is distinct from old.reviewed_by and new.reviewed_by is not null then
    if new.reviewed_by <> auth.uid() and not is_admin_user() then
      raise exception 'reviewed_by must be the acting user';
    end if;
    if new.reviewed_by = new.created_by and not is_admin_user() then
      raise exception 'the report author cannot review their own report';
    end if;
  end if;
  if new.approved_by is distinct from old.approved_by and new.approved_by is not null then
    if new.approved_by <> auth.uid() and not is_admin_user() then
      raise exception 'approved_by must be the acting user';
    end if;
    if new.approved_by = new.created_by and not is_admin_user() then
      raise exception 'the report author cannot approve their own report';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_report_snapshot_self_approval on rasta_report_snapshots;
create trigger trg_prevent_report_snapshot_self_approval
  before update on rasta_report_snapshots
  for each row execute function prevent_report_snapshot_self_approval();

-- rasta_decisions: no decided_by column existed at all, and the only client call site never
-- sent final_decision, so every approved/rejected decision had a blank rationale. Add the
-- column and require a non-empty rationale to finalize; auto-fill decided_by/decided_at from
-- the acting user rather than trusting the client to send them.
alter table rasta_decisions add column if not exists decided_by uuid references profiles (id);

create or replace function enforce_decision_finalization()
returns trigger as $$
begin
  if new.status in ('approved', 'rejected') and old.status is distinct from new.status then
    if trim(coalesce(new.final_decision, '')) = '' then
      raise exception 'a final decision rationale is required to approve or reject';
    end if;
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_decision_finalization on rasta_decisions;
create trigger trg_enforce_decision_finalization
  before update on rasta_decisions
  for each row execute function enforce_decision_finalization();

-- ----------------------------------------------------------------------------
-- 17f. profiles.email was user-writable (via the generic self-update policy)
--      with no unique constraint, and accept_pending_invites() matched on
--      that mutable mirror instead of the JWT-verified auth.email() — a user
--      could edit their own email to a pending invitee's address and claim
--      that invite's role, including 'owner'.
-- ----------------------------------------------------------------------------
create or replace function accept_pending_invites()
returns void as $$
begin
  insert into project_members (project_id, user_id, role)
  select pi.project_id, auth.uid(), pi.role
  from project_invites pi
  where lower(pi.email) = lower(auth.email()) and pi.accepted_at is null
  on conflict (project_id, user_id) do nothing;

  update project_invites
  set accepted_at = now()
  where accepted_at is null
    and lower(email) = lower(auth.email());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function prevent_email_change()
returns trigger as $$
begin
  if new.email is distinct from old.email and auth.uid() is not null and not is_admin_user() then
    new.email := old.email;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_email_change on profiles;
create trigger trg_prevent_email_change
  before update on profiles
  for each row execute function prevent_email_change();

-- Case-insensitive uniqueness. Guarded so re-running this file never aborts the whole
-- migration if a production database already has duplicate emails — it just skips the
-- index and tells you so, rather than failing every statement after it.
do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'idx_profiles_email_unique') then
    begin
      execute 'create unique index idx_profiles_email_unique on profiles (lower(email)) where email <> ''''';
    exception when unique_violation then
      raise notice 'Skipped unique index on profiles.email — duplicate emails exist. Resolve duplicates, then run: create unique index idx_profiles_email_unique on profiles (lower(email)) where email <> ''''';
    end;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 17g. Issues: the pursuer/approver segregation the module is named for was
--      UI-only — any project member, including the pursuer themselves, could
--      move an issue to approved/rejected via a direct PATCH.
-- ----------------------------------------------------------------------------
create or replace function enforce_issue_approval_transition()
returns trigger as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    if not (
      new.approver_id = auth.uid()
      or im_can_manage(new.project_id)
      or is_admin_user()
    ) then
      raise exception 'only the assigned approver or a project admin may approve or reject an issue';
    end if;
    if new.pursuer_id = auth.uid() and new.approver_id is distinct from auth.uid() and not is_admin_user() then
      raise exception 'the assigned pursuer cannot approve their own issue';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_issue_approval on im_issues;
create trigger trg_enforce_issue_approval
  before update on im_issues
  for each row execute function enforce_issue_approval_transition();

-- ----------------------------------------------------------------------------
-- 17h. Schedule baseline — plannedStart/plannedEnd lived only in the live-
--      edited `schedules` JSONB array with no frozen snapshot, so editing the
--      plan silently erased whatever it used to say and zeroed the reported
--      delay. Capture an immutable snapshot every time the owner signs off
--      the whole plan (schedule_owner_approved_at newly set) — a real,
--      queryable baseline history, without redesigning schedules into a
--      relational table.
-- ----------------------------------------------------------------------------
create table if not exists schedule_baselines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  baseline_version text not null default 'Baseline 0',
  schedules jsonb not null,
  captured_by uuid references profiles (id),
  captured_at timestamptz not null default now()
);

alter table schedule_baselines enable row level security;

-- No INSERT/UPDATE/DELETE policy for clients — only the security definer trigger below ever
-- writes here, so a captured baseline can never be edited or backdated after the fact.
drop policy if exists "schedule_baselines_select_member" on schedule_baselines;
create policy "schedule_baselines_select_member" on schedule_baselines
  for select using (is_project_member(project_id) or is_admin_user() or rasta_scope_ok_for_source('pipepulse', project_id));

create or replace function capture_schedule_baseline()
returns trigger as $$
begin
  if new.schedule_owner_approved_at is not null
     and new.schedule_owner_approved_at is distinct from old.schedule_owner_approved_at then
    insert into schedule_baselines (project_id, baseline_version, schedules, captured_by)
    values (
      new.id,
      'Baseline ' || (select count(*) from schedule_baselines where project_id = new.id),
      new.schedules,
      new.schedule_owner_approved_by
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_capture_schedule_baseline on projects;
create trigger trg_capture_schedule_baseline
  after update on projects
  for each row execute function capture_schedule_baseline();

create index if not exists idx_schedule_baselines_project on schedule_baselines (project_id);

-- ----------------------------------------------------------------------------
-- 17i. created_by was never populated for risks/actions — no client insert
--      path sent it, and the column had no default, so every row ended up
--      NULL. Defaulting at the column level fixes it for every future insert
--      regardless of which client (or a future direct API caller) omits it.
-- ----------------------------------------------------------------------------
alter table rm_risks alter column created_by set default auth.uid();
alter table rm_risk_actions alter column created_by set default auth.uid();
alter table rm_risk_assessments alter column created_by set default auth.uid();
alter table rm_risk_history alter column user_id set default auth.uid();
alter table rm_projects alter column created_by set default auth.uid();
alter table im_issues alter column created_by set default auth.uid();
alter table im_projects alter column created_by set default auth.uid();
alter table projects alter column created_by set default auth.uid();
alter table organizations alter column created_by set default auth.uid();
alter table portfolios alter column created_by set default auth.uid();
alter table programs alter column created_by set default auth.uid();
alter table master_projects alter column created_by set default auth.uid();
alter table project_phases alter column created_by set default auth.uid();
alter table rasta_report_profiles alter column created_by set default auth.uid();
alter table rasta_report_snapshots alter column created_by set default auth.uid();
alter table rasta_decisions alter column created_by set default auth.uid();
alter table rasta_actions alter column created_by set default auth.uid();

-- ----------------------------------------------------------------------------
-- 17j. updated_at existed on eleven tables with zero triggers anywhere in the
--      schema — every value was either frozen at insert time or, for the four
--      tables that also declare updated_by, entirely dead. One generic
--      trigger function per shape, applied everywhere the column exists.
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function set_updated_at_and_by()
returns trigger as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

do $$
declare
  t text;
begin
  foreach t in array array['rm_risks', 'rm_risk_actions', 'im_issues', 'project_phases', 'rasta_report_profiles', 'rasta_decisions', 'rasta_actions']
  loop
    execute format('drop trigger if exists trg_set_updated_at on %I', t);
    execute format('create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at()', t);
  end loop;

  foreach t in array array['organizations', 'portfolios', 'programs', 'master_projects']
  loop
    execute format('drop trigger if exists trg_set_updated_at on %I', t);
    execute format('create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at_and_by()', t);
  end loop;
end $$;

-- ============================================================================
-- 18. Portfolio Executive Dashboard — two small additive pieces of real data
--     the dashboard's Cost Exposure/EAC/VAC and Portfolio Dependency widgets
--     need but nothing in the schema captured yet. Both are optional/empty by
--     default: the dashboard shows an honest "not entered yet" state until a
--     PM fills them in, rather than fabricating numbers to fill the widgets.
-- ============================================================================

-- PM-enterable forecast cost, mirroring the simplicity of contract_value (BAC) already on this
-- table — lets Cost Exposure/EAC/VAC be computed from real data instead of invented ones.
alter table master_projects add column if not exists forecast_cost_at_completion numeric;

-- Cross-project dependencies for the Portfolio Dependency widget ("which project's delay affects
-- which other project") — a real relational fact, not derivable from any existing table.
create table if not exists master_project_dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  depends_on_project_id uuid not null references master_projects (id) on delete cascade,
  dependency_type text not null default 'finish_to_start' check (dependency_type in ('finish_to_start', 'start_to_start', 'finish_to_finish', 'resource', 'other')),
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (project_id <> depends_on_project_id),
  unique (project_id, depends_on_project_id)
);

alter table master_project_dependencies enable row level security;

drop policy if exists "master_project_dependencies_select_authenticated" on master_project_dependencies;
create policy "master_project_dependencies_select_authenticated" on master_project_dependencies
  for select using (auth.uid() is not null);

drop policy if exists "master_project_dependencies_write_admin" on master_project_dependencies;
create policy "master_project_dependencies_write_admin" on master_project_dependencies
  for all using (is_admin_user()) with check (is_admin_user());

create index if not exists idx_master_project_dependencies_project on master_project_dependencies (project_id);
create index if not exists idx_master_project_dependencies_depends_on on master_project_dependencies (depends_on_project_id);

-- ============================================================================
-- 19. Financial Management module ("مدیریت مالی") — a fourth product reached from
--     the hub, owner-side budget/contract/payment control. Deliberately NOT
--     accounting: no general ledger, no P&L, no contractor internal cost. Attaches
--     directly to master_projects (no separate project registry / mapping layer
--     like Risk-Issues-PipePulse have, since there's nothing module-specific to
--     alias — a project's financial identity IS the master_projects row).
--
--     Four independent concepts, deliberately kept separate per spec rather than
--     collapsed into one table, with the relationships between them expressed as
--     foreign keys rather than duplicated numbers:
--       Budget (internal approved funding ceiling)
--         -> Contract/Commitment (what's legally committed to a contractor)
--           -> Payment Certificate (what's been certified as executed)
--             -> Payment (what's actually been paid, tracked on the certificate)
--     Cash Flow & Forecast is a read-side rollup computed from these four, not a
--     fifth independent data source — see the "avoid unnecessary manual entry"
--     requirement: every number it shows is derivable from what's below.
-- ============================================================================

create table if not exists fin_budgets (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade unique,
  approved_budget numeric not null default 0,
  currency text not null default 'IRR',
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table fin_budgets enable row level security;

drop policy if exists "fin_budgets_select_authenticated" on fin_budgets;
create policy "fin_budgets_select_authenticated" on fin_budgets for select using (auth.uid() is not null);
drop policy if exists "fin_budgets_write_admin" on fin_budgets;
create policy "fin_budgets_write_admin" on fin_budgets for all using (is_admin_user()) with check (is_admin_user());

-- Current Budget = approved_budget + sum(fin_budget_changes.amount) — a running log rather than
-- an overwritten single field, so "what changed and why" survives (spec: "Budget Changes").
create table if not exists fin_budget_changes (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  change_date date not null default current_date,
  amount numeric not null,
  reason text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table fin_budget_changes enable row level security;

drop policy if exists "fin_budget_changes_select_authenticated" on fin_budget_changes;
create policy "fin_budget_changes_select_authenticated" on fin_budget_changes for select using (auth.uid() is not null);
drop policy if exists "fin_budget_changes_write_admin" on fin_budget_changes;
create policy "fin_budget_changes_write_admin" on fin_budget_changes for all using (is_admin_user()) with check (is_admin_user());

-- Contract / Commitment. Current Contract Value = contract_value + sum(fin_contract_amendments.amount).
-- Financial Commitment (fed up into Budget's "Actual/Committed Cost") = sum of every active
-- contract's current contract value for the project.
create table if not exists fin_contracts (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  contract_number text not null default '',
  title text not null default '',
  contractor_org_id uuid references organizations (id) on delete set null,
  contract_value numeric not null default 0,
  currency text not null default 'IRR',
  advance_payment_percent numeric not null default 0,
  retention_percent numeric not null default 0,
  performance_guarantee_percent numeric not null default 0,
  start_date date,
  planned_completion_date date,
  status text not null default 'active' check (status in ('draft', 'active', 'completed', 'terminated')),
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table fin_contracts enable row level security;

drop policy if exists "fin_contracts_select_authenticated" on fin_contracts;
create policy "fin_contracts_select_authenticated" on fin_contracts for select using (auth.uid() is not null);
drop policy if exists "fin_contracts_write_admin" on fin_contracts;
create policy "fin_contracts_write_admin" on fin_contracts for all using (is_admin_user()) with check (is_admin_user());

create table if not exists fin_contract_amendments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references fin_contracts (id) on delete cascade,
  amendment_number text not null default '',
  amendment_date date not null default current_date,
  amount numeric not null,
  reason text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table fin_contract_amendments enable row level security;

drop policy if exists "fin_contract_amendments_select_authenticated" on fin_contract_amendments;
create policy "fin_contract_amendments_select_authenticated" on fin_contract_amendments for select using (auth.uid() is not null);
drop policy if exists "fin_contract_amendments_write_admin" on fin_contract_amendments;
create policy "fin_contract_amendments_write_admin" on fin_contract_amendments for all using (is_admin_user()) with check (is_admin_user());

-- Payment Certificate (صورت‌وضعیت). payable_amount is a generated column (never hand-entered,
-- always derivable from the certificate's own fields); certified_amount/paid_amount are the two
-- numbers a real approval/payment workflow actually sets, kept nullable/zero until that happens
-- so "not yet certified" and "certified as zero" stay distinguishable. Payment Aging is computed
-- client-side from submitted_date/certified_date against today — not stored, since "aging" is
-- inherently a function of the current date, not a fact about the row.
create table if not exists fin_payment_certificates (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references fin_contracts (id) on delete cascade,
  certificate_number text not null default '',
  certificate_date date not null default current_date,
  gross_amount numeric not null default 0,
  adjustments numeric not null default 0,
  deductions numeric not null default 0,
  retention_amount numeric not null default 0,
  advance_recovery_amount numeric not null default 0,
  payable_amount numeric generated always as (gross_amount + adjustments - deductions - retention_amount - advance_recovery_amount) stored,
  certified_amount numeric,
  paid_amount numeric not null default 0,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'under_review', 'certified', 'rejected', 'paid', 'partially_paid')),
  submitted_date date,
  certified_date date,
  paid_date date,
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table fin_payment_certificates enable row level security;

drop policy if exists "fin_payment_certificates_select_authenticated" on fin_payment_certificates;
create policy "fin_payment_certificates_select_authenticated" on fin_payment_certificates for select using (auth.uid() is not null);
drop policy if exists "fin_payment_certificates_write_admin" on fin_payment_certificates;
create policy "fin_payment_certificates_write_admin" on fin_payment_certificates for all using (is_admin_user()) with check (is_admin_user());

create or replace function set_updated_at_and_by_fin()
returns trigger as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

do $$
declare
  t text;
begin
  foreach t in array array['fin_budgets', 'fin_contracts', 'fin_payment_certificates']
  loop
    execute format('drop trigger if exists trg_set_updated_at on %I', t);
    execute format('create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at_and_by_fin()', t);
  end loop;
end $$;

create index if not exists idx_fin_budget_changes_project on fin_budget_changes (master_project_id);
create index if not exists idx_fin_contracts_project on fin_contracts (master_project_id);
create index if not exists idx_fin_contract_amendments_contract on fin_contract_amendments (contract_id);
create index if not exists idx_fin_payment_certificates_contract on fin_payment_certificates (contract_id);

-- ============================================================================
-- 20. Material Supply & Inventory Management module ("مدیریت تامین کالا") — a fifth
--     product reached from the hub, owner-side material lifecycle tracking across
--     the full EPC chain:
--       Project -> MTO -> Material -> Engineering Mapping -> Procurement ->
--       Manufacturing -> Release -> Shipment -> Warehouse -> Allocation -> Construction
--
--     mtl_materials is the CENTRAL entity (not the purchase order), carrying its
--     Technical identity (spec/size/rating), Financial identity (unit weight/price,
--     generated total weight/value) and Engineering/Location identity (facility/
--     area/system/P&ID/tag) on one row simultaneously, per spec. Every downstream
--     stage (procurement/manufacturing/release/shipment/warehouse/allocation) is a
--     transaction table referencing mtl_materials by quantity — status-chain
--     quantities (ordered/manufactured/released/shipped/received/allocated/consumed)
--     are deliberately NOT stored as columns on mtl_materials; they are always
--     summed client-side from these transaction tables, so there is exactly one
--     place each number can be entered (mirrors the Financial module's "derive,
--     don't duplicate" rule).
--
--     MTO revisions are tracked (mtl_mto_revisions) so a material's mto_quantity
--     stays traceable to the revision that set it, per the "MTO revisions
--     traceable" requirement. Facility/Area/System/P&ID/Tag are kept as plain text
--     columns on mtl_materials rather than a new normalized master-data hierarchy —
--     deliberately, to avoid inventing parallel master data beyond what this
--     module's own spec calls for; drill-down is done by grouping/filtering on
--     these columns.
-- ============================================================================

create table if not exists mtl_mto_revisions (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  revision_number text not null default 'Rev.0',
  revision_date date not null default current_date,
  status text not null default 'issued' check (status in ('draft', 'issued', 'superseded')),
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table mtl_mto_revisions enable row level security;

drop policy if exists "mtl_mto_revisions_select_authenticated" on mtl_mto_revisions;
create policy "mtl_mto_revisions_select_authenticated" on mtl_mto_revisions for select using (auth.uid() is not null);
drop policy if exists "mtl_mto_revisions_write_admin" on mtl_mto_revisions;
create policy "mtl_mto_revisions_write_admin" on mtl_mto_revisions for all using (is_admin_user()) with check (is_admin_user());

create table if not exists mtl_materials (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  mto_revision_id uuid references mtl_mto_revisions (id) on delete set null,
  line_no text not null default '',
  material_code text not null default '',
  description text not null default '',
  commodity_type text not null default 'other' check (
    commodity_type in ('pipe', 'fitting', 'valve', 'flange', 'gasket', 'bolt_nut', 'instrument', 'equipment', 'support', 'other')
  ),
  spec text not null default '',
  size text not null default '',
  rating text not null default '',
  unit text not null default 'EA',
  -- Engineering / location identity — drill-down path Facility -> Area -> System -> P&ID -> Tag.
  facility text not null default '',
  area text not null default '',
  system_name text not null default '',
  pid_number text not null default '',
  pid_revision text not null default '',
  tag_number text not null default '',
  -- Technical + financial identity, carried on the material itself per spec.
  mto_quantity numeric not null default 0,
  unit_weight_kg numeric not null default 0,
  unit_price numeric not null default 0,
  currency text not null default 'IRR',
  total_weight_kg numeric generated always as (mto_quantity * unit_weight_kg) stored,
  total_value numeric generated always as (mto_quantity * unit_price) stored,
  -- Manual override; the real shortage/readiness computation is client-side (see
  -- materialCalc.ts) but a manual flag lets a planner flag a material as blocking
  -- construction ahead of the numbers catching up.
  is_construction_blocking boolean not null default false,
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table mtl_materials enable row level security;

drop policy if exists "mtl_materials_select_authenticated" on mtl_materials;
create policy "mtl_materials_select_authenticated" on mtl_materials for select using (auth.uid() is not null);
drop policy if exists "mtl_materials_write_admin" on mtl_materials;
create policy "mtl_materials_write_admin" on mtl_materials for all using (is_admin_user()) with check (is_admin_user());

-- Procurement: MR -> RFQ -> Evaluation -> Award, tracked as one status-progressing
-- request row (not four separate tables) since these are process states of the
-- same request, not independent facts.
create table if not exists mtl_procurement_requests (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  mr_number text not null default '',
  mr_date date not null default current_date,
  status text not null default 'draft' check (
    status in ('draft', 'mr_issued', 'rfq_sent', 'under_evaluation', 'awarded', 'cancelled')
  ),
  supplier_org_id uuid references organizations (id) on delete set null,
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table mtl_procurement_requests enable row level security;

drop policy if exists "mtl_procurement_requests_select_authenticated" on mtl_procurement_requests;
create policy "mtl_procurement_requests_select_authenticated" on mtl_procurement_requests for select using (auth.uid() is not null);
drop policy if exists "mtl_procurement_requests_write_admin" on mtl_procurement_requests;
create policy "mtl_procurement_requests_write_admin" on mtl_procurement_requests for all using (is_admin_user()) with check (is_admin_user());

create table if not exists mtl_procurement_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references mtl_procurement_requests (id) on delete cascade,
  material_id uuid not null references mtl_materials (id) on delete cascade,
  quantity_requested numeric not null default 0
);

alter table mtl_procurement_lines enable row level security;

drop policy if exists "mtl_procurement_lines_select_authenticated" on mtl_procurement_lines;
create policy "mtl_procurement_lines_select_authenticated" on mtl_procurement_lines for select using (auth.uid() is not null);
drop policy if exists "mtl_procurement_lines_write_admin" on mtl_procurement_lines;
create policy "mtl_procurement_lines_write_admin" on mtl_procurement_lines for all using (is_admin_user()) with check (is_admin_user());

create table if not exists mtl_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  request_id uuid references mtl_procurement_requests (id) on delete set null,
  po_number text not null default '',
  po_date date not null default current_date,
  supplier_org_id uuid references organizations (id) on delete set null,
  currency text not null default 'IRR',
  status text not null default 'issued' check (status in ('draft', 'issued', 'active', 'completed', 'cancelled')),
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table mtl_purchase_orders enable row level security;

drop policy if exists "mtl_purchase_orders_select_authenticated" on mtl_purchase_orders;
create policy "mtl_purchase_orders_select_authenticated" on mtl_purchase_orders for select using (auth.uid() is not null);
drop policy if exists "mtl_purchase_orders_write_admin" on mtl_purchase_orders;
create policy "mtl_purchase_orders_write_admin" on mtl_purchase_orders for all using (is_admin_user()) with check (is_admin_user());

create table if not exists mtl_po_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references mtl_purchase_orders (id) on delete cascade,
  material_id uuid not null references mtl_materials (id) on delete cascade,
  quantity_ordered numeric not null default 0,
  unit_price numeric not null default 0,
  planned_delivery_date date
);

alter table mtl_po_lines enable row level security;

drop policy if exists "mtl_po_lines_select_authenticated" on mtl_po_lines;
create policy "mtl_po_lines_select_authenticated" on mtl_po_lines for select using (auth.uid() is not null);
drop policy if exists "mtl_po_lines_write_admin" on mtl_po_lines;
create policy "mtl_po_lines_write_admin" on mtl_po_lines for all using (is_admin_user()) with check (is_admin_user());

-- Manufacturing & inspection tracked per PO line (one manufacturing record per ordered
-- item), so FAT/long-lead/delay all read off the same PO commitment they belong to.
create table if not exists mtl_manufacturing (
  id uuid primary key default gen_random_uuid(),
  po_line_id uuid not null references mtl_po_lines (id) on delete cascade unique,
  status text not null default 'not_started' check (
    status in ('not_started', 'in_progress', 'fat_scheduled', 'fat_passed', 'fat_failed', 'ready_for_shipment')
  ),
  is_long_lead boolean not null default false,
  planned_ready_date date,
  actual_ready_date date,
  fat_date date,
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table mtl_manufacturing enable row level security;

drop policy if exists "mtl_manufacturing_select_authenticated" on mtl_manufacturing;
create policy "mtl_manufacturing_select_authenticated" on mtl_manufacturing for select using (auth.uid() is not null);
drop policy if exists "mtl_manufacturing_write_admin" on mtl_manufacturing;
create policy "mtl_manufacturing_write_admin" on mtl_manufacturing for all using (is_admin_user()) with check (is_admin_user());

create table if not exists mtl_release_notes (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  release_number text not null default '',
  release_date date not null default current_date,
  po_id uuid references mtl_purchase_orders (id) on delete set null,
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table mtl_release_notes enable row level security;

drop policy if exists "mtl_release_notes_select_authenticated" on mtl_release_notes;
create policy "mtl_release_notes_select_authenticated" on mtl_release_notes for select using (auth.uid() is not null);
drop policy if exists "mtl_release_notes_write_admin" on mtl_release_notes;
create policy "mtl_release_notes_write_admin" on mtl_release_notes for all using (is_admin_user()) with check (is_admin_user());

create table if not exists mtl_release_lines (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references mtl_release_notes (id) on delete cascade,
  material_id uuid not null references mtl_materials (id) on delete cascade,
  quantity_released numeric not null default 0
);

alter table mtl_release_lines enable row level security;

drop policy if exists "mtl_release_lines_select_authenticated" on mtl_release_lines;
create policy "mtl_release_lines_select_authenticated" on mtl_release_lines for select using (auth.uid() is not null);
drop policy if exists "mtl_release_lines_write_admin" on mtl_release_lines;
create policy "mtl_release_lines_write_admin" on mtl_release_lines for all using (is_admin_user()) with check (is_admin_user());

create table if not exists mtl_shipments (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  shipment_number text not null default '',
  shipment_date date not null default current_date,
  carrier text not null default '',
  tracking_ref text not null default '',
  origin text not null default '',
  destination text not null default '',
  status text not null default 'planned' check (status in ('planned', 'in_transit', 'customs', 'delivered')),
  eta date,
  ata date,
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table mtl_shipments enable row level security;

drop policy if exists "mtl_shipments_select_authenticated" on mtl_shipments;
create policy "mtl_shipments_select_authenticated" on mtl_shipments for select using (auth.uid() is not null);
drop policy if exists "mtl_shipments_write_admin" on mtl_shipments;
create policy "mtl_shipments_write_admin" on mtl_shipments for all using (is_admin_user()) with check (is_admin_user());

create table if not exists mtl_shipment_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references mtl_shipments (id) on delete cascade,
  material_id uuid not null references mtl_materials (id) on delete cascade,
  quantity_shipped numeric not null default 0
);

alter table mtl_shipment_lines enable row level security;

drop policy if exists "mtl_shipment_lines_select_authenticated" on mtl_shipment_lines;
create policy "mtl_shipment_lines_select_authenticated" on mtl_shipment_lines for select using (auth.uid() is not null);
drop policy if exists "mtl_shipment_lines_write_admin" on mtl_shipment_lines;
create policy "mtl_shipment_lines_write_admin" on mtl_shipment_lines for all using (is_admin_user()) with check (is_admin_user());

create table if not exists mtl_warehouse_receipts (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  receipt_number text not null default '',
  receipt_date date not null default current_date,
  shipment_id uuid references mtl_shipments (id) on delete set null,
  warehouse_location text not null default '',
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table mtl_warehouse_receipts enable row level security;

drop policy if exists "mtl_warehouse_receipts_select_authenticated" on mtl_warehouse_receipts;
create policy "mtl_warehouse_receipts_select_authenticated" on mtl_warehouse_receipts for select using (auth.uid() is not null);
drop policy if exists "mtl_warehouse_receipts_write_admin" on mtl_warehouse_receipts;
create policy "mtl_warehouse_receipts_write_admin" on mtl_warehouse_receipts for all using (is_admin_user()) with check (is_admin_user());

create table if not exists mtl_warehouse_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references mtl_warehouse_receipts (id) on delete cascade,
  material_id uuid not null references mtl_materials (id) on delete cascade,
  quantity_received numeric not null default 0,
  condition text not null default 'ok' check (condition in ('ok', 'damaged', 'shortage'))
);

alter table mtl_warehouse_lines enable row level security;

drop policy if exists "mtl_warehouse_lines_select_authenticated" on mtl_warehouse_lines;
create policy "mtl_warehouse_lines_select_authenticated" on mtl_warehouse_lines for select using (auth.uid() is not null);
drop policy if exists "mtl_warehouse_lines_write_admin" on mtl_warehouse_lines;
create policy "mtl_warehouse_lines_write_admin" on mtl_warehouse_lines for all using (is_admin_user()) with check (is_admin_user());

-- Allocation to a construction work package. quantity_consumed is a running total
-- updated by the "record consumption" action (not a separate ledger table) — the
-- spec asks for available/reserved/allocated/consumed/remaining visibility, not a
-- full consumption transaction history.
create table if not exists mtl_allocations (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  material_id uuid not null references mtl_materials (id) on delete cascade,
  work_package_code text not null default '',
  work_package_name text not null default '',
  quantity_allocated numeric not null default 0,
  quantity_consumed numeric not null default 0,
  allocation_date date not null default current_date,
  status text not null default 'allocated' check (status in ('allocated', 'consumed', 'returned')),
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table mtl_allocations enable row level security;

drop policy if exists "mtl_allocations_select_authenticated" on mtl_allocations;
create policy "mtl_allocations_select_authenticated" on mtl_allocations for select using (auth.uid() is not null);
drop policy if exists "mtl_allocations_write_admin" on mtl_allocations;
create policy "mtl_allocations_write_admin" on mtl_allocations for all using (is_admin_user()) with check (is_admin_user());

create or replace function set_updated_at_and_by_mtl()
returns trigger as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'mtl_materials', 'mtl_procurement_requests', 'mtl_purchase_orders', 'mtl_manufacturing',
    'mtl_shipments', 'mtl_allocations'
  ]
  loop
    execute format('drop trigger if exists trg_set_updated_at on %I', t);
    execute format('create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at_and_by_mtl()', t);
  end loop;
end $$;

create index if not exists idx_mtl_mto_revisions_project on mtl_mto_revisions (master_project_id);
create index if not exists idx_mtl_materials_project on mtl_materials (master_project_id);
create index if not exists idx_mtl_materials_revision on mtl_materials (mto_revision_id);
create index if not exists idx_mtl_procurement_requests_project on mtl_procurement_requests (master_project_id);
create index if not exists idx_mtl_procurement_lines_request on mtl_procurement_lines (request_id);
create index if not exists idx_mtl_procurement_lines_material on mtl_procurement_lines (material_id);
create index if not exists idx_mtl_purchase_orders_project on mtl_purchase_orders (master_project_id);
create index if not exists idx_mtl_po_lines_po on mtl_po_lines (po_id);
create index if not exists idx_mtl_po_lines_material on mtl_po_lines (material_id);
create index if not exists idx_mtl_manufacturing_po_line on mtl_manufacturing (po_line_id);
create index if not exists idx_mtl_release_notes_project on mtl_release_notes (master_project_id);
create index if not exists idx_mtl_release_lines_release on mtl_release_lines (release_id);
create index if not exists idx_mtl_release_lines_material on mtl_release_lines (material_id);
create index if not exists idx_mtl_shipments_project on mtl_shipments (master_project_id);
create index if not exists idx_mtl_shipment_lines_shipment on mtl_shipment_lines (shipment_id);
create index if not exists idx_mtl_shipment_lines_material on mtl_shipment_lines (material_id);
create index if not exists idx_mtl_warehouse_receipts_project on mtl_warehouse_receipts (master_project_id);
create index if not exists idx_mtl_warehouse_lines_receipt on mtl_warehouse_lines (receipt_id);
create index if not exists idx_mtl_warehouse_lines_material on mtl_warehouse_lines (material_id);
create index if not exists idx_mtl_allocations_project on mtl_allocations (master_project_id);

-- ============================================================================
-- 21. Financial Management extensions — additive only, no parallel structure:
--     everything below either adds columns to the existing fin_contracts /
--     fin_payment_certificates / fin_budgets tables (section 19) or adds a new
--     table that hangs off them the same way section 19's tables hang off
--     master_projects.
--
--     Multi-currency: per spec, "every amount is three independent values"
--     (rial amount, foreign-currency amount, FC rial-equivalent). Applied to
--     Contract Value, Certificate Gross Amount and Paid Amount, and Approved
--     Budget — the four amounts the spec explicitly names (Contract, Payment
--     Certificate, Payment, Budget). Deliberately NOT applied to
--     adjustments/deductions/retention/advance-recovery: those are computed as
--     percentages of the certificate's rial gross_amount exactly as before
--     (payable_amount's generated-column formula is unchanged), and each
--     certificate's FC gross/paid rial-equivalents are added on top in the
--     calc layer — i.e. the FC portion is tracked and totalled for visibility
--     but is not run back through the rial deduction formula. This mirrors
--     common EPC practice where a contract's foreign-currency portion (e.g.
--     TPI/consultant fees or imported-equipment payments) is paid net of the
--     domestic retention/tax scheme.
--
--     Multi-contract: fin_contracts already supports many rows per
--     master_project_id (no uniqueness constraint) — the only change needed is
--     a contract_role so the UI can group/filter Main EPC vs Supervision
--     Consultant vs MC vs TPI vs Other, all still independently managed
--     contracts of the same project.
--
--     Work vs Adjustment certificates: certificate_type distinguishes the two;
--     related_certificate_id is a self-referencing FK so an Adjustment
--     Certificate points back at the Work Certificate it adjusts (e.g.
--     Adjustment No.11 -> Work No.11), with its own adjustment_factor —
--     related but independent rows, not a merged concept.
-- ============================================================================

alter table fin_contracts add column if not exists contract_role text not null default 'main_epc' check (contract_role in ('main_epc', 'supervision_consultant', 'mc', 'tpi', 'other'));
alter table fin_contracts add column if not exists contract_value_fc numeric not null default 0;
alter table fin_contracts add column if not exists fc_currency text not null default 'EUR';
alter table fin_contracts add column if not exists exchange_rate numeric not null default 0;
alter table fin_contracts add column if not exists contract_value_fc_rial_equivalent numeric generated always as (contract_value_fc * exchange_rate) stored;

alter table fin_payment_certificates add column if not exists certificate_type text not null default 'work' check (certificate_type in ('work', 'adjustment'));
alter table fin_payment_certificates add column if not exists related_certificate_id uuid references fin_payment_certificates (id) on delete set null;
alter table fin_payment_certificates add column if not exists adjustment_factor numeric;
alter table fin_payment_certificates add column if not exists gross_amount_fc numeric not null default 0;
alter table fin_payment_certificates add column if not exists fc_currency text not null default 'EUR';
alter table fin_payment_certificates add column if not exists exchange_rate numeric not null default 0;
alter table fin_payment_certificates add column if not exists gross_amount_fc_rial_equivalent numeric generated always as (gross_amount_fc * exchange_rate) stored;
alter table fin_payment_certificates add column if not exists paid_amount_fc numeric not null default 0;
alter table fin_payment_certificates add column if not exists paid_exchange_rate numeric not null default 0;
alter table fin_payment_certificates add column if not exists paid_amount_fc_rial_equivalent numeric generated always as (paid_amount_fc * paid_exchange_rate) stored;

alter table fin_budgets add column if not exists approved_budget_fc numeric not null default 0;
alter table fin_budgets add column if not exists fc_currency text not null default 'EUR';
alter table fin_budgets add column if not exists exchange_rate numeric not null default 0;
alter table fin_budgets add column if not exists approved_budget_fc_rial_equivalent numeric generated always as (approved_budget_fc * exchange_rate) stored;

create table if not exists fin_guarantees (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references fin_contracts (id) on delete cascade,
  guarantee_type text not null default 'bank_guarantee' check (guarantee_type in ('bank_guarantee', 'promissory_note', 'other')),
  number text not null default '',
  amount numeric not null default 0,
  currency text not null default 'IRR',
  issue_date date,
  expiry_date date,
  status text not null default 'active' check (status in ('active', 'released', 'expired', 'claimed')),
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table fin_guarantees enable row level security;

drop policy if exists "fin_guarantees_select_authenticated" on fin_guarantees;
create policy "fin_guarantees_select_authenticated" on fin_guarantees for select using (auth.uid() is not null);
drop policy if exists "fin_guarantees_write_admin" on fin_guarantees;
create policy "fin_guarantees_write_admin" on fin_guarantees for all using (is_admin_user()) with check (is_admin_user());

-- Annual Budget — a project's yearly budget breakdown, deliberately separate from
-- fin_budgets.approved_budget (the Total Project Budget) so the two are never confused;
-- current-year absorption reads off this table, total project financial capacity reads off
-- fin_budgets. "year" is a Jalali year (e.g. 1403) since the whole module reports in Jalali.
create table if not exists fin_annual_budgets (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  jalali_year integer not null,
  budget_amount numeric not null default 0,
  currency text not null default 'IRR',
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now(),
  unique (master_project_id, jalali_year)
);

alter table fin_annual_budgets enable row level security;

drop policy if exists "fin_annual_budgets_select_authenticated" on fin_annual_budgets;
create policy "fin_annual_budgets_select_authenticated" on fin_annual_budgets for select using (auth.uid() is not null);
drop policy if exists "fin_annual_budgets_write_admin" on fin_annual_budgets;
create policy "fin_annual_budgets_write_admin" on fin_annual_budgets for all using (is_admin_user()) with check (is_admin_user());

do $$
declare
  t text;
begin
  foreach t in array array['fin_guarantees', 'fin_annual_budgets']
  loop
    execute format('drop trigger if exists trg_set_updated_at on %I', t);
    execute format('create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at_and_by_fin()', t);
  end loop;
end $$;

create index if not exists idx_fin_guarantees_contract on fin_guarantees (contract_id);
create index if not exists idx_fin_annual_budgets_project on fin_annual_budgets (master_project_id);
create index if not exists idx_fin_payment_certificates_related on fin_payment_certificates (related_certificate_id);
create index if not exists idx_mtl_allocations_material on mtl_allocations (material_id);

-- ============================================================================
-- 22. Payment records (سوابق پرداخت) — an itemized payment ledger against a
--     certificate, additive on top of section 19/21: fin_payment_certificates
--     keeps its own paid_amount/paid_date exactly as before (still the figure
--     every existing dashboard/report/calc reads), this table just lets a
--     single certificate's payment be logged as one or several dated
--     transactions (partial payments, installments) with a method/reference,
--     for the "سوابق پرداخت" listing page. It is a record-keeping layer, not a
--     new source of truth — the client does not recompute
--     fin_payment_certificates.paid_amount from this table.
-- ============================================================================

create table if not exists fin_payments (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references fin_payment_certificates (id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric not null default 0,
  amount_fc numeric not null default 0,
  fc_currency text not null default 'EUR',
  exchange_rate numeric not null default 0,
  amount_fc_rial_equivalent numeric generated always as (amount_fc * exchange_rate) stored,
  method text not null default '',
  reference_number text not null default '',
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table fin_payments enable row level security;

drop policy if exists "fin_payments_select_authenticated" on fin_payments;
create policy "fin_payments_select_authenticated" on fin_payments for select using (auth.uid() is not null);
drop policy if exists "fin_payments_write_admin" on fin_payments;
create policy "fin_payments_write_admin" on fin_payments for all using (is_admin_user()) with check (is_admin_user());

drop trigger if exists trg_set_updated_at on fin_payments;
create trigger trg_set_updated_at before update on fin_payments for each row execute function set_updated_at_and_by_fin();

create index if not exists idx_fin_payments_certificate on fin_payments (certificate_id);

-- ============================================================================
-- 23. Financial Management, owner-executive round: contractor claims register,
--     retention release schedule, tax/insurance deduction split, certificate
--     approval audit trail + delegation-of-authority threshold, and document
--     attachments — closing the gap between "a data-entry tool" and what an
--     owner-side PM/CEO actually needs to run EPC contract administration.
--
--     Deduction split keeps `deductions` and `payable_amount` as the exact
--     same generated-column NAMES as before (now sourced from the new
--     tax_deduction/insurance_deduction/other_deduction columns instead of a
--     single hand-entered value) so every existing calc/dashboard/report that
--     reads certificate.deductions keeps working unchanged as the total.
-- ============================================================================

alter table fin_payment_certificates add column if not exists tax_deduction numeric not null default 0;
alter table fin_payment_certificates add column if not exists insurance_deduction numeric not null default 0;
alter table fin_payment_certificates add column if not exists other_deduction numeric not null default 0;

-- Preserve any previously hand-entered deductions value as "other" before the column becomes generated.
update fin_payment_certificates set other_deduction = deductions where other_deduction = 0 and deductions <> 0;

alter table fin_payment_certificates drop column if exists payable_amount;
alter table fin_payment_certificates drop column if exists deductions;
alter table fin_payment_certificates add column deductions numeric generated always as (tax_deduction + insurance_deduction + other_deduction) stored;
-- Postgres forbids a generated column from referencing another generated column, so this expression
-- inlines the tax+insurance+other sum directly rather than referencing the `deductions` column above
-- (the two stay mathematically identical, just computed independently).
alter table fin_payment_certificates add column payable_amount numeric generated always as (gross_amount + adjustments - (tax_deduction + insurance_deduction + other_deduction) - retention_amount - advance_recovery_amount) stored;

-- Approval workflow / audit trail — who certified and who gave final approval, not just a status enum.
alter table fin_payment_certificates add column if not exists certified_by uuid references profiles (id);
alter table fin_payment_certificates add column if not exists approved_by uuid references profiles (id);
alter table fin_payment_certificates add column if not exists approved_date date;

-- Document attachments (guarantee letter scan, certificate backup docs) — see the finance-docs
-- storage bucket below.
alter table fin_payment_certificates add column if not exists attachment_url text not null default '';
alter table fin_guarantees add column if not exists attachment_url text not null default '';

-- Delegation of authority: certificates certified above this rial amount require an admin/owner
-- approval (profiles.is_admin), not just the project-level certifier. Null = no threshold set
-- (every certificate can be approved by any authorized user, current behavior).
alter table fin_budgets add column if not exists certificate_approval_threshold numeric;

-- Contractor claims (کلایم پیمانکار) — time extension / cost / disruption / variation claims,
-- deliberately a distinct entity from fin_contract_amendments (which is an *agreed* value change):
-- a claim starts as a contractor assertion that may be rejected or only partially approved, and
-- carries its own review workflow.
create table if not exists fin_claims (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references fin_contracts (id) on delete cascade,
  claim_number text not null default '',
  claim_type text not null default 'other' check (claim_type in ('time_extension', 'cost', 'disruption', 'variation', 'other')),
  title text not null default '',
  description text not null default '',
  submitted_date date not null default current_date,
  amount_claimed numeric not null default 0,
  amount_approved numeric,
  currency text not null default 'IRR',
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'approved', 'partially_approved', 'rejected', 'arbitration')),
  correspondence_ref text not null default '',
  attachment_url text not null default '',
  resolution_date date,
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table fin_claims enable row level security;

drop policy if exists "fin_claims_select_authenticated" on fin_claims;
create policy "fin_claims_select_authenticated" on fin_claims for select using (auth.uid() is not null);
drop policy if exists "fin_claims_write_admin" on fin_claims;
create policy "fin_claims_write_admin" on fin_claims for all using (is_admin_user()) with check (is_admin_user());

-- Retention (حسن انجام کار) release schedule — the amount withheld per certificate is already
-- tracked (fin_payment_certificates.retention_amount); this table is the *liability side*: when
-- the accumulated retention on a contract is actually due back to the contractor, in one or more
-- stages (provisional handover / final handover after the defects-liability period).
create table if not exists fin_retention_releases (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references fin_contracts (id) on delete cascade,
  release_stage text not null default 'provisional_handover' check (release_stage in ('provisional_handover', 'final_handover', 'other')),
  planned_date date,
  planned_amount numeric not null default 0,
  actual_date date,
  actual_amount numeric,
  status text not null default 'pending' check (status in ('pending', 'released', 'cancelled')),
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table fin_retention_releases enable row level security;

drop policy if exists "fin_retention_releases_select_authenticated" on fin_retention_releases;
create policy "fin_retention_releases_select_authenticated" on fin_retention_releases for select using (auth.uid() is not null);
drop policy if exists "fin_retention_releases_write_admin" on fin_retention_releases;
create policy "fin_retention_releases_write_admin" on fin_retention_releases for all using (is_admin_user()) with check (is_admin_user());

do $$
declare
  t text;
begin
  foreach t in array array['fin_claims', 'fin_retention_releases']
  loop
    execute format('drop trigger if exists trg_set_updated_at on %I', t);
    execute format('create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at_and_by_fin()', t);
  end loop;
end $$;

create index if not exists idx_fin_claims_contract on fin_claims (contract_id);
create index if not exists idx_fin_retention_releases_contract on fin_retention_releases (contract_id);

-- Storage bucket for finance document attachments (guarantee letters, certificate backup docs) —
-- mirrors the 'avatars' bucket pattern above, but read is authenticated-only (these are internal
-- contract documents, not public) and write is admin-only (matches every fin_* table's RLS).
insert into storage.buckets (id, name, public)
values ('finance-docs', 'finance-docs', false)
on conflict (id) do nothing;

drop policy if exists "finance_docs_read_authenticated" on storage.objects;
create policy "finance_docs_read_authenticated" on storage.objects
  for select using (bucket_id = 'finance-docs' and auth.uid() is not null);

drop policy if exists "finance_docs_write_admin" on storage.objects;
create policy "finance_docs_write_admin" on storage.objects
  for insert with check (bucket_id = 'finance-docs' and is_admin_user());

drop policy if exists "finance_docs_update_admin" on storage.objects;
create policy "finance_docs_update_admin" on storage.objects
  for update using (bucket_id = 'finance-docs' and is_admin_user());

drop policy if exists "finance_docs_delete_admin" on storage.objects;
create policy "finance_docs_delete_admin" on storage.objects
  for delete using (bucket_id = 'finance-docs' and is_admin_user());

-- ============================================================================
-- 24. Contractor-submitted monthly funding requirement (Cash Call)
--
--     The Cash Flow & Funding Forecast page's "planned"/"forecast" series were
--     always a straight-line proxy computed from contract value/dates — never
--     a number the contractor actually submitted. This table lets a PM enter
--     the contractor's own monthly cash-call estimate per contract (in Jalali
--     year/month, matching how this module dates everything), so it can be
--     charted against real fin_payment_certificates.paid_amount and the gap
--     between "what the contractor said they'd need" and "what was actually
--     paid" becomes a visible number instead of an implicit straight line.
-- ============================================================================

create table if not exists fin_cashflow_forecasts (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references fin_contracts (id) on delete cascade,
  jalali_year integer not null,
  jalali_month smallint not null check (jalali_month between 1 and 12),
  forecast_amount numeric not null default 0,
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now(),
  unique (contract_id, jalali_year, jalali_month)
);

alter table fin_cashflow_forecasts enable row level security;

drop policy if exists "fin_cashflow_forecasts_select_authenticated" on fin_cashflow_forecasts;
create policy "fin_cashflow_forecasts_select_authenticated" on fin_cashflow_forecasts for select using (auth.uid() is not null);
drop policy if exists "fin_cashflow_forecasts_write_admin" on fin_cashflow_forecasts;
create policy "fin_cashflow_forecasts_write_admin" on fin_cashflow_forecasts for all using (is_admin_user()) with check (is_admin_user());

drop trigger if exists trg_set_updated_at on fin_cashflow_forecasts;
create trigger trg_set_updated_at before update on fin_cashflow_forecasts for each row execute function set_updated_at_and_by_fin();

create index if not exists idx_fin_cashflow_forecasts_contract on fin_cashflow_forecasts (contract_id);

-- ============================================================================
-- 25. PipePulse 3D model viewer — FBX upload (e.g. exported from Autodesk
--     Navisworks Manage) per project, stored in a private bucket and rendered
--     client-side with three.js. One model per project — mirrors the existing
--     svg_raw/svg_file_name field-on-projects pattern, except the file itself
--     lives in Storage (it's a large binary, not text) and the column holds a
--     storage path, resolved to a signed URL on demand (same approach as the
--     finance-docs bucket).
-- ============================================================================

alter table projects add column if not exists model3d_path text;
alter table projects add column if not exists model3d_file_name text;

insert into storage.buckets (id, name, public)
values ('project-models', 'project-models', false)
on conflict (id) do nothing;

-- Path convention: <project_id>/<filename> — read/write gated by the same
-- project-membership functions (is_project_member/can_edit_project) that
-- already govern the `lines`/`daily_logs` tables for this project.
drop policy if exists "project_models_read_members" on storage.objects;
create policy "project_models_read_members" on storage.objects
  for select using (bucket_id = 'project-models' and (is_project_member(((storage.foldername(name))[1])::uuid) or is_admin_user()));

drop policy if exists "project_models_write_members" on storage.objects;
create policy "project_models_write_members" on storage.objects
  for insert with check (bucket_id = 'project-models' and (can_edit_project(((storage.foldername(name))[1])::uuid) or is_admin_user()));

drop policy if exists "project_models_update_members" on storage.objects;
create policy "project_models_update_members" on storage.objects
  for update using (bucket_id = 'project-models' and (can_edit_project(((storage.foldername(name))[1])::uuid) or is_admin_user()));

drop policy if exists "project_models_delete_members" on storage.objects;
create policy "project_models_delete_members" on storage.objects
  for delete using (bucket_id = 'project-models' and (can_edit_project(((storage.foldername(name))[1])::uuid) or is_admin_user()));

-- ============================================================================
-- 26. Joint-centric 3D progress tracking (weld/flange register, spools,
--     equipment) — the 3D model viewer's real unit of progress is the joint
--     (a weld between two spools, or a flange bolt-up to another spool or to
--     equipment), placed by clicking its point on the model; a spool is the
--     gap between two consecutive joints (or a joint and equipment) and is
--     linked to one or more 3D mesh objects only once both its bounding
--     joints exist; equipment is a separate, self-contained item (its own
--     mesh group + foundation/erection milestones) since it isn't a linear
--     run like a pipe spool.
-- ============================================================================

create table if not exists equipment3d (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  tag text not null default '',
  description text not null default '',
  foundation_ready_date date,
  erected_date date,
  mesh_object_names text[] not null default '{}',
  notes text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists joints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  line_id uuid not null references lines (id) on delete cascade,
  sequence_number integer not null default 1,
  joint_type text not null default 'weld' check (joint_type in ('weld', 'flange')),
  joint_number text not null default '',
  diameter text not null default '',
  thickness text not null default '',
  connected_equipment_id uuid references equipment3d (id) on delete set null,
  status text not null default 'not_started' check (status in ('not_started', 'completed')),
  completed_date date,
  notes text not null default '',
  position_x numeric,
  position_y numeric,
  position_z numeric,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
-- axis_x/y/z and ring_radius were a short-lived attempt at orienting a 3D ring marker to the pipe;
-- replaced by a flat camera-facing weld-tag label that needs neither, so they're dropped again.
alter table joints drop column if exists axis_x;
alter table joints drop column if exists axis_y;
alter table joints drop column if exists axis_z;
alter table joints drop column if exists ring_radius;

create table if not exists spools (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  line_id uuid not null references lines (id) on delete cascade,
  -- null start_joint_id = spool starts at the line's own origin (not yet bounded by a joint);
  -- null end_joint_id = spool ends at the line's own terminus. Both null only very briefly,
  -- for a line with no joints placed at all yet.
  start_joint_id uuid references joints (id) on delete set null,
  end_joint_id uuid references joints (id) on delete set null,
  mesh_object_names text[] not null default '{}',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table equipment3d enable row level security;
alter table joints enable row level security;
alter table spools enable row level security;

drop policy if exists "equipment3d_select_member" on equipment3d;
create policy "equipment3d_select_member" on equipment3d
  for select using (is_project_member(project_id) or is_admin_user());
drop policy if exists "equipment3d_write_editor" on equipment3d;
create policy "equipment3d_write_editor" on equipment3d
  for all
  using (can_edit_project(project_id) or project_role(project_id) = 'owner' or is_admin_user())
  with check (can_edit_project(project_id) or project_role(project_id) = 'owner' or is_admin_user());

drop policy if exists "joints_select_member" on joints;
create policy "joints_select_member" on joints
  for select using (is_project_member(project_id) or is_admin_user());
drop policy if exists "joints_write_editor" on joints;
create policy "joints_write_editor" on joints
  for all
  using (can_edit_project(project_id) or project_role(project_id) = 'owner' or is_admin_user())
  with check (can_edit_project(project_id) or project_role(project_id) = 'owner' or is_admin_user());

drop policy if exists "spools_select_member" on spools;
create policy "spools_select_member" on spools
  for select using (is_project_member(project_id) or is_admin_user());
drop policy if exists "spools_write_editor" on spools;
create policy "spools_write_editor" on spools
  for all
  using (can_edit_project(project_id) or project_role(project_id) = 'owner' or is_admin_user())
  with check (can_edit_project(project_id) or project_role(project_id) = 'owner' or is_admin_user());

create index if not exists idx_equipment3d_project on equipment3d (project_id);
create index if not exists idx_joints_project on joints (project_id);
create index if not exists idx_joints_line on joints (line_id);
create index if not exists idx_spools_project on spools (project_id);
create index if not exists idx_spools_line on spools (line_id);

-- ============================================================================
-- 19. Competency Assessment module — structured interview/evaluation tool for
--     gas transmission pipeline construction project manager candidates: take
--     a full candidate profile (with employment/insurance/education history and
--     document attachments), let a multi-person interview panel each score the
--     candidate independently across a fixed set of weighted competency domains
--     (defined in application code, not this schema — see
--     src/modules/competency/lib/competencyModel.ts), show the panel average to
--     the interview lead who then records one final score with their own
--     judgment, and produce a weighted domain + overall maturity report.
--
--     Interview records are sensitive HR content, so — unlike the
--     project-membership-scoped modules above — visibility here is private to
--     whoever ran the interview (created_by = auth.uid()), the panelists
--     assigned to that specific interview, and admins — not shared with every
--     project member. created_by defaults to auth.uid() server-side (never
--     client-supplied) per BL-09.
-- ============================================================================

create table if not exists comp_assessments (
  id uuid primary key default gen_random_uuid(),
  candidate_name text not null,
  candidate_position text not null default '',
  candidate_national_id text not null default '',
  candidate_phone text not null default '',
  candidate_email text not null default '',
  photo_url text not null default '',
  years_experience_total numeric,
  years_experience_pipeline numeric,
  current_employer text not null default '',
  -- Structured repeatable history — arrays of objects (see competencyData.ts for the exact shape
  -- of each entry). Kept as JSONB rather than child tables since entries are always read/written
  -- as a whole list with the rest of the profile, never queried independently.
  education jsonb not null default '[]'::jsonb,
  employment_history jsonb not null default '[]'::jsonb,
  certifications jsonb not null default '[]'::jsonb,
  notable_projects text not null default '',
  interview_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  -- The interview lead's FINAL scoring pass — keyed by question key (see competencyModel.ts),
  -- value {"score": 0-5, "note": "..."}. Individual panelists score independently in
  -- comp_panelist_scores below; the lead reviews the panel average and records their own final
  -- judgment here. The question set itself lives in application code, not a DB table, since it's
  -- a fixed, versioned rubric rather than user-defined content.
  answers jsonb not null default '{}'::jsonb,
  capstone_score int check (capstone_score is null or capstone_score between 0 and 5),
  capstone_note text not null default '',
  -- Qualification scorecard (item 5 of the spec): four manually-judged components alongside the
  -- auto-derived interview score, each 0-5. Nullable = not yet judged.
  education_score numeric check (education_score is null or education_score between 0 and 5),
  experience_score numeric check (experience_score is null or experience_score between 0 and 5),
  pm_training_score numeric check (pm_training_score is null or pm_training_score between 0 and 5),
  pm_certification_score numeric check (pm_certification_score is null or pm_certification_score between 0 and 5),
  -- Self-service candidate link: an unguessable capability token. Whoever holds the link (sent
  -- privately by the interview lead) can fill in their own profile/documents without a RASTA
  -- login — see the comp_self_service_* functions below, which are the ONLY write path for that
  -- token (never a direct table grant), so a leaked token can only ever touch this one row.
  self_service_token uuid not null default gen_random_uuid(),
  self_service_status text not null default 'not_sent' check (self_service_status in ('not_sent', 'pending', 'submitted', 'reviewed')),
  reviewed_by uuid references profiles (id),
  reviewed_at timestamptz,
  created_by uuid not null default auth.uid() references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migrate pre-existing free-text education/certifications columns (from the module's first
-- version) into the new structured jsonb shape, wrapping any existing text as a single note entry
-- so nothing is silently dropped.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'comp_assessments' and column_name = 'education' and data_type = 'text') then
    alter table comp_assessments alter column education drop default;
    alter table comp_assessments alter column education type jsonb using (
      case when education is null or education = '' then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'degree', education, 'field', '', 'institution', '', 'year', '')) end
    );
    alter table comp_assessments alter column education set default '[]'::jsonb;
    alter table comp_assessments alter column education set not null;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'comp_assessments' and column_name = 'certifications' and data_type = 'text') then
    alter table comp_assessments alter column certifications drop default;
    alter table comp_assessments alter column certifications type jsonb using (
      case when certifications is null or certifications = '' then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'title', certifications, 'issuer', '', 'date', '', 'isPmp', false)) end
    );
    alter table comp_assessments alter column certifications set default '[]'::jsonb;
    alter table comp_assessments alter column certifications set not null;
  end if;
end $$;

alter table comp_assessments add column if not exists candidate_national_id text not null default '';
alter table comp_assessments add column if not exists candidate_phone text not null default '';
alter table comp_assessments add column if not exists candidate_email text not null default '';
alter table comp_assessments add column if not exists photo_url text not null default '';
alter table comp_assessments add column if not exists employment_history jsonb not null default '[]'::jsonb;
alter table comp_assessments add column if not exists capstone_score int;
alter table comp_assessments add column if not exists capstone_note text not null default '';
alter table comp_assessments add column if not exists education_score numeric;
alter table comp_assessments add column if not exists experience_score numeric;
alter table comp_assessments add column if not exists pm_training_score numeric;
alter table comp_assessments add column if not exists pm_certification_score numeric;
alter table comp_assessments add column if not exists self_service_token uuid not null default gen_random_uuid();
alter table comp_assessments add column if not exists self_service_status text not null default 'not_sent';
alter table comp_assessments add column if not exists reviewed_by uuid references profiles (id);
alter table comp_assessments add column if not exists reviewed_at timestamptz;
alter table comp_assessments add column if not exists candidate_age int check (candidate_age is null or candidate_age between 0 and 100);
alter table comp_assessments add column if not exists has_disability boolean not null default false;
alter table comp_assessments add column if not exists disability_note text not null default '';
-- The interview lead's (or designated final assessor's) explicit go/no-go verdict — distinct from
-- status='completed' (which only means the scoring flow was finished, not that the candidate was
-- approved). Shown as a badge on the candidate's card once set.
alter table comp_assessments add column if not exists is_approved boolean not null default false;
-- candidate_age is now derived client-side from this and stored alongside it (not typed manually)
-- so the two can never disagree; kept as a real column rather than computed-on-read since it's the
-- field candidates fill in through the self-service form.
alter table comp_assessments add column if not exists candidate_birth_date date;
-- Free-text narrative judgment from the assessment lead — distinct from the per-domain
-- strengths/weaknesses derived automatically from question scores (competencyModel.domainFlags),
-- which stay score-driven; these are the lead's own words.
alter table comp_assessments add column if not exists strengths text not null default '';
alter table comp_assessments add column if not exists development_areas text not null default '';

create unique index if not exists idx_comp_assessments_self_service_token on comp_assessments (self_service_token);

alter table comp_assessments enable row level security;

drop trigger if exists trg_set_updated_at on comp_assessments;
create trigger trg_set_updated_at before update on comp_assessments
  for each row execute function set_updated_at();

create index if not exists idx_comp_assessments_created_by on comp_assessments (created_by);

-- ----------------------------------------------------------------------------
-- Interview panel: who is assigned to score a given candidate, and each
-- panelist's own independent scoring pass (kept separate from comp_assessments.
-- answers, which is the lead's final record).
-- ----------------------------------------------------------------------------

create table if not exists comp_panelists (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references comp_assessments (id) on delete cascade,
  user_id uuid not null references profiles (id),
  is_lead boolean not null default false,
  added_by uuid not null default auth.uid() references profiles (id),
  created_at timestamptz not null default now(),
  unique (assessment_id, user_id)
);

alter table comp_panelists enable row level security;

create table if not exists comp_panelist_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references comp_assessments (id) on delete cascade,
  panelist_id uuid not null default auth.uid() references profiles (id),
  answers jsonb not null default '{}'::jsonb,
  capstone_score int check (capstone_score is null or capstone_score between 0 and 5),
  capstone_note text not null default '',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, panelist_id)
);

alter table comp_panelist_scores enable row level security;

drop trigger if exists trg_set_updated_at on comp_panelist_scores;
create trigger trg_set_updated_at before update on comp_panelist_scores
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Candidate documents: resume, education/certification scans, national ID,
-- insurance records, etc. Uploaded either by interview staff or, via the
-- self-service RPC functions further below, by the candidate themselves.
-- ----------------------------------------------------------------------------

create table if not exists comp_attachments (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references comp_assessments (id) on delete cascade,
  kind text not null default 'other' check (kind in ('resume', 'education', 'certification', 'national_id', 'insurance', 'other')),
  file_name text not null,
  storage_path text not null,
  uploaded_by uuid references profiles (id),
  uploaded_by_candidate boolean not null default false,
  created_at timestamptz not null default now()
);

alter table comp_attachments enable row level security;

-- ----------------------------------------------------------------------------
-- comp_can_access_assessment: shared visibility check for everything above —
-- the interview lead (created_by), an admin, or any assigned panelist. Security
-- definer so it can read comp_assessments/comp_panelists without recursing into
-- their own RLS policies (same pattern as is_project_member() etc. above).
-- ----------------------------------------------------------------------------

create or replace function comp_can_access_assessment(p_assessment_id uuid)
returns boolean as $$
  select exists (
    select 1 from comp_assessments a
    where a.id = p_assessment_id and (a.created_by = auth.uid() or is_admin_user())
  ) or exists (
    select 1 from comp_panelists p
    where p.assessment_id = p_assessment_id and p.user_id = auth.uid()
  );
$$ language sql security definer stable;

-- comp_is_lead: who may write the final verdict (comp_assessments) and manage the panel roster —
-- the assessment's creator, an admin, or whichever single panelist has been explicitly designated
-- team lead (comp_panelists.is_lead). Designating a lead at assignment time (rather than only ever
-- trusting created_by) lets the person who actually runs the interview record the final scores
-- even when someone else set the assessment up.
create or replace function comp_is_lead(p_assessment_id uuid)
returns boolean as $$
  select exists (
    select 1 from comp_assessments a
    where a.id = p_assessment_id and (a.created_by = auth.uid() or is_admin_user())
  ) or exists (
    select 1 from comp_panelists p
    where p.assessment_id = p_assessment_id and p.user_id = auth.uid() and p.is_lead
  );
$$ language sql security definer stable;

drop policy if exists "comp_assessments_select_own" on comp_assessments;
create policy "comp_assessments_select_own" on comp_assessments
  for select using (comp_can_access_assessment(id));

drop policy if exists "comp_assessments_insert_own" on comp_assessments;
create policy "comp_assessments_insert_own" on comp_assessments
  for insert with check (created_by = auth.uid());

drop policy if exists "comp_assessments_update_own" on comp_assessments;
create policy "comp_assessments_update_own" on comp_assessments
  for update using (comp_is_lead(id));

drop policy if exists "comp_assessments_delete_own" on comp_assessments;
create policy "comp_assessments_delete_own" on comp_assessments
  for delete using (created_by = auth.uid() or is_admin_user());

drop policy if exists "comp_panelists_select" on comp_panelists;
create policy "comp_panelists_select" on comp_panelists
  for select using (comp_can_access_assessment(assessment_id));

drop policy if exists "comp_panelists_insert" on comp_panelists;
create policy "comp_panelists_insert" on comp_panelists
  for insert with check (comp_is_lead(assessment_id));

drop policy if exists "comp_panelists_update" on comp_panelists;
create policy "comp_panelists_update" on comp_panelists
  for update using (comp_is_lead(assessment_id));

drop policy if exists "comp_panelists_delete" on comp_panelists;
create policy "comp_panelists_delete" on comp_panelists
  for delete using (comp_is_lead(assessment_id));

-- At most one designated lead per assessment — the client always clears the previous lead before
-- setting a new one, but this makes that invariant a guarantee rather than a convention.
create unique index if not exists idx_comp_panelists_one_lead on comp_panelists (assessment_id) where is_lead;

drop policy if exists "comp_panelist_scores_select" on comp_panelist_scores;
create policy "comp_panelist_scores_select" on comp_panelist_scores
  for select using (comp_can_access_assessment(assessment_id));

drop policy if exists "comp_panelist_scores_insert" on comp_panelist_scores;
create policy "comp_panelist_scores_insert" on comp_panelist_scores
  for insert with check (panelist_id = auth.uid() and comp_can_access_assessment(assessment_id));

drop policy if exists "comp_panelist_scores_update" on comp_panelist_scores;
create policy "comp_panelist_scores_update" on comp_panelist_scores
  for update using (panelist_id = auth.uid());

drop policy if exists "comp_panelist_scores_delete" on comp_panelist_scores;
create policy "comp_panelist_scores_delete" on comp_panelist_scores
  for delete using (
    panelist_id = auth.uid()
    or exists (select 1 from comp_assessments a where a.id = assessment_id and (a.created_by = auth.uid() or is_admin_user()))
  );

drop policy if exists "comp_attachments_select" on comp_attachments;
create policy "comp_attachments_select" on comp_attachments
  for select using (comp_can_access_assessment(assessment_id));

drop policy if exists "comp_attachments_insert" on comp_attachments;
create policy "comp_attachments_insert" on comp_attachments
  for insert with check (comp_can_access_assessment(assessment_id) and uploaded_by_candidate = false);

drop policy if exists "comp_attachments_delete" on comp_attachments;
create policy "comp_attachments_delete" on comp_attachments
  for delete using (comp_can_access_assessment(assessment_id));

create index if not exists idx_comp_panelists_assessment on comp_panelists (assessment_id);
create index if not exists idx_comp_panelist_scores_assessment on comp_panelist_scores (assessment_id);
create index if not exists idx_comp_attachments_assessment on comp_attachments (assessment_id);

-- ----------------------------------------------------------------------------
-- Candidate self-service: three SECURITY DEFINER RPC functions are the only
-- way an unauthenticated candidate (holding the self_service_token link) can
-- read or write anything. They deliberately expose/accept only candidate-owned
-- profile fields — never the interview questions, scores, or any other
-- candidate's row — so granting execute to anon cannot be used to read or
-- modify anything beyond "my own profile, given my own link".
-- ----------------------------------------------------------------------------

-- Both functions below have changed shape more than once — new OUT columns for _get, new
-- parameters for _submit — and Postgres cannot CREATE OR REPLACE across either change (it refuses
-- the return-type change outright, and a changed parameter list would leave the old _submit behind
-- as a stale overload instead of replacing it). Every prior signature this function has ever had is
-- dropped first, so this file stays re-runnable no matter which shape is currently live. Safe: these
-- are stateless SQL functions, no data lives in them.
drop function if exists comp_self_service_get(uuid);
drop function if exists comp_self_service_submit(uuid, text, text, text, text, numeric, numeric, text, jsonb, jsonb, jsonb, text);
drop function if exists comp_self_service_submit(uuid, text, text, text, text, int, boolean, text, numeric, numeric, text, jsonb, jsonb, jsonb, text);

create or replace function comp_self_service_get(p_token uuid)
returns table (
  id uuid,
  candidate_name text,
  candidate_position text,
  candidate_national_id text,
  candidate_phone text,
  candidate_email text,
  candidate_birth_date date,
  candidate_age int,
  has_disability boolean,
  disability_note text,
  years_experience_total numeric,
  years_experience_pipeline numeric,
  current_employer text,
  education jsonb,
  employment_history jsonb,
  certifications jsonb,
  notable_projects text,
  self_service_status text
) as $$
  select a.id, a.candidate_name, a.candidate_position, a.candidate_national_id, a.candidate_phone, a.candidate_email,
         a.candidate_birth_date, a.candidate_age, a.has_disability, a.disability_note,
         a.years_experience_total, a.years_experience_pipeline, a.current_employer,
         a.education, a.employment_history, a.certifications, a.notable_projects, a.self_service_status
  from comp_assessments a
  where a.self_service_token = p_token;
$$ language sql security definer stable;

create or replace function comp_self_service_submit(
  p_token uuid,
  p_candidate_name text,
  p_candidate_national_id text,
  p_candidate_phone text,
  p_candidate_email text,
  p_candidate_birth_date date,
  p_candidate_age int,
  p_has_disability boolean,
  p_disability_note text,
  p_years_experience_total numeric,
  p_years_experience_pipeline numeric,
  p_current_employer text,
  p_education jsonb,
  p_employment_history jsonb,
  p_certifications jsonb,
  p_notable_projects text
)
returns void as $$
  update comp_assessments set
    candidate_name = coalesce(nullif(p_candidate_name, ''), candidate_name),
    candidate_national_id = p_candidate_national_id,
    candidate_phone = p_candidate_phone,
    candidate_email = p_candidate_email,
    candidate_birth_date = p_candidate_birth_date,
    candidate_age = p_candidate_age,
    has_disability = p_has_disability,
    disability_note = p_disability_note,
    years_experience_total = p_years_experience_total,
    years_experience_pipeline = p_years_experience_pipeline,
    current_employer = p_current_employer,
    education = p_education,
    employment_history = p_employment_history,
    certifications = p_certifications,
    notable_projects = coalesce(nullif(p_notable_projects, ''), notable_projects),
    self_service_status = 'submitted'
  where self_service_token = p_token;
$$ language sql security definer;

create or replace function comp_self_service_add_attachment(p_token uuid, p_kind text, p_file_name text, p_storage_path text)
returns void as $$
  insert into comp_attachments (assessment_id, kind, file_name, storage_path, uploaded_by, uploaded_by_candidate)
  select a.id, p_kind, p_file_name, p_storage_path, null, true
  from comp_assessments a where a.self_service_token = p_token;
$$ language sql security definer;

-- Lets the self-service page show a candidate their own already-uploaded documents after a reload
-- (previously tracked only in unpersisted React state, so a closed/reopened tab always looked
-- empty even though the files were saved correctly all along). Scoped by the same unguessable
-- token as every other comp_self_service_* function — never exposes another candidate's rows.
create or replace function comp_self_service_list_attachments(p_token uuid)
returns table (id uuid, kind text, file_name text, created_at timestamptz) as $$
  select att.id, att.kind, att.file_name, att.created_at
  from comp_attachments att
  join comp_assessments a on a.id = att.assessment_id
  where a.self_service_token = p_token
  order by att.created_at desc;
$$ language sql security definer stable;

grant execute on function comp_self_service_get(uuid) to anon, authenticated;
grant execute on function comp_self_service_submit(uuid, text, text, text, text, date, int, boolean, text, numeric, numeric, text, jsonb, jsonb, jsonb, text) to anon, authenticated;
grant execute on function comp_self_service_add_attachment(uuid, text, text, text) to anon, authenticated;
grant execute on function comp_self_service_list_attachments(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Storage bucket for candidate documents. Staff read/write is gated by the
-- same comp_can_access_assessment() check as the tables above (folder = the
-- assessment id). Candidate self-service uploads go through a second, narrower
-- policy: the object path must be "<assessment id>/<token>/<file>" and the
-- token segment must match that exact assessment's self_service_token, so
-- holding one candidate's link can never write into another candidate's folder.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('comp-docs', 'comp-docs', false)
on conflict (id) do nothing;

drop policy if exists "comp_docs_read_staff" on storage.objects;
create policy "comp_docs_read_staff" on storage.objects
  for select using (
    bucket_id = 'comp-docs'
    and comp_can_access_assessment(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "comp_docs_write_staff" on storage.objects;
create policy "comp_docs_write_staff" on storage.objects
  for insert with check (
    bucket_id = 'comp-docs'
    and comp_can_access_assessment(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "comp_docs_delete_staff" on storage.objects;
create policy "comp_docs_delete_staff" on storage.objects
  for delete using (
    bucket_id = 'comp-docs'
    and comp_can_access_assessment(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "comp_docs_write_candidate" on storage.objects;
create policy "comp_docs_write_candidate" on storage.objects
  for insert to anon with check (
    bucket_id = 'comp-docs'
    and exists (
      select 1 from comp_assessments a
      where a.id::text = (storage.foldername(name))[1]
        and a.self_service_token::text = (storage.foldername(name))[2]
    )
  );

insert into rasta_modules (key, label_fa) values
  ('competency', 'ارزیابی شایستگی')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Public results link: a second, separate unguessable token (results_share_token,
-- never self_service_token) lets the interview lead send a read-only "view results
-- online" link to anyone — HR, a stakeholder, the candidate — without a RASTA
-- login. Kept as its own token so a leaked results link can never be used to
-- submit/overwrite the candidate's self-service profile, and vice versa.
--
-- comp_public_results_get is the ONLY way that link can read anything, and it
-- deliberately returns just the scored result: no interviewer/panelist identity
-- (comp_panelists and comp_panelist_scores are never touched here — the panel
-- roster and each panelist's own scoring pass stay staff-only) and no candidate
-- contact/personal-profile fields (phone, email, national id, employer,
-- education, certifications, photo). Granting execute to anon therefore cannot
-- be used to read anything beyond one candidate's result, given that exact link.
-- ----------------------------------------------------------------------------

alter table comp_assessments add column if not exists results_share_token uuid not null default gen_random_uuid();
create unique index if not exists idx_comp_assessments_results_share_token on comp_assessments (results_share_token);

-- comp_public_results_get predates the multi-role DB-backed question bank and originally only ever
-- worked for project_manager (whose domain scores are computed purely from comp_assessments.answers
-- keyed by fixed in-code question keys). For every other role, answers are keyed by
-- comp_question_bank UUIDs, and the public page had no way to resolve a question's category (needed
-- to bucket it into a domain) without bank access — which an anonymous public-link visitor must
-- never get (reference answers etc. stay evaluator-only). Fixed (Section 38 below) by having the RPC
-- resolve each selected question's OFFICIAL score (the panel's average across every submitted
-- panelist, falling back to the lead's own answers only when nobody has submitted — same rule as
-- resolveOfficialAnswers on the client) together with just its category into `resolved_questions`;
-- the client then runs the exact same computeCategoryScores() bucket logic used everywhere else in
-- the app on that minimal, non-sensitive data.
drop function if exists comp_public_results_get(uuid);
create or replace function comp_public_results_get(p_token uuid)
returns table (
  id uuid,
  candidate_name text,
  candidate_position text,
  job_role text,
  interview_date date,
  status text,
  answers jsonb,
  capstone_score int,
  capstone_note text,
  education_score numeric,
  experience_score numeric,
  pm_training_score numeric,
  pm_certification_score numeric,
  is_approved boolean,
  strengths text,
  development_areas text,
  resolved_questions jsonb,
  photo_url text
) as $$
declare
  v_assessment comp_assessments%rowtype;
  v_has_submitted boolean;
  v_resolved_questions jsonb;
begin
  select * into v_assessment from comp_assessments a where a.results_share_token = p_token;
  if not found then
    return;
  end if;

  -- A Project Manager candidate can now go through either the fixed in-code rubric (legacy,
  -- selected_question_ids empty) or the DB-backed question bank (selected_question_ids populated,
  -- exactly like every other role) — see usesLegacyPmRubric on the client. Branch on that instead of
  -- job_role so a bank-driven PM assessment gets its resolved_questions just like any other role.
  if jsonb_array_length(v_assessment.selected_question_ids) = 0 then
    v_resolved_questions := '[]'::jsonb;
  else
    select exists(
      select 1 from comp_panelist_scores ps where ps.assessment_id = v_assessment.id and ps.submitted_at is not null
    ) into v_has_submitted;

    select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'category', q.category, 'score', official.score)), '[]'::jsonb)
    into v_resolved_questions
    from comp_question_bank q
    cross join lateral (
      select case
        when v_has_submitted then (
          select avg((ps.answers -> q.id::text ->> 'score')::numeric)
          from comp_panelist_scores ps
          where ps.assessment_id = v_assessment.id
            and ps.submitted_at is not null
            and (ps.answers -> q.id::text ->> 'score') is not null
        )
        else (v_assessment.answers -> q.id::text ->> 'score')::numeric
      end as score
    ) official
    where q.id::text in (select jsonb_array_elements_text(v_assessment.selected_question_ids));
  end if;

  return query select
    v_assessment.id, v_assessment.candidate_name, v_assessment.candidate_position, v_assessment.job_role,
    v_assessment.interview_date, v_assessment.status, v_assessment.answers,
    v_assessment.capstone_score, v_assessment.capstone_note,
    v_assessment.education_score, v_assessment.experience_score, v_assessment.pm_training_score, v_assessment.pm_certification_score,
    v_assessment.is_approved, v_assessment.strengths, v_assessment.development_areas, v_resolved_questions,
    v_assessment.photo_url;
end;
$$ language plpgsql security definer stable;

grant execute on function comp_public_results_get(uuid) to anon, authenticated;

-- The public results page may also show the candidate's photo. photo_url is never embedded with
-- results_share_token the way self-service uploads embed self_service_token in their storage path
-- (see comp_docs_insert_self_service above), so an equivalent "path contains the right token" storage
-- policy isn't possible here. Instead this scopes anon read to exactly the objects that are some
-- assessment's *official* photo_url — resumes/certifications/national-ID docs are never stored in
-- that column, so this can never expose them, regardless of which assessment's results_share_token
-- a visitor holds.
drop policy if exists "comp_docs_read_public_photo" on storage.objects;
create policy "comp_docs_read_public_photo" on storage.objects
  for select to anon using (
    bucket_id = 'comp-docs'
    and exists (select 1 from comp_assessments a where a.photo_url = name)
  );

-- ----------------------------------------------------------------------------
-- 17. RASTA Access Control — real module gating (completes section 13, which
--     was deliberately left non-enforcing). Two gaps fixed here:
--
--     1. rasta_modules was missing 4 real modules (executive/finance/material/
--        pipelinedigitaltwin) added since section 13 was written, and the
--        one-time action seed for rasta_permissions never re-ran for those or
--        for 'competency' (added later, above) — re-running it here is a
--        no-op for modules it already covered, thanks to on conflict do nothing.
--
--     2. A new, deliberately simple per-user × per-module access switch:
--        rasta_user_module_access. This is NOT a replacement for the
--        roles/permissions/scope model above (still there, unused by the
--        app, untouched) — it's a separate, minimal boolean gate that
--        actually IS consulted by the client now (ModuleHub + RootApp),
--        because "can this user even open this module" needed to be a fact
--        the app can check, not just data an admin screen can edit.
--
--        Design: NO ROW = full access. An admin restricts a user by
--        inserting an explicit has_access=false row; removing that row (or
--        setting it back to true) restores access. This means every
--        existing user, and every future new user, keeps full access to
--        every module by default with zero migration/backfill needed —
--        access only narrows when an admin explicitly acts.
-- ----------------------------------------------------------------------------

insert into rasta_modules (key, label_fa) values
  ('executive', 'مدیریت سبد پروژه‌ها'),
  ('finance', 'مدیریت مالی پروژه'),
  ('material', 'مدیریت تامین کالا'),
  ('pipelinedigitaltwin', 'دوقلوی دیجیتال خط لوله')
on conflict (key) do nothing;

-- Added later (Project Cost Estimator module) — kept in this same block so a fresh database
-- only needs to run this file once; on conflict do nothing makes it safe to also re-run on an
-- existing database that already has the earlier rows.
insert into rasta_modules (key, label_fa) values
  ('estimator', 'برآورد هزینه پروژه')
on conflict (key) do nothing;

insert into rasta_permissions (module_key, action)
select m.key, a.action
from rasta_modules m
cross join (values ('view'), ('create'), ('edit'), ('delete'), ('submit'), ('review'), ('approve'), ('reject'), ('export'), ('configure')) as a(action)
on conflict (module_key, action) do nothing;

create table if not exists rasta_user_module_access (
  user_id uuid not null references profiles (id) on delete cascade,
  module_key text not null references rasta_modules (key) on delete cascade,
  has_access boolean not null default true,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now(),
  primary key (user_id, module_key)
);

alter table rasta_user_module_access enable row level security;
drop policy if exists "rasta_user_module_access_select_self_or_admin" on rasta_user_module_access;
create policy "rasta_user_module_access_select_self_or_admin" on rasta_user_module_access
  for select using (is_admin_user() or user_id = auth.uid());
drop policy if exists "rasta_user_module_access_write_admin" on rasta_user_module_access;
create policy "rasta_user_module_access_write_admin" on rasta_user_module_access
  for all using (is_admin_user()) with check (is_admin_user());

create index if not exists idx_rasta_user_module_access_user on rasta_user_module_access (user_id);

-- Admins always get every active module (never lockable via this switch, so an admin can never
-- accidentally lock themselves — or another admin — out of the platform).
drop function if exists rasta_my_accessible_modules();
create or replace function rasta_my_accessible_modules()
returns table (module_key text) as $$
  select m.key
  from rasta_modules m
  where m.is_active
    and (
      is_admin_user()
      or not exists (
        select 1 from rasta_user_module_access a
        where a.user_id = auth.uid() and a.module_key = m.key and a.has_access = false
      )
    );
$$ language sql security definer stable;

grant execute on function rasta_my_accessible_modules() to authenticated;

-- ----------------------------------------------------------------------------
-- 18. Project Cost Estimator — project definitions + saved estimate history.
--     Ownership model is deliberately simple (unlike Risk/Material's multi-role
--     project membership): a cost estimate is personal working data, so RLS is
--     just "creator, or an admin". est_estimates is an append-only history —
--     every "محاسبه" the user runs is saved as a new row (never overwritten),
--     so a project can be re-priced over time without losing earlier runs.
-- ----------------------------------------------------------------------------

create table if not exists est_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  has_onshore boolean not null default true,
  has_offshore boolean not null default false,
  has_compressor_station boolean not null default false,
  tie_in_count integer not null default 0 check (tie_in_count >= 0),
  has_telecom_scada boolean not null default false,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table est_projects enable row level security;

drop policy if exists "est_projects_select_own" on est_projects;
create policy "est_projects_select_own" on est_projects
  for select using (created_by = auth.uid() or is_admin_user());
drop policy if exists "est_projects_insert_own" on est_projects;
create policy "est_projects_insert_own" on est_projects
  for insert with check (created_by = auth.uid());
drop policy if exists "est_projects_update_own" on est_projects;
create policy "est_projects_update_own" on est_projects
  for update using (created_by = auth.uid() or is_admin_user());
drop policy if exists "est_projects_delete_own" on est_projects;
create policy "est_projects_delete_own" on est_projects
  for delete using (created_by = auth.uid() or is_admin_user());

drop trigger if exists trg_set_updated_at on est_projects;
create trigger trg_set_updated_at before update on est_projects for each row execute function set_updated_at();

-- inputs/results are stored as JSONB snapshots (the full wizard spec and the full computed
-- breakdown at that moment) rather than a normalized column-per-field schema — mirrors how
-- EstimatorInputs/computeCBS already work client-side as one flat config/result object, and lets
-- the section-spec shape evolve without a migration every time a new option is added.
create table if not exists est_estimates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references est_projects (id) on delete cascade,
  label text not null default '',
  inputs jsonb not null,
  results jsonb not null,
  fx_rial_per_usd numeric not null default 0,
  grand_total_eur numeric not null default 0,
  grand_total_rial numeric not null default 0,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table est_estimates enable row level security;

drop policy if exists "est_estimates_select_own" on est_estimates;
create policy "est_estimates_select_own" on est_estimates
  for select using (
    exists (select 1 from est_projects p where p.id = project_id and (p.created_by = auth.uid() or is_admin_user()))
  );
drop policy if exists "est_estimates_insert_own" on est_estimates;
create policy "est_estimates_insert_own" on est_estimates
  for insert with check (
    created_by = auth.uid()
    and exists (select 1 from est_projects p where p.id = project_id and p.created_by = auth.uid())
  );
drop policy if exists "est_estimates_delete_own" on est_estimates;
create policy "est_estimates_delete_own" on est_estimates
  for delete using (
    exists (select 1 from est_projects p where p.id = project_id and (p.created_by = auth.uid() or is_admin_user()))
  );

create index if not exists idx_est_estimates_project on est_estimates (project_id, created_at desc);

-- Singleton assumptions row (Ministry-of-Petroleum-guideline default rates, overhead percentages,
-- and lifecycle durations) — every new calculation seeds from this instead of hardcoded client
-- constants once an admin has set it. The boolean primary key pinned to true is the standard
-- Postgres singleton-table trick: only one row can ever exist.
create table if not exists est_assumptions (
  id boolean primary key default true check (id),
  overhead jsonb not null,
  lifecycle jsonb not null,
  specs jsonb not null,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table est_assumptions enable row level security;

drop policy if exists "est_assumptions_select_all" on est_assumptions;
create policy "est_assumptions_select_all" on est_assumptions
  for select using (auth.uid() is not null);
drop policy if exists "est_assumptions_write_admin" on est_assumptions;
create policy "est_assumptions_write_admin" on est_assumptions
  for all using (is_admin_user()) with check (is_admin_user());

drop trigger if exists trg_set_updated_at on est_assumptions;
create trigger trg_set_updated_at before update on est_assumptions for each row execute function set_updated_at_and_by();

-- ============================================================================
-- 21. Project Lifecycle & Control Tower — stage/gate governance, master-plan
--     alignment, milestone tracking, readiness/health scoring and early warning
--     across the Portfolio -> Program(طرح/Plan) -> Project hierarchy.
--
--     DELIBERATELY NOT DUPLICATED (see the audit that preceded this section):
--       * The three-level hierarchy already exists as portfolios -> programs ->
--         master_projects. "Plan" in the request is the existing
--         `programs` (labelled «طرح» throughout the UI); no parallel hierarchy is
--         created here and every plc_* row hangs off master_projects.id.
--       * Actions already exist as rasta_actions (owner/due/priority/status/
--         source + risk and issue links). Rather than a second action table this
--         section only ADDS two nullable link columns to it, so the Reporting
--         module's Decision Center and this module's Control Tower read and write
--         the same action rows.
--       * Risk and Issue stay in rm_* / im_* and are reached through
--         rasta_project_mappings, exactly like every other module does.
--
--     master_projects.status (idea/planning/executing/...) is intentionally left
--     alone: it is a coarse label other modules already read. The governed stage —
--     the one with gates, readiness and an audit trail — lives in
--     plc_project_lifecycle.current_stage_key so neither concept fights the other.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 21a. Template engine — an admin defines stages/gates/checklists once per
--      project type ("Pipeline EPC", "Station", "Building"), and instantiating a
--      template onto a project copies them into the plc_project_* tables. Copying
--      rather than referencing is deliberate: editing a template must never
--      retroactively rewrite the governance record of a project already running.
-- ---------------------------------------------------------------------------

create table if not exists plc_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  project_type text not null default '',
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table plc_templates enable row level security;
drop policy if exists "plc_templates_select_authenticated" on plc_templates;
create policy "plc_templates_select_authenticated" on plc_templates
  for select using (auth.uid() is not null);
drop policy if exists "plc_templates_write_admin" on plc_templates;
create policy "plc_templates_write_admin" on plc_templates
  for all using (is_admin_user()) with check (is_admin_user());

create table if not exists plc_template_stages (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references plc_templates (id) on delete cascade,
  stage_key text not null,
  name_fa text not null,
  name_en text not null default '',
  sequence smallint not null default 0,
  typical_duration_months numeric,
  gate_name text not null default '',
  gate_readiness_threshold smallint not null default 100 check (gate_readiness_threshold between 0 and 100),
  created_at timestamptz not null default now(),
  unique (template_id, stage_key)
);

alter table plc_template_stages enable row level security;
drop policy if exists "plc_template_stages_select_authenticated" on plc_template_stages;
create policy "plc_template_stages_select_authenticated" on plc_template_stages
  for select using (auth.uid() is not null);
drop policy if exists "plc_template_stages_write_admin" on plc_template_stages;
create policy "plc_template_stages_write_admin" on plc_template_stages
  for all using (is_admin_user()) with check (is_admin_user());

create table if not exists plc_template_checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_stage_id uuid not null references plc_template_stages (id) on delete cascade,
  category text not null default 'general',
  title text not null,
  is_mandatory boolean not null default true,
  requires_document boolean not null default false,
  requires_approval boolean not null default false,
  guidance text not null default '',
  sequence smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table plc_template_checklist_items enable row level security;
drop policy if exists "plc_template_checklist_select_authenticated" on plc_template_checklist_items;
create policy "plc_template_checklist_select_authenticated" on plc_template_checklist_items
  for select using (auth.uid() is not null);
drop policy if exists "plc_template_checklist_write_admin" on plc_template_checklist_items;
create policy "plc_template_checklist_write_admin" on plc_template_checklist_items
  for all using (is_admin_user()) with check (is_admin_user());

-- ---------------------------------------------------------------------------
-- 21b. Per-project lifecycle state.
-- ---------------------------------------------------------------------------

create table if not exists plc_project_lifecycle (
  project_id uuid primary key references master_projects (id) on delete cascade,
  template_id uuid references plc_templates (id) on delete set null,
  current_stage_key text not null default 'idea',
  stage_entered_at date,
  -- Overall health is normally derived from plc_health_scores; an authorised
  -- manager may override it, but only with a reason recorded alongside.
  health_override text check (health_override in ('green', 'yellow', 'red', 'black')),
  health_override_reason text not null default '',
  health_override_by uuid references profiles (id),
  health_override_at timestamptz,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table plc_project_lifecycle enable row level security;
drop policy if exists "plc_project_lifecycle_select_authenticated" on plc_project_lifecycle;
create policy "plc_project_lifecycle_select_authenticated" on plc_project_lifecycle
  for select using (auth.uid() is not null);
drop policy if exists "plc_project_lifecycle_write_authenticated" on plc_project_lifecycle;
create policy "plc_project_lifecycle_write_authenticated" on plc_project_lifecycle
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create table if not exists plc_project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  stage_key text not null,
  name_fa text not null,
  sequence smallint not null default 0,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'skipped')),
  planned_start date,
  planned_finish date,
  actual_start date,
  actual_finish date,
  forecast_finish date,
  progress smallint not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, stage_key)
);

alter table plc_project_stages enable row level security;
drop policy if exists "plc_project_stages_select_authenticated" on plc_project_stages;
create policy "plc_project_stages_select_authenticated" on plc_project_stages
  for select using (auth.uid() is not null);
drop policy if exists "plc_project_stages_write_authenticated" on plc_project_stages;
create policy "plc_project_stages_write_authenticated" on plc_project_stages
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- A gate is the controlled exit from a stage. Readiness % is computed by the
-- client engine from the checklist, but the *decision* (approved/rejected) and
-- any override of an unmet requirement are stored here so they survive a
-- recalculation and remain auditable.
create table if not exists plc_project_gates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  stage_key text not null,
  name text not null,
  gate_owner_id uuid references profiles (id),
  readiness_threshold smallint not null default 100 check (readiness_threshold between 0 and 100),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'ready', 'approved', 'rejected', 'blocked')),
  approval_date date,
  approved_by uuid references profiles (id),
  comments text not null default '',
  -- Override = passing a gate whose mandatory requirements are not all met.
  -- Never allowed silently: user, timestamp and reason are all required by the UI
  -- and kept here as the permanent record.
  override_by uuid references profiles (id),
  override_reason text not null default '',
  override_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, stage_key)
);

alter table plc_project_gates enable row level security;
drop policy if exists "plc_project_gates_select_authenticated" on plc_project_gates;
create policy "plc_project_gates_select_authenticated" on plc_project_gates
  for select using (auth.uid() is not null);
drop policy if exists "plc_project_gates_write_authenticated" on plc_project_gates;
create policy "plc_project_gates_write_authenticated" on plc_project_gates
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create table if not exists plc_checklist_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  stage_key text not null,
  category text not null default 'general',
  title text not null,
  is_mandatory boolean not null default true,
  requires_document boolean not null default false,
  requires_approval boolean not null default false,
  responsible_id uuid references profiles (id),
  due_date date,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'waived')),
  completion_date date,
  evidence_url text not null default '',
  evidence_label text not null default '',
  comment text not null default '',
  guidance text not null default '',
  sequence smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plc_checklist_items enable row level security;
drop policy if exists "plc_checklist_items_select_authenticated" on plc_checklist_items;
create policy "plc_checklist_items_select_authenticated" on plc_checklist_items
  for select using (auth.uid() is not null);
drop policy if exists "plc_checklist_items_write_authenticated" on plc_checklist_items;
create policy "plc_checklist_items_write_authenticated" on plc_checklist_items
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create index if not exists idx_plc_checklist_project_stage on plc_checklist_items (project_id, stage_key);

-- ---------------------------------------------------------------------------
-- 21c. Master plan — activities and milestones with the baseline / forecast /
--      actual triad the whole variance story rests on.
-- ---------------------------------------------------------------------------

create table if not exists plc_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  wbs_code text not null default '',
  name text not null,
  stage_key text not null default '',
  baseline_start date,
  baseline_finish date,
  forecast_start date,
  forecast_finish date,
  actual_start date,
  actual_finish date,
  progress smallint not null default 0 check (progress between 0 and 100),
  owner_id uuid references profiles (id),
  is_critical boolean not null default false,
  depends_on_id uuid references plc_activities (id) on delete set null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'on_hold')),
  sequence smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plc_activities enable row level security;
drop policy if exists "plc_activities_select_authenticated" on plc_activities;
create policy "plc_activities_select_authenticated" on plc_activities
  for select using (auth.uid() is not null);
drop policy if exists "plc_activities_write_authenticated" on plc_activities;
create policy "plc_activities_write_authenticated" on plc_activities
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create index if not exists idx_plc_activities_project on plc_activities (project_id, sequence);

create table if not exists plc_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  name text not null,
  milestone_type text not null default 'project' check (milestone_type in ('contractual', 'project', 'gate', 'payment', 'regulatory', 'external')),
  stage_key text not null default '',
  baseline_date date,
  forecast_date date,
  actual_date date,
  is_critical boolean not null default false,
  owner_id uuid references profiles (id),
  depends_on_id uuid references plc_milestones (id) on delete set null,
  status text not null default 'on_track' check (status in ('achieved', 'on_track', 'at_risk', 'delayed', 'blocked')),
  evidence_url text not null default '',
  evidence_label text not null default '',
  comments text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plc_milestones enable row level security;
drop policy if exists "plc_milestones_select_authenticated" on plc_milestones;
create policy "plc_milestones_select_authenticated" on plc_milestones
  for select using (auth.uid() is not null);
drop policy if exists "plc_milestones_write_authenticated" on plc_milestones;
create policy "plc_milestones_write_authenticated" on plc_milestones
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create index if not exists idx_plc_milestones_project on plc_milestones (project_id);

-- Every forecast_date change is appended here. This is what makes drift
-- detectable: a milestone sitting at "+5 days" is a variance, but one that went
-- +5 -> +8 -> +12 -> +17 over four reporting cycles is a trend, and only the
-- trend justifies an early warning.
create table if not exists plc_milestone_forecast_history (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references plc_milestones (id) on delete cascade,
  forecast_date date,
  variance_days integer not null default 0,
  note text not null default '',
  recorded_by uuid references profiles (id) default auth.uid(),
  recorded_at timestamptz not null default now()
);

alter table plc_milestone_forecast_history enable row level security;
drop policy if exists "plc_ms_history_select_authenticated" on plc_milestone_forecast_history;
create policy "plc_ms_history_select_authenticated" on plc_milestone_forecast_history
  for select using (auth.uid() is not null);
drop policy if exists "plc_ms_history_insert_authenticated" on plc_milestone_forecast_history;
create policy "plc_ms_history_insert_authenticated" on plc_milestone_forecast_history
  for insert with check (auth.uid() is not null);

create index if not exists idx_plc_ms_history_milestone on plc_milestone_forecast_history (milestone_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- 21d. Health, warnings, audit.
-- ---------------------------------------------------------------------------

create table if not exists plc_health_scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  dimension text not null check (dimension in (
    'schedule', 'cost', 'engineering', 'procurement', 'construction',
    'quality', 'hse', 'risk', 'contract', 'cashflow'
  )),
  score smallint not null default 100 check (score between 0 and 100),
  status text not null default 'green' check (status in ('green', 'yellow', 'red', 'black')),
  trend text not null default 'flat' check (trend in ('improving', 'flat', 'worsening')),
  explanation text not null default '',
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now(),
  unique (project_id, dimension)
);

alter table plc_health_scores enable row level security;
drop policy if exists "plc_health_select_authenticated" on plc_health_scores;
create policy "plc_health_select_authenticated" on plc_health_scores
  for select using (auth.uid() is not null);
drop policy if exists "plc_health_write_authenticated" on plc_health_scores;
create policy "plc_health_write_authenticated" on plc_health_scores
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create table if not exists plc_early_warnings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  trigger_key text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  title text not null,
  detail text not null default '',
  responsible_id uuid references profiles (id),
  required_action text not null default '',
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'dismissed')),
  related_milestone_id uuid references plc_milestones (id) on delete set null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plc_early_warnings enable row level security;
drop policy if exists "plc_warnings_select_authenticated" on plc_early_warnings;
create policy "plc_warnings_select_authenticated" on plc_early_warnings
  for select using (auth.uid() is not null);
drop policy if exists "plc_warnings_write_authenticated" on plc_early_warnings;
create policy "plc_warnings_write_authenticated" on plc_early_warnings
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create index if not exists idx_plc_warnings_project on plc_early_warnings (project_id, status);

-- Governance events only (stage moves, gate decisions, baseline/forecast edits,
-- health overrides) — not a generic row-diff log. Append-only by policy: there is
-- no update or delete policy, so even an admin cannot rewrite the trail.
create table if not exists plc_audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  event text not null,
  field text not null default '',
  old_value text not null default '',
  new_value text not null default '',
  reason text not null default '',
  changed_by uuid references profiles (id) default auth.uid(),
  changed_at timestamptz not null default now()
);

alter table plc_audit_log enable row level security;
drop policy if exists "plc_audit_select_authenticated" on plc_audit_log;
create policy "plc_audit_select_authenticated" on plc_audit_log
  for select using (auth.uid() is not null);
drop policy if exists "plc_audit_insert_authenticated" on plc_audit_log;
create policy "plc_audit_insert_authenticated" on plc_audit_log
  for insert with check (auth.uid() is not null);

create index if not exists idx_plc_audit_project on plc_audit_log (project_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- 21e. Integration with the EXISTING action table rather than a second one.
-- ---------------------------------------------------------------------------

alter table rasta_actions add column if not exists related_milestone_id uuid references plc_milestones (id) on delete set null;
alter table rasta_actions add column if not exists related_gate_id uuid references plc_project_gates (id) on delete set null;
alter table rasta_actions add column if not exists completion_pct smallint not null default 0 check (completion_pct between 0 and 100);
alter table rasta_actions add column if not exists closed_date date;

-- 'lifecycle' joins the existing source list so a Control Tower action is
-- distinguishable from one raised in the Decision Center.
alter table rasta_actions drop constraint if exists rasta_actions_source_check;
alter table rasta_actions add constraint rasta_actions_source_check
  check (source in ('risk', 'issue', 'decision', 'management_report', 'lifecycle', 'milestone', 'gate'));

-- The module registry row + its permission set (the cross-join re-seed in
-- section 17 covers the actions once the module key exists).
insert into rasta_modules (key, label_fa) values
  ('lifecycle', 'چرخه عمر و برج کنترل پروژه')
on conflict (key) do nothing;

insert into rasta_permissions (module_key, action)
select m.key, a.action
from rasta_modules m
cross join (values ('view'), ('create'), ('edit'), ('delete'), ('submit'), ('review'), ('approve'), ('reject'), ('export'), ('configure')) as a(action)
on conflict (module_key, action) do nothing;

do $$
declare
  t text;
begin
  foreach t in array array[
    'plc_templates', 'plc_project_lifecycle', 'plc_project_stages', 'plc_project_gates',
    'plc_checklist_items', 'plc_activities', 'plc_milestones', 'plc_health_scores', 'plc_early_warnings'
  ] loop
    execute format('drop trigger if exists trg_set_updated_at on %I', t);
    execute format('create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 21f. Evidence storage for checklist items that carry requires_document.
--
--      Mirrors the finance-docs bucket, with one deliberate difference: write is
--      authenticated rather than admin-only. A checklist item is completed by the
--      project member who did the work, not by an administrator, so gating upload
--      on is_admin_user() would leave the mandatory-evidence gap it is meant to
--      close. Read stays authenticated-only — these are internal governance
--      records, never public. Objects are keyed `${projectId}/${uuid}.${ext}`.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('plc-docs', 'plc-docs', false)
on conflict (id) do nothing;

drop policy if exists "plc_docs_read_authenticated" on storage.objects;
create policy "plc_docs_read_authenticated" on storage.objects
  for select using (bucket_id = 'plc-docs' and auth.uid() is not null);

drop policy if exists "plc_docs_write_authenticated" on storage.objects;
create policy "plc_docs_write_authenticated" on storage.objects
  for insert with check (bucket_id = 'plc-docs' and auth.uid() is not null);

drop policy if exists "plc_docs_update_authenticated" on storage.objects;
create policy "plc_docs_update_authenticated" on storage.objects
  for update using (bucket_id = 'plc-docs' and auth.uid() is not null);

-- Delete stays admin-only: evidence backing an approved gate is part of the
-- audit trail, so removing it is a governance act, not routine housekeeping.
drop policy if exists "plc_docs_delete_admin" on storage.objects;
create policy "plc_docs_delete_admin" on storage.objects
  for delete using (bucket_id = 'plc-docs' and is_admin_user());

-- ---------------------------------------------------------------------------
-- 21g. Control Tower -> Issue Management bridge. An overdue rasta_actions row
--      (raised in the lifecycle module, e.g. an overdue checklist/gate action)
--      can be converted, in place, into a real im_issues row in the project's
--      mapped Issue Management project — carrying its own pursuer + deadline
--      chosen at conversion time, rather than the action's original owner/due
--      date. im_issues.related_action_id points back so the Control Tower can
--      show "already converted" and avoid duplicate conversions; rasta_actions
--      already had related_issue_id (section 17c) so the link is bidirectional.
-- ---------------------------------------------------------------------------

alter table im_issues add column if not exists source text not null default 'manual';
alter table im_issues drop constraint if exists im_issues_source_check;
alter table im_issues add constraint im_issues_source_check
  check (source in ('manual', 'lifecycle_action'));

alter table im_issues add column if not exists related_action_id uuid references rasta_actions (id) on delete set null;

create index if not exists idx_im_issues_related_action on im_issues (related_action_id) where related_action_id is not null;

-- SECURITY DEFINER: an ordinary Control Tower user is very unlikely to also be
-- an im_issues project member (im_issues_insert_member requires
-- im_is_project_member), so a plain client-side insert would be denied by RLS
-- for exactly the users this feature is for. The function re-checks access to
-- the *master* project itself (same helper the rest of section 17c/21 uses)
-- before writing, so it never becomes an open door.
create or replace function rasta_convert_action_to_issue(
  p_action_id uuid,
  p_pursuer_id uuid,
  p_deadline_days smallint default 3
)
returns uuid as $$
declare
  v_action rasta_actions%rowtype;
  v_im_project_id uuid;
  v_issue_id uuid;
begin
  select * into v_action from rasta_actions where id = p_action_id;
  if not found then
    raise exception 'action not found';
  end if;

  if not rasta_user_can_access_master_project(v_action.master_project_id) then
    raise exception 'not authorized for this project';
  end if;

  if v_action.related_issue_id is not null then
    raise exception 'action already converted to an issue';
  end if;

  select source_project_id into v_im_project_id
  from rasta_project_mappings
  where master_project_id = v_action.master_project_id
    and source_module = 'issues'
    and status = 'confirmed'
  limit 1;

  if v_im_project_id is null then
    raise exception 'no confirmed Issue Management project is linked to this project yet';
  end if;

  if p_deadline_days is null or p_deadline_days <= 0 then
    p_deadline_days := 3;
  end if;

  insert into im_issues (project_id, title, description, pursuer_id, priority, deadline_days, status, created_by, source, related_action_id)
  values (
    v_im_project_id,
    v_action.title,
    'ایجاد شده خودکار از یک اقدام دیرکرد شده در برج کنترل پروژه.',
    p_pursuer_id,
    v_action.priority,
    p_deadline_days,
    'open',
    auth.uid(),
    'lifecycle_action',
    p_action_id
  )
  returning id into v_issue_id;

  update rasta_actions set related_issue_id = v_issue_id, updated_at = now() where id = p_action_id;

  return v_issue_id;
end;
$$ language plpgsql security definer set search_path = public;

-- =====================================================================
-- Section 24: Change Management — the Project Radar sidebar's "Change
-- Management" module. Rebuilt (2026-08) into a full EPC change-control
-- workflow: Draft -> Submitted -> Engineering Review -> Planning Review ->
-- Contract Review -> PM Review -> CCB Approval -> Approved/Rejected ->
-- Implementation -> Verification -> Closed. Tables key on
-- master_projects.id directly (same convention as fin_contracts/plc_* —
-- no per-module project-space or mapping row needed).
--
-- chg_change_requests: the core record + contractor-submitted financial/
--   schedule proposal. Percent-of-contract/duration figures are always
--   derived at read time (never stored), so they can't go stale.
-- chg_stage_reviews: one row per (change, stage) — the review/decision
--   for Engineering, Planning, Contract, PM and CCB. Stage-specific fields
--   (affected drawings, contractual basis, CCB meeting no., ...) live in
--   `details` jsonb, same "shape varies by type" pattern the Risk module
--   already uses for strategy_details, rather than dozens of nullable
--   columns most rows would never use.
-- chg_documents: lightweight document register (metadata only for now —
--   file_url accepts a link/reference; binary upload is a later add-on,
--   same storage-bucket pattern PLC's evidence upload already uses).
-- chg_history: append-only activity log powering the Change History
--   timeline — the application writes one row per submission/decision,
--   mirroring the PLC module's own writeAudit() fire-and-forget pattern.
-- =====================================================================

insert into rasta_project_roles (name, is_system) values
  ('مجری', true),
  ('مدیرعامل', true),
  ('مدیر مهندسی', true),
  ('مدیر برنامه‌ریزی و کنترل پروژه', true),
  ('مدیر امور پیمان', true),
  ('عضو کمیته کنترل تغییرات', true)
on conflict (name) do nothing;

drop table if exists chg_history cascade;
drop table if exists chg_documents cascade;
drop table if exists chg_stage_reviews cascade;
drop table if exists chg_change_requests cascade;

create sequence if not exists chg_cr_seq;

create table chg_change_requests (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  cr_number text not null default ('CR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('chg_cr_seq')::text, 4, '0')),
  title text not null default '',
  description text not null default '',
  reason_for_change text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),

  -- Financial proposal (currency snapshotted at submission so the record's
  -- own history never drifts if the linked contract's currency changes later).
  currency text not null default 'IRR',
  original_contract_amount numeric not null default 0,
  proposed_change_amount numeric not null default 0,
  approved_change_amount numeric,

  -- Schedule proposal
  original_duration_days integer not null default 0,
  proposed_schedule_impact_days integer not null default 0,
  approved_schedule_impact_days integer,

  -- Risk / scope (new_risks_count is informational until real Risk-module
  -- linkage is built — see the module's own scoping notes)
  new_risks_count integer not null default 0,
  scope_impact_level text not null default 'medium' check (scope_impact_level in ('low', 'medium', 'high', 'critical')),

  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'engineering_review', 'planning_review', 'contract_review',
    'pm_review', 'ccb_review', 'approved', 'rejected', 'implementation', 'verification', 'closed'
  )),

  submitted_by uuid references profiles (id),
  submitted_at timestamptz,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_set_updated_at on chg_change_requests;
create trigger trg_set_updated_at before update on chg_change_requests for each row execute function set_updated_at_and_by();

alter table chg_change_requests enable row level security;
create policy "chg_change_requests_select_authenticated" on chg_change_requests for select using (auth.uid() is not null);
create policy "chg_change_requests_write_admin" on chg_change_requests for all using (is_admin_user()) with check (is_admin_user());

create table chg_stage_reviews (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references chg_change_requests (id) on delete cascade,
  stage text not null check (stage in ('engineering', 'planning', 'contract', 'pm', 'ccb')),
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'approved_with_conditions', 'rejected', 'request_revision', 'returned')),
  responsible_user_id uuid references profiles (id),
  reviewer_user_id uuid references profiles (id),
  approver_user_id uuid references profiles (id),
  comment text not null default '',
  details jsonb not null default '{}'::jsonb,
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (change_request_id, stage)
);

drop trigger if exists trg_set_updated_at on chg_stage_reviews;
create trigger trg_set_updated_at before update on chg_stage_reviews for each row execute function set_updated_at_and_by();

alter table chg_stage_reviews enable row level security;
create policy "chg_stage_reviews_select_authenticated" on chg_stage_reviews for select using (auth.uid() is not null);
create policy "chg_stage_reviews_write_admin" on chg_stage_reviews for all using (is_admin_user()) with check (is_admin_user());

create table chg_documents (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references chg_change_requests (id) on delete cascade,
  category text not null default 'other' check (category in (
    'contractor_proposal', 'technical', 'drawing', 'boq_mto', 'cost_breakdown',
    'schedule_analysis', 'contract', 'correspondence', 'ccb_minutes', 'other'
  )),
  document_number text not null default '',
  revision text not null default '',
  file_name text not null default '',
  file_url text not null default '',
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  uploaded_by uuid references profiles (id) default auth.uid(),
  uploaded_at timestamptz not null default now()
);

alter table chg_documents enable row level security;
create policy "chg_documents_select_authenticated" on chg_documents for select using (auth.uid() is not null);
create policy "chg_documents_write_admin" on chg_documents for all using (is_admin_user()) with check (is_admin_user());

create table chg_history (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references chg_change_requests (id) on delete cascade,
  user_id uuid references profiles (id) default auth.uid(),
  role_label text not null default '',
  action text not null default '',
  comment text not null default '',
  created_at timestamptz not null default now()
);

alter table chg_history enable row level security;
create policy "chg_history_select_authenticated" on chg_history for select using (auth.uid() is not null);
create policy "chg_history_write_admin" on chg_history for all using (is_admin_user()) with check (is_admin_user());

-- =====================================================================
-- Section 25: Change Management — fields from the organization's own
-- "فرم درخواست و مدیریت تغییر پروژه EPC" Word template that Section 24's
-- first pass didn't yet capture: general/contract identification, change
-- classification checkboxes, affected-document register, scope-change
-- type, a change-level risk register mini-table, and closeout/lessons-
-- learned facts. Purely additive (ADD COLUMN IF NOT EXISTS) — safe to
-- re-run, no data loss for Section 24's tables.
--
-- The Word form's "امور مالی/کنترل هزینه" and "HSE/QAQC" reviewer blocks
-- are NOT modeled as two more pipeline stages — that would mean a 7-stage
-- workflow and a bigger UI/state-machine change than this pass covers.
-- Cost-control fields are folded into the existing `contract` stage's
-- `details` jsonb (it already owns financial entitlement/evaluation), and
-- HSE/QAQC fields are folded into the existing `engineering` stage's
-- `details` jsonb, each stage keeping its own single decision.
-- =====================================================================

alter table chg_change_requests add column if not exists project_code text not null default '';
alter table chg_change_requests add column if not exists contract_name text not null default '';
alter table chg_change_requests add column if not exists contract_number text not null default '';
alter table chg_change_requests add column if not exists contract_date text not null default '';
alter table chg_change_requests add column if not exists project_phase text check (project_phase in ('engineering', 'procurement', 'construction', 'commissioning'));
alter table chg_change_requests add column if not exists requester_name text not null default '';
alter table chg_change_requests add column if not exists requester_organization text check (requester_organization in ('employer', 'consultant', 'contractor', 'pm'));
alter table chg_change_requests add column if not exists change_types text[] not null default '{}';

alter table chg_change_requests add column if not exists current_situation_description text not null default '';
alter table chg_change_requests add column if not exists change_reason_categories text[] not null default '{}';
alter table chg_change_requests add column if not exists change_reason_other text not null default '';
-- array of { docNumber, title, currentRevision, proposedRevision }
alter table chg_change_requests add column if not exists affected_documents jsonb not null default '[]'::jsonb;

alter table chg_change_requests add column if not exists scope_change_type text check (scope_change_type in ('none', 'increase', 'decrease', 'unchanged_modified'));
alter table chg_change_requests add column if not exists scope_effect_description text not null default '';

-- array of { description, probability, impact, controlAction }
alter table chg_change_requests add column if not exists identified_risks jsonb not null default '[]'::jsonb;
alter table chg_change_requests add column if not exists requires_new_risk_register_entry boolean not null default false;
alter table chg_change_requests add column if not exists creates_new_issue boolean not null default false;

-- array of { seq, actionLabel, responsible, plannedStart, plannedEnd, status }, seeded with the
-- Word form's 8 default rows when a request first enters 'implementation' (app-layer, not a trigger).
alter table chg_change_requests add column if not exists implementation_actions jsonb not null default '[]'::jsonb;

alter table chg_change_requests add column if not exists implemented_as_approved boolean;
alter table chg_change_requests add column if not exists actual_cost_amount numeric;
alter table chg_change_requests add column if not exists actual_delay_days integer;
alter table chg_change_requests add column if not exists documents_updated boolean;
alter table chg_change_requests add column if not exists updated_document_types text[] not null default '{}';
alter table chg_change_requests add column if not exists lesson_learned_recorded boolean;
alter table chg_change_requests add column if not exists lesson_learned_number text not null default '';

-- CCB gets 3 extra decision shades the Word form asks for (تصویب با اصلاح هزینه/زمان، تعلیق) —
-- only the CCB card renders buttons for these, but the column-level check applies to every stage.
alter table chg_stage_reviews drop constraint if exists chg_stage_reviews_decision_check;
alter table chg_stage_reviews add constraint chg_stage_reviews_decision_check check (decision in (
  'pending', 'approved', 'approved_with_conditions', 'approved_with_cost_revision',
  'approved_with_time_revision', 'suspended', 'rejected', 'request_revision', 'returned'
));

-- =====================================================================
-- Section 26: Change Management — real per-role write access.
--
-- Every chg_* write policy so far has been "is_admin_user() only" (an
-- explicitly disclosed simplification from Section 24). In practice this
-- meant a real مدیر مهندسی/مدیر برنامه‌ریزی/... who is not also a global
-- admin saw fully-enabled decision buttons in the UI (app-layer role
-- gating passed) but every click silently failed at the database (RLS
-- denied it) — the "Engineering stage buttons don't work" bug. This
-- section replaces the admin-only write policies with a helper that also
-- recognizes anyone holding one of the Change Management project roles
-- on that specific project, while keeping delete admin-only per request.
-- =====================================================================

create or replace function chg_can_write_project(target_project_id uuid)
returns boolean as $$
  select
    is_admin_user()
    or exists (
      select 1
      from rasta_project_role_assignments a
      join rasta_project_roles r on r.id = a.project_role_id
      where a.project_id = target_project_id
        and a.user_id = auth.uid()
        and r.name in (
          'پیمانکار', 'مدیر مهندسی', 'مدیر برنامه‌ریزی و کنترل پروژه',
          'مدیر امور پیمان', 'مدیر پروژه', 'عضو کمیته کنترل تغییرات', 'مجری'
        )
    );
$$ language sql security definer stable;

drop policy if exists "chg_change_requests_write_admin" on chg_change_requests;
create policy "chg_change_requests_insert" on chg_change_requests for insert with check (chg_can_write_project(master_project_id));
create policy "chg_change_requests_update" on chg_change_requests for update using (chg_can_write_project(master_project_id)) with check (chg_can_write_project(master_project_id));
create policy "chg_change_requests_delete" on chg_change_requests for delete using (is_admin_user());

drop policy if exists "chg_stage_reviews_write_admin" on chg_stage_reviews;
create policy "chg_stage_reviews_write" on chg_stage_reviews for all
  using (chg_can_write_project((select master_project_id from chg_change_requests where id = change_request_id)))
  with check (chg_can_write_project((select master_project_id from chg_change_requests where id = change_request_id)));

drop policy if exists "chg_documents_write_admin" on chg_documents;
create policy "chg_documents_write" on chg_documents for all
  using (chg_can_write_project((select master_project_id from chg_change_requests where id = change_request_id)))
  with check (chg_can_write_project((select master_project_id from chg_change_requests where id = change_request_id)));

drop policy if exists "chg_history_write_admin" on chg_history;
create policy "chg_history_write" on chg_history for all
  using (chg_can_write_project((select master_project_id from chg_change_requests where id = change_request_id)))
  with check (chg_can_write_project((select master_project_id from chg_change_requests where id = change_request_id)));

-- =====================================================================
-- Section 27: Competency Assessment — multi-role question bank.
--
-- The module originally assessed exactly one job (مدیر پروژه) against a
-- fixed, versioned-in-code rubric (competencyModel.ts) — deliberately kept
-- untouched, including every existing comp_assessments row (job_role
-- defaults to 'project_manager', so nothing pre-existing changes meaning).
-- Every OTHER job role now draws its questions from this DB-backed bank
-- instead: admin-authored via the Question Bank screen, activatable/
-- deactivatable without deleting, each with a full reference-answer +
-- scoring-rubric structure (never shown to the candidate, only to the
-- evaluator, and only once the candidate's own answer is on record — see
-- RoleQuestionScoreCard.tsx). comp_assessments gains job_role (which bank
-- applies) and selected_question_ids (the specific rows randomly assigned
-- to that one assessment, frozen once set so every panelist and the lead
-- score the exact same question set).
--
-- The actual ~23-question-per-role seed content (welding, mechanical/
-- piping, pipeline, coating/CP, radiography interpretation, civil,
-- project control, HSE, contracts) lives in the companion file
-- supabase/competency_question_bank_seed.sql, applied once after this
-- section — kept separate so this main file doesn't balloon with a few
-- hundred KB of question text.
-- =====================================================================

alter table comp_assessments add column if not exists job_role text not null default 'project_manager';
alter table comp_assessments add column if not exists selected_question_ids jsonb not null default '[]'::jsonb;

create table if not exists comp_question_bank (
  id uuid primary key default gen_random_uuid(),
  job_role text not null,
  category text not null check (category in ('GENERAL', 'TECHNICAL', 'SCENARIO', 'PROBLEM_SOLVING', 'EXPERIENCE_BASED', 'CASE_STUDY', 'IMAGE_BASED')),
  sub_category text not null default '',
  difficulty text not null default 'L2' check (difficulty in ('L1', 'L2', 'L3', 'L4')),
  question_text text not null,
  image_url text not null default '',
  -- Never shown to the candidate — only to the evaluator, and only after the candidate's own
  -- answer has been recorded (client-enforced reveal gate; this table has no candidate-facing path).
  reference_answer text not null default '',
  key_points jsonb not null default '[]'::jsonb,
  excellent_answer_indicators jsonb not null default '[]'::jsonb,
  common_mistakes jsonb not null default '[]'::jsonb,
  standard_reference text not null default '',
  score_min int not null default 0,
  score_max int not null default 5,
  evaluator_note_required boolean not null default true,
  active boolean not null default true,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table comp_question_bank enable row level security;

drop trigger if exists trg_set_updated_at on comp_question_bank;
create trigger trg_set_updated_at before update on comp_question_bank
  for each row execute function set_updated_at();

-- Every authenticated user may read the bank (an evaluator needs the reference answer, not just
-- admins) — only writing (author/edit/activate/delete) is admin-only, same pattern as
-- rasta_modules/plc_templates above.
drop policy if exists "comp_question_bank_select_authenticated" on comp_question_bank;
create policy "comp_question_bank_select_authenticated" on comp_question_bank
  for select using (auth.uid() is not null);

drop policy if exists "comp_question_bank_write_admin" on comp_question_bank;
create policy "comp_question_bank_write_admin" on comp_question_bank
  for all using (is_admin_user()) with check (is_admin_user());

-- ----------------------------------------------------------------------------
-- Section 28: Competency Assessment — configurable panel size + reusable,
-- specialty-scoped interview panel groups.
--
-- 1. panel_size on comp_assessments replaces the previously hardcoded "always
--    exactly 3 panelists" limit — the lead picks it per assessment.
-- 2. comp_panel_groups/comp_panel_group_members let a lead save a named set of
--    people once (e.g. "گروه مصاحبه برق و ابزار دقیق") and apply it to any
--    matching future candidate in one click instead of re-adding the same
--    people to the panel every time. job_role is optional (a group can be
--    generic) and is plain text, not a foreign key, since JobRole is a
--    client-side enum rather than its own reference table.
-- ----------------------------------------------------------------------------

alter table comp_assessments add column if not exists panel_size int not null default 3 check (panel_size between 1 and 8);

create table if not exists comp_panel_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  job_role text,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table comp_panel_groups enable row level security;

create table if not exists comp_panel_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references comp_panel_groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  is_lead boolean not null default false,
  unique (group_id, user_id)
);

alter table comp_panel_group_members enable row level security;

-- Any authenticated user can see every group (so any lead can pick a matching one), but only an
-- admin or the group's own creator can edit or delete it — same "anyone reads, owner/admin writes"
-- shape as comp_assessments' own comp_is_lead check above.
drop policy if exists "comp_panel_groups_select_authenticated" on comp_panel_groups;
create policy "comp_panel_groups_select_authenticated" on comp_panel_groups
  for select using (auth.uid() is not null);

drop policy if exists "comp_panel_groups_write_owner" on comp_panel_groups;
create policy "comp_panel_groups_write_owner" on comp_panel_groups
  for all using (is_admin_user() or created_by = auth.uid()) with check (is_admin_user() or created_by = auth.uid());

drop policy if exists "comp_panel_group_members_select_authenticated" on comp_panel_group_members;
create policy "comp_panel_group_members_select_authenticated" on comp_panel_group_members
  for select using (auth.uid() is not null);

drop policy if exists "comp_panel_group_members_write_owner" on comp_panel_group_members;
create policy "comp_panel_group_members_write_owner" on comp_panel_group_members
  for all using (
    is_admin_user() or exists (select 1 from comp_panel_groups g where g.id = group_id and g.created_by = auth.uid())
  ) with check (
    is_admin_user() or exists (select 1 from comp_panel_groups g where g.id = group_id and g.created_by = auth.uid())
  );

create index if not exists idx_comp_panel_group_members_group on comp_panel_group_members (group_id);

create index if not exists idx_comp_question_bank_role_category on comp_question_bank (job_role, category, active);

-- ----------------------------------------------------------------------------
-- Section 29: Competency Assessment — module-scoped admins, broader candidate
-- visibility, and lead delete rights.
--
-- 1. comp_module_admins: a small set of users granted full admin-equivalent
--    rights *within this module only*, independent of the global RASTA
--    profiles.is_admin flag — so a senior evaluator can be trusted with e.g.
--    editing the question bank without making them a system-wide admin.
--    comp_is_module_admin() is the single check every "admin-only" policy in
--    this module should use going forward instead of is_admin_user() alone.
-- 2. comp_assessments SELECT is opened to any authenticated user — every
--    evaluator should see every candidate on the dashboard, not just ones
--    they already happen to be a panelist on.
-- 3. comp_assessments DELETE now also allows the assessment's own lead
--    (comp_is_lead), not just its creator or a system admin.
-- ----------------------------------------------------------------------------

create table if not exists comp_module_admins (
  user_id uuid primary key references profiles (id) on delete cascade,
  added_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table comp_module_admins enable row level security;

create or replace function comp_is_module_admin()
returns boolean as $$
  select is_admin_user() or exists (select 1 from comp_module_admins where user_id = auth.uid());
$$ language sql security definer stable;

-- Anyone authenticated can read the admin list (so the UI can show who has full access); only a
-- system admin or an existing module admin can add/remove one — self-sustaining once a system
-- admin seeds the first module admin.
drop policy if exists "comp_module_admins_select_authenticated" on comp_module_admins;
create policy "comp_module_admins_select_authenticated" on comp_module_admins
  for select using (auth.uid() is not null);

drop policy if exists "comp_module_admins_write_admin" on comp_module_admins;
create policy "comp_module_admins_write_admin" on comp_module_admins
  for all using (comp_is_module_admin()) with check (comp_is_module_admin());

drop policy if exists "comp_question_bank_write_admin" on comp_question_bank;
create policy "comp_question_bank_write_admin" on comp_question_bank
  for all using (comp_is_module_admin()) with check (comp_is_module_admin());

drop policy if exists "comp_panel_groups_write_owner" on comp_panel_groups;
create policy "comp_panel_groups_write_owner" on comp_panel_groups
  for all using (comp_is_module_admin() or created_by = auth.uid()) with check (comp_is_module_admin() or created_by = auth.uid());

drop policy if exists "comp_panel_group_members_write_owner" on comp_panel_group_members;
create policy "comp_panel_group_members_write_owner" on comp_panel_group_members
  for all using (
    comp_is_module_admin() or exists (select 1 from comp_panel_groups g where g.id = group_id and g.created_by = auth.uid())
  ) with check (
    comp_is_module_admin() or exists (select 1 from comp_panel_groups g where g.id = group_id and g.created_by = auth.uid())
  );

drop policy if exists "comp_assessments_select_own" on comp_assessments;
create policy "comp_assessments_select_own" on comp_assessments
  for select using (auth.uid() is not null);

drop policy if exists "comp_assessments_delete_own" on comp_assessments;
create policy "comp_assessments_delete_own" on comp_assessments
  for delete using (created_by = auth.uid() or comp_is_module_admin() or comp_is_lead(id));

-- comp_can_access_assessment/comp_is_lead were written against is_admin_user() before module
-- admins existed — redefined here so a module admin gets the exact same full read/write standing
-- on every assessment that a system admin already had ("مانند ادمین سامانه").
create or replace function comp_can_access_assessment(p_assessment_id uuid)
returns boolean as $$
  select exists (
    select 1 from comp_assessments a
    where a.id = p_assessment_id and (a.created_by = auth.uid() or comp_is_module_admin())
  ) or exists (
    select 1 from comp_panelists p
    where p.assessment_id = p_assessment_id and p.user_id = auth.uid()
  );
$$ language sql security definer stable;

create or replace function comp_is_lead(p_assessment_id uuid)
returns boolean as $$
  select exists (
    select 1 from comp_assessments a
    where a.id = p_assessment_id and (a.created_by = auth.uid() or comp_is_module_admin())
  ) or exists (
    select 1 from comp_panelists p
    where p.assessment_id = p_assessment_id and p.user_id = auth.uid() and p.is_lead
  );
$$ language sql security definer stable;

-- comp_panelist_scores_delete was the one remaining comp_* write policy still checking
-- is_admin_user() directly instead of comp_is_module_admin() — a module admin without the global
-- flag couldn't delete a panelist's score sheet. Bringing it in line with every other admin-gated
-- policy in this module.
drop policy if exists "comp_panelist_scores_delete" on comp_panelist_scores;
create policy "comp_panelist_scores_delete" on comp_panelist_scores
  for delete using (
    panelist_id = auth.uid()
    or exists (select 1 from comp_assessments a where a.id = assessment_id and (a.created_by = auth.uid() or comp_is_module_admin()))
  );
-- ----------------------------------------------------------------------------
-- Section 30: fixes/features batch —
--
-- 1. comp_attachments + the comp-docs storage bucket's staff policies were
--    still scoped to comp_can_access_assessment() (creator/admin/assigned
--    panelist only), even though comp_assessments SELECT was already opened
--    to every authenticated user in Section 29. Any evaluator who could now
--    SEE a candidate but wasn't specifically assigned to it hit a silent RLS
--    denial trying to upload/delete a document — the reported "sometimes
--    upload fails" bug. Broadened to any authenticated user, matching
--    comp_assessments' own visibility.
-- 2. Candidate self-service can now also read back its own folder (for photo
--    /document thumbnail previews across reloads), scoped by the same
--    self_service_token folder-matching already used for writes.
-- 3. comp_set_photo / comp_self_service_set_photo: narrow, dedicated RPCs for
--    the one photo_url column, usable by any authenticated staff member or by
--    the token-holding candidate — without loosening the general
--    comp_assessments UPDATE policy that guards scoring/status fields.
-- 4. comp_panelists / comp_panelist_scores SELECT broadened the same way, so
--    every evaluator sees the same panel composition and the same panelist
--    scores for any candidate (needed for a judge-average final score that
--    doesn't silently vary by who's looking).
-- 5. comp_panelist_scores gains per-judge qualification scores (education/
--    experience/training/certification) and a mandatory strengths/
--    development-areas pair, so each panelist can complete their own
--    scorecard and wrap-up, not just the lead.
-- ----------------------------------------------------------------------------

alter table comp_panelist_scores
  add column if not exists education_score int check (education_score is null or education_score between 0 and 5),
  add column if not exists experience_score int check (experience_score is null or experience_score between 0 and 5),
  add column if not exists pm_training_score int check (pm_training_score is null or pm_training_score between 0 and 5),
  add column if not exists pm_certification_score int check (pm_certification_score is null or pm_certification_score between 0 and 5),
  add column if not exists strengths text not null default '',
  add column if not exists development_areas text not null default '';

drop policy if exists "comp_panelists_select" on comp_panelists;
create policy "comp_panelists_select" on comp_panelists
  for select using (auth.uid() is not null);

drop policy if exists "comp_panelist_scores_select" on comp_panelist_scores;
create policy "comp_panelist_scores_select" on comp_panelist_scores
  for select using (auth.uid() is not null);

drop policy if exists "comp_attachments_select" on comp_attachments;
create policy "comp_attachments_select" on comp_attachments
  for select using (auth.uid() is not null);

drop policy if exists "comp_attachments_insert" on comp_attachments;
create policy "comp_attachments_insert" on comp_attachments
  for insert with check (auth.uid() is not null and uploaded_by_candidate = false);

drop policy if exists "comp_attachments_delete" on comp_attachments;
create policy "comp_attachments_delete" on comp_attachments
  for delete using (auth.uid() is not null);

drop policy if exists "comp_docs_read_staff" on storage.objects;
create policy "comp_docs_read_staff" on storage.objects
  for select using (bucket_id = 'comp-docs' and auth.uid() is not null);

drop policy if exists "comp_docs_write_staff" on storage.objects;
create policy "comp_docs_write_staff" on storage.objects
  for insert with check (bucket_id = 'comp-docs' and auth.uid() is not null);

drop policy if exists "comp_docs_delete_staff" on storage.objects;
create policy "comp_docs_delete_staff" on storage.objects
  for delete using (bucket_id = 'comp-docs' and auth.uid() is not null);

drop policy if exists "comp_docs_read_candidate" on storage.objects;
create policy "comp_docs_read_candidate" on storage.objects
  for select to anon using (
    bucket_id = 'comp-docs'
    and exists (
      select 1 from comp_assessments a
      where a.id::text = (storage.foldername(name))[1]
        and a.self_service_token::text = (storage.foldername(name))[2]
    )
  );

create or replace function comp_set_photo(p_assessment_id uuid, p_photo_url text)
returns void as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update comp_assessments set photo_url = p_photo_url where id = p_assessment_id;
end;
$$ language plpgsql security definer;

grant execute on function comp_set_photo(uuid, text) to authenticated;

create or replace function comp_self_service_set_photo(p_token uuid, p_storage_path text)
returns void as $$
  update comp_assessments set photo_url = p_storage_path where self_service_token = p_token;
$$ language sql security definer;

grant execute on function comp_self_service_set_photo(uuid, text) to anon, authenticated;

-- comp_self_service_get gains photo_url so a reopened self-service link can show the candidate
-- their own already-uploaded photo instead of always looking empty.
drop function if exists comp_self_service_get(uuid);
create or replace function comp_self_service_get(p_token uuid)
returns table (
  id uuid,
  candidate_name text,
  candidate_position text,
  candidate_national_id text,
  candidate_phone text,
  candidate_email text,
  candidate_birth_date date,
  candidate_age int,
  has_disability boolean,
  disability_note text,
  years_experience_total numeric,
  years_experience_pipeline numeric,
  current_employer text,
  education jsonb,
  employment_history jsonb,
  certifications jsonb,
  notable_projects text,
  self_service_status text,
  photo_url text
) as $$
  select a.id, a.candidate_name, a.candidate_position, a.candidate_national_id, a.candidate_phone, a.candidate_email,
         a.candidate_birth_date, a.candidate_age, a.has_disability, a.disability_note,
         a.years_experience_total, a.years_experience_pipeline, a.current_employer,
         a.education, a.employment_history, a.certifications, a.notable_projects, a.self_service_status,
         a.photo_url
  from comp_assessments a
  where a.self_service_token = p_token;
$$ language sql security definer stable;

grant execute on function comp_self_service_get(uuid) to anon, authenticated;

-- comp_self_service_list_attachments gains storage_path so the self-service page can render a real
-- thumbnail preview for image attachments (via the new comp_docs_read_candidate policy above),
-- not just a filename.
create or replace function comp_self_service_list_attachments(p_token uuid)
returns table (id uuid, kind text, file_name text, storage_path text, created_at timestamptz) as $$
  select att.id, att.kind, att.file_name, att.storage_path, att.created_at
  from comp_attachments att
  join comp_assessments a on a.id = att.assessment_id
  where a.self_service_token = p_token
  order by att.created_at desc;
$$ language sql security definer stable;

-- ----------------------------------------------------------------------------
-- Section 31: Competency Assessment Engine v2.0 — Question Bank architecture.
--
-- 1. Three more question types (BEHAVIORAL/HSE/JUDGMENT) alongside the
--    existing seven, matching the full question-type vocabulary the module
--    now needs to classify HSE/behavioral/judgment questions distinctly
--    instead of forcing them into SCENARIO or GENERAL.
-- 2. weight: per-question weight within its category, for future weighted
--    scoring (defaults to 1 = no change to today's unweighted average).
-- 3. approval_status: every row an admin authors directly is auto-APPROVED
--    (today's behavior, unchanged); non-admin question *proposals* (a later
--    phase) will land as PENDING_REVIEW instead of writing the bank directly.
-- 4. Versioning: question_group_id ties every edit of "the same question"
--    together; version increments and superseded_by chains old -> new on
--    every edit. Editing NEVER mutates a row in place any more (see the
--    application-side updateQuestion, which now inserts a new version row) —
--    so an assessment's frozen selected_question_ids always keeps pointing
--    at the exact wording/reference-answer that was actually used, even
--    after an admin later corrects the question. Existing rows are
--    backfilled as version 1 of their own group (self-referencing).
-- 5. comp_job_role_config: per-job-role list of allowed question types (spec
--    section 3) — a small config table rather than touching the JobRole
--    TypeScript union, since no new job roles are needed right now and every
--    existing role already has a live question bank.
-- 6. Question Bank read access is narrowed from "every authenticated user"
--    to: admin/assessment-designer (full bank, any role), or an evaluator
--    who can access a *live* (not yet completed) assessment and only for
--    that assessment's own frozen question selection (or, for the
--    project_manager fixed rubric, any of their own live PM assessments,
--    since PM's question set is identical and fixed for every candidate).
--    A completed assessment's questions/reference-answers stop being
--    visible to its panelists entirely — only admin/designer/report-viewer
--    (see Section 32) can still see them, matching spec section 10/24.
--    Existing app code already renders bank lookups as optional
--    (`bankItem?: CompQuestionBankItem`), so a row simply not coming back
--    degrades to "no reveal panel shown" rather than breaking anything.
-- ----------------------------------------------------------------------------

alter table comp_question_bank drop constraint if exists comp_question_bank_category_check;
alter table comp_question_bank add constraint comp_question_bank_category_check
  check (category in ('GENERAL', 'TECHNICAL', 'SCENARIO', 'PROBLEM_SOLVING', 'EXPERIENCE_BASED', 'CASE_STUDY', 'IMAGE_BASED', 'BEHAVIORAL', 'HSE', 'JUDGMENT'));

alter table comp_question_bank add column if not exists weight numeric not null default 1 check (weight > 0);
alter table comp_question_bank add column if not exists approval_status text not null default 'APPROVED'
  check (approval_status in ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_REVISION'));
alter table comp_question_bank add column if not exists question_group_id uuid;
alter table comp_question_bank add column if not exists version int not null default 1;
alter table comp_question_bank add column if not exists superseded_by uuid references comp_question_bank (id);

update comp_question_bank set question_group_id = id where question_group_id is null;
alter table comp_question_bank alter column question_group_id set not null;
alter table comp_question_bank alter column question_group_id set default gen_random_uuid();

create index if not exists idx_comp_question_bank_group on comp_question_bank (question_group_id);
create index if not exists idx_comp_question_bank_approval on comp_question_bank (approval_status);

create table if not exists comp_job_role_config (
  job_role text primary key,
  allowed_question_types jsonb not null default
    '["GENERAL","TECHNICAL","SCENARIO","PROBLEM_SOLVING","EXPERIENCE_BASED","CASE_STUDY","IMAGE_BASED","BEHAVIORAL","HSE","JUDGMENT"]'::jsonb,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

alter table comp_job_role_config enable row level security;

drop trigger if exists trg_set_updated_at on comp_job_role_config;
create trigger trg_set_updated_at before update on comp_job_role_config
  for each row execute function set_updated_at_and_by();

insert into comp_job_role_config (job_role) values
  ('project_manager'), ('welding_inspector'), ('mechanical_piping_inspector'), ('pipeline_inspector'),
  ('coating_cp_inspector'), ('radiography_interpreter'), ('civil_engineer'), ('project_control_specialist'),
  ('hse_specialist'), ('contracts_specialist'), ('site_supervisor'), ('inspection_body_supervisor')
on conflict (job_role) do nothing;

drop policy if exists "comp_job_role_config_select_authenticated" on comp_job_role_config;
create policy "comp_job_role_config_select_authenticated" on comp_job_role_config
  for select using (auth.uid() is not null);

drop policy if exists "comp_job_role_config_write_admin" on comp_job_role_config;
create policy "comp_job_role_config_write_admin" on comp_job_role_config
  for all using (comp_is_module_admin()) with check (comp_is_module_admin());

-- comp_question_bank_public: a safe, non-sensitive projection (no reference_answer, key_points,
-- excellent_answer_indicators, common_mistakes or standard_reference — the evaluator-only advisory
-- content the rest of this section restricts) that ANY authenticated user may call regardless of
-- panelist status or assessment completion. The cross-role dashboard and reports pages (spec
-- sections irrelevant here — this predates this rewrite) only ever need a question's category/
-- weight/text to bucket an *already-recorded* score into a domain, never the advisory material — so
-- they read this function instead of the now-restricted comp_question_bank table directly, keeping
-- "every evaluator sees every candidate's aggregate scores" working exactly as before. security
-- definer so it can read past the table's row-level policy, same technique as every other
-- comp_self_service_* / comp_can_access_assessment function above.
create or replace function comp_question_bank_public()
returns table (
  id uuid, job_role text, category text, sub_category text, difficulty text,
  question_text text, image_url text, weight numeric, question_group_id uuid,
  version int, active boolean, created_at timestamptz, updated_at timestamptz
) as $$
  select id, job_role, category, sub_category, difficulty, question_text, image_url, weight,
         question_group_id, version, active, created_at, updated_at
  from comp_question_bank
  where auth.uid() is not null;
$$ language sql security definer stable;

-- ----------------------------------------------------------------------------
-- Section 32: Competency Assessment Engine v2.0 — RBAC, built on the existing
-- generic rasta_modules/rasta_roles/rasta_permissions framework (already used
-- by other modules) instead of a parallel comp-specific role table.
--
-- ADMIN            = comp_is_module_admin() (unchanged, existing concept).
-- ASSESSMENT_DESIGNER = rasta permission 'competency'/'configure' — full
--   question-bank read (needed to preview/build question mixes) but never a
--   write grant on comp_question_bank itself.
-- REPORT_VIEWER    = rasta permission 'competency'/'view' — read-only access
--   layered on top of whatever a plain authenticated user already sees;
--   comp_assessments stays visible to every authenticated user as decided in
--   Section 29, so this role currently only matters for future,
--   report-scoped policies (e.g. once/if that broad visibility is narrowed).
-- JUDGE            = unchanged: being an assigned comp_panelists row on a
--   specific assessment already scopes exactly what the spec calls "Judge"
--   access — no new global role needed for it.
-- CANDIDATE        = unchanged: the token-based self-service link, which
--   never authenticates and never touches comp_question_bank at all.
-- ----------------------------------------------------------------------------

insert into rasta_modules (key, label_fa) values ('competency', 'ارزیابی شایستگی')
on conflict (key) do nothing;

insert into rasta_permissions (module_key, action)
select m.key, a.action
from rasta_modules m
cross join (values ('view'), ('create'), ('edit'), ('delete'), ('submit'), ('review'), ('approve'), ('reject'), ('export'), ('configure')) as a(action)
where m.key = 'competency'
on conflict (module_key, action) do nothing;

insert into rasta_roles (name, description, is_system)
values
  ('ASSESSMENT_DESIGNER', 'طراحی آزمون شایستگی: تعریف ترکیب سؤال و تولید آزمون — بدون دسترسی ویرایش بانک سؤالات', true),
  ('REPORT_VIEWER', 'مشاهده گزارش‌های نهایی‌شده ارزیابی شایستگی', true)
on conflict (name) do nothing;

insert into rasta_role_permissions (role_id, permission_id)
select r.id, p.id
from rasta_roles r
join rasta_permissions p on p.module_key = 'competency' and p.action in ('view', 'create', 'configure')
where r.name = 'ASSESSMENT_DESIGNER'
on conflict do nothing;

insert into rasta_role_permissions (role_id, permission_id)
select r.id, p.id
from rasta_roles r
join rasta_permissions p on p.module_key = 'competency' and p.action in ('view', 'export')
where r.name = 'REPORT_VIEWER'
on conflict do nothing;

create or replace function comp_is_assessment_designer()
returns boolean as $$
  select comp_is_module_admin() or rasta_has_permission(auth.uid(), 'competency', 'configure');
$$ language sql security definer stable;

create or replace function comp_is_report_viewer()
returns boolean as $$
  select comp_is_module_admin() or comp_is_assessment_designer() or rasta_has_permission(auth.uid(), 'competency', 'view');
$$ language sql security definer stable;

-- The security-critical piece: replace "any authenticated user may read the whole bank" with the
-- scoped rule described in Section 31's header comment above.
drop policy if exists "comp_question_bank_select_authenticated" on comp_question_bank;
drop policy if exists "comp_question_bank_select_scoped" on comp_question_bank;
create policy "comp_question_bank_select_scoped" on comp_question_bank
  for select using (
    comp_is_module_admin()
    or comp_is_assessment_designer()
    or exists (
      select 1 from comp_assessments a
      where a.status <> 'completed'
        and a.job_role = comp_question_bank.job_role
        and (
          -- The lead of a live assessment for this role can browse the whole role's bank (needed
          -- to actually generate/re-generate that assessment's random question selection).
          comp_is_lead(a.id)
          -- An ordinary panelist only sees the exact rows already frozen into that one
          -- assessment's snapshot (or, for project_manager, any live PM assessment they're on —
          -- the fixed rubric is identical for every PM candidate so there's no extra row-level
          -- selection to scope by).
          or (
            comp_can_access_assessment(a.id)
            and (a.job_role = 'project_manager' or a.selected_question_ids @> to_jsonb(comp_question_bank.id::text))
          )
        )
    )
  );

grant execute on function comp_self_service_list_attachments(uuid) to anon, authenticated;

-- rasta_user_roles is a sitewide table gated to GLOBAL admins only (is_admin_user()), but the
-- Competency module's Settings page is meant to be usable by a comp_module_admin who may not be a
-- global admin. Rather than broadening the generic rasta_user_roles policy (which would let a
-- comp-only admin touch every other module's role grants too), these two narrow RPCs let a module
-- admin manage exactly the two roles this module cares about, the same "narrow SECURITY DEFINER
-- RPC" pattern as comp_set_photo/comp_self_service_* elsewhere in this schema.

create or replace function comp_grant_role(p_user_id uuid, p_role_name text)
returns void as $$
declare
  v_role_id uuid;
begin
  if not comp_is_module_admin() then
    raise exception 'forbidden';
  end if;
  if p_role_name not in ('ASSESSMENT_DESIGNER', 'REPORT_VIEWER') then
    raise exception 'invalid role';
  end if;
  select id into v_role_id from rasta_roles where name = p_role_name;
  if v_role_id is null then
    raise exception 'role not found';
  end if;
  insert into rasta_user_roles (user_id, role_id, created_by)
  values (p_user_id, v_role_id, auth.uid())
  on conflict (user_id, role_id) do nothing;
end;
$$ language plpgsql security definer;

create or replace function comp_revoke_role(p_user_id uuid, p_role_name text)
returns void as $$
declare
  v_role_id uuid;
begin
  if not comp_is_module_admin() then
    raise exception 'forbidden';
  end if;
  select id into v_role_id from rasta_roles where name = p_role_name;
  if v_role_id is null then
    return;
  end if;
  delete from rasta_user_roles where user_id = p_user_id and role_id = v_role_id;
end;
$$ language plpgsql security definer;

create or replace function comp_list_role_assignments(p_role_name text)
returns table (user_id uuid, created_by uuid, created_at timestamptz) as $$
  select ur.user_id, ur.created_by, ur.created_at
  from rasta_user_roles ur
  join rasta_roles r on r.id = ur.role_id
  where r.name = p_role_name and comp_is_module_admin();
$$ language sql security definer stable;

-- ----------------------------------------------------------------------------
-- Section 33: Competency Assessment Engine v2.0 — Assessment Designer (spec
-- section 6/7/8/36): a reusable, named question-mix "recipe" per job role
-- (category x difficulty x count), designed once by an admin/assessment
-- designer and then applied to generate any number of candidates' actual
-- question snapshots (comp_assessments.selected_question_ids), replacing the
-- old fixed hardcoded target counts in assignRandomQuestions.
-- ----------------------------------------------------------------------------

create table if not exists comp_assessment_templates (
  id uuid primary key default gen_random_uuid(),
  job_role text not null,
  title text not null,
  duration_minutes int not null default 60 check (duration_minutes > 0),
  panel_size_default int not null default 3 check (panel_size_default between 1 and 8),
  -- Array of {category, difficulty, count} cells — see AssessmentDesignerModal.tsx for the exact
  -- shape. Kept as jsonb rather than child rows since it's always read/written as one whole grid.
  question_mix jsonb not null default '[]'::jsonb,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table comp_assessment_templates enable row level security;

drop trigger if exists trg_set_updated_at on comp_assessment_templates;
create trigger trg_set_updated_at before update on comp_assessment_templates
  for each row execute function set_updated_at();

create index if not exists idx_comp_assessment_templates_role on comp_assessment_templates (job_role);

drop policy if exists "comp_assessment_templates_select_authenticated" on comp_assessment_templates;
create policy "comp_assessment_templates_select_authenticated" on comp_assessment_templates
  for select using (auth.uid() is not null);

drop policy if exists "comp_assessment_templates_write_designer" on comp_assessment_templates;
create policy "comp_assessment_templates_write_designer" on comp_assessment_templates
  for all using (comp_is_assessment_designer()) with check (comp_is_assessment_designer());

-- ----------------------------------------------------------------------------
-- Section 34: Competency Assessment Engine v2.0 — Random Question Engine
-- (spec section 8/9): track how many times each question has been drawn
-- into a generated assessment, so future generation can prefer under-used
-- questions over ones that keep coming up ("Previous Usage" control).
-- comp_increment_question_usage is a narrow, low-risk RPC (bumping a
-- counter can't leak or corrupt anything sensitive) open to any
-- authenticated user, the same "low-risk single-purpose RPC" pattern as
-- comp_set_photo — a plain panelist/lead triggering generation has no
-- general UPDATE grant on comp_question_bank (admin-only), so a dedicated
-- RPC is needed rather than a direct table write.
-- ----------------------------------------------------------------------------

alter table comp_question_bank add column if not exists usage_count int not null default 0;

create or replace function comp_increment_question_usage(p_ids uuid[])
returns void as $$
  update comp_question_bank set usage_count = usage_count + 1 where id = any(p_ids) and auth.uid() is not null;
$$ language sql security definer;

-- ----------------------------------------------------------------------------
-- Section 35: Competency Assessment Engine v2.0 — Judge workflow locking +
-- audit log (spec section 30/31).
--
-- 1. comp_audit_log: a minimal, append-only log of sensitive actions. No
--    direct INSERT policy is granted to authenticated users at all — rows
--    are written exclusively by SECURITY DEFINER functions (comp_log_audit
--    below, called from other RPCs), so a client can never forge an entry.
--    Only a module admin may read it.
-- 2. Locking: once a panelist has submitted their score (submitted_at set),
--    they can no longer edit it themselves — only comp_is_module_admin()
--    bypasses this. The *first* transition into the locked state is still
--    allowed for its own actor, since the USING clause evaluates against
--    the row's state *before* the update.
--    Note: comp_assessments itself is deliberately NOT locked on
--    status='completed' — the lead's post-completion actions (setApproved,
--    strengths/development notes, markReviewed on ResultsStage) are the
--    lifecycle's "Final Review" step, not the "Judge" scoring the spec's
--    locking requirement targets, so comp_assessments_update_own keeps its
--    original, unrestricted-by-status shape.
-- 3. comp_reopen_assessment: admin-only, clears the assessment status and
--    every panelist's submitted_at for that assessment so judges can score
--    again, and writes an audit row.
-- ----------------------------------------------------------------------------

create table if not exists comp_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  actor uuid references profiles (id),
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

alter table comp_audit_log enable row level security;

drop policy if exists "comp_audit_log_select_admin" on comp_audit_log;
create policy "comp_audit_log_select_admin" on comp_audit_log
  for select using (comp_is_module_admin());

create or replace function comp_log_audit(p_action text, p_entity_type text, p_entity_id uuid, p_previous jsonb, p_new jsonb)
returns void as $$
  insert into comp_audit_log (action, entity_type, entity_id, actor, previous_value, new_value)
  values (p_action, p_entity_type, p_entity_id, auth.uid(), p_previous, p_new);
$$ language sql security definer;

drop policy if exists "comp_panelist_scores_update" on comp_panelist_scores;
create policy "comp_panelist_scores_update" on comp_panelist_scores
  for update using (comp_is_module_admin() or (panelist_id = auth.uid() and submitted_at is null));

create or replace function comp_reopen_assessment(p_assessment_id uuid)
returns void as $$
begin
  if not comp_is_module_admin() then
    raise exception 'forbidden';
  end if;
  update comp_assessments set status = 'draft' where id = p_assessment_id;
  update comp_panelist_scores set submitted_at = null where assessment_id = p_assessment_id;
  perform comp_log_audit('ASSESSMENT_REOPENED', 'comp_assessments', p_assessment_id, jsonb_build_object('status', 'completed'), jsonb_build_object('status', 'draft'));
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Section 36: Competency Assessment Engine v2.0 — Gemini AI Analysis (spec
-- section 18-27). Stores the structured JSON output from the comp-gemini-
-- analysis Edge Function so it's generated on demand and then persisted
-- (never recomputed on every page view). Visibility mirrors comp_assessments'
-- own broad authenticated visibility (Section 29) since this is a derived
-- report artifact built only from data that visibility already exposes —
-- never the question bank's evaluator-only reference-answer content (see the
-- Edge Function, which reads questions via comp_question_bank_public() only).
-- ----------------------------------------------------------------------------

create table if not exists comp_ai_analysis (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references comp_assessments (id) on delete cascade,
  model text not null,
  analysis jsonb not null,
  confidence numeric,
  generated_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table comp_ai_analysis enable row level security;

create index if not exists idx_comp_ai_analysis_assessment on comp_ai_analysis (assessment_id, created_at desc);

drop policy if exists "comp_ai_analysis_select_authenticated" on comp_ai_analysis;
create policy "comp_ai_analysis_select_authenticated" on comp_ai_analysis
  for select using (auth.uid() is not null);

drop policy if exists "comp_ai_analysis_insert_authenticated" on comp_ai_analysis;
create policy "comp_ai_analysis_insert_authenticated" on comp_ai_analysis
  for insert with check (auth.uid() is not null);

-- ----------------------------------------------------------------------------
-- Section 37: Competency Assessment Engine v2.0 — Question Proposal Workflow
-- (spec section 12), completing the Phase 4 that was deferred earlier in
-- this rewrite. A non-admin can now INSERT a new comp_question_bank row
-- directly, but only ever landing as PENDING_REVIEW + inactive and owned by
-- themselves — it can never appear in a live assessment's random selection
-- (that only ever draws active + APPROVED rows) until an admin approves it.
-- Only an admin can still UPDATE/DELETE any row, i.e. only an admin can
-- move a proposal to APPROVED/REJECTED/NEEDS_REVISION or edit its content.
-- ----------------------------------------------------------------------------

drop policy if exists "comp_question_bank_write_admin" on comp_question_bank;

create policy "comp_question_bank_insert" on comp_question_bank
  for insert with check (
    comp_is_module_admin()
    or (approval_status = 'PENDING_REVIEW' and active = false and created_by = auth.uid())
  );

create policy "comp_question_bank_update_admin" on comp_question_bank
  for update using (comp_is_module_admin()) with check (comp_is_module_admin());

create policy "comp_question_bank_delete_admin" on comp_question_bank
  for delete using (comp_is_module_admin());

-- A proposer must be able to see their own proposal afterward (to track its status), even with no
-- live assessment tying them to that job role's bank at all.
--
-- The blanket "job_role = 'project_manager'" branch below used to apply to EVERY PM assessment,
-- because every PM assessment used the fixed in-code rubric (selected_question_ids always empty),
-- so the generic "selected_question_ids @> ..." branch could never match for PM at all. Now that a
-- PM assessment can also be bank-driven exactly like every other role (see usesLegacyPmRubric on
-- the client), that carve-out is narrowed to ONLY the still-legacy case (selected_question_ids
-- still empty) — a bank-driven PM assessment is scoped by its own real selection, same as any
-- other role, with no special-case treatment left.
drop policy if exists "comp_question_bank_select_scoped" on comp_question_bank;
create policy "comp_question_bank_select_scoped" on comp_question_bank
  for select using (
    comp_is_module_admin()
    or comp_is_assessment_designer()
    or created_by = auth.uid()
    or exists (
      select 1 from comp_assessments a
      where a.status <> 'completed'
        and a.job_role = comp_question_bank.job_role
        and (
          comp_is_lead(a.id)
          or (
            comp_can_access_assessment(a.id)
            and (
              (a.job_role = 'project_manager' and jsonb_array_length(a.selected_question_ids) = 0)
              or a.selected_question_ids @> to_jsonb(comp_question_bank.id::text)
            )
          )
        )
    )
  );

-- ----------------------------------------------------------------------------
-- Section 39: Competency Assessment Engine v2.0 — optional exam duration + a
-- live, judge-controllable interview timer. Exam duration becomes optional
-- (no target duration = no expectation set) on the reusable template, and a
-- new auto_finish_on_timeout opt-in lets the designer decide whether the
-- live interview timer below should auto-stop itself once that duration
-- elapses, or just keep counting into overtime. Never auto-submits/locks
-- anyone's scores — comp_set_interview_timer only ever touches the 3 timer
-- columns below.
-- ----------------------------------------------------------------------------

alter table comp_assessment_templates alter column duration_minutes drop not null;
alter table comp_assessment_templates alter column duration_minutes drop default;
alter table comp_assessment_templates drop constraint if exists comp_assessment_templates_duration_minutes_check;
alter table comp_assessment_templates add constraint comp_assessment_templates_duration_minutes_check check (duration_minutes is null or duration_minutes > 0);
alter table comp_assessment_templates add column if not exists auto_finish_on_timeout boolean not null default false;

-- Copied onto the actual assessment when generated from a template, since the live interview timer
-- needs this specific candidate's own target duration/behavior, not just the reusable template's.
alter table comp_assessments add column if not exists duration_minutes int;
alter table comp_assessments drop constraint if exists comp_assessments_duration_minutes_check;
alter table comp_assessments add constraint comp_assessments_duration_minutes_check check (duration_minutes is null or duration_minutes > 0);
alter table comp_assessments add column if not exists auto_finish_on_timeout boolean not null default false;

-- Live interview timer state — any panelist (not just the lead) may start/pause/reset it, since
-- whoever is actually running the interview in the room needs control, not just whoever created the
-- assessment. Elapsed time is computed server-side from real clock time (never trusts a
-- client-submitted elapsed value), so it can't be tampered with or drift from clock skew.
alter table comp_assessments add column if not exists interview_timer_started_at timestamptz;
alter table comp_assessments add column if not exists interview_timer_elapsed_seconds int not null default 0;
alter table comp_assessments add column if not exists interview_timer_running boolean not null default false;

create or replace function comp_set_interview_timer(p_assessment_id uuid, p_action text)
returns void as $$
declare
  v comp_assessments%rowtype;
begin
  if not comp_can_access_assessment(p_assessment_id) then
    raise exception 'forbidden';
  end if;
  select * into v from comp_assessments where id = p_assessment_id;
  if not found then
    raise exception 'assessment not found';
  end if;

  if p_action = 'start' then
    if not v.interview_timer_running then
      update comp_assessments set interview_timer_running = true, interview_timer_started_at = now() where id = p_assessment_id;
    end if;
  elsif p_action = 'pause' then
    if v.interview_timer_running and v.interview_timer_started_at is not null then
      update comp_assessments
      set interview_timer_running = false,
          interview_timer_elapsed_seconds = interview_timer_elapsed_seconds + greatest(0, floor(extract(epoch from (now() - v.interview_timer_started_at)))::int),
          interview_timer_started_at = null
      where id = p_assessment_id;
    end if;
  elsif p_action = 'reset' then
    update comp_assessments set interview_timer_running = false, interview_timer_started_at = null, interview_timer_elapsed_seconds = 0 where id = p_assessment_id;
  else
    raise exception 'invalid timer action: %', p_action;
  end if;
end;
$$ language plpgsql security definer;

grant execute on function comp_set_interview_timer(uuid, text) to authenticated;

alter table comp_question_bank add column if not exists proposal_reason text not null default '';

-- ============================================================================
-- Section 40: Personality & Behavioral Assessment Engine — Phase 1:
-- foundational domain model (catalog tables, question bank, per-candidate
-- assessment shell, scoring/validity/AI-analysis storage, RBAC). This is
-- Phase 1 of a multi-phase build — question CONTENT, the Assessment Designer
-- wizard, the candidate-facing UI, the scoring/validity/pattern engines, and
-- Gemini integration are later phases layered on top of this schema.
--
-- Reuse decisions (per the spec's own "do not duplicate, do not disrupt the
-- existing system" instructions):
--   - Job roles: reuses the existing JobRole domain (job_role text columns,
--     same literal values as comp_job_role_config) — no new job-role table.
--   - Candidate/assessment identity: personality_assessments links to the
--     EXISTING comp_assessments row (1:1) rather than creating a parallel
--     candidate model — a candidate is one person with possibly both a
--     competency assessment and a personality assessment on the same record,
--     matching the spec's "Technical + Personality Integration".
--   - Versioning + approval workflow for personality_questions mirrors
--     comp_question_bank's proven design exactly (question_group_id/version/
--     superseded_by, approval_status, a non-admin INSERT lands as
--     PENDING_REVIEW+inactive) rather than a separate "proposals" table.
--   - Audit trail reuses comp_audit_log/comp_log_audit() (already fully
--     generic — entity_type/entity_id/actor/before/after — despite the
--     comp_ prefix, which is a naming artifact from when it was first built)
--     instead of a parallel personality_audit_logs table; its SELECT policy
--     is widened below so a personality-only module admin can read it too.
--   - RBAC reuses the existing rasta_modules/rasta_roles/rasta_permissions/
--     rasta_has_permission() framework, registering a new 'personality'
--     module key exactly like 'competency' did, with its own
--     PERSONALITY_ASSESSMENT_DESIGNER/PERSONALITY_REPORT_VIEWER roles (kept
--     distinct from competency's ASSESSMENT_DESIGNER/REPORT_VIEWER roles,
--     since someone may be trusted with one module and not the other) and a
--     dedicated personality_module_admins table mirroring comp_module_admins.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RBAC: module admins + rasta_roles registration
-- ----------------------------------------------------------------------------

create table if not exists personality_module_admins (
  user_id uuid primary key references profiles (id) on delete cascade,
  added_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
alter table personality_module_admins enable row level security;

create or replace function personality_is_module_admin()
returns boolean as $$
  select is_admin_user() or exists (select 1 from personality_module_admins where user_id = auth.uid());
$$ language sql security definer stable;

drop policy if exists "personality_module_admins_select_authenticated" on personality_module_admins;
create policy "personality_module_admins_select_authenticated" on personality_module_admins
  for select using (auth.uid() is not null);

drop policy if exists "personality_module_admins_write_admin" on personality_module_admins;
create policy "personality_module_admins_write_admin" on personality_module_admins
  for all using (personality_is_module_admin()) with check (personality_is_module_admin());

insert into rasta_modules (key, label_fa) values ('personality', 'ارزیابی شخصیت و رفتاری')
on conflict (key) do nothing;

insert into rasta_permissions (module_key, action)
select m.key, a.action
from rasta_modules m
cross join (values ('view'), ('create'), ('edit'), ('delete'), ('submit'), ('review'), ('approve'), ('reject'), ('export'), ('configure')) as a(action)
where m.key = 'personality'
on conflict (module_key, action) do nothing;

insert into rasta_roles (name, description, is_system)
values
  ('PERSONALITY_ASSESSMENT_DESIGNER', 'طراحی آزمون شخصیت و رفتاری: تعریف ترکیب سؤال و تولید آزمون — بدون دسترسی ویرایش بانک سؤالات', true),
  ('PERSONALITY_REPORT_VIEWER', 'مشاهده گزارش‌های نهایی‌شده ارزیابی شخصیت و رفتاری', true)
on conflict (name) do nothing;

insert into rasta_role_permissions (role_id, permission_id)
select r.id, p.id
from rasta_roles r
join rasta_permissions p on p.module_key = 'personality' and p.action in ('view', 'create', 'configure')
where r.name = 'PERSONALITY_ASSESSMENT_DESIGNER'
on conflict do nothing;

insert into rasta_role_permissions (role_id, permission_id)
select r.id, p.id
from rasta_roles r
join rasta_permissions p on p.module_key = 'personality' and p.action in ('view', 'export')
where r.name = 'PERSONALITY_REPORT_VIEWER'
on conflict do nothing;

create or replace function personality_is_assessment_designer()
returns boolean as $$
  select personality_is_module_admin() or rasta_has_permission(auth.uid(), 'personality', 'configure');
$$ language sql security definer stable;

create or replace function personality_is_report_viewer()
returns boolean as $$
  select personality_is_module_admin() or personality_is_assessment_designer() or rasta_has_permission(auth.uid(), 'personality', 'view');
$$ language sql security definer stable;

-- Let a personality-only module admin read the shared audit log too (see the reuse note above) —
-- additive only, never narrows who could already read it.
drop policy if exists "comp_audit_log_select_admin" on comp_audit_log;
create policy "comp_audit_log_select_admin" on comp_audit_log
  for select using (comp_is_module_admin() or personality_is_module_admin());

-- ----------------------------------------------------------------------------
-- Catalog: framework / traits / facets / behavioral dimensions / job profiles
-- / response scales — admin-configurable reference data.
-- ----------------------------------------------------------------------------

create table if not exists personality_frameworks (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label_fa text not null,
  description text not null default '',
  version int not null default 1,
  active boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

create table if not exists personality_traits (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references personality_frameworks (id) on delete cascade,
  key text not null,
  label_fa text not null,
  description text not null default '',
  display_order int not null default 0,
  active boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  unique (framework_id, key)
);

create table if not exists personality_facets (
  id uuid primary key default gen_random_uuid(),
  trait_id uuid not null references personality_traits (id) on delete cascade,
  key text not null,
  label_fa text not null,
  description text not null default '',
  display_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  unique (trait_id, key)
);

-- The 22+ professional behavioral dimensions — a module-wide catalog, not tied to one framework,
-- since they describe workplace behavior rather than personality-trait theory.
create table if not exists personality_behavioral_dimensions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label_fa text not null,
  description text not null default '',
  default_weight numeric not null default 1 check (default_weight > 0),
  related_trait_ids uuid[] not null default '{}',
  related_facet_ids uuid[] not null default '{}',
  active boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

-- Job Behavioral Profile: which dimensions matter for a given job_role, at what weight/threshold.
-- job_role is a plain text column against the existing JobRole domain (same literal values as
-- comp_job_role_config.job_role) — no new job-role table. Versioned (job roles can have more than
-- one profile revision over time; only one should be active per job_role at a time, enforced at the
-- application layer like comp_question_bank's own versioning, not a DB constraint).
create table if not exists personality_job_behavioral_profiles (
  id uuid primary key default gen_random_uuid(),
  job_role text not null,
  version int not null default 1,
  title text not null,
  active boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);
create index if not exists idx_personality_job_profiles_role on personality_job_behavioral_profiles (job_role) where active;

create table if not exists personality_job_behavioral_requirements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references personality_job_behavioral_profiles (id) on delete cascade,
  dimension_id uuid not null references personality_behavioral_dimensions (id),
  weight numeric not null default 1 check (weight > 0),
  min_threshold numeric,
  preferred_min numeric,
  preferred_max numeric,
  is_critical boolean not null default false,
  created_at timestamptz not null default now(),
  unique (profile_id, dimension_id)
);

-- Configurable response scales — Likert-5/7, frequency, importance, forced choice, ranking, etc.
-- labels is [{value:int, label_fa:text}]; reverse_rule names the reversal strategy the scoring
-- engine applies (computed server-side only, never in frontend code).
create table if not exists personality_response_scales (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label_fa text not null,
  min_value int not null,
  max_value int not null,
  labels jsonb not null default '[]'::jsonb,
  scoring_rule text not null default 'linear',
  reverse_rule text not null default 'mirror_min_max',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (max_value > min_value)
);

alter table personality_traits enable row level security;
alter table personality_facets enable row level security;
alter table personality_behavioral_dimensions enable row level security;
alter table personality_job_behavioral_profiles enable row level security;
alter table personality_job_behavioral_requirements enable row level security;
alter table personality_response_scales enable row level security;
alter table personality_frameworks enable row level security;

-- Reference/config data: any authenticated user may read it (needed to render the designer wizard
-- and, later, non-sensitive parts of the candidate UI); only an admin/assessment-designer may write.
do $$
declare
  t text;
begin
  foreach t in array array[
    'personality_frameworks', 'personality_traits', 'personality_facets',
    'personality_behavioral_dimensions', 'personality_job_behavioral_profiles',
    'personality_job_behavioral_requirements', 'personality_response_scales'
  ]
  loop
    execute format('drop policy if exists "%1$s_select_authenticated" on %1$s', t);
    execute format('create policy "%1$s_select_authenticated" on %1$s for select using (auth.uid() is not null)', t);
    execute format('drop policy if exists "%1$s_write_admin" on %1$s', t);
    execute format(
      'create policy "%1$s_write_admin" on %1$s for all using (personality_is_module_admin() or personality_is_assessment_designer()) with check (personality_is_module_admin() or personality_is_assessment_designer())',
      t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Personality Question Bank — versioned + approval workflow, mirroring
-- comp_question_bank's proven design exactly (see the reuse note above)
-- rather than a separate table.
-- ----------------------------------------------------------------------------

create table if not exists personality_questions (
  id uuid primary key default gen_random_uuid(),
  question_group_id uuid not null default gen_random_uuid(),
  version int not null default 1,
  superseded_by uuid references personality_questions (id),
  framework_id uuid references personality_frameworks (id),
  trait_id uuid references personality_traits (id),
  facet_id uuid references personality_facets (id),
  dimension_id uuid references personality_behavioral_dimensions (id),
  question_type text not null check (question_type in ('LIKERT', 'FORCED_CHOICE', 'SJT', 'FREQUENCY', 'PRIORITY_CHOICE', 'EXPERIENCE_ANCHORED')),
  question_text text not null,
  scenario_context text not null default '',
  scale_id uuid references personality_response_scales (id),
  -- For FORCED_CHOICE/SJT/PRIORITY_CHOICE: [{key, label_fa, ...}] — never exposes which option is
  -- "correct" to the client beyond what the candidate-facing UI needs to render the choice itself.
  options jsonb not null default '[]'::jsonb,
  reverse_scored boolean not null default false,
  job_role text,
  complexity text not null default 'L1' check (complexity in ('L1', 'L2', 'L3', 'L4')),
  weight numeric not null default 1 check (weight > 0),
  active boolean not null default true,
  approval_status text not null default 'PENDING_REVIEW' check (approval_status in ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_REVISION')),
  -- Question-quality metadata: {clarity, construct_relevance, social_desirability_risk,
  -- ambiguity_risk, double_barreled_risk, response_bias_risk} — 0-100 or null when not yet
  -- assessed. Kept as jsonb rather than fixed columns since the exact metric set is expected to
  -- evolve (future psychometric analytics).
  quality jsonb not null default '{}'::jsonb,
  usage_count int not null default 0,
  last_used_at timestamptz,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  check (trait_id is not null or dimension_id is not null)
);

create index if not exists idx_personality_questions_group on personality_questions (question_group_id);
create index if not exists idx_personality_questions_approval on personality_questions (approval_status);
create index if not exists idx_personality_questions_dimension on personality_questions (dimension_id);
create index if not exists idx_personality_questions_trait on personality_questions (trait_id);
create index if not exists idx_personality_questions_job_role on personality_questions (job_role);
create index if not exists idx_personality_questions_type on personality_questions (question_type);

alter table personality_questions enable row level security;

-- Mirrors comp_question_bank_insert exactly: an admin/designer row lands pre-approved; anyone
-- else's lands as an inactive PENDING_REVIEW proposal, never visible in live assessment generation
-- until approved.
drop policy if exists "personality_questions_insert" on personality_questions;
create policy "personality_questions_insert" on personality_questions
  for insert with check (
    personality_is_module_admin()
    or personality_is_assessment_designer()
    or (approval_status = 'PENDING_REVIEW' and active = false and created_by = auth.uid())
  );

drop policy if exists "personality_questions_select" on personality_questions;
create policy "personality_questions_select" on personality_questions
  for select using (
    personality_is_module_admin()
    or personality_is_assessment_designer()
    or personality_is_report_viewer()
    or created_by = auth.uid()
  );

drop policy if exists "personality_questions_update_admin" on personality_questions;
create policy "personality_questions_update_admin" on personality_questions
  for update using (personality_is_module_admin()) with check (personality_is_module_admin());

drop policy if exists "personality_questions_delete_admin" on personality_questions;
create policy "personality_questions_delete_admin" on personality_questions
  for delete using (personality_is_module_admin());

-- ----------------------------------------------------------------------------
-- Assessment templates (reusable question-mix recipes) + the per-candidate
-- assessment shell, linked to the EXISTING comp_assessments row rather than
-- a parallel candidate model.
-- ----------------------------------------------------------------------------

create table if not exists personality_assessment_templates (
  id uuid primary key default gen_random_uuid(),
  job_role text not null,
  title text not null,
  framework_id uuid references personality_frameworks (id),
  job_profile_id uuid references personality_job_behavioral_profiles (id),
  -- [{question_type, complexity, count}]
  question_mix jsonb not null default '[]'::jsonb,
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);
alter table personality_assessment_templates enable row level security;

drop policy if exists "personality_assessment_templates_all" on personality_assessment_templates;
create policy "personality_assessment_templates_all" on personality_assessment_templates
  for all using (personality_is_module_admin() or personality_is_assessment_designer())
  with check (personality_is_module_admin() or personality_is_assessment_designer());

create table if not exists personality_assessments (
  id uuid primary key default gen_random_uuid(),
  -- Reuses the EXISTING candidate/assessment record — a candidate is one person who may have both a
  -- competency assessment and a personality assessment attached to the same comp_assessments row.
  assessment_id uuid not null references comp_assessments (id) on delete cascade,
  job_role text not null,
  framework_id uuid references personality_frameworks (id),
  job_profile_id uuid references personality_job_behavioral_profiles (id),
  form_key text not null default 'A' check (form_key in ('A', 'B', 'C', 'D')),
  -- Frozen snapshot once generated — same pattern as comp_assessments.selected_question_ids: an
  -- array of personality_questions.id, immutable after generation.
  selected_question_ids jsonb not null default '[]'::jsonb,
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'DESIGNED', 'GENERATED', 'ASSIGNED', 'STARTED', 'IN_PROGRESS', 'SUBMITTED',
    'VALIDITY_CHECK', 'SCORING', 'FINGERPRINT', 'AI_ANALYSIS', 'FINAL_REVIEW', 'LOCKED', 'ARCHIVED'
  )),
  -- Deterministic, rule-based pattern/watchpoint engine output — always computed, independent of
  -- whether AI analysis has run; AI interpretation layers on top of this, never replaces it.
  -- [{dimensions:[...], interpretation}] / [{dimensions:[...], topic}].
  computed_patterns jsonb not null default '[]'::jsonb,
  computed_watchpoints jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  submitted_at timestamptz,
  locked_at timestamptz,
  locked_by uuid references profiles (id),
  -- Separate from results_share_token below, same reasoning as comp_assessments'
  -- self_service_token/results_share_token split: a leaked results link must never let someone
  -- submit/overwrite answers, and vice versa.
  candidate_token uuid not null default gen_random_uuid(),
  results_share_token uuid not null default gen_random_uuid(),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  unique (assessment_id)
);
create unique index if not exists idx_personality_assessments_candidate_token on personality_assessments (candidate_token);
create unique index if not exists idx_personality_assessments_results_token on personality_assessments (results_share_token);
create index if not exists idx_personality_assessments_assessment on personality_assessments (assessment_id);

alter table personality_assessments enable row level security;

create or replace function personality_can_access_assessment(p_personality_assessment_id uuid)
returns boolean as $$
  select personality_is_module_admin() or personality_is_report_viewer() or exists (
    select 1 from personality_assessments pa
    join comp_assessments a on a.id = pa.assessment_id
    where pa.id = p_personality_assessment_id and (pa.created_by = auth.uid() or a.created_by = auth.uid())
  );
$$ language sql security definer stable;

drop policy if exists "personality_assessments_select" on personality_assessments;
create policy "personality_assessments_select" on personality_assessments
  for select using (personality_can_access_assessment(id));

drop policy if exists "personality_assessments_insert" on personality_assessments;
create policy "personality_assessments_insert" on personality_assessments
  for insert with check (personality_is_module_admin() or personality_is_assessment_designer());

drop policy if exists "personality_assessments_update" on personality_assessments;
create policy "personality_assessments_update" on personality_assessments
  for update using (personality_is_module_admin() or personality_is_assessment_designer() or created_by = auth.uid());

drop policy if exists "personality_assessments_delete" on personality_assessments;
create policy "personality_assessments_delete" on personality_assessments
  for delete using (personality_is_module_admin() or created_by = auth.uid());

-- ----------------------------------------------------------------------------
-- Responses, scores, validity, AI analysis — all keyed off
-- personality_assessments, visibility scoped the same way.
-- ----------------------------------------------------------------------------

create table if not exists personality_responses (
  id uuid primary key default gen_random_uuid(),
  personality_assessment_id uuid not null references personality_assessments (id) on delete cascade,
  question_id uuid not null references personality_questions (id),
  -- {selected: number|string, selected_option?: text, rank?: [text]} — shape depends on question_type.
  response_value jsonb not null,
  response_time_ms int,
  answered_at timestamptz not null default now(),
  unique (personality_assessment_id, question_id)
);
alter table personality_responses enable row level security;

drop policy if exists "personality_responses_select" on personality_responses;
create policy "personality_responses_select" on personality_responses
  for select using (personality_can_access_assessment(personality_assessment_id));

drop policy if exists "personality_responses_write" on personality_responses;
create policy "personality_responses_write" on personality_responses
  for all using (personality_is_module_admin() or personality_is_assessment_designer())
  with check (personality_is_module_admin() or personality_is_assessment_designer());

create table if not exists personality_dimension_scores (
  id uuid primary key default gen_random_uuid(),
  personality_assessment_id uuid not null references personality_assessments (id) on delete cascade,
  score_kind text not null check (score_kind in ('TRAIT', 'FACET', 'BEHAVIORAL_DIMENSION')),
  trait_id uuid references personality_traits (id),
  facet_id uuid references personality_facets (id),
  dimension_id uuid references personality_behavioral_dimensions (id),
  raw_score numeric,
  normalized_score numeric,
  weighted_score numeric,
  coverage_count int not null default 0,
  confidence text not null default 'LOW' check (confidence in ('LOW', 'MEDIUM', 'HIGH')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);
create index if not exists idx_personality_dimension_scores_assessment on personality_dimension_scores (personality_assessment_id);
alter table personality_dimension_scores enable row level security;

drop policy if exists "personality_dimension_scores_select" on personality_dimension_scores;
create policy "personality_dimension_scores_select" on personality_dimension_scores
  for select using (personality_can_access_assessment(personality_assessment_id));

drop policy if exists "personality_dimension_scores_write" on personality_dimension_scores;
create policy "personality_dimension_scores_write" on personality_dimension_scores
  for all using (personality_is_module_admin() or personality_is_assessment_designer())
  with check (personality_is_module_admin() or personality_is_assessment_designer());

create table if not exists personality_validity_results (
  id uuid primary key default gen_random_uuid(),
  personality_assessment_id uuid not null references personality_assessments (id) on delete cascade unique,
  completion_seconds int,
  straight_lining_flag boolean not null default false,
  extreme_response_rate numeric,
  consistency_score numeric,
  social_desirability_score numeric,
  random_pattern_flag boolean not null default false,
  missing_response_count int not null default 0,
  contradiction_count int not null default 0,
  overall_status text not null default 'VALID' check (overall_status in ('VALID', 'ACCEPTABLE', 'REVIEW_REQUIRED', 'INVALID')),
  computed_at timestamptz not null default now()
);
alter table personality_validity_results enable row level security;

drop policy if exists "personality_validity_results_select" on personality_validity_results;
create policy "personality_validity_results_select" on personality_validity_results
  for select using (personality_can_access_assessment(personality_assessment_id));

drop policy if exists "personality_validity_results_write" on personality_validity_results;
create policy "personality_validity_results_write" on personality_validity_results
  for all using (personality_is_module_admin() or personality_is_assessment_designer())
  with check (personality_is_module_admin() or personality_is_assessment_designer());

-- Mirrors comp_ai_analysis exactly — structured Gemini output, validated against a schema before
-- storage (enforced by the Edge Function, a later phase).
create table if not exists personality_ai_analysis (
  id uuid primary key default gen_random_uuid(),
  personality_assessment_id uuid not null references personality_assessments (id) on delete cascade,
  model text not null,
  analysis jsonb not null,
  confidence text,
  generated_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_personality_ai_analysis_assessment on personality_ai_analysis (personality_assessment_id, created_at desc);
alter table personality_ai_analysis enable row level security;

drop policy if exists "personality_ai_analysis_select" on personality_ai_analysis;
create policy "personality_ai_analysis_select" on personality_ai_analysis
  for select using (personality_can_access_assessment(personality_assessment_id));

drop policy if exists "personality_ai_analysis_insert" on personality_ai_analysis;
create policy "personality_ai_analysis_insert" on personality_ai_analysis
  for insert with check (personality_can_access_assessment(personality_assessment_id));

-- ----------------------------------------------------------------------------
-- updated_at/updated_by triggers (reuses the existing set_updated_at_and_by()
-- trigger function already used across the app).
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'personality_frameworks', 'personality_traits', 'personality_facets',
    'personality_behavioral_dimensions', 'personality_job_behavioral_profiles',
    'personality_questions', 'personality_assessment_templates', 'personality_assessments',
    'personality_dimension_scores'
  ]
  loop
    execute format('drop trigger if exists trg_set_updated_at on %1$s', t);
    execute format('create trigger trg_set_updated_at before update on %1$s for each row execute function set_updated_at_and_by()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Phase 1 catalog seed data (spec section 5, 6, 11, 67) — the reference
-- CATALOG only (framework/traits/facets/behavioral dimensions/response
-- scales/example job profiles), never fake candidate data, scores, or
-- assessments. Every row here is fully editable by an admin afterward.
-- Question CONTENT (the 100-300 actual personality/SJT items) is a later
-- phase.
-- ----------------------------------------------------------------------------

insert into personality_frameworks (key, label_fa, description, version)
values ('big_five', 'مدل پنج‌عاملی شخصیت (Big Five)', 'چارچوب پیش‌فرض و قابل‌تنظیم برای سنجش ویژگی‌های شخصیتی.', 1)
on conflict (key) do nothing;

with fw as (select id from personality_frameworks where key = 'big_five'),
tr as (
  insert into personality_traits (framework_id, key, label_fa, description, display_order)
  select fw.id, v.key, v.label_fa, v.description, v.ord
  from fw, (values
    ('conscientiousness', 'وظیفه‌شناسی', 'نظم، پایبندی به تعهد، برنامه‌ریزی و پیگیری تا نتیجه.', 1),
    ('emotional_stability', 'ثبات هیجانی', 'مدیریت استرس، تنظیم هیجانی و واکنش به فشار/شکست.', 2),
    ('agreeableness', 'همسازی', 'همکاری، احترام، همدلی و رویکرد به تعارض.', 3),
    ('extraversion', 'برون‌گرایی', 'ابتکار در ارتباط، قاطعیت، تعامل اجتماعی و رهبری.', 4),
    ('openness', 'گشودگی به تجربه', 'یادگیری‌پذیری، کنجکاوی، نوآوری و پذیرش روش‌های جدید.', 5)
  ) as v(key, label_fa, description, ord)
  on conflict (framework_id, key) do nothing
  returning id, key
)
insert into personality_facets (trait_id, key, label_fa, display_order)
select tr.id, f.key, f.label_fa, f.ord
from tr
join (values
  ('conscientiousness', 'discipline', 'نظم', 1),
  ('conscientiousness', 'organization', 'سازمان‌دهی', 2),
  ('conscientiousness', 'reliability', 'قابل‌اتکا بودن', 3),
  ('conscientiousness', 'persistence', 'پشتکار', 4),
  ('conscientiousness', 'achievement_orientation', 'گرایش به دستاورد', 5),
  ('conscientiousness', 'planning_orientation', 'گرایش به برنامه‌ریزی', 6),
  ('conscientiousness', 'attention_to_detail', 'دقت به جزئیات', 7),
  ('conscientiousness', 'follow_through', 'پیگیری تا انتها', 8),
  ('emotional_stability', 'stress_management', 'مدیریت استرس', 1),
  ('emotional_stability', 'emotional_regulation', 'تنظیم هیجانی', 2),
  ('emotional_stability', 'pressure_tolerance', 'تحمل فشار', 3),
  ('emotional_stability', 'composure', 'خونسردی', 4),
  ('emotional_stability', 'resilience', 'تاب‌آوری', 5),
  ('emotional_stability', 'reaction_to_setbacks', 'واکنش به ناکامی', 6),
  ('agreeableness', 'cooperation', 'همکاری', 1),
  ('agreeableness', 'respectfulness', 'احترام', 2),
  ('agreeableness', 'empathy', 'همدلی', 3),
  ('agreeableness', 'team_orientation', 'گرایش تیمی', 4),
  ('agreeableness', 'interpersonal_flexibility', 'انعطاف بین‌فردی', 5),
  ('agreeableness', 'conflict_approach', 'رویکرد به تعارض', 6),
  ('extraversion', 'communication_initiative', 'ابتکار در ارتباط', 1),
  ('extraversion', 'assertiveness', 'قاطعیت', 2),
  ('extraversion', 'social_engagement', 'تعامل اجتماعی', 3),
  ('extraversion', 'influence', 'نفوذ', 4),
  ('extraversion', 'leadership_expression', 'بروز رهبری', 5),
  ('openness', 'learning_agility', 'چابکی یادگیری', 1),
  ('openness', 'curiosity', 'کنجکاوی', 2),
  ('openness', 'innovation', 'نوآوری', 3),
  ('openness', 'adaptability', 'انطباق‌پذیری', 4),
  ('openness', 'conceptual_thinking', 'تفکر مفهومی', 5),
  ('openness', 'acceptance_of_new_methods', 'پذیرش روش‌های جدید', 6)
) as f(trait_key, key, label_fa, ord) on f.trait_key = tr.key
on conflict (trait_id, key) do nothing;

insert into personality_behavioral_dimensions (key, label_fa, description)
values
  ('ACCOUNTABILITY', 'پاسخگویی', 'پذیرش مسئولیت نتایج کار خود، حتی در شرایط نامطلوب.'),
  ('DISCIPLINE', 'نظم کاری', 'پایبندی به رویه‌ها، زمان‌بندی و استانداردهای کاری.'),
  ('OWNERSHIP', 'مالکیت کار', 'برخورد با مسئله به‌عنوان مسئله خود، نه انتظار برای دستور دیگران.'),
  ('PERSISTENCE', 'پشتکار', 'ادامه تلاش در کارهای دشوار یا کندپیشرفت.'),
  ('SAFETY_ORIENTATION', 'گرایش ایمنی', 'اولویت‌دهی واقعی به ایمنی در تصمیم‌ها و رفتار روزمره.'),
  ('INTEGRITY_ORIENTATION', 'گرایش به درستکاری', 'صداقت و شفافیت در گزارش‌دهی و تصمیم‌گیری حرفه‌ای.'),
  ('RISK_AWARENESS', 'آگاهی از ریسک', 'شناسایی و در نظر گرفتن ریسک پیش از تصمیم‌گیری.'),
  ('DECISION_CONFIDENCE', 'اطمینان در تصمیم‌گیری', 'توان تصمیم‌گیری به‌موقع با وجود عدم قطعیت.'),
  ('DECISION_QUALITY', 'کیفیت تصمیم', 'استدلال منطقی و مستند در فرآیند تصمیم‌گیری.'),
  ('PROBLEM_OWNERSHIP', 'مالکیت حل مسئله', 'پیگیری یک مسئله تا حل واقعی آن، نه صرفاً گزارش آن.'),
  ('ANALYTICAL_THINKING', 'تفکر تحلیلی', 'تجزیه مسئله به اجزا و استفاده از داده برای تصمیم‌گیری.'),
  ('DETAIL_ORIENTATION', 'دقت به جزئیات', 'توجه به جزئیات فنی/اجرایی که بر کیفیت نتیجه اثر دارند.'),
  ('ADAPTABILITY', 'انطباق‌پذیری', 'تعدیل رویکرد در برابر تغییر شرایط یا اطلاعات جدید.'),
  ('LEARNING_AGILITY', 'چابکی یادگیری', 'سرعت و کیفیت یادگیری از تجربه و بازخورد.'),
  ('CONFLICT_MANAGEMENT', 'مدیریت تعارض', 'رسیدگی سازنده به اختلاف‌نظر حرفه‌ای.'),
  ('COMMUNICATION', 'ارتباطات', 'وضوح، به‌موقع بودن و اثربخشی ارتباط حرفه‌ای.'),
  ('STAKEHOLDER_ORIENTATION', 'گرایش به ذی‌نفعان', 'در نظر گرفتن نیاز و انتظار طرف‌های ذی‌نفع پروژه.'),
  ('TEAMWORK', 'کار تیمی', 'مشارکت مؤثر و حمایت از موفقیت تیم.'),
  ('LEADERSHIP', 'رهبری', 'هدایت، الهام‌بخشی و مسئولیت‌پذیری در قبال عملکرد دیگران.'),
  ('INITIATIVE', 'ابتکار عمل', 'اقدام پیش‌دستانه بدون نیاز به دستور صریح.'),
  ('RULE_ORIENTATION', 'گرایش به رویه', 'پایبندی به مقررات، استانداردها و رویه‌های تعریف‌شده.'),
  ('COMMERCIAL_AWARENESS', 'آگاهی تجاری/قراردادی', 'درک اثر تصمیم‌ها بر هزینه، قرارداد و منافع پروژه.'),
  ('DOCUMENTATION_DISCIPLINE', 'نظم مستندسازی', 'ثبت دقیق و به‌موقع مدارک و سوابق کاری.'),
  ('ESCALATION_JUDGMENT', 'قضاوت در ارجاع', 'تشخیص درست زمان و نحوه ارجاع مسئله به سطح بالاتر.')
on conflict (key) do nothing;

insert into personality_response_scales (key, label_fa, min_value, max_value, labels, scoring_rule, reverse_rule)
values
  ('likert_7', 'لیکرت ۷ درجه‌ای (توافق)', 1, 7,
   '[{"value":1,"label_fa":"کاملاً مخالفم"},{"value":2,"label_fa":"مخالفم"},{"value":3,"label_fa":"نسبتاً مخالفم"},{"value":4,"label_fa":"خنثی"},{"value":5,"label_fa":"نسبتاً موافقم"},{"value":6,"label_fa":"موافقم"},{"value":7,"label_fa":"کاملاً موافقم"}]'::jsonb,
   'linear', 'mirror_min_max'),
  ('likert_5', 'لیکرت ۵ درجه‌ای (توافق)', 1, 5,
   '[{"value":1,"label_fa":"کاملاً مخالفم"},{"value":2,"label_fa":"مخالفم"},{"value":3,"label_fa":"خنثی"},{"value":4,"label_fa":"موافقم"},{"value":5,"label_fa":"کاملاً موافقم"}]'::jsonb,
   'linear', 'mirror_min_max'),
  ('frequency_5', 'فراوانی رفتار (۵ درجه)', 1, 5,
   '[{"value":1,"label_fa":"هرگز"},{"value":2,"label_fa":"بندرت"},{"value":3,"label_fa":"گاهی"},{"value":4,"label_fa":"اغلب"},{"value":5,"label_fa":"همیشه"}]'::jsonb,
   'linear', 'mirror_min_max'),
  ('importance_5', 'اهمیت (۵ درجه)', 1, 5,
   '[{"value":1,"label_fa":"بی‌اهمیت"},{"value":2,"label_fa":"کم‌اهمیت"},{"value":3,"label_fa":"متوسط"},{"value":4,"label_fa":"مهم"},{"value":5,"label_fa":"بسیار مهم"}]'::jsonb,
   'linear', 'mirror_min_max'),
  ('forced_choice_2', 'انتخاب اجباری (دو گزینه‌ای)', 1, 2, '[]'::jsonb, 'categorical', 'not_applicable'),
  ('sjt_rank', 'رتبه‌بندی گزینه‌های موقعیتی', 1, 4, '[]'::jsonb, 'rank_weighted', 'not_applicable')
on conflict (key) do nothing;

-- Example job behavioral profiles (spec section 8) — templates, not fixed psychological truths;
-- admins can edit weights/thresholds or add more roles.
with pm as (
  insert into personality_job_behavioral_profiles (job_role, title)
  values ('project_manager', 'نیم‌رخ رفتاری پیش‌فرض — مدیر پروژه')
  returning id
)
insert into personality_job_behavioral_requirements (profile_id, dimension_id, weight, min_threshold, is_critical)
select pm.id, d.id, v.weight, v.min_threshold, v.is_critical
from pm
join (values
  ('ACCOUNTABILITY', 12, 70, true),
  ('OWNERSHIP', 10, 65, false),
  ('DECISION_CONFIDENCE', 10, 65, false),
  ('LEADERSHIP', 12, 65, false),
  ('STAKEHOLDER_ORIENTATION', 10, 60, false),
  ('CONFLICT_MANAGEMENT', 10, 60, false)
) as v(dim_key, weight, min_threshold, is_critical) on true
join personality_behavioral_dimensions d on d.key = v.dim_key
on conflict (profile_id, dimension_id) do nothing;

with pm as (select id from personality_job_behavioral_profiles where job_role = 'project_manager')
insert into personality_job_behavioral_requirements (profile_id, dimension_id, weight, min_threshold, is_critical)
select pm.id, d.id, 8, 55, false
from pm, personality_behavioral_dimensions d
where d.key in ('ADAPTABILITY', 'RISK_AWARENESS', 'SAFETY_ORIENTATION', 'INTEGRITY_ORIENTATION', 'COMMUNICATION')
on conflict (profile_id, dimension_id) do nothing;

with wi as (
  insert into personality_job_behavioral_profiles (job_role, title)
  values ('welding_inspector', 'نیم‌رخ رفتاری پیش‌فرض — بازرس جوش')
  returning id
)
insert into personality_job_behavioral_requirements (profile_id, dimension_id, weight, min_threshold, is_critical)
select wi.id, d.id, v.weight, v.min_threshold, v.is_critical
from wi
join (values
  ('DETAIL_ORIENTATION', 15, 75, true),
  ('RULE_ORIENTATION', 12, 70, true),
  ('SAFETY_ORIENTATION', 15, 75, true),
  ('INTEGRITY_ORIENTATION', 12, 70, true),
  ('PERSISTENCE', 10, 60, false),
  ('DOCUMENTATION_DISCIPLINE', 10, 65, false)
) as v(dim_key, weight, min_threshold, is_critical) on true
join personality_behavioral_dimensions d on d.key = v.dim_key
on conflict (profile_id, dimension_id) do nothing;

with hse as (
  insert into personality_job_behavioral_profiles (job_role, title)
  values ('hse_specialist', 'نیم‌رخ رفتاری پیش‌فرض — کارشناس HSE')
  returning id
)
insert into personality_job_behavioral_requirements (profile_id, dimension_id, weight, min_threshold, is_critical)
select hse.id, d.id, v.weight, v.min_threshold, v.is_critical
from hse
join (values
  ('SAFETY_ORIENTATION', 18, 80, true),
  ('RULE_ORIENTATION', 12, 70, false),
  ('RISK_AWARENESS', 15, 75, true),
  ('INTEGRITY_ORIENTATION', 12, 70, false),
  ('CONFLICT_MANAGEMENT', 10, 60, false),
  ('ESCALATION_JUDGMENT', 12, 65, true),
  ('COMMUNICATION', 10, 60, false)
) as v(dim_key, weight, min_threshold, is_critical) on true
join personality_behavioral_dimensions d on d.key = v.dim_key
on conflict (profile_id, dimension_id) do nothing;

with pc as (
  insert into personality_job_behavioral_profiles (job_role, title)
  values ('project_control_specialist', 'نیم‌رخ رفتاری پیش‌فرض — کارشناس کنترل پروژه')
  returning id
)
insert into personality_job_behavioral_requirements (profile_id, dimension_id, weight, min_threshold, is_critical)
select pc.id, d.id, v.weight, v.min_threshold, v.is_critical
from pc
join (values
  ('ANALYTICAL_THINKING', 18, 75, true),
  ('DISCIPLINE', 12, 70, false),
  ('DETAIL_ORIENTATION', 12, 70, false),
  ('PERSISTENCE', 10, 60, false),
  ('DOCUMENTATION_DISCIPLINE', 12, 65, false)
) as v(dim_key, weight, min_threshold, is_critical) on true
join personality_behavioral_dimensions d on d.key = v.dim_key
on conflict (profile_id, dimension_id) do nothing;

-- ============================================================================
-- Section 41: Personality & Behavioral Assessment Engine — Phase 3: server-side
-- scoring engine + candidate RPCs. Scoring is centralized here (never in
-- frontend code) and always computed from personality_responses — the
-- frontend only ever reads the resulting personality_dimension_scores/
-- personality_validity_results rows.
-- ============================================================================

-- comp_question_bank_public()-equivalent: a safe, non-sensitive projection of a personality
-- question for the candidate-facing UI — strips dimension_key/score from every option (candidate
-- must never see which trait/dimension is measured or how an option scores). Scale metadata is
-- inlined here (rather than a separate personality_response_scales lookup) because the
-- candidate-taking flow is anonymous and personality_response_scales' RLS is authenticated-only.
create or replace function personality_question_public(p_ids uuid[])
returns table (
  id uuid, question_type text, question_text text, scenario_context text, scale_id uuid, options jsonb, complexity text,
  scale_key text, scale_min_value int, scale_max_value int, scale_labels jsonb
) as $$
  select
    q.id, q.question_type, q.question_text, q.scenario_context, q.scale_id,
    coalesce(
      (select jsonb_agg(jsonb_build_object('key', opt->>'key', 'label_fa', opt->>'label_fa') order by opt->>'key')
       from jsonb_array_elements(q.options) as opt),
      '[]'::jsonb
    ) as options,
    q.complexity,
    s.key, s.min_value, s.max_value, s.labels
  from personality_questions q
  left join personality_response_scales s on s.id = q.scale_id
  where q.id = any(p_ids);
$$ language sql security definer stable;

grant execute on function personality_question_public(uuid[]) to anon, authenticated;

-- Candidate-taking flow (anon, via candidate_token — never the same token as results_share_token).

create or replace function personality_candidate_get(p_token uuid)
returns table (
  id uuid, status text, selected_question_ids jsonb, started_at timestamptz, submitted_at timestamptz
) as $$
  select pa.id, pa.status, pa.selected_question_ids, pa.started_at, pa.submitted_at
  from personality_assessments pa
  where pa.candidate_token = p_token;
$$ language sql security definer stable;

grant execute on function personality_candidate_get(uuid) to anon, authenticated;

create or replace function personality_candidate_start(p_token uuid)
returns void as $$
  update personality_assessments
  set status = case when status = 'DESIGNED' or status = 'GENERATED' or status = 'ASSIGNED' then 'STARTED' else status end,
      started_at = coalesce(started_at, now())
  where candidate_token = p_token and status not in ('SUBMITTED', 'VALIDITY_CHECK', 'SCORING', 'FINGERPRINT', 'AI_ANALYSIS', 'FINAL_REVIEW', 'LOCKED', 'ARCHIVED');
$$ language sql security definer;

grant execute on function personality_candidate_start(uuid) to anon, authenticated;

create or replace function personality_candidate_submit_response(p_token uuid, p_question_id uuid, p_response jsonb, p_response_time_ms int default null)
returns void as $$
declare
  v_id uuid;
  v_status text;
begin
  select pa.id, pa.status into v_id, v_status from personality_assessments pa where pa.candidate_token = p_token;
  if v_id is null then
    raise exception 'invalid token';
  end if;
  if v_status in ('SUBMITTED', 'VALIDITY_CHECK', 'SCORING', 'FINGERPRINT', 'AI_ANALYSIS', 'FINAL_REVIEW', 'LOCKED', 'ARCHIVED') then
    raise exception 'assessment already submitted';
  end if;
  update personality_assessments set status = 'IN_PROGRESS' where id = v_id and status = 'STARTED';
  insert into personality_responses (personality_assessment_id, question_id, response_value, response_time_ms)
  values (v_id, p_question_id, p_response, p_response_time_ms)
  on conflict (personality_assessment_id, question_id)
  do update set response_value = excluded.response_value, response_time_ms = excluded.response_time_ms, answered_at = now();
end;
$$ language plpgsql security definer;

grant execute on function personality_candidate_submit_response(uuid, uuid, jsonb, int) to anon, authenticated;

-- Scoring engine. Idempotent (re-running after a reopen recomputes cleanly). Never claims
-- population percentiles — normalized 0-100 only.
create or replace function personality_score_assessment(p_id uuid)
returns void as $$
declare
  pa personality_assessments%rowtype;
  v_straight_lining boolean := false;
  v_missing int := 0;
  v_total_selected int := 0;
  v_completion_seconds int;
begin
  select * into pa from personality_assessments where id = p_id;
  if not found then
    raise exception 'personality assessment not found';
  end if;

  delete from personality_dimension_scores where personality_assessment_id = p_id;

  -- TRAIT scores (Big Five) — average of normalized 0-1 LIKERT/FREQUENCY item scores tied to a
  -- trait, reverse-scored items mirrored around the scale midpoint first.
  insert into personality_dimension_scores (personality_assessment_id, score_kind, trait_id, raw_score, normalized_score, weighted_score, coverage_count, confidence)
  select p_id, 'TRAIT', x.trait_id, avg(x.v), avg(x.v) * 100, avg(x.v) * 100, count(*),
    case when count(*) >= 5 then 'HIGH' when count(*) >= 2 then 'MEDIUM' else 'LOW' end
  from (
    select q.trait_id,
      case when q.reverse_scored
        then 1.0 - (((r.response_value->>'selected')::numeric - s.min_value) / nullif(s.max_value - s.min_value, 0))
        else ((r.response_value->>'selected')::numeric - s.min_value) / nullif(s.max_value - s.min_value, 0)
      end as v
    from personality_responses r
    join personality_questions q on q.id = r.question_id
    join personality_response_scales s on s.id = q.scale_id
    where r.personality_assessment_id = p_id
      and q.trait_id is not null
      and q.question_type in ('LIKERT', 'FREQUENCY')
      and (r.response_value ? 'selected')
  ) x
  where x.v is not null
  group by x.trait_id;

  -- FACET scores — same source, grouped by facet.
  insert into personality_dimension_scores (personality_assessment_id, score_kind, facet_id, raw_score, normalized_score, weighted_score, coverage_count, confidence)
  select p_id, 'FACET', x.facet_id, avg(x.v), avg(x.v) * 100, avg(x.v) * 100, count(*),
    case when count(*) >= 3 then 'HIGH' when count(*) >= 1 then 'MEDIUM' else 'LOW' end
  from (
    select q.facet_id,
      case when q.reverse_scored
        then 1.0 - (((r.response_value->>'selected')::numeric - s.min_value) / nullif(s.max_value - s.min_value, 0))
        else ((r.response_value->>'selected')::numeric - s.min_value) / nullif(s.max_value - s.min_value, 0)
      end as v
    from personality_responses r
    join personality_questions q on q.id = r.question_id
    join personality_response_scales s on s.id = q.scale_id
    where r.personality_assessment_id = p_id
      and q.facet_id is not null
      and q.question_type in ('LIKERT', 'FREQUENCY')
      and (r.response_value ? 'selected')
  ) x
  where x.v is not null
  group by x.facet_id;

  -- BEHAVIORAL_DIMENSION scores — LIKERT/FREQUENCY items tied directly to a dimension, PLUS
  -- FORCED_CHOICE/SJT/PRIORITY_CHOICE/EXPERIENCE_ANCHORED items resolved via the chosen option's
  -- embedded dimension_key/score (SJT/EA/PRIORITY_CHOICE options carry a 0-5 quality score;
  -- FORCED_CHOICE is ipsative, so a chosen side counts as full credit toward its own construct).
  insert into personality_dimension_scores (personality_assessment_id, score_kind, dimension_id, raw_score, normalized_score, weighted_score, coverage_count, confidence)
  select p_id, 'BEHAVIORAL_DIMENSION', x.dim_id, avg(x.v), avg(x.v) * 100, avg(x.v) * 100, count(*),
    case when count(*) >= 4 then 'HIGH' when count(*) >= 2 then 'MEDIUM' else 'LOW' end
  from (
    select q.dimension_id as dim_id,
      case when q.reverse_scored
        then 1.0 - (((r.response_value->>'selected')::numeric - s.min_value) / nullif(s.max_value - s.min_value, 0))
        else ((r.response_value->>'selected')::numeric - s.min_value) / nullif(s.max_value - s.min_value, 0)
      end as v
    from personality_responses r
    join personality_questions q on q.id = r.question_id
    join personality_response_scales s on s.id = q.scale_id
    where r.personality_assessment_id = p_id
      and q.dimension_id is not null
      and q.question_type in ('LIKERT', 'FREQUENCY')
      and (r.response_value ? 'selected')

    union all

    select d.id as dim_id,
      case when q.question_type = 'FORCED_CHOICE' then 1.0 else (opt->>'score')::numeric / 5.0 end as v
    from personality_responses r
    join personality_questions q on q.id = r.question_id
    cross join lateral jsonb_array_elements(q.options) as opt
    join personality_behavioral_dimensions d on d.key = (opt->>'dimension_key')
    where r.personality_assessment_id = p_id
      and q.question_type in ('FORCED_CHOICE', 'SJT', 'PRIORITY_CHOICE', 'EXPERIENCE_ANCHORED')
      and (r.response_value->>'selected_option') = (opt->>'key')
  ) x
  where x.v is not null
  group by x.dim_id;

  -- Response validity — evidence for review, never an automatic dishonesty verdict.
  -- Straight-lining: candidate picked the single most common LIKERT/FREQUENCY value on more than
  -- 90% of those items (only evaluated once there are enough such items to mean anything).
  select (count(*) filter (where v = mode_v))::numeric / nullif(count(*), 0) > 0.9
  into v_straight_lining
  from (
    select (r.response_value->>'selected')::numeric as v
    from personality_responses r
    join personality_questions q on q.id = r.question_id
    where r.personality_assessment_id = p_id and q.question_type in ('LIKERT', 'FREQUENCY') and (r.response_value ? 'selected')
  ) vals
  cross join lateral (select mode() within group (order by v) as mode_v from (
    select (r2.response_value->>'selected')::numeric as v
    from personality_responses r2
    join personality_questions q2 on q2.id = r2.question_id
    where r2.personality_assessment_id = p_id and q2.question_type in ('LIKERT', 'FREQUENCY') and (r2.response_value ? 'selected')
  ) inner_vals) m
  having count(*) >= 8;

  v_straight_lining := coalesce(v_straight_lining, false);

  select jsonb_array_length(pa.selected_question_ids) into v_total_selected;
  select v_total_selected - count(*) into v_missing from personality_responses where personality_assessment_id = p_id;
  v_completion_seconds := case when pa.started_at is not null then greatest(0, extract(epoch from (now() - pa.started_at))::int) else null end;

  insert into personality_validity_results (
    personality_assessment_id, completion_seconds, straight_lining_flag, missing_response_count, overall_status
  )
  values (
    p_id, v_completion_seconds, v_straight_lining, greatest(0, coalesce(v_missing, 0)),
    case when v_straight_lining or coalesce(v_missing, 0) > 0 then 'REVIEW_REQUIRED' else 'ACCEPTABLE' end
  )
  on conflict (personality_assessment_id) do update set
    completion_seconds = excluded.completion_seconds,
    straight_lining_flag = excluded.straight_lining_flag,
    missing_response_count = excluded.missing_response_count,
    overall_status = excluded.overall_status,
    computed_at = now();

  -- Deterministic, rule-based watchpoints — never a diagnosis, just a flag for structured-interview
  -- follow-up when a behavioral dimension scores low.
  update personality_assessments pa2
  set computed_watchpoints = coalesce((
    select jsonb_agg(jsonb_build_object(
      'dimensionKeys', jsonb_build_array(d.key),
      'topic', 'در مصاحبه ساختاریافته، شواهد بیشتری درباره «' || d.label_fa || '» بررسی شود.'
    ))
    from personality_dimension_scores ds
    join personality_behavioral_dimensions d on d.id = ds.dimension_id
    where ds.personality_assessment_id = p_id and ds.score_kind = 'BEHAVIORAL_DIMENSION' and ds.normalized_score < 40
  ), '[]'::jsonb),
  computed_patterns = coalesce((
    select jsonb_agg(jsonb_build_object(
      'dimensionKeys', jsonb_build_array(d.key),
      'interpretation', 'الگوی پاسخ نشان‌دهنده تمایل نسبتاً قوی در حوزه «' || d.label_fa || '» است.'
    ))
    from personality_dimension_scores ds
    join personality_behavioral_dimensions d on d.id = ds.dimension_id
    where ds.personality_assessment_id = p_id and ds.score_kind = 'BEHAVIORAL_DIMENSION' and ds.normalized_score >= 80
  ), '[]'::jsonb),
  status = 'FINGERPRINT',
  submitted_at = coalesce(pa2.submitted_at, now()),
  updated_at = now()
  where pa2.id = p_id;

  perform comp_log_audit('PERSONALITY_ASSESSMENT_SCORED', 'personality_assessments', p_id, null, jsonb_build_object('status', 'FINGERPRINT'));
end;
$$ language plpgsql security definer;

grant execute on function personality_score_assessment(uuid) to authenticated;

-- Candidate-facing finalize: marks submitted and scores in one call, callable by the anon
-- candidate-taking flow via their own token (never requires a RASTA login).
create or replace function personality_candidate_finalize(p_token uuid)
returns void as $$
declare
  v_id uuid;
begin
  select id into v_id from personality_assessments where candidate_token = p_token;
  if v_id is null then
    raise exception 'invalid token';
  end if;
  update personality_assessments set status = 'SUBMITTED', submitted_at = coalesce(submitted_at, now()) where id = v_id;
  perform personality_score_assessment(v_id);
end;
$$ language plpgsql security definer;

grant execute on function personality_candidate_finalize(uuid) to anon, authenticated;

-- Lets the anon candidate-taking UI resume mid-way after a page reload — returns only this
-- candidate's own already-submitted answers (scoped by their own token, never another candidate's).
create or replace function personality_candidate_get_responses(p_token uuid)
returns table (question_id uuid, response_value jsonb) as $$
  select r.question_id, r.response_value
  from personality_responses r
  join personality_assessments pa on pa.id = r.personality_assessment_id
  where pa.candidate_token = p_token;
$$ language sql security definer stable;

grant execute on function personality_candidate_get_responses(uuid) to anon, authenticated;

-- Public "view results online" link (analogous to comp_public_results_get) — read-only,
-- non-sensitive projection only (no raw item-level answers, no reference content).
create or replace function personality_public_results_get(p_token uuid)
returns table (
  id uuid, job_role text, status text, submitted_at timestamptz,
  dimension_scores jsonb, validity_status text
) as $$
  select
    pa.id, pa.job_role, pa.status, pa.submitted_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'scoreKind', ds.score_kind,
        'traitKey', t.key, 'traitLabelFa', t.label_fa,
        'facetKey', f.key, 'facetLabelFa', f.label_fa,
        'dimensionKey', d.key, 'dimensionLabelFa', d.label_fa,
        'normalizedScore', ds.normalized_score, 'coverageCount', ds.coverage_count, 'confidence', ds.confidence
      ))
      from personality_dimension_scores ds
      left join personality_traits t on t.id = ds.trait_id
      left join personality_facets f on f.id = ds.facet_id
      left join personality_behavioral_dimensions d on d.id = ds.dimension_id
      where ds.personality_assessment_id = pa.id
    ), '[]'::jsonb),
    (select vr.overall_status from personality_validity_results vr where vr.personality_assessment_id = pa.id)
  from personality_assessments pa
  where pa.results_share_token = p_token;
$$ language sql security definer stable;

-- ----------------------------------------------------------------------------
-- Section 42: Personality & Behavioral Assessment Engine — question usage
-- tracking. Mirrors comp_increment_question_usage exactly (Section 34): a
-- narrow, low-risk RPC (bumping a counter can't leak or corrupt anything
-- sensitive) so a plain designer generating an assessment — who has no
-- general UPDATE grant on personality_questions (admin-only) — can still
-- bump usage_count without a dedicated table-level policy.
-- ----------------------------------------------------------------------------

create or replace function personality_increment_question_usage(p_ids uuid[])
returns void as $$
  update personality_questions
  set usage_count = usage_count + 1, last_used_at = now()
  where id = any(p_ids) and auth.uid() is not null;
$$ language sql security definer;

grant execute on function personality_increment_question_usage(uuid[]) to authenticated;

grant execute on function personality_public_results_get(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Section 43: Personality & Behavioral Assessment Engine — module-scoped role
-- management RPCs. Mirrors comp_grant_role/comp_revoke_role/
-- comp_list_role_assignments exactly (Section 32): rasta_user_roles is a
-- sitewide table gated to GLOBAL admins only (is_admin_user()), but a
-- personality-only module admin (personality_is_module_admin(), who may not
-- be a global admin) still needs to manage PERSONALITY_ASSESSMENT_DESIGNER/
-- PERSONALITY_REPORT_VIEWER grants from the module's own Settings page. These
-- narrow SECURITY DEFINER RPCs let them do exactly that, scoped to only these
-- two role names, without broadening the generic rasta_user_roles policy.
-- ----------------------------------------------------------------------------

create or replace function personality_grant_role(p_user_id uuid, p_role_name text)
returns void as $$
declare
  v_role_id uuid;
begin
  if not personality_is_module_admin() then
    raise exception 'forbidden';
  end if;
  if p_role_name not in ('PERSONALITY_ASSESSMENT_DESIGNER', 'PERSONALITY_REPORT_VIEWER') then
    raise exception 'invalid role';
  end if;
  select id into v_role_id from rasta_roles where name = p_role_name;
  if v_role_id is null then
    raise exception 'role not found';
  end if;
  insert into rasta_user_roles (user_id, role_id, created_by)
  values (p_user_id, v_role_id, auth.uid())
  on conflict (user_id, role_id) do nothing;
end;
$$ language plpgsql security definer;

create or replace function personality_revoke_role(p_user_id uuid, p_role_name text)
returns void as $$
declare
  v_role_id uuid;
begin
  if not personality_is_module_admin() then
    raise exception 'forbidden';
  end if;
  select id into v_role_id from rasta_roles where name = p_role_name;
  if v_role_id is null then
    return;
  end if;
  delete from rasta_user_roles where user_id = p_user_id and role_id = v_role_id;
end;
$$ language plpgsql security definer;

create or replace function personality_list_role_assignments(p_role_name text)
returns table (user_id uuid, created_by uuid, created_at timestamptz) as $$
  select ur.user_id, ur.created_by, ur.created_at
  from rasta_user_roles ur
  join rasta_roles r on r.id = ur.role_id
  where r.name = p_role_name and personality_is_module_admin();
$$ language sql security definer stable;

-- ============================================================================
-- Section 44: Integrated Exam Design Panel (spec follow-up) — lets a
-- competency ASSESSMENT_DESIGNER decide, per candidate, whether a personality
-- assessment and/or the technical assessment are required, from a new stage
-- in the candidate wizard positioned right after "پنل مصاحبه‌گران". This is
-- also the bridge point where the Personality module — previously its own
-- standalone top-level module — gets embedded into the Competency module's
-- own candidate flow instead: rather than duplicating RBAC, a competency
-- ASSESSMENT_DESIGNER is granted the same standing as a
-- PERSONALITY_ASSESSMENT_DESIGNER (see the redefinition below), so the same
-- person configuring the technical question mix here can also configure and
-- read the personality assessment for the same candidate without a second,
-- separate module-admin grant.
-- ============================================================================

alter table comp_assessments add column if not exists needs_personality_assessment boolean not null default false;
alter table comp_assessments add column if not exists needs_technical_assessment boolean not null default true;

-- Narrow, single-purpose RPC (same reasoning as comp_increment_question_usage/comp_reopen_assessment):
-- the general comp_assessments UPDATE policy is scoped to the assessment's own lead, but deciding
-- the exam design is an ASSESSMENT_DESIGNER-only action, which may not be the same person.
create or replace function comp_set_exam_design(p_assessment_id uuid, p_needs_personality boolean, p_needs_technical boolean)
returns void as $$
begin
  if not (comp_is_assessment_designer() or comp_is_module_admin()) then
    raise exception 'forbidden';
  end if;
  update comp_assessments
  set needs_personality_assessment = p_needs_personality, needs_technical_assessment = p_needs_technical
  where id = p_assessment_id;
  perform comp_log_audit(
    'EXAM_DESIGN_SET', 'comp_assessments', p_assessment_id, null,
    jsonb_build_object('needsPersonalityAssessment', p_needs_personality, 'needsTechnicalAssessment', p_needs_technical)
  );
end;
$$ language plpgsql security definer;

-- Bridges the two modules' designer roles: a competency ASSESSMENT_DESIGNER (the group the user
-- chose to reuse for the whole exam design panel, including the personality mix) is now
-- automatically also a personality-module assessment designer, without a second, separate grant.
-- personality_is_report_viewer() and every RLS policy built on personality_is_assessment_designer()
-- (question bank write, template management, personality_can_access_assessment, etc.) inherit this
-- for free — no other policy needs to change.
create or replace function personality_is_assessment_designer()
returns boolean as $$
  select personality_is_module_admin() or comp_is_assessment_designer() or rasta_has_permission(auth.uid(), 'personality', 'configure');
$$ language sql security definer stable;

-- ----------------------------------------------------------------------------
-- Section 45: Personality module no longer a standalone top-level module (see
-- Section 44's Exam Design Panel) — deactivate its rasta_modules row so it no
-- longer shows as a toggleable environment in the admin access matrix or in
-- rasta_my_accessible_modules(). Deliberately just deactivated, not deleted:
-- rasta_has_permission()/personality_is_assessment_designer() etc. read
-- rasta_permissions/rasta_role_permissions directly and never join through
-- rasta_modules, so this has no effect on any real RBAC check — it only hides
-- the now-meaningless top-level entry.
-- ----------------------------------------------------------------------------

update rasta_modules set is_active = false where key = 'personality';

-- ============================================================================
-- Section 46: Unified Candidate AI Analysis (spec follow-up) — replaces the
-- two separate comp_ai_analysis (technical-only) and personality_ai_analysis
-- (personality-only) analyses with ONE comprehensive, evidence-based analysis
-- per candidate, covering personality profiling, behavioral pattern,
-- technical/specialized evaluation, and job-fit together — generated by a
-- single Gemini call that reads BOTH the technical and personality data for
-- the same comp_assessments row. The two old tables/edge functions are left
-- in place untouched (historical data, never deleted), but the frontend
-- stops surfacing/generating them in favor of this one.
-- ============================================================================

create table if not exists comp_candidate_ai_analysis (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references comp_assessments (id) on delete cascade,
  model text not null,
  analysis jsonb not null,
  confidence text,
  generated_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_comp_candidate_ai_analysis_assessment on comp_candidate_ai_analysis (assessment_id, created_at desc);
alter table comp_candidate_ai_analysis enable row level security;

-- Same permissive, any-authenticated-user policy already used for comp_ai_analysis/
-- personality_ai_analysis — a deliberate existing choice in this codebase, not a new relaxation.
drop policy if exists "comp_candidate_ai_analysis_select" on comp_candidate_ai_analysis;
create policy "comp_candidate_ai_analysis_select" on comp_candidate_ai_analysis
  for select using (auth.uid() is not null);

drop policy if exists "comp_candidate_ai_analysis_insert" on comp_candidate_ai_analysis;
create policy "comp_candidate_ai_analysis_insert" on comp_candidate_ai_analysis
  for insert with check (auth.uid() is not null);

-- ============================================================================
-- Section 47: Enterprise Competency Assessment Engine — Phase 1: configurable
-- Job Role catalog + a unified Competency Model spanning both technical and
-- behavioral evidence.
--
-- Reuse note (per explicit instruction to extend rather than duplicate):
-- job_role was ALREADY plain `text` everywhere (comp_assessments, comp_
-- question_bank, personality_*) with no DB-level CHECK constraint against a
-- fixed list — the "fixed enum" only ever existed in the frontend's JobRole
-- TypeScript union. comp_job_role_config already existed as a real,
-- admin-writable, one-row-per-role config table (allowed_question_types) —
-- rather than creating a parallel comp_job_roles table, this EXTENDS that
-- exact table into the full configurable job-role catalog (adding a
-- label/description/active/sort_order), so adding "a future role" from now
-- on is a single INSERT, no code change, no new table.
--
-- comp_competencies/comp_job_competency_requirements are genuinely new: no
-- existing entity spans BOTH technical and behavioral evidence under one
-- named competency. This generalizes the exact pattern already proven by
-- personality_job_behavioral_profiles/personality_job_behavioral_requirements
-- (Section 40) — same shape (required level, critical flag, weight per job)
-- — but scoped to job_role directly (via comp_job_role_config) rather than a
-- separate "profile" indirection, and to a domain-tagged competency instead
-- of a behavioral-dimension-only one. Evidence-source wiring (which
-- assessments/items actually feed each competency's score) is deliberately
-- OUT of scope here — that is the next phase (Evidence Engine) — this phase
-- is the catalog/model only.
-- ============================================================================

alter table comp_job_role_config add column if not exists label_fa text not null default '';
alter table comp_job_role_config add column if not exists description text not null default '';
alter table comp_job_role_config add column if not exists active boolean not null default true;
alter table comp_job_role_config add column if not exists sort_order int not null default 0;
alter table comp_job_role_config add column if not exists created_at timestamptz not null default now();

-- Backfill the 12 pre-existing roles' Persian labels/order — mirrors JOB_ROLE_LABEL_FA/JOB_ROLES
-- from src/modules/competency/types.ts exactly, so nothing in the UI changes when this ships.
update comp_job_role_config set label_fa = v.label_fa, sort_order = v.sort_order
from (values
  ('project_manager', 'مدیر پروژه', 1),
  ('welding_inspector', 'بازرس جوش', 2),
  ('mechanical_piping_inspector', 'بازرس مکانیک/پایپینگ', 3),
  ('pipeline_inspector', 'بازرس خط لوله', 4),
  ('coating_cp_inspector', 'بازرس پوشش و حفاظت کاتدی', 5),
  ('radiography_interpreter', 'مفسر رادیوگرافی', 6),
  ('civil_engineer', 'مهندس عمران', 7),
  ('project_control_specialist', 'کارشناس کنترل پروژه', 8),
  ('hse_specialist', 'کارشناس HSE', 9),
  ('contracts_specialist', 'کارشناس قراردادها', 10),
  ('site_supervisor', 'سرپرست کارگاه', 11),
  ('inspection_body_supervisor', 'سرپرست نهاد بازرسی', 12)
) as v(job_role, label_fa, sort_order)
where comp_job_role_config.job_role = v.job_role and comp_job_role_config.label_fa = '';

create table if not exists comp_competencies (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label_fa text not null,
  description text not null default '',
  -- Which evidence domain(s) this competency conceptually draws from — informs the Evidence
  -- Engine (next phase) which assessment types are even relevant, without yet defining the exact
  -- weighted evidence-source mapping.
  domain text not null default 'HYBRID' check (domain in ('TECHNICAL', 'BEHAVIORAL', 'HYBRID')),
  -- Configurable proficiency scale — mirrors personality_response_scales' own jsonb-labels
  -- pattern rather than a fixed level count baked into a column.
  proficiency_levels jsonb not null default
    '[{"level":1,"label_fa":"مبتدی"},{"level":2,"label_fa":"کارآمد"},{"level":3,"label_fa":"ماهر"},{"level":4,"label_fa":"متخصص"},{"level":5,"label_fa":"استاد"}]'::jsonb,
  active boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

create table if not exists comp_job_competency_requirements (
  id uuid primary key default gen_random_uuid(),
  job_role text not null references comp_job_role_config (job_role) on delete cascade,
  competency_id uuid not null references comp_competencies (id) on delete cascade,
  required_level numeric not null,
  is_critical boolean not null default false,
  weight numeric not null default 1 check (weight > 0),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  unique (job_role, competency_id)
);

create index if not exists idx_comp_job_competency_requirements_job_role on comp_job_competency_requirements (job_role);
create index if not exists idx_comp_job_competency_requirements_competency on comp_job_competency_requirements (competency_id);

alter table comp_competencies enable row level security;
alter table comp_job_competency_requirements enable row level security;

-- Same "any authenticated user reads, admin-or-assessment-designer writes" pattern already used
-- for comp_job_role_config/personality_job_behavioral_requirements — reused verbatim, not a new
-- policy shape.
do $$
declare
  t text;
begin
  foreach t in array array['comp_competencies', 'comp_job_competency_requirements']
  loop
    execute format('drop policy if exists "%1$s_select_authenticated" on %1$s', t);
    execute format('create policy "%1$s_select_authenticated" on %1$s for select using (auth.uid() is not null)', t);
    execute format('drop policy if exists "%1$s_write_admin_or_designer" on %1$s', t);
    execute format(
      'create policy "%1$s_write_admin_or_designer" on %1$s for all using (comp_is_module_admin() or comp_is_assessment_designer()) with check (comp_is_module_admin() or comp_is_assessment_designer())',
      t
    );
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['comp_competencies', 'comp_job_competency_requirements']
  loop
    execute format('drop trigger if exists trg_set_updated_at on %I', t);
    execute format('create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at_and_by()', t);
  end loop;
end $$;

-- ============================================================================
-- Section 48: Enterprise Competency Assessment Engine — public "view results
-- online" link needs the job role's Persian label too, now that job-role
-- labels are admin-configurable data (comp_job_role_config, Section 47)
-- instead of a frontend-hardcoded Record<JobRole, string>. The candidate on
-- this anonymous link has no session, so the frontend cannot fall back to an
-- authenticated fetch of comp_job_role_config (RLS there requires auth.uid()
-- is not null) — personality_public_results_get is already SECURITY DEFINER
-- and already returns non-sensitive fields (job_role itself included), so
-- resolving the label server-side here is the smallest possible fix, exactly
-- mirroring the existing non-sensitive-projection pattern of this function.
-- ----------------------------------------------------------------------------

drop function if exists personality_public_results_get(uuid);
create or replace function personality_public_results_get(p_token uuid)
returns table (
  id uuid, job_role text, job_role_label_fa text, status text, submitted_at timestamptz,
  dimension_scores jsonb, validity_status text
) as $$
  select
    pa.id, pa.job_role, coalesce(nullif(jrc.label_fa, ''), pa.job_role), pa.status, pa.submitted_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'scoreKind', ds.score_kind,
        'traitKey', t.key, 'traitLabelFa', t.label_fa,
        'facetKey', f.key, 'facetLabelFa', f.label_fa,
        'dimensionKey', d.key, 'dimensionLabelFa', d.label_fa,
        'normalizedScore', ds.normalized_score, 'coverageCount', ds.coverage_count, 'confidence', ds.confidence
      ))
      from personality_dimension_scores ds
      left join personality_traits t on t.id = ds.trait_id
      left join personality_facets f on f.id = ds.facet_id
      left join personality_behavioral_dimensions d on d.id = ds.dimension_id
      where ds.personality_assessment_id = pa.id
    ), '[]'::jsonb),
    (select vr.overall_status from personality_validity_results vr where vr.personality_assessment_id = pa.id)
  from personality_assessments pa
  left join comp_job_role_config jrc on jrc.job_role = pa.job_role
  where pa.results_share_token = p_token;
$$ language sql security definer stable;

grant execute on function personality_public_results_get(uuid) to anon, authenticated;

-- ============================================================================
-- Section 49: Enterprise Competency Assessment Engine — Phase 2: Evidence
-- Engine + Competency Engine.
--
-- Core principle: every assessment result is EVIDENCE, and every competency
-- score must be explainable by — and traceable back to — the exact evidence
-- items that produced it. Nothing here re-scores anything: the technical
-- question scores, personality trait/dimension scores, SJT option scores,
-- the candidate's recorded experience and the interview panel's direct
-- ratings stay owned by the modules that already produce them. This section
-- only (1) configures WHICH of those sources feed WHICH competency and with
-- what weight (comp_competency_evidence_sources), (2) materializes one
-- evidence row per contributing item, with its normalized 0-100 score, its
-- effective weight and a raw drill-down payload (comp_competency_evidence),
-- and (3) rolls those up into one explainable score per required competency
-- (comp_competency_scores), with explicit coverage/confidence and a status.
--
-- Lack of evidence is never treated as lack of competency: a competency with
-- no evidence gets actual_score/actual_level/gap = null, confidence NONE and
-- status INSUFFICIENT_EVIDENCE — never GAP/CRITICAL_GAP. The same rule
-- applies at item level: an unscored question, an absent experience field or
-- an empty certification list produce NO evidence row, not a zero.
--
-- Evidence rows are derived data, recomputed wholesale by
-- comp_compute_competency_profile (SECURITY DEFINER) — there is deliberately
-- no insert/update RLS policy on the two output tables, so the only way a
-- row can exist is via the audited compute function. comp_interview_ratings
-- is the one new PRIMARY evidence table: structured-interview ratings of a
-- competency made directly by a panel member (its entry UI is the next
-- phase; the table exists now so the engine already reads it).
--
-- The default competency library, evidence-source wiring, the 10 new EPC
-- pipeline job roles and every role's competency requirements seeded at the
-- end of this section are REAL, admin-editable configuration (Settings →
-- «مدل شایستگی و مشاغل»), not mock data — they exist so the engine produces
-- meaningful profiles immediately. Seeded with `on conflict do nothing`, so
-- re-running this file never overwrites an admin's later edits (it would
-- only re-add a seeded row an admin had deleted).
-- ============================================================================

create table if not exists comp_competency_evidence_sources (
  id uuid primary key default gen_random_uuid(),
  competency_id uuid not null references comp_competencies (id) on delete cascade,
  source_type text not null check (source_type in (
    'TECHNICAL_CATEGORY', 'PERSONALITY_DIMENSION', 'PERSONALITY_TRAIT', 'SJT', 'EXPERIENCE', 'STRUCTURED_INTERVIEW'
  )),
  -- TECHNICAL_CATEGORY: comp_question_bank.category · PERSONALITY_DIMENSION/SJT: behavioral
  -- dimension key · PERSONALITY_TRAIT: trait key · EXPERIENCE: one of the four metric keys below ·
  -- STRUCTURED_INTERVIEW: always '' (a direct interview rating of this very competency).
  source_ref text not null default '',
  weight numeric not null default 1 check (weight > 0),
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  unique (competency_id, source_type, source_ref),
  check (source_type <> 'EXPERIENCE' or source_ref in ('years_total', 'years_pipeline', 'certifications', 'education')),
  check (source_type <> 'STRUCTURED_INTERVIEW' or source_ref = ''),
  check (source_type = 'STRUCTURED_INTERVIEW' or source_ref <> '')
);

create table if not exists comp_interview_ratings (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references comp_assessments (id) on delete cascade,
  competency_id uuid not null references comp_competencies (id) on delete cascade,
  rater_id uuid not null default auth.uid() references profiles (id),
  rating numeric not null check (rating between 1 and 5),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id),
  unique (assessment_id, competency_id, rater_id)
);
create index if not exists idx_comp_interview_ratings_competency on comp_interview_ratings (competency_id);

create table if not exists comp_competency_evidence (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references comp_assessments (id) on delete cascade,
  competency_id uuid not null references comp_competencies (id) on delete cascade,
  source_type text not null,
  source_ref text not null default '',
  -- The exact contributing item: question id / personality question id / dimension-score row id /
  -- experience metric key / rater id — what makes every score traceable.
  source_item_id text not null,
  source_label text not null default '',
  normalized_score numeric not null check (normalized_score between 0 and 100),
  -- The configured source weight split evenly across that source's items, so a source contributes
  -- its configured weight in total regardless of how many items it happened to produce.
  effective_weight numeric not null check (effective_weight > 0),
  raw_value jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now()
);
create index if not exists idx_comp_competency_evidence_assessment on comp_competency_evidence (assessment_id, competency_id);
create index if not exists idx_comp_competency_evidence_competency on comp_competency_evidence (competency_id);

create table if not exists comp_competency_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references comp_assessments (id) on delete cascade,
  competency_id uuid not null references comp_competencies (id) on delete cascade,
  required_level numeric not null,
  level_count int not null,
  actual_score numeric,
  actual_level numeric,
  -- required_level − actual_level: positive = shortfall. Null whenever there is no evidence.
  gap numeric,
  is_critical boolean not null default false,
  weight numeric not null default 1,
  evidence_count int not null default 0,
  source_types_covered int not null default 0,
  coverage numeric not null default 0 check (coverage between 0 and 1),
  confidence text not null check (confidence in ('NONE', 'LOW', 'MEDIUM', 'HIGH')),
  status text not null check (status in ('INSUFFICIENT_EVIDENCE', 'EXCEEDS', 'MEETS', 'GAP', 'CRITICAL_GAP')),
  computed_at timestamptz not null default now(),
  unique (assessment_id, competency_id)
);
create index if not exists idx_comp_competency_scores_competency on comp_competency_scores (competency_id);

alter table comp_competency_evidence_sources enable row level security;
alter table comp_interview_ratings enable row level security;
alter table comp_competency_evidence enable row level security;
alter table comp_competency_scores enable row level security;

-- Evidence-source wiring is model configuration: same "any authenticated user reads, admin-or-
-- assessment-designer writes" policy as comp_competencies/comp_job_competency_requirements (Section 47).
drop policy if exists "comp_competency_evidence_sources_select_authenticated" on comp_competency_evidence_sources;
create policy "comp_competency_evidence_sources_select_authenticated" on comp_competency_evidence_sources
  for select using (auth.uid() is not null);
drop policy if exists "comp_competency_evidence_sources_write_admin_or_designer" on comp_competency_evidence_sources;
create policy "comp_competency_evidence_sources_write_admin_or_designer" on comp_competency_evidence_sources
  for all using (comp_is_module_admin() or comp_is_assessment_designer())
  with check (comp_is_module_admin() or comp_is_assessment_designer());

-- Derived per-candidate outputs: readable by whoever can access the candidate's assessment, and
-- intentionally NOT writable by anyone directly — only comp_compute_competency_profile writes them.
do $$
declare
  t text;
begin
  foreach t in array array['comp_competency_evidence', 'comp_competency_scores']
  loop
    execute format('drop policy if exists "%1$s_select_access" on %1$s', t);
    execute format('create policy "%1$s_select_access" on %1$s for select using (comp_can_access_assessment(assessment_id))', t);
  end loop;
end $$;

-- A rater can see every rating on an assessment they can access, but only ever writes their own.
drop policy if exists "comp_interview_ratings_select_access" on comp_interview_ratings;
create policy "comp_interview_ratings_select_access" on comp_interview_ratings
  for select using (comp_can_access_assessment(assessment_id));
drop policy if exists "comp_interview_ratings_insert_own" on comp_interview_ratings;
create policy "comp_interview_ratings_insert_own" on comp_interview_ratings
  for insert with check (rater_id = auth.uid() and comp_can_access_assessment(assessment_id));
drop policy if exists "comp_interview_ratings_update_own" on comp_interview_ratings;
create policy "comp_interview_ratings_update_own" on comp_interview_ratings
  for update using (rater_id = auth.uid() and comp_can_access_assessment(assessment_id))
  with check (rater_id = auth.uid() and comp_can_access_assessment(assessment_id));
drop policy if exists "comp_interview_ratings_delete_own" on comp_interview_ratings;
create policy "comp_interview_ratings_delete_own" on comp_interview_ratings
  for delete using (rater_id = auth.uid() and comp_can_access_assessment(assessment_id));

do $$
declare
  t text;
begin
  foreach t in array array['comp_competency_evidence_sources', 'comp_interview_ratings']
  loop
    execute format('drop trigger if exists trg_set_updated_at on %I', t);
    execute format('create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at_and_by()', t);
  end loop;
end $$;

-- Recomputes one candidate's full competency profile from scratch. Scoring rules:
--   * TECHNICAL_CATEGORY — one item per selected question of that bank category that has an
--     official score. The official score mirrors resolveOfficialAnswers
--     (src/modules/competency/lib/roleCompetencyModel.ts) exactly: the rounded average of every
--     SUBMITTED panelist's numeric score for that question, falling back to the lead's own
--     comp_assessments.answers entry when no submitted panelist scored it. normalized = score/5×100.
--     Legacy Project Manager assessments (fixed in-code rubric, empty selected_question_ids) simply
--     yield no technical evidence — by design, not an error.
--   * PERSONALITY_TRAIT / PERSONALITY_DIMENSION — the candidate's scored personality assessment's
--     TRAIT / BEHAVIORAL_DIMENSION row for that key; normalized_score used as-is (already 0-100).
--   * SJT — one item per answered SJT question (of that same scored personality assessment) whose
--     CHOSEN option maps to that dimension key; normalized = option score/5×100.
--   * EXPERIENCE — years_total: min(years/15,1)×100 · years_pipeline: min(years/10,1)×100 ·
--     certifications: min(count/5,1)×100 · education: min(count/3,1)×100. Only non-blank entries
--     count; a null value or an empty list is NO evidence, never a zero.
--   * STRUCTURED_INTERVIEW — one item per rater: (rating−1)/4×100.
--   effective_weight = source weight / number of items that source produced for that competency.
-- Roll-up per required (active) competency: actual_score = Σ(normalized×w)/Σw; coverage = Σ weight of
-- sources with ≥1 item / Σ weight of all configured sources; actual_level = round(1 + score/100 ×
-- (levels−1), 1); gap = required − actual_level; confidence NONE/LOW/MEDIUM/HIGH and status
-- INSUFFICIENT_EVIDENCE/EXCEEDS/MEETS/GAP/CRITICAL_GAP as documented inline below.
create or replace function comp_compute_competency_profile(p_assessment_id uuid)
returns void as $$
declare
  v_assessment comp_assessments%rowtype;
  v_pa_id uuid;
  v_count int;
begin
  if not comp_can_access_assessment(p_assessment_id) then
    raise exception 'forbidden';
  end if;

  select * into v_assessment from comp_assessments where id = p_assessment_id;
  if not found then
    raise exception 'assessment not found';
  end if;

  delete from comp_competency_evidence where assessment_id = p_assessment_id;
  delete from comp_competency_scores where assessment_id = p_assessment_id;

  -- personality_assessments.assessment_id is unique, so there is at most one; only a scored one counts.
  select pa.id into v_pa_id
  from personality_assessments pa
  where pa.assessment_id = p_assessment_id
    and pa.status in ('FINGERPRINT', 'AI_ANALYSIS', 'FINAL_REVIEW', 'LOCKED', 'ARCHIVED');

  with srcs as (
    select s.id, s.competency_id, s.source_type, s.source_ref, s.weight
    from comp_competency_evidence_sources s
    join comp_job_competency_requirements r on r.competency_id = s.competency_id and r.job_role = v_assessment.job_role
    join comp_competencies c on c.id = s.competency_id and c.active
  ),
  submitted as (
    select ps.answers
    from comp_panelist_scores ps
    where ps.assessment_id = p_assessment_id and ps.submitted_at is not null
  ),
  selected_questions as (
    select qb.id, qb.category, qb.question_text
    from jsonb_array_elements_text(
      case when jsonb_typeof(v_assessment.selected_question_ids) = 'array' then v_assessment.selected_question_ids else '[]'::jsonb end
    ) sel(qid)
    join comp_question_bank qb on qb.id::text = sel.qid
  ),
  technical as (
    select
      q.id, q.category, q.question_text, panel.avg_score, panel.panelist_count, panel.notes,
      case when jsonb_typeof(v_assessment.answers -> q.id::text -> 'score') = 'number'
        then (v_assessment.answers -> q.id::text ->> 'score')::numeric end as lead_score,
      coalesce(nullif(v_assessment.answers -> q.id::text ->> 'candidateAnswer', ''), panel.candidate_answer) as candidate_answer,
      nullif(v_assessment.answers -> q.id::text ->> 'note', '') as lead_note
    from selected_questions q
    cross join lateral (
      select
        avg(case when jsonb_typeof(s.answers -> q.id::text -> 'score') = 'number' then (s.answers -> q.id::text ->> 'score')::numeric end) as avg_score,
        count(*) filter (where jsonb_typeof(s.answers -> q.id::text -> 'score') = 'number')::int as panelist_count,
        coalesce(jsonb_agg(left(s.answers -> q.id::text ->> 'note', 300)) filter (where coalesce(s.answers -> q.id::text ->> 'note', '') <> ''), '[]'::jsonb) as notes,
        (array_agg(s.answers -> q.id::text ->> 'candidateAnswer') filter (where coalesce(s.answers -> q.id::text ->> 'candidateAnswer', '') <> ''))[1] as candidate_answer
      from submitted s
    ) panel
  ),
  technical_official as (
    select t.*, coalesce(round(t.avg_score), t.lead_score) as official_score
    from technical t
  ),
  personality as (
    select 'PERSONALITY_TRAIT'::text as source_type, t.key as source_ref, ds.id::text as item_id, t.label_fa as label,
      ds.normalized_score as score,
      jsonb_build_object('personalityAssessmentId', v_pa_id, 'scoreKind', ds.score_kind, 'rawScore', ds.raw_score,
        'coverageCount', ds.coverage_count, 'confidence', ds.confidence) as raw
    from personality_dimension_scores ds
    join personality_traits t on t.id = ds.trait_id
    where ds.personality_assessment_id = v_pa_id and ds.score_kind = 'TRAIT' and ds.normalized_score is not null
    union all
    select 'PERSONALITY_DIMENSION'::text, d.key, ds.id::text, d.label_fa,
      ds.normalized_score,
      jsonb_build_object('personalityAssessmentId', v_pa_id, 'scoreKind', ds.score_kind, 'rawScore', ds.raw_score,
        'coverageCount', ds.coverage_count, 'confidence', ds.confidence)
    from personality_dimension_scores ds
    join personality_behavioral_dimensions d on d.id = ds.dimension_id
    where ds.personality_assessment_id = v_pa_id and ds.score_kind = 'BEHAVIORAL_DIMENSION' and ds.normalized_score is not null
  ),
  sjt as (
    select
      o.value ->> 'dimension_key' as source_ref, pr.question_id::text as item_id, left(pq.question_text, 160) as label,
      (o.value ->> 'score')::numeric / 5 * 100 as score,
      jsonb_build_object('personalityAssessmentId', v_pa_id, 'selectedOption', o.value ->> 'key',
        'optionLabel', left(o.value ->> 'label_fa', 300), 'optionScore', (o.value ->> 'score')::numeric) as raw
    from personality_responses pr
    join personality_questions pq on pq.id = pr.question_id and pq.question_type = 'SJT'
    cross join lateral jsonb_array_elements(case when jsonb_typeof(pq.options) = 'array' then pq.options else '[]'::jsonb end) o(value)
    where pr.personality_assessment_id = v_pa_id
      and o.value ->> 'key' = pr.response_value ->> 'selected_option'
      and jsonb_typeof(o.value -> 'score') = 'number'
  ),
  experience as (
    select 'years_total'::text as source_ref, 'سابقه کاری کل'::text as label,
      least(greatest(v_assessment.years_experience_total, 0) / 15, 1) * 100 as score,
      jsonb_build_object('years', v_assessment.years_experience_total, 'saturatesAt', 15) as raw
    where v_assessment.years_experience_total is not null
    union all
    select 'years_pipeline', 'سابقه کاری در خطوط لوله',
      least(greatest(v_assessment.years_experience_pipeline, 0) / 10, 1) * 100,
      jsonb_build_object('years', v_assessment.years_experience_pipeline, 'saturatesAt', 10)
    where v_assessment.years_experience_pipeline is not null
    union all
    select 'certifications', 'گواهینامه‌ها و دوره‌های تخصصی', least(x.n / 5.0, 1) * 100,
      jsonb_build_object('count', x.n, 'titles', x.titles, 'saturatesAt', 5)
    from (
      select count(*)::int as n, jsonb_agg(c.value ->> 'title') as titles
      from jsonb_array_elements(case when jsonb_typeof(v_assessment.certifications) = 'array' then v_assessment.certifications else '[]'::jsonb end) c(value)
      where btrim(coalesce(c.value ->> 'title', '')) <> ''
    ) x
    where x.n > 0
    union all
    select 'education', 'سوابق تحصیلی', least(x.n / 3.0, 1) * 100,
      jsonb_build_object('count', x.n, 'degrees', x.degrees, 'saturatesAt', 3)
    from (
      select count(*)::int as n, jsonb_agg(btrim(coalesce(e.value ->> 'degree', '') || ' ' || coalesce(e.value ->> 'field', ''))) as degrees
      from jsonb_array_elements(case when jsonb_typeof(v_assessment.education) = 'array' then v_assessment.education else '[]'::jsonb end) e(value)
      where btrim(coalesce(e.value ->> 'degree', '')) <> '' or btrim(coalesce(e.value ->> 'field', '')) <> ''
    ) x
    where x.n > 0
  ),
  interview as (
    select r.competency_id, r.rater_id::text as item_id,
      'مصاحبه ساختاریافته — ' || coalesce(nullif(p.full_name, ''), 'ارزیاب') as label,
      (r.rating - 1) / 4 * 100 as score,
      jsonb_build_object('rating', r.rating, 'raterId', r.rater_id, 'notes', left(r.notes, 300), 'ratedAt', r.updated_at) as raw
    from comp_interview_ratings r
    left join profiles p on p.id = r.rater_id
    where r.assessment_id = p_assessment_id
  ),
  items as (
    select s.id as source_id, s.competency_id, s.source_type, s.source_ref, s.weight, x.item_id, x.label, x.score, x.raw
    from srcs s
    cross join lateral (
      select t.id::text as item_id, left(t.question_text, 160) as label, t.official_score / 5 * 100 as score,
        jsonb_build_object(
          'score', t.official_score,
          'scoreOrigin', case when t.avg_score is not null then 'PANEL_AVERAGE' else 'LEAD_ENTRY' end,
          'panelistCount', t.panelist_count,
          'panelAverage', round(t.avg_score, 2),
          'leadScore', t.lead_score,
          'category', t.category,
          'candidateAnswer', left(t.candidate_answer, 300),
          'leadNote', left(t.lead_note, 300),
          'panelNotes', t.notes
        ) as raw
      from technical_official t
      where s.source_type = 'TECHNICAL_CATEGORY' and t.category = s.source_ref and t.official_score is not null
      union all
      select p.item_id, p.label, p.score, p.raw
      from personality p
      where p.source_type = s.source_type and p.source_ref = s.source_ref
      union all
      select j.item_id, j.label, j.score, j.raw
      from sjt j
      where s.source_type = 'SJT' and j.source_ref = s.source_ref
      union all
      select e.source_ref, e.label, e.score, e.raw
      from experience e
      where s.source_type = 'EXPERIENCE' and e.source_ref = s.source_ref
      union all
      select i.item_id, i.label, i.score, i.raw
      from interview i
      where s.source_type = 'STRUCTURED_INTERVIEW' and i.competency_id = s.competency_id
    ) x
  )
  insert into comp_competency_evidence (
    assessment_id, competency_id, source_type, source_ref, source_item_id, source_label, normalized_score, effective_weight, raw_value
  )
  select
    p_assessment_id, competency_id, source_type, source_ref, item_id, coalesce(label, ''),
    least(greatest(score, 0), 100),
    weight / count(*) over (partition by source_id),
    raw
  from items;

  insert into comp_competency_scores (
    assessment_id, competency_id, required_level, level_count, actual_score, actual_level, gap, is_critical, weight,
    evidence_count, source_types_covered, coverage, confidence, status
  )
  select
    p_assessment_id, x.competency_id, x.required_level, x.level_count,
    round(x.raw_score, 2), x.actual_level, x.required_level - x.actual_level,
    x.is_critical, x.weight, x.evidence_count, x.source_types_covered, x.coverage,
    case
      when x.evidence_count = 0 then 'NONE'
      when x.coverage >= 0.75 and x.evidence_count >= 3 and x.source_types_covered >= 2 then 'HIGH'
      when x.coverage >= 0.5 and x.evidence_count >= 2 then 'MEDIUM'
      else 'LOW'
    end,
    -- No evidence is never a gap — it's reported as its own status so a reviewer knows to go gather
    -- evidence rather than conclude the candidate lacks the competency.
    case
      when x.actual_level is null then 'INSUFFICIENT_EVIDENCE'
      when x.actual_level >= x.required_level + 1 then 'EXCEEDS'
      when x.actual_level >= x.required_level then 'MEETS'
      when x.is_critical then 'CRITICAL_GAP'
      else 'GAP'
    end
  from (
    select
      r.competency_id, r.required_level, r.is_critical, r.weight, lc.level_count, ev.raw_score,
      case when ev.raw_score is not null
        then round(1 + ev.raw_score / 100 * (greatest(lc.level_count, 1) - 1), 1) end as actual_level,
      ev.evidence_count, ev.source_types_covered,
      case when cov.total_weight > 0 then round(cov.covered_weight / cov.total_weight, 4) else 0 end as coverage
    from comp_job_competency_requirements r
    join comp_competencies c on c.id = r.competency_id and c.active
    cross join lateral (
      select case when jsonb_typeof(c.proficiency_levels) = 'array' then jsonb_array_length(c.proficiency_levels) else 0 end as level_count
    ) lc
    cross join lateral (
      select
        sum(e.normalized_score * e.effective_weight) / nullif(sum(e.effective_weight), 0) as raw_score,
        count(*)::int as evidence_count,
        count(distinct e.source_type)::int as source_types_covered
      from comp_competency_evidence e
      where e.assessment_id = p_assessment_id and e.competency_id = r.competency_id
    ) ev
    cross join lateral (
      select
        coalesce(sum(s.weight), 0) as total_weight,
        coalesce(sum(s.weight) filter (where exists (
          select 1 from comp_competency_evidence e
          where e.assessment_id = p_assessment_id and e.competency_id = s.competency_id
            and e.source_type = s.source_type and e.source_ref = s.source_ref
        )), 0) as covered_weight
      from comp_competency_evidence_sources s
      where s.competency_id = r.competency_id
    ) cov
    where r.job_role = v_assessment.job_role
  ) x;

  get diagnostics v_count = row_count;

  perform comp_log_audit('COMPETENCY_PROFILE_COMPUTED', 'comp_assessments', p_assessment_id, null, jsonb_build_object('competencies', v_count));
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function comp_compute_competency_profile(uuid) from public, anon;
grant execute on function comp_compute_competency_profile(uuid) to authenticated;

-- ---- Default competency library (real, editable configuration — see the header note) ----

insert into comp_competencies (key, label_fa, description, domain) values
  ('technical_knowledge', 'دانش فنی و تخصصی', 'تسلط بر استانداردها، کدها، مشخصات فنی و اصول مهندسی حوزه تخصصی (خطوط لوله، جوش، پایپینگ، پوشش، عمران و ...).', 'TECHNICAL'),
  ('practical_experience', 'تجربه عملی و اجرایی', 'به‌کارگیری دانش در شرایط واقعی کارگاه و پروژه‌های EPC نفت و گاز، مبتنی بر سوابق و مثال‌های مشخص.', 'TECHNICAL'),
  ('problem_solving', 'حل مسئله و تفکر تحلیلی', 'شناسایی علت ریشه‌ای مشکلات فنی و اجرایی، تحلیل گزینه‌ها و ارائه راه‌حل عملی.', 'HYBRID'),
  ('professional_judgment', 'قضاوت حرفه‌ای و تصمیم‌گیری', 'تصمیم‌گیری درست و به‌موقع در موقعیت‌های مبهم یا پرفشار و تشخیص زمان ارجاع موضوع.', 'HYBRID'),
  ('hse_awareness', 'آگاهی و تعهد HSE', 'شناخت و رعایت الزامات ایمنی، بهداشت و محیط‌زیست و حساسیت نسبت به ریسک‌های کارگاهی.', 'HYBRID'),
  ('quality_compliance', 'کیفیت و انطباق با الزامات', 'پایبندی به ITP، رویه‌ها و مشخصات فنی، دقت در بازرسی و مستندسازی کیفی.', 'HYBRID'),
  ('planning_control', 'برنامه‌ریزی و کنترل پروژه', 'برنامه‌ریزی، پایش پیشرفت، کنترل زمان و منابع و گزارش‌دهی به‌موقع انحرافات.', 'HYBRID'),
  ('leadership', 'رهبری و مدیریت تیم', 'هدایت، انگیزش و هماهنگی تیم‌های اجرایی و پیمانکاران و پذیرش مسئولیت نتیجه.', 'BEHAVIORAL'),
  ('communication', 'ارتباطات و گزارش‌دهی', 'انتقال شفاف و مؤثر اطلاعات به کارفرما، مشاور، پیمانکار و تیم، به‌صورت شفاهی و مکتوب.', 'BEHAVIORAL'),
  ('teamwork_collaboration', 'کار تیمی و همکاری', 'همکاری سازنده میان‌رشته‌ای، مدیریت اختلاف‌نظر و حمایت از اهداف مشترک تیم.', 'BEHAVIORAL'),
  ('accountability_reliability', 'مسئولیت‌پذیری و قابلیت اتکا', 'پاسخگویی در قبال تعهدات، درستکاری و پیگیری کارها تا حصول نتیجه.', 'BEHAVIORAL'),
  ('commercial_contract_awareness', 'آگاهی قراردادی و تجاری', 'درک مفاد قرارداد، ادعاها، تغییرات (Variation) و پیامدهای مالی تصمیمات اجرایی.', 'HYBRID')
on conflict (key) do nothing;

insert into comp_competency_evidence_sources (competency_id, source_type, source_ref, weight)
select c.id, v.source_type, v.source_ref, v.weight
from (values
  ('technical_knowledge', 'TECHNICAL_CATEGORY', 'TECHNICAL', 3),
  ('technical_knowledge', 'TECHNICAL_CATEGORY', 'GENERAL', 1),
  ('technical_knowledge', 'EXPERIENCE', 'certifications', 1),
  ('technical_knowledge', 'EXPERIENCE', 'education', 0.5),
  ('technical_knowledge', 'STRUCTURED_INTERVIEW', '', 1),

  ('practical_experience', 'TECHNICAL_CATEGORY', 'EXPERIENCE_BASED', 2),
  ('practical_experience', 'EXPERIENCE', 'years_total', 1),
  ('practical_experience', 'EXPERIENCE', 'years_pipeline', 1.5),
  ('practical_experience', 'STRUCTURED_INTERVIEW', '', 1),

  ('problem_solving', 'TECHNICAL_CATEGORY', 'PROBLEM_SOLVING', 2),
  ('problem_solving', 'TECHNICAL_CATEGORY', 'CASE_STUDY', 1),
  ('problem_solving', 'PERSONALITY_DIMENSION', 'ANALYTICAL_THINKING', 1),
  ('problem_solving', 'SJT', 'ANALYTICAL_THINKING', 1),
  ('problem_solving', 'STRUCTURED_INTERVIEW', '', 1),

  ('professional_judgment', 'TECHNICAL_CATEGORY', 'SCENARIO', 2),
  ('professional_judgment', 'TECHNICAL_CATEGORY', 'JUDGMENT', 1),
  ('professional_judgment', 'SJT', 'DECISION_QUALITY', 1),
  ('professional_judgment', 'PERSONALITY_DIMENSION', 'ESCALATION_JUDGMENT', 1),
  ('professional_judgment', 'STRUCTURED_INTERVIEW', '', 1),

  ('hse_awareness', 'TECHNICAL_CATEGORY', 'HSE', 2),
  ('hse_awareness', 'PERSONALITY_DIMENSION', 'SAFETY_ORIENTATION', 1.5),
  ('hse_awareness', 'SJT', 'SAFETY_ORIENTATION', 1),
  ('hse_awareness', 'PERSONALITY_DIMENSION', 'RISK_AWARENESS', 1),
  ('hse_awareness', 'STRUCTURED_INTERVIEW', '', 1),

  ('quality_compliance', 'PERSONALITY_DIMENSION', 'DETAIL_ORIENTATION', 1),
  ('quality_compliance', 'PERSONALITY_DIMENSION', 'RULE_ORIENTATION', 1),
  ('quality_compliance', 'PERSONALITY_DIMENSION', 'DOCUMENTATION_DISCIPLINE', 1),
  ('quality_compliance', 'TECHNICAL_CATEGORY', 'TECHNICAL', 1),
  ('quality_compliance', 'STRUCTURED_INTERVIEW', '', 1),

  ('planning_control', 'PERSONALITY_TRAIT', 'conscientiousness', 1),
  ('planning_control', 'PERSONALITY_DIMENSION', 'DISCIPLINE', 1),
  ('planning_control', 'TECHNICAL_CATEGORY', 'CASE_STUDY', 1),
  ('planning_control', 'EXPERIENCE', 'years_total', 0.5),
  ('planning_control', 'STRUCTURED_INTERVIEW', '', 1.5),

  ('leadership', 'PERSONALITY_DIMENSION', 'LEADERSHIP', 2),
  ('leadership', 'SJT', 'LEADERSHIP', 1),
  ('leadership', 'PERSONALITY_TRAIT', 'extraversion', 0.5),
  ('leadership', 'PERSONALITY_DIMENSION', 'CONFLICT_MANAGEMENT', 1),
  ('leadership', 'STRUCTURED_INTERVIEW', '', 2),

  ('communication', 'PERSONALITY_DIMENSION', 'COMMUNICATION', 2),
  ('communication', 'SJT', 'COMMUNICATION', 1),
  ('communication', 'PERSONALITY_DIMENSION', 'STAKEHOLDER_ORIENTATION', 1),
  ('communication', 'STRUCTURED_INTERVIEW', '', 2),

  ('teamwork_collaboration', 'PERSONALITY_DIMENSION', 'TEAMWORK', 2),
  ('teamwork_collaboration', 'PERSONALITY_TRAIT', 'agreeableness', 1),
  ('teamwork_collaboration', 'SJT', 'CONFLICT_MANAGEMENT', 1),
  ('teamwork_collaboration', 'STRUCTURED_INTERVIEW', '', 1.5),

  ('accountability_reliability', 'PERSONALITY_DIMENSION', 'ACCOUNTABILITY', 2),
  ('accountability_reliability', 'PERSONALITY_DIMENSION', 'OWNERSHIP', 1),
  ('accountability_reliability', 'SJT', 'INTEGRITY_ORIENTATION', 1),
  ('accountability_reliability', 'PERSONALITY_TRAIT', 'conscientiousness', 1),
  ('accountability_reliability', 'STRUCTURED_INTERVIEW', '', 1.5),

  ('commercial_contract_awareness', 'PERSONALITY_DIMENSION', 'COMMERCIAL_AWARENESS', 1.5),
  ('commercial_contract_awareness', 'SJT', 'COMMERCIAL_AWARENESS', 1),
  ('commercial_contract_awareness', 'TECHNICAL_CATEGORY', 'CASE_STUDY', 1),
  ('commercial_contract_awareness', 'STRUCTURED_INTERVIEW', '', 1.5)
) as v(competency_key, source_type, source_ref, weight)
join comp_competencies c on c.key = v.competency_key
on conflict (competency_id, source_type, source_ref) do nothing;

-- The 10 EPC pipeline roles not yet in the catalog; the 12 pre-existing rows are left untouched.
insert into comp_job_role_config (job_role, label_fa, description, sort_order) values
  ('project_director', 'مدیر طرح', 'مسئول کلان پروژه/طرح EPC، هدایت مدیران پروژه و تعامل با کارفرما در سطح راهبردی.', 13),
  ('project_control_manager', 'مدیر کنترل پروژه', 'هدایت واحد برنامه‌ریزی و کنترل پروژه، پایش زمان، هزینه و پیشرفت و گزارش به مدیریت.', 14),
  ('planning_engineer', 'مهندس برنامه‌ریزی', 'تهیه و به‌روزرسانی برنامه زمان‌بندی، محاسبه پیشرفت و تحلیل انحرافات.', 15),
  ('supervision_manager', 'مدیر نظارت', 'هدایت تیم نظارت کارگاهی و اطمینان از انطباق اجرا با مشخصات فنی، کیفیت و HSE.', 16),
  ('pipeline_supervisor', 'سرپرست خط لوله', 'سرپرستی عملیات اجرایی خط لوله (ترانشه، لوله‌گذاری، جوشکاری، بستر و خاکریزی).', 17),
  ('welding_supervisor', 'سرپرست جوشکاری', 'سرپرستی تیم‌های جوشکاری، کنترل WPS/PQR و کیفیت جوش در کارگاه.', 18),
  ('mechanical_piping_supervisor', 'سرپرست مکانیک/پایپینگ', 'سرپرستی نصب تجهیزات مکانیکی و پایپینگ ایستگاه‌ها و تأسیسات.', 19),
  ('civil_supervisor', 'سرپرست عمران', 'سرپرستی عملیات عمرانی (فونداسیون، سازه، راه دسترسی و ابنیه) در کارگاه.', 20),
  ('coating_supervisor', 'سرپرست پوشش', 'سرپرستی آماده‌سازی سطح و اجرای پوشش لوله و سرجوش‌ها مطابق مشخصات فنی.', 21),
  ('contract_commercial_manager', 'مدیر قراردادها و امور بازرگانی', 'مدیریت قراردادها، الحاقیه‌ها، ادعاها و امور تجاری پروژه.', 22)
on conflict (job_role) do nothing;

insert into comp_job_competency_requirements (job_role, competency_id, required_level, is_critical, weight)
select v.job_role, c.id, v.required_level, v.is_critical, v.weight
from (values
  ('project_manager', 'leadership', 4, true, 2),
  ('project_manager', 'planning_control', 4, true, 1.5),
  ('project_manager', 'professional_judgment', 4, false, 1.5),
  ('project_manager', 'communication', 4, false, 1),
  ('project_manager', 'accountability_reliability', 4, false, 1),
  ('project_manager', 'commercial_contract_awareness', 3, false, 1),
  ('project_manager', 'hse_awareness', 3, false, 1),
  ('project_manager', 'problem_solving', 3, false, 1),
  ('project_manager', 'practical_experience', 3, false, 1),

  ('welding_inspector', 'technical_knowledge', 4, true, 2),
  ('welding_inspector', 'quality_compliance', 4, true, 1.5),
  ('welding_inspector', 'practical_experience', 3, false, 1.5),
  ('welding_inspector', 'professional_judgment', 3, false, 1),
  ('welding_inspector', 'hse_awareness', 3, false, 1),
  ('welding_inspector', 'accountability_reliability', 3, false, 1),
  ('welding_inspector', 'communication', 2, false, 0.5),

  ('mechanical_piping_inspector', 'technical_knowledge', 4, true, 2),
  ('mechanical_piping_inspector', 'quality_compliance', 4, true, 1.5),
  ('mechanical_piping_inspector', 'practical_experience', 3, false, 1.5),
  ('mechanical_piping_inspector', 'problem_solving', 3, false, 1),
  ('mechanical_piping_inspector', 'hse_awareness', 3, false, 1),
  ('mechanical_piping_inspector', 'accountability_reliability', 3, false, 1),
  ('mechanical_piping_inspector', 'communication', 2, false, 0.5),

  ('pipeline_inspector', 'technical_knowledge', 4, true, 2),
  ('pipeline_inspector', 'quality_compliance', 4, true, 1.5),
  ('pipeline_inspector', 'practical_experience', 3, false, 1.5),
  ('pipeline_inspector', 'professional_judgment', 3, false, 1),
  ('pipeline_inspector', 'hse_awareness', 3, false, 1),
  ('pipeline_inspector', 'accountability_reliability', 3, false, 1),
  ('pipeline_inspector', 'communication', 2, false, 0.5),

  ('coating_cp_inspector', 'technical_knowledge', 4, true, 2),
  ('coating_cp_inspector', 'quality_compliance', 4, true, 1.5),
  ('coating_cp_inspector', 'practical_experience', 3, false, 1.5),
  ('coating_cp_inspector', 'problem_solving', 3, false, 1),
  ('coating_cp_inspector', 'hse_awareness', 3, false, 1),
  ('coating_cp_inspector', 'accountability_reliability', 3, false, 1),

  ('radiography_interpreter', 'technical_knowledge', 4, true, 2),
  ('radiography_interpreter', 'quality_compliance', 4, true, 1.5),
  ('radiography_interpreter', 'professional_judgment', 4, false, 1.5),
  ('radiography_interpreter', 'practical_experience', 3, false, 1),
  ('radiography_interpreter', 'hse_awareness', 3, false, 1),
  ('radiography_interpreter', 'accountability_reliability', 3, false, 1),
  ('radiography_interpreter', 'communication', 2, false, 0.5),

  ('civil_engineer', 'technical_knowledge', 3, true, 2),
  ('civil_engineer', 'practical_experience', 3, false, 1),
  ('civil_engineer', 'problem_solving', 3, false, 1),
  ('civil_engineer', 'quality_compliance', 3, false, 1),
  ('civil_engineer', 'hse_awareness', 3, false, 1),
  ('civil_engineer', 'planning_control', 2, false, 1),
  ('civil_engineer', 'teamwork_collaboration', 3, false, 1),

  ('project_control_specialist', 'planning_control', 4, true, 2),
  ('project_control_specialist', 'technical_knowledge', 3, false, 1),
  ('project_control_specialist', 'problem_solving', 3, false, 1),
  ('project_control_specialist', 'communication', 3, false, 1),
  ('project_control_specialist', 'commercial_contract_awareness', 2, false, 1),
  ('project_control_specialist', 'accountability_reliability', 3, false, 1),
  ('project_control_specialist', 'teamwork_collaboration', 3, false, 1),

  ('hse_specialist', 'hse_awareness', 4, true, 2),
  ('hse_specialist', 'professional_judgment', 3, false, 1.5),
  ('hse_specialist', 'technical_knowledge', 3, false, 1),
  ('hse_specialist', 'practical_experience', 3, false, 1),
  ('hse_specialist', 'communication', 3, false, 1),
  ('hse_specialist', 'accountability_reliability', 4, false, 1),
  ('hse_specialist', 'leadership', 2, false, 0.5),

  ('contracts_specialist', 'commercial_contract_awareness', 4, true, 2),
  ('contracts_specialist', 'communication', 3, false, 1),
  ('contracts_specialist', 'professional_judgment', 3, false, 1),
  ('contracts_specialist', 'problem_solving', 3, false, 1),
  ('contracts_specialist', 'accountability_reliability', 3, false, 1),
  ('contracts_specialist', 'planning_control', 2, false, 1),
  ('contracts_specialist', 'technical_knowledge', 2, false, 0.5),

  ('site_supervisor', 'hse_awareness', 4, true, 2),
  ('site_supervisor', 'technical_knowledge', 3, true, 1.5),
  ('site_supervisor', 'leadership', 3, false, 1.5),
  ('site_supervisor', 'practical_experience', 3, false, 1.5),
  ('site_supervisor', 'planning_control', 3, false, 1),
  ('site_supervisor', 'teamwork_collaboration', 3, false, 1),
  ('site_supervisor', 'communication', 3, false, 1),
  ('site_supervisor', 'accountability_reliability', 3, false, 1),

  ('inspection_body_supervisor', 'technical_knowledge', 4, true, 2),
  ('inspection_body_supervisor', 'quality_compliance', 4, true, 1.5),
  ('inspection_body_supervisor', 'hse_awareness', 3, true, 1),
  ('inspection_body_supervisor', 'professional_judgment', 4, false, 1.5),
  ('inspection_body_supervisor', 'leadership', 3, false, 1),
  ('inspection_body_supervisor', 'communication', 3, false, 1),
  ('inspection_body_supervisor', 'accountability_reliability', 4, false, 1),

  ('project_director', 'leadership', 4, true, 2),
  ('project_director', 'professional_judgment', 4, true, 1.5),
  ('project_director', 'commercial_contract_awareness', 3, false, 1),
  ('project_director', 'planning_control', 3, false, 1),
  ('project_director', 'communication', 4, false, 1),
  ('project_director', 'hse_awareness', 3, false, 1),
  ('project_director', 'accountability_reliability', 4, false, 1),
  ('project_director', 'problem_solving', 3, false, 1),

  ('project_control_manager', 'planning_control', 4, true, 2),
  ('project_control_manager', 'leadership', 3, true, 1.5),
  ('project_control_manager', 'commercial_contract_awareness', 3, false, 1),
  ('project_control_manager', 'communication', 3, false, 1),
  ('project_control_manager', 'problem_solving', 3, false, 1),
  ('project_control_manager', 'professional_judgment', 3, false, 1),
  ('project_control_manager', 'accountability_reliability', 3, false, 1),

  ('planning_engineer', 'planning_control', 4, true, 2),
  ('planning_engineer', 'technical_knowledge', 3, false, 1),
  ('planning_engineer', 'problem_solving', 3, false, 1),
  ('planning_engineer', 'communication', 2, false, 1),
  ('planning_engineer', 'teamwork_collaboration', 3, false, 1),
  ('planning_engineer', 'accountability_reliability', 3, false, 1),

  ('supervision_manager', 'leadership', 4, true, 2),
  ('supervision_manager', 'technical_knowledge', 3, true, 1.5),
  ('supervision_manager', 'quality_compliance', 4, true, 1.5),
  ('supervision_manager', 'hse_awareness', 3, true, 1),
  ('supervision_manager', 'professional_judgment', 4, false, 1.5),
  ('supervision_manager', 'communication', 3, false, 1),
  ('supervision_manager', 'accountability_reliability', 3, false, 1),
  ('supervision_manager', 'commercial_contract_awareness', 2, false, 0.5),

  ('pipeline_supervisor', 'hse_awareness', 4, true, 2),
  ('pipeline_supervisor', 'technical_knowledge', 3, true, 1.5),
  ('pipeline_supervisor', 'practical_experience', 4, false, 1.5),
  ('pipeline_supervisor', 'leadership', 3, false, 1),
  ('pipeline_supervisor', 'quality_compliance', 3, false, 1),
  ('pipeline_supervisor', 'teamwork_collaboration', 3, false, 1),
  ('pipeline_supervisor', 'accountability_reliability', 3, false, 1),

  ('welding_supervisor', 'technical_knowledge', 4, true, 2),
  ('welding_supervisor', 'hse_awareness', 3, true, 1.5),
  ('welding_supervisor', 'practical_experience', 4, false, 1.5),
  ('welding_supervisor', 'quality_compliance', 4, false, 1.5),
  ('welding_supervisor', 'leadership', 3, false, 1),
  ('welding_supervisor', 'accountability_reliability', 3, false, 1),

  ('mechanical_piping_supervisor', 'technical_knowledge', 3, true, 1.5),
  ('mechanical_piping_supervisor', 'hse_awareness', 3, true, 1.5),
  ('mechanical_piping_supervisor', 'practical_experience', 4, false, 1.5),
  ('mechanical_piping_supervisor', 'quality_compliance', 3, false, 1),
  ('mechanical_piping_supervisor', 'leadership', 3, false, 1),
  ('mechanical_piping_supervisor', 'problem_solving', 3, false, 1),
  ('mechanical_piping_supervisor', 'teamwork_collaboration', 3, false, 1),

  ('civil_supervisor', 'technical_knowledge', 3, true, 1.5),
  ('civil_supervisor', 'hse_awareness', 3, true, 1.5),
  ('civil_supervisor', 'practical_experience', 3, false, 1.5),
  ('civil_supervisor', 'quality_compliance', 3, false, 1),
  ('civil_supervisor', 'leadership', 3, false, 1),
  ('civil_supervisor', 'planning_control', 2, false, 1),
  ('civil_supervisor', 'teamwork_collaboration', 3, false, 1),

  ('coating_supervisor', 'technical_knowledge', 3, true, 1.5),
  ('coating_supervisor', 'hse_awareness', 3, true, 1.5),
  ('coating_supervisor', 'practical_experience', 3, false, 1.5),
  ('coating_supervisor', 'quality_compliance', 4, false, 1.5),
  ('coating_supervisor', 'leadership', 3, false, 1),
  ('coating_supervisor', 'accountability_reliability', 3, false, 1),

  ('contract_commercial_manager', 'commercial_contract_awareness', 4, true, 2),
  ('contract_commercial_manager', 'leadership', 3, true, 1.5),
  ('contract_commercial_manager', 'communication', 4, false, 1.5),
  ('contract_commercial_manager', 'professional_judgment', 4, false, 1),
  ('contract_commercial_manager', 'problem_solving', 3, false, 1),
  ('contract_commercial_manager', 'accountability_reliability', 3, false, 1),
  ('contract_commercial_manager', 'planning_control', 3, false, 1)
) as v(job_role, competency_key, required_level, is_critical, weight)
join comp_competencies c on c.key = v.competency_key
join comp_job_role_config jrc on jrc.job_role = v.job_role
on conflict (job_role, competency_id) do nothing;

-- ============================================================================
-- Section 50: Enterprise Competency Assessment Engine — Phase 3: Assessment
-- Blueprints + the Structured Interview.
--
-- An Assessment Blueprint is a reusable, versioned, job-specific definition
-- of WHICH assessment methods a candidate goes through (technical questions,
-- personality incl. SJT, structured interview, recorded experience), plus
-- optionally which saved question-mix template each method starts from.
-- Applying a blueprint to a candidate COPIES its toggles onto that
-- comp_assessments row (via comp_set_exam_design) and remembers which
-- blueprint it came from — the candidate's own flags stay the source of
-- truth, so later edits to a blueprint never silently rewrite the design of
-- candidates already in flight (the audit entry records the exact blueprint
-- version applied).
--
-- The Competency Engine now respects that design: an evidence source whose
-- assessment METHOD was deliberately not part of this candidate's design is
-- excluded from both evidence collection AND the coverage denominator.
-- A method that was not part of the design is "not assessed by design", not
-- "missing evidence" — counting it as uncovered would lower coverage (and so
-- confidence) for a choice the designer made on purpose, and would make two
-- candidates with identical results look differently reliable purely because
-- of their exam design. A competency whose every configured source is
-- excluded still reports INSUFFICIENT_EVIDENCE / NONE, exactly as before —
-- never a gap.
--
-- The seeded default blueprint per job role at the end of this section is
-- REAL, admin-editable configuration (Settings → «مدل شایستگی و مشاغل» →
-- «الگوهای ارزیابی»), not mock data. includes_technical is only seeded true
-- for roles that actually have approved, active bank questions, so a
-- candidate is never routed into an empty technical stage.
-- ============================================================================

create table if not exists comp_assessment_blueprints (
  id uuid primary key default gen_random_uuid(),
  job_role text not null references comp_job_role_config (job_role) on delete cascade,
  title text not null,
  description text not null default '',
  -- Bumped server-side whenever the design itself (methods/templates) changes — see
  -- comp_assessment_blueprints_bump_version below; title/description/flag edits don't count.
  version int not null default 1 check (version >= 1),
  is_default boolean not null default false,
  active boolean not null default true,
  includes_technical boolean not null default true,
  -- Personality items include the SJT items — both come from the same personality assessment.
  includes_personality boolean not null default true,
  includes_structured_interview boolean not null default true,
  includes_experience boolean not null default true,
  technical_template_id uuid references comp_assessment_templates (id) on delete set null,
  personality_template_id uuid references personality_assessment_templates (id) on delete set null,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

create index if not exists idx_comp_assessment_blueprints_job_role on comp_assessment_blueprints (job_role);
create index if not exists idx_comp_assessment_blueprints_technical_template on comp_assessment_blueprints (technical_template_id);
create index if not exists idx_comp_assessment_blueprints_personality_template on comp_assessment_blueprints (personality_template_id);
-- An inactive blueprint may keep is_default = true without blocking a new active default.
create unique index if not exists idx_comp_assessment_blueprints_one_active_default
  on comp_assessment_blueprints (job_role) where is_default and active;

alter table comp_assessment_blueprints enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['comp_assessment_blueprints']
  loop
    execute format('drop policy if exists "%1$s_select_authenticated" on %1$s', t);
    execute format('create policy "%1$s_select_authenticated" on %1$s for select using (auth.uid() is not null)', t);
    execute format('drop policy if exists "%1$s_write_admin_or_designer" on %1$s', t);
    execute format(
      'create policy "%1$s_write_admin_or_designer" on %1$s for all using (comp_is_module_admin() or comp_is_assessment_designer()) with check (comp_is_module_admin() or comp_is_assessment_designer())',
      t
    );
    execute format('drop trigger if exists trg_set_updated_at on %I', t);
    execute format('create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at_and_by()', t);
  end loop;
end $$;

create or replace function comp_assessment_blueprints_bump_version()
returns trigger as $$
begin
  if (new.includes_technical, new.includes_personality, new.includes_structured_interview, new.includes_experience,
      new.technical_template_id, new.personality_template_id)
     is distinct from
     (old.includes_technical, old.includes_personality, old.includes_structured_interview, old.includes_experience,
      old.technical_template_id, old.personality_template_id) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists trg_comp_assessment_blueprints_bump_version on comp_assessment_blueprints;
create trigger trg_comp_assessment_blueprints_bump_version before update on comp_assessment_blueprints
  for each row execute function comp_assessment_blueprints_bump_version();

alter table comp_assessments add column if not exists blueprint_id uuid references comp_assessment_blueprints (id) on delete set null;
alter table comp_assessments add column if not exists needs_structured_interview boolean not null default false;
alter table comp_assessments add column if not exists includes_experience boolean not null default true;
create index if not exists idx_comp_assessments_blueprint on comp_assessments (blueprint_id);

-- Supersedes Section 44's 3-arg version. The old signature is dropped (not overloaded) so PostgREST
-- resolves every existing 3-arg call to this one via the defaults; a null argument means "leave that
-- flag unchanged".
drop function if exists comp_set_exam_design(uuid, boolean, boolean);
create or replace function comp_set_exam_design(
  p_assessment_id uuid,
  p_needs_personality boolean,
  p_needs_technical boolean,
  p_needs_structured_interview boolean default null,
  p_includes_experience boolean default null,
  p_blueprint_id uuid default null
)
returns void as $$
declare
  v_blueprint_version int;
begin
  if not (comp_is_assessment_designer() or comp_is_module_admin()) then
    raise exception 'forbidden';
  end if;
  if p_blueprint_id is not null then
    select b.version into v_blueprint_version
    from comp_assessment_blueprints b
    join comp_assessments a on a.id = p_assessment_id and a.job_role = b.job_role
    where b.id = p_blueprint_id;
    if not found then
      raise exception 'blueprint does not belong to this assessment''s job role';
    end if;
  end if;
  update comp_assessments
  set needs_personality_assessment = coalesce(p_needs_personality, needs_personality_assessment),
      needs_technical_assessment = coalesce(p_needs_technical, needs_technical_assessment),
      needs_structured_interview = coalesce(p_needs_structured_interview, needs_structured_interview),
      includes_experience = coalesce(p_includes_experience, includes_experience),
      blueprint_id = coalesce(p_blueprint_id, blueprint_id)
  where id = p_assessment_id;
  perform comp_log_audit(
    'EXAM_DESIGN_SET', 'comp_assessments', p_assessment_id, null,
    jsonb_build_object(
      'needsPersonalityAssessment', p_needs_personality,
      'needsTechnicalAssessment', p_needs_technical,
      'needsStructuredInterview', p_needs_structured_interview,
      'includesExperience', p_includes_experience,
      'blueprintId', p_blueprint_id,
      'blueprintVersion', v_blueprint_version
    )
  );
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function comp_set_exam_design(uuid, boolean, boolean, boolean, boolean, uuid) from public, anon;
grant execute on function comp_set_exam_design(uuid, boolean, boolean, boolean, boolean, uuid) to authenticated;

-- Section 49's comp_compute_competency_profile, changed ONLY to honor the candidate's exam design
-- (see this section's header): v_excluded_types lists the source types of every method the design
-- left out, and both the `srcs` CTE (evidence collection) and the `cov` lateral (coverage
-- denominator) skip them. Everything else — scoring rules, roll-up, statuses — is unchanged. The
-- audit entry additionally records which types were excluded, so a reviewer can tell "not assessed
-- by design" apart from "no evidence" after the fact.
create or replace function comp_compute_competency_profile(p_assessment_id uuid)
returns void as $$
declare
  v_assessment comp_assessments%rowtype;
  v_pa_id uuid;
  v_count int;
  v_excluded_types text[];
begin
  if not comp_can_access_assessment(p_assessment_id) then
    raise exception 'forbidden';
  end if;

  select * into v_assessment from comp_assessments where id = p_assessment_id;
  if not found then
    raise exception 'assessment not found';
  end if;

  -- Source types whose assessment method is not part of this candidate's design (see the Section 50
  -- header): dropped from both evidence collection and the coverage denominator below.
  v_excluded_types := array_remove(array[
    case when not v_assessment.needs_technical_assessment then 'TECHNICAL_CATEGORY' end,
    case when not v_assessment.needs_personality_assessment then 'PERSONALITY_DIMENSION' end,
    case when not v_assessment.needs_personality_assessment then 'PERSONALITY_TRAIT' end,
    case when not v_assessment.needs_personality_assessment then 'SJT' end,
    case when not v_assessment.needs_structured_interview then 'STRUCTURED_INTERVIEW' end,
    case when not v_assessment.includes_experience then 'EXPERIENCE' end
  ], null);

  delete from comp_competency_evidence where assessment_id = p_assessment_id;
  delete from comp_competency_scores where assessment_id = p_assessment_id;

  -- personality_assessments.assessment_id is unique, so there is at most one; only a scored one counts.
  select pa.id into v_pa_id
  from personality_assessments pa
  where pa.assessment_id = p_assessment_id
    and pa.status in ('FINGERPRINT', 'AI_ANALYSIS', 'FINAL_REVIEW', 'LOCKED', 'ARCHIVED');

  with srcs as (
    select s.id, s.competency_id, s.source_type, s.source_ref, s.weight
    from comp_competency_evidence_sources s
    join comp_job_competency_requirements r on r.competency_id = s.competency_id and r.job_role = v_assessment.job_role
    join comp_competencies c on c.id = s.competency_id and c.active
    where s.source_type <> all(v_excluded_types)
  ),
  submitted as (
    select ps.answers
    from comp_panelist_scores ps
    where ps.assessment_id = p_assessment_id and ps.submitted_at is not null
  ),
  selected_questions as (
    select qb.id, qb.category, qb.question_text
    from jsonb_array_elements_text(
      case when jsonb_typeof(v_assessment.selected_question_ids) = 'array' then v_assessment.selected_question_ids else '[]'::jsonb end
    ) sel(qid)
    join comp_question_bank qb on qb.id::text = sel.qid
  ),
  technical as (
    select
      q.id, q.category, q.question_text, panel.avg_score, panel.panelist_count, panel.notes,
      case when jsonb_typeof(v_assessment.answers -> q.id::text -> 'score') = 'number'
        then (v_assessment.answers -> q.id::text ->> 'score')::numeric end as lead_score,
      coalesce(nullif(v_assessment.answers -> q.id::text ->> 'candidateAnswer', ''), panel.candidate_answer) as candidate_answer,
      nullif(v_assessment.answers -> q.id::text ->> 'note', '') as lead_note
    from selected_questions q
    cross join lateral (
      select
        avg(case when jsonb_typeof(s.answers -> q.id::text -> 'score') = 'number' then (s.answers -> q.id::text ->> 'score')::numeric end) as avg_score,
        count(*) filter (where jsonb_typeof(s.answers -> q.id::text -> 'score') = 'number')::int as panelist_count,
        coalesce(jsonb_agg(left(s.answers -> q.id::text ->> 'note', 300)) filter (where coalesce(s.answers -> q.id::text ->> 'note', '') <> ''), '[]'::jsonb) as notes,
        (array_agg(s.answers -> q.id::text ->> 'candidateAnswer') filter (where coalesce(s.answers -> q.id::text ->> 'candidateAnswer', '') <> ''))[1] as candidate_answer
      from submitted s
    ) panel
  ),
  technical_official as (
    select t.*, coalesce(round(t.avg_score), t.lead_score) as official_score
    from technical t
  ),
  personality as (
    select 'PERSONALITY_TRAIT'::text as source_type, t.key as source_ref, ds.id::text as item_id, t.label_fa as label,
      ds.normalized_score as score,
      jsonb_build_object('personalityAssessmentId', v_pa_id, 'scoreKind', ds.score_kind, 'rawScore', ds.raw_score,
        'coverageCount', ds.coverage_count, 'confidence', ds.confidence) as raw
    from personality_dimension_scores ds
    join personality_traits t on t.id = ds.trait_id
    where ds.personality_assessment_id = v_pa_id and ds.score_kind = 'TRAIT' and ds.normalized_score is not null
    union all
    select 'PERSONALITY_DIMENSION'::text, d.key, ds.id::text, d.label_fa,
      ds.normalized_score,
      jsonb_build_object('personalityAssessmentId', v_pa_id, 'scoreKind', ds.score_kind, 'rawScore', ds.raw_score,
        'coverageCount', ds.coverage_count, 'confidence', ds.confidence)
    from personality_dimension_scores ds
    join personality_behavioral_dimensions d on d.id = ds.dimension_id
    where ds.personality_assessment_id = v_pa_id and ds.score_kind = 'BEHAVIORAL_DIMENSION' and ds.normalized_score is not null
  ),
  sjt as (
    select
      o.value ->> 'dimension_key' as source_ref, pr.question_id::text as item_id, left(pq.question_text, 160) as label,
      (o.value ->> 'score')::numeric / 5 * 100 as score,
      jsonb_build_object('personalityAssessmentId', v_pa_id, 'selectedOption', o.value ->> 'key',
        'optionLabel', left(o.value ->> 'label_fa', 300), 'optionScore', (o.value ->> 'score')::numeric) as raw
    from personality_responses pr
    join personality_questions pq on pq.id = pr.question_id and pq.question_type = 'SJT'
    cross join lateral jsonb_array_elements(case when jsonb_typeof(pq.options) = 'array' then pq.options else '[]'::jsonb end) o(value)
    where pr.personality_assessment_id = v_pa_id
      and o.value ->> 'key' = pr.response_value ->> 'selected_option'
      and jsonb_typeof(o.value -> 'score') = 'number'
  ),
  experience as (
    select 'years_total'::text as source_ref, 'سابقه کاری کل'::text as label,
      least(greatest(v_assessment.years_experience_total, 0) / 15, 1) * 100 as score,
      jsonb_build_object('years', v_assessment.years_experience_total, 'saturatesAt', 15) as raw
    where v_assessment.years_experience_total is not null
    union all
    select 'years_pipeline', 'سابقه کاری در خطوط لوله',
      least(greatest(v_assessment.years_experience_pipeline, 0) / 10, 1) * 100,
      jsonb_build_object('years', v_assessment.years_experience_pipeline, 'saturatesAt', 10)
    where v_assessment.years_experience_pipeline is not null
    union all
    select 'certifications', 'گواهینامه‌ها و دوره‌های تخصصی', least(x.n / 5.0, 1) * 100,
      jsonb_build_object('count', x.n, 'titles', x.titles, 'saturatesAt', 5)
    from (
      select count(*)::int as n, jsonb_agg(c.value ->> 'title') as titles
      from jsonb_array_elements(case when jsonb_typeof(v_assessment.certifications) = 'array' then v_assessment.certifications else '[]'::jsonb end) c(value)
      where btrim(coalesce(c.value ->> 'title', '')) <> ''
    ) x
    where x.n > 0
    union all
    select 'education', 'سوابق تحصیلی', least(x.n / 3.0, 1) * 100,
      jsonb_build_object('count', x.n, 'degrees', x.degrees, 'saturatesAt', 3)
    from (
      select count(*)::int as n, jsonb_agg(btrim(coalesce(e.value ->> 'degree', '') || ' ' || coalesce(e.value ->> 'field', ''))) as degrees
      from jsonb_array_elements(case when jsonb_typeof(v_assessment.education) = 'array' then v_assessment.education else '[]'::jsonb end) e(value)
      where btrim(coalesce(e.value ->> 'degree', '')) <> '' or btrim(coalesce(e.value ->> 'field', '')) <> ''
    ) x
    where x.n > 0
  ),
  interview as (
    select r.competency_id, r.rater_id::text as item_id,
      'مصاحبه ساختاریافته — ' || coalesce(nullif(p.full_name, ''), 'ارزیاب') as label,
      (r.rating - 1) / 4 * 100 as score,
      jsonb_build_object('rating', r.rating, 'raterId', r.rater_id, 'notes', left(r.notes, 300), 'ratedAt', r.updated_at) as raw
    from comp_interview_ratings r
    left join profiles p on p.id = r.rater_id
    where r.assessment_id = p_assessment_id
  ),
  items as (
    select s.id as source_id, s.competency_id, s.source_type, s.source_ref, s.weight, x.item_id, x.label, x.score, x.raw
    from srcs s
    cross join lateral (
      select t.id::text as item_id, left(t.question_text, 160) as label, t.official_score / 5 * 100 as score,
        jsonb_build_object(
          'score', t.official_score,
          'scoreOrigin', case when t.avg_score is not null then 'PANEL_AVERAGE' else 'LEAD_ENTRY' end,
          'panelistCount', t.panelist_count,
          'panelAverage', round(t.avg_score, 2),
          'leadScore', t.lead_score,
          'category', t.category,
          'candidateAnswer', left(t.candidate_answer, 300),
          'leadNote', left(t.lead_note, 300),
          'panelNotes', t.notes
        ) as raw
      from technical_official t
      where s.source_type = 'TECHNICAL_CATEGORY' and t.category = s.source_ref and t.official_score is not null
      union all
      select p.item_id, p.label, p.score, p.raw
      from personality p
      where p.source_type = s.source_type and p.source_ref = s.source_ref
      union all
      select j.item_id, j.label, j.score, j.raw
      from sjt j
      where s.source_type = 'SJT' and j.source_ref = s.source_ref
      union all
      select e.source_ref, e.label, e.score, e.raw
      from experience e
      where s.source_type = 'EXPERIENCE' and e.source_ref = s.source_ref
      union all
      select i.item_id, i.label, i.score, i.raw
      from interview i
      where s.source_type = 'STRUCTURED_INTERVIEW' and i.competency_id = s.competency_id
    ) x
  )
  insert into comp_competency_evidence (
    assessment_id, competency_id, source_type, source_ref, source_item_id, source_label, normalized_score, effective_weight, raw_value
  )
  select
    p_assessment_id, competency_id, source_type, source_ref, item_id, coalesce(label, ''),
    least(greatest(score, 0), 100),
    weight / count(*) over (partition by source_id),
    raw
  from items;

  insert into comp_competency_scores (
    assessment_id, competency_id, required_level, level_count, actual_score, actual_level, gap, is_critical, weight,
    evidence_count, source_types_covered, coverage, confidence, status
  )
  select
    p_assessment_id, x.competency_id, x.required_level, x.level_count,
    round(x.raw_score, 2), x.actual_level, x.required_level - x.actual_level,
    x.is_critical, x.weight, x.evidence_count, x.source_types_covered, x.coverage,
    case
      when x.evidence_count = 0 then 'NONE'
      when x.coverage >= 0.75 and x.evidence_count >= 3 and x.source_types_covered >= 2 then 'HIGH'
      when x.coverage >= 0.5 and x.evidence_count >= 2 then 'MEDIUM'
      else 'LOW'
    end,
    -- No evidence is never a gap — it's reported as its own status so a reviewer knows to go gather
    -- evidence rather than conclude the candidate lacks the competency.
    case
      when x.actual_level is null then 'INSUFFICIENT_EVIDENCE'
      when x.actual_level >= x.required_level + 1 then 'EXCEEDS'
      when x.actual_level >= x.required_level then 'MEETS'
      when x.is_critical then 'CRITICAL_GAP'
      else 'GAP'
    end
  from (
    select
      r.competency_id, r.required_level, r.is_critical, r.weight, lc.level_count, ev.raw_score,
      case when ev.raw_score is not null
        then round(1 + ev.raw_score / 100 * (greatest(lc.level_count, 1) - 1), 1) end as actual_level,
      ev.evidence_count, ev.source_types_covered,
      case when cov.total_weight > 0 then round(cov.covered_weight / cov.total_weight, 4) else 0 end as coverage
    from comp_job_competency_requirements r
    join comp_competencies c on c.id = r.competency_id and c.active
    cross join lateral (
      select case when jsonb_typeof(c.proficiency_levels) = 'array' then jsonb_array_length(c.proficiency_levels) else 0 end as level_count
    ) lc
    cross join lateral (
      select
        sum(e.normalized_score * e.effective_weight) / nullif(sum(e.effective_weight), 0) as raw_score,
        count(*)::int as evidence_count,
        count(distinct e.source_type)::int as source_types_covered
      from comp_competency_evidence e
      where e.assessment_id = p_assessment_id and e.competency_id = r.competency_id
    ) ev
    cross join lateral (
      select
        coalesce(sum(s.weight), 0) as total_weight,
        coalesce(sum(s.weight) filter (where exists (
          select 1 from comp_competency_evidence e
          where e.assessment_id = p_assessment_id and e.competency_id = s.competency_id
            and e.source_type = s.source_type and e.source_ref = s.source_ref
        )), 0) as covered_weight
      from comp_competency_evidence_sources s
      where s.competency_id = r.competency_id and s.source_type <> all(v_excluded_types)
    ) cov
    where r.job_role = v_assessment.job_role
  ) x;

  get diagnostics v_count = row_count;

  perform comp_log_audit('COMPETENCY_PROFILE_COMPUTED', 'comp_assessments', p_assessment_id, null, jsonb_build_object('competencies', v_count, 'excludedByDesign', to_jsonb(v_excluded_types)));
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function comp_compute_competency_profile(uuid) from public, anon;
grant execute on function comp_compute_competency_profile(uuid) to authenticated;

-- ---- Default blueprint per job role (real, editable configuration — see the header note) ----
-- Only roles with no blueprint at all get one, so re-running this file never overrides an admin's
-- own blueprints (it would only re-add one for a role whose blueprints were all deleted).
insert into comp_assessment_blueprints (
  job_role, title, description, is_default, active,
  includes_technical, includes_personality, includes_structured_interview, includes_experience
)
select
  j.job_role,
  'الگوی استاندارد — ' || coalesce(nullif(j.label_fa, ''), j.job_role),
  'الگوی پیش‌فرض ارزیابی این شغل: آزمون شخصیت و رفتاری (شامل سؤالات موقعیتی)، مصاحبه ساختاریافته و سوابق و تجربه'
    || case when exists (
      select 1 from comp_question_bank q where q.job_role = j.job_role and q.active and q.approval_status = 'APPROVED'
    ) then '، به‌همراه آزمون فنی تخصصی.' else '؛ آزمون فنی تا افزودن سؤال تأییدشده به بانک این شغل غیرفعال است.' end,
  true, true,
  exists (select 1 from comp_question_bank q where q.job_role = j.job_role and q.active and q.approval_status = 'APPROVED'),
  true, true, true
from comp_job_role_config j
where not exists (select 1 from comp_assessment_blueprints b where b.job_role = j.job_role);
