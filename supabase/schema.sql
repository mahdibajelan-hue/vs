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
drop policy if exists "projects_select_member" on projects;
create policy "projects_select_member" on projects
  for select using (is_project_member(id));

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
  for select using (is_project_member(project_id));

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

alter table lines enable row level security;
alter table daily_logs enable row level security;

drop policy if exists "lines_select_member" on lines;
create policy "lines_select_member" on lines
  for select using (is_project_member(project_id));

drop policy if exists "lines_write_editor" on lines;
create policy "lines_write_editor" on lines
  for all using (can_edit_project(project_id)) with check (can_edit_project(project_id));

drop policy if exists "daily_logs_select_member" on daily_logs;
create policy "daily_logs_select_member" on daily_logs
  for select using (is_project_member(project_id));

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
