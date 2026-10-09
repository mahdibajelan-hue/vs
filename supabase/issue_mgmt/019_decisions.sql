-- ============================================================================
-- Issue Management v2 — Decision Management (phase 2). A decision is a first-class record: question, options with
-- trade-offs, decider, needed-by date, outcome + rationale. Tasks blocked "waiting for a decision" point at it
-- (im_issue_tasks.blocked_decision_id), so the cost of an undecided decision becomes measurable.
-- ============================================================================
create sequence if not exists im_decision_seq;

create table if not exists im_decisions (
  id uuid primary key default gen_random_uuid(),
  seq_no bigint not null default nextval('im_decision_seq'),
  code text generated always as ('DEC-' || lpad(seq_no::text, 5, '0')) stored,
  project_id uuid not null references im_projects (id) on delete cascade,
  issue_id uuid references im_issues (id) on delete set null,
  title text not null check (length(trim(title)) > 2),
  question text not null default '',
  requested_by uuid references profiles (id) default auth.uid(),
  decider_id uuid references profiles (id),
  needed_by date,
  status text not null default 'pending' check (status in ('draft', 'pending', 'decided', 'deferred', 'cancelled')),
  chosen_option uuid,
  rationale text not null default '',
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_im_decisions_project on im_decisions (project_id, status);
create index if not exists idx_im_decisions_issue on im_decisions (issue_id);

create table if not exists im_decision_options (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references im_decisions (id) on delete cascade,
  title text not null,
  pros text not null default '',
  cons text not null default '',
  cost_impact numeric,
  time_impact_days integer,
  recommended boolean not null default false,
  sort smallint not null default 0
);
alter table im_decisions drop constraint if exists im_decisions_chosen_fk;
alter table im_decisions add constraint im_decisions_chosen_fk foreign key (chosen_option) references im_decision_options (id) on delete set null;
-- close the loop declared in 012: tasks blocked on a decision reference it
alter table im_issue_tasks drop constraint if exists im_issue_tasks_blocked_decision_fk;
alter table im_issue_tasks add constraint im_issue_tasks_blocked_decision_fk foreign key (blocked_decision_id) references im_decisions (id) on delete set null;

-- visibility follows the project (or the linked issue); only the decider or an admin may record the outcome
create or replace function im_can_see_decision(p_project uuid, p_issue uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select im_is_project_member(p_project) or is_admin_user() or (p_issue is not null and im_can_see_issue(p_issue));
$$;

create or replace function im_decision_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_admin boolean := is_admin_user() or im_can_manage(new.project_id);
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'decided' then
      if not (v_admin or new.decider_id = auth.uid()) then raise exception 'only_decider_may_decide'; end if;
      if new.chosen_option is null and length(trim(new.rationale)) < 3 then raise exception 'decision_needs_option_or_rationale'; end if;
      new.decided_by := auth.uid();
      new.decided_at := now();
    elsif old.status = 'decided' and not v_admin then
      raise exception 'decided_is_final_admin_only';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'decided' and new.status = 'decided' and (new.chosen_option is distinct from old.chosen_option or new.rationale is distinct from old.rationale) and not v_admin then
    raise exception 'decided_is_final_admin_only';
  end if;
  return new;
end;
$$;

create or replace function im_decision_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if new.issue_id is null then return new; end if;
  select code into v_code from im_issues where id = new.issue_id;
  if tg_op = 'INSERT' then
    perform im_log_event(new.issue_id, v_code, null, 'decision_created', 'decision', null, new.code || ' · ' || new.title, jsonb_build_object('decision_id', new.id));
  elsif new.status is distinct from old.status then
    perform set_config('im.reason', coalesce(nullif(new.rationale, ''), ''), true);
    perform im_log_event(new.issue_id, v_code, null, 'decision_' || new.status, 'decision', old.status, new.status, jsonb_build_object('decision_id', new.id, 'code', new.code));
  end if;
  return new;
end;
$$;

alter table im_decisions enable row level security;
alter table im_decision_options enable row level security;
drop policy if exists im_decisions_read on im_decisions;
create policy im_decisions_read on im_decisions for select using (im_can_see_decision(project_id, issue_id));
drop policy if exists im_decisions_write on im_decisions;
create policy im_decisions_write on im_decisions for all using (im_is_project_member(project_id) or is_admin_user()) with check (im_is_project_member(project_id) or is_admin_user());
drop policy if exists im_dec_options_read on im_decision_options;
create policy im_dec_options_read on im_decision_options for select using (exists (select 1 from im_decisions d where d.id = decision_id and im_can_see_decision(d.project_id, d.issue_id)));
drop policy if exists im_dec_options_write on im_decision_options;
create policy im_dec_options_write on im_decision_options for all using (exists (select 1 from im_decisions d where d.id = decision_id and (im_is_project_member(d.project_id) or is_admin_user()) and d.status in ('draft', 'pending')))
  with check (exists (select 1 from im_decisions d where d.id = decision_id and (im_is_project_member(d.project_id) or is_admin_user()) and d.status in ('draft', 'pending')));

-- (triggers are created in separate statements on Supabase MCP to stay under the 60 s limit)
-- create trigger trg_im_decision_guard before insert or update on im_decisions for each row execute function im_decision_guard();
-- create trigger trg_im_decision_audit after insert or update on im_decisions for each row execute function im_decision_audit();

-- notification rule for stale decisions (generator block is appended in 020_decision_notifications.sql)
insert into im_notif_rules (key, name, description, kind, recipients, escalate_to, channels, threshold_hours, dedupe_hours, sort) values
 ('decision_overdue', 'تصمیم معوق', 'تصمیمی که موعدش گذشته و هنوز اتخاذ نشده؛ تصمیم‌گیرنده و سپس مدیران مطلع می‌شوند', 'state', '{}', '{admins}', '{in_app,email}', 0, 24, 110)
on conflict (key) do nothing;
