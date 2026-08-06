-- IsoTrack — Supabase schema + Row Level Security policies
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

drop policy if exists "projects_update_editor" on projects;
create policy "projects_update_editor" on projects
  for update using (can_edit_project(id));

drop policy if exists "projects_delete_owner_role" on projects;
create policy "projects_delete_owner_role" on projects
  for delete using (project_role(id) = 'owner' or created_by = auth.uid());

-- ============================================================================
-- 7. Policies — project_members / project_invites
-- ============================================================================
drop policy if exists "members_select_member" on project_members;
create policy "members_select_member" on project_members
  for select using (is_project_member(project_id));

-- An existing 'owner' role member can always add people. As a bootstrap escape hatch — mirrors
-- canManageUsers() in permissions.ts — any existing member may also add people as long as no
-- 'owner' has joined the project yet (so a contractor/consultant who created the project solo
-- isn't permanently locked out of inviting anyone, including a future owner).
drop policy if exists "members_insert_owner_or_bootstrap" on project_members;
create policy "members_insert_owner_or_bootstrap" on project_members
  for insert with check (
    project_role(project_id) = 'owner'
    or not exists (select 1 from project_members where project_id = project_members.project_id and role = 'owner')
    or user_id = auth.uid() -- accept_pending_invites() inserting for the current user
  );

drop policy if exists "members_delete_owner" on project_members;
create policy "members_delete_owner" on project_members
  for delete using (project_role(project_id) = 'owner');

drop policy if exists "members_update_owner" on project_members;
create policy "members_update_owner" on project_members
  for update using (project_role(project_id) = 'owner');

drop policy if exists "invites_select_member_or_invitee" on project_invites;
create policy "invites_select_member_or_invitee" on project_invites
  for select using (
    is_project_member(project_id)
    or email = (select email from profiles where id = auth.uid())
  );

drop policy if exists "invites_insert_member" on project_invites;
create policy "invites_insert_member" on project_invites
  for insert with check (is_project_member(project_id));

drop policy if exists "invites_delete_member" on project_invites;
create policy "invites_delete_member" on project_invites
  for delete using (is_project_member(project_id));

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

alter table lines enable row level security;
alter table daily_logs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['lines', 'daily_logs']
  loop
    execute format('drop policy if exists "%1$s_select_member" on %1$s', t);
    execute format('create policy "%1$s_select_member" on %1$s for select using (is_project_member(project_id))', t);

    execute format('drop policy if exists "%1$s_write_editor" on %1$s', t);
    execute format('create policy "%1$s_write_editor" on %1$s for all using (can_edit_project(project_id)) with check (can_edit_project(project_id))', t);
  end loop;
end $$;

-- ============================================================================
-- 9. Indexes
-- ============================================================================
create index if not exists idx_project_members_user on project_members (user_id);
create index if not exists idx_lines_project on lines (project_id);
create index if not exists idx_daily_logs_project on daily_logs (project_id);
create index if not exists idx_daily_logs_line on daily_logs (line_id);
create index if not exists idx_project_invites_email on project_invites (email);
