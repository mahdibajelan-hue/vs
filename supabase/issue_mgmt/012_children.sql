-- ============================================================================
-- Issue Management v2 — child tables (events/audit, tasks, links, evidence, RCA/CAPA, people, saved filters, templates)
-- RLS rule used everywhere: visible/writable when the caller can see the parent issue.
-- ============================================================================

create or replace function im_can_see_issue(p_issue_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from im_issues i
    where i.id = p_issue_id
      and (im_is_project_member(i.project_id) or is_admin_user() or rasta_scope_ok_for_source('issues', i.project_id)
           or i.pursuer_id = auth.uid() or i.approver_id = auth.uid() or i.owner_id = auth.uid() or i.follow_up_id = auth.uid())
  );
$$;

create or replace function im_can_write_issue(p_issue_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from im_issues i
    where i.id = p_issue_id
      and (im_is_project_member(i.project_id) or is_admin_user()
           or i.pursuer_id = auth.uid() or i.approver_id = auth.uid() or i.owner_id = auth.uid() or i.follow_up_id = auth.uid())
  );
$$;

-- Append-only audit trail. issue_id is deliberately NOT a foreign key so the trail survives a deletion.
create table if not exists im_issue_events (
  id bigint generated always as identity primary key,
  issue_id uuid not null,
  issue_code text not null default '',
  task_id uuid,
  kind text not null,
  field text not null default '',
  old_value text,
  new_value text,
  reason text not null default '',
  meta jsonb not null default '{}'::jsonb,
  actor_id uuid default auth.uid(),
  at timestamptz not null default now()
);
create index if not exists idx_im_events_issue on im_issue_events (issue_id, at desc);

create table if not exists im_issue_tasks (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references im_issues (id) on delete cascade,
  parent_task_id uuid references im_issue_tasks (id) on delete cascade,
  title text not null,
  description text not null default '',
  expected_output text not null default '',
  accountable_id uuid references profiles (id),
  executor_id uuid references profiles (id),
  approver_id uuid references profiles (id),
  collaborators uuid[] not null default '{}',
  start_date date,
  due_date date,
  original_due_date date,
  extension_count integer not null default 0,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'blocked', 'pending_verification', 'done', 'cancelled')),
  progress smallint not null default 0 check (progress between 0 and 100),
  hours_spent numeric not null default 0,
  blocked_kind text not null default '' check (blocked_kind in ('', 'decision', 'permit', 'material', 'drawing', 'unit_response', 'contractor', 'finance', 'other')),
  blocked_note text not null default '',
  blocked_since timestamptz,
  blocked_decision_id uuid,
  completion_claimed_at timestamptz,
  completion_claimed_by uuid references profiles (id),
  verified_by uuid references profiles (id),
  verified_at timestamptz,
  last_progress_at timestamptz not null default now(),
  sort smallint not null default 0,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_im_tasks_issue on im_issue_tasks (issue_id);
create index if not exists idx_im_tasks_exec on im_issue_tasks (executor_id) where status not in ('done', 'cancelled');
create index if not exists idx_im_tasks_due on im_issue_tasks (due_date) where status not in ('done', 'cancelled');

