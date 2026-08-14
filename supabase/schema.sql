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