create table if not exists im_task_deps (
  task_id uuid not null references im_issue_tasks (id) on delete cascade,
  depends_on_task_id uuid not null references im_issue_tasks (id) on delete cascade,
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table if not exists im_task_updates (
  id bigint generated always as identity primary key,
  task_id uuid not null references im_issue_tasks (id) on delete cascade,
  issue_id uuid not null references im_issues (id) on delete cascade,
  kind text not null default 'progress' check (kind in ('progress', 'note', 'followup', 'claim', 'verify', 'block', 'unblock', 'reject')),
  progress smallint check (progress between 0 and 100),
  hours numeric,
  note text not null default '',
  at timestamptz not null default now(),
  by_id uuid references profiles (id) default auth.uid()
);
create index if not exists idx_im_task_updates_task on im_task_updates (task_id, at desc);

-- Controlled due-date extensions (issue-level when task_id is null, task-level otherwise). The original date is never overwritten.
create table if not exists im_extensions (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references im_issues (id) on delete cascade,
  task_id uuid references im_issue_tasks (id) on delete cascade,
  from_due date not null,
  to_due date not null,
  reason text not null check (length(trim(reason)) > 2),
  impact text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references profiles (id) default auth.uid(),
  requested_at timestamptz not null default now(),
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  decision_note text not null default ''
);
create index if not exists idx_im_ext_issue on im_extensions (issue_id);

create table if not exists im_issue_links (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references im_issues (id) on delete cascade,
  target_type text not null check (target_type in ('issue', 'risk', 'decision', 'task', 'project', 'unit', 'action', 'mission', 'finding', 'land_parcel', 'document')),
  target_id text not null,
  target_label text not null default '',
  relation text not null default 'relates' check (relation in ('relates', 'blocks', 'blocked_by', 'duplicates', 'caused_by', 'derived_from', 'resolves')),
  link_status text not null default 'confirmed' check (link_status in ('suggested', 'confirmed', 'rejected')),
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (issue_id, target_type, target_id, relation)
);
create index if not exists idx_im_links_target on im_issue_links (target_type, target_id);

create table if not exists im_attachments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references im_issues (id) on delete cascade,
  task_id uuid references im_issue_tasks (id) on delete set null,
  decision_id uuid,
  kind text not null default 'document' check (kind in ('image', 'document', 'correspondence', 'expert_opinion', 'resolution_evidence', 'other')),
  storage_path text not null,
  file_name text not null,
  mime text not null default '',
  size_bytes bigint not null default 0,
  note text not null default '',
  uploaded_by uuid references profiles (id) default auth.uid(),
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_im_att_issue on im_attachments (issue_id);

create table if not exists im_rca (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references im_issues (id) on delete cascade,
  method text not null check (method in ('five_whys', 'fishbone', 'free')),
  data jsonb not null default '{}'::jsonb,
  root_cause text not null default '',
  confirmed boolean not null default false,
  confirmed_by uuid references profiles (id),
  confirmed_at timestamptz,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_im_rca_issue on im_rca (issue_id);

create table if not exists im_capa (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references im_issues (id) on delete cascade,
  kind text not null check (kind in ('corrective', 'preventive')),
  description text not null,
  owner_id uuid references profiles (id),
  due_date date,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'done', 'verified', 'cancelled')),
  effectiveness text not null default '' check (effectiveness in ('', 'effective', 'partial', 'ineffective')),
  effectiveness_note text not null default '',
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_im_capa_issue on im_capa (issue_id);

-- Stakeholders beyond the fixed owner / follow-up / pursuer / approver.
create table if not exists im_issue_people (
  issue_id uuid not null references im_issues (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null check (role in ('watcher', 'consulted', 'informed', 'expert')),
  created_at timestamptz not null default now(),
  primary key (issue_id, user_id, role)
);

create table if not exists im_saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade default auth.uid(),
  scope text not null default 'issues' check (scope in ('issues', 'tasks', 'decisions')),
  name text not null,
  filter jsonb not null default '{}'::jsonb,
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists im_templates (
  key text primary key,
  name text not null,
  category text references im_categories (key),
  defaults jsonb not null default '{}'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
alter table im_categories enable row level security;
alter table im_workflow_stages enable row level security;
alter table im_workflow_transitions enable row level security;
alter table im_sla_policies enable row level security;
alter table im_issue_events enable row level security;
alter table im_issue_tasks enable row level security;
alter table im_task_deps enable row level security;
alter table im_task_updates enable row level security;
alter table im_extensions enable row level security;
alter table im_issue_links enable row level security;
alter table im_attachments enable row level security;
alter table im_rca enable row level security;
alter table im_capa enable row level security;
alter table im_issue_people enable row level security;
alter table im_saved_filters enable row level security;
alter table im_templates enable row level security;

-- reference data: everyone signed in reads, admins write
drop policy if exists im_categories_read on im_categories; create policy im_categories_read on im_categories for select using (auth.uid() is not null);
drop policy if exists im_categories_write on im_categories; create policy im_categories_write on im_categories for all using (is_admin_user()) with check (is_admin_user());
drop policy if exists im_wf_stages_read on im_workflow_stages; create policy im_wf_stages_read on im_workflow_stages for select using (auth.uid() is not null);
drop policy if exists im_wf_stages_write on im_workflow_stages; create policy im_wf_stages_write on im_workflow_stages for all using (is_admin_user()) with check (is_admin_user());
drop policy if exists im_wf_trans_read on im_workflow_transitions; create policy im_wf_trans_read on im_workflow_transitions for select using (auth.uid() is not null);
drop policy if exists im_wf_trans_write on im_workflow_transitions; create policy im_wf_trans_write on im_workflow_transitions for all using (is_admin_user()) with check (is_admin_user());
drop policy if exists im_sla_read on im_sla_policies; create policy im_sla_read on im_sla_policies for select using (auth.uid() is not null);
drop policy if exists im_sla_write on im_sla_policies; create policy im_sla_write on im_sla_policies for all using (is_admin_user()) with check (is_admin_user());
drop policy if exists im_templates_read on im_templates; create policy im_templates_read on im_templates for select using (auth.uid() is not null);
drop policy if exists im_templates_write on im_templates; create policy im_templates_write on im_templates for all using (is_admin_user()) with check (is_admin_user());

-- audit trail: read when the issue is visible; NO insert/update/delete policy (only security-definer triggers write)
drop policy if exists im_events_read on im_issue_events;
create policy im_events_read on im_issue_events for select using (im_can_see_issue(issue_id) or is_admin_user());

-- child records follow the parent issue
do $$
declare t text;
begin
  foreach t in array array['im_issue_tasks', 'im_task_updates', 'im_extensions', 'im_issue_links', 'im_attachments', 'im_rca', 'im_capa', 'im_issue_people']
  loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (im_can_see_issue(issue_id))', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format('create policy %I on %I for all using (im_can_write_issue(issue_id)) with check (im_can_write_issue(issue_id))', t || '_write', t);
  end loop;
end $$;
-- task dependencies: through the task's issue
drop policy if exists im_task_deps_read on im_task_deps;
create policy im_task_deps_read on im_task_deps for select using (exists (select 1 from im_issue_tasks t where t.id = task_id and im_can_see_issue(t.issue_id)));
drop policy if exists im_task_deps_write on im_task_deps;
create policy im_task_deps_write on im_task_deps for all using (exists (select 1 from im_issue_tasks t where t.id = task_id and im_can_write_issue(t.issue_id))) with check (exists (select 1 from im_issue_tasks t where t.id = task_id and im_can_write_issue(t.issue_id)));
-- personal filters
drop policy if exists im_saved_filters_own on im_saved_filters;
create policy im_saved_filters_own on im_saved_filters for all using (user_id = auth.uid() or is_shared) with check (user_id = auth.uid());
