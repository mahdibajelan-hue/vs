-- ============================================================================
-- Issue Management v2 — server-side rules: roles, closing blockers, lifecycle guard, due-date control, audit trail.
-- ============================================================================

create or replace function im_actor_roles(p_issue im_issues)
returns text[] language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when is_admin_user() or im_can_manage(p_issue.project_id) then 'admin' end,
    case when p_issue.owner_id = auth.uid() then 'owner' end,
    case when p_issue.pursuer_id = auth.uid() then 'pursuer' end,
    case when p_issue.approver_id = auth.uid() then 'approver' end,
    case when p_issue.follow_up_id = auth.uid() then 'follow_up' end,
    case when im_is_project_member(p_issue.project_id) then 'member' end
  ], null);
$$;

-- What still stops an issue from being closed (empty array = may close). «اقدام انجام شد» ≠ «مسئله رفع شد».
create or replace function im_close_blockers(p_issue im_issues)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  b text[] := '{}';
  cat im_categories%rowtype;
  v_open int;
  v_ev int;
  v_cat boolean;
begin
  if coalesce(trim(p_issue.resolution_summary), '') = '' then b := array_append(b, ('خلاصه و نتیجه نهایی رفع ثبت نشده است')::text); end if;
  if coalesce(trim(p_issue.acceptance_criteria), '') = '' then b := array_append(b, ('معیار پذیرش تعریف نشده است')::text); end if;
  if p_issue.category is null then b := array_append(b, ('دسته‌بندی مسئله مشخص نیست')::text); end if;
  select * into cat from im_categories where key = p_issue.category;
  v_cat := found;
  if v_cat and cat.require_evidence then
    select count(*) into v_ev from im_attachments a where a.issue_id = p_issue.id and a.kind = 'resolution_evidence';
    if v_ev = 0 then b := array_append(b, ('شاهد رفع (پیوست) برای این دسته الزامی است و بارگذاری نشده')::text); end if;
  end if;
  if ((v_cat and cat.require_root_cause) or p_issue.severity in ('high', 'critical')) and not p_issue.root_cause_confirmed then
    b := array_append(b, ('علت ریشه‌ای تأیید نشده است')::text);
  end if;
  select count(*) into v_open from im_issue_tasks t where t.issue_id = p_issue.id and t.status not in ('done', 'cancelled');
  if v_open > 0 then b := array_append(b, (v_open::text || ' اقدام باز یا تأییدنشده وجود دارد')::text); end if;
  return b;
end;
$$;

-- Lifecycle guard: workflow transitions, role checks, closing blockers, reopen bookkeeping, due-date control.
create or replace function im_issue_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_stage im_workflow_stages%rowtype;
  v_tr im_workflow_transitions%rowtype;
  v_roles text[];
  v_reason text := coalesce(current_setting('im.reason', true), '');
  v_blockers text[];
begin
  if tg_op = 'INSERT' then
    if new.code is null or new.code = '' then new.code := 'ISS-' || lpad(coalesce(new.seq_no, nextval('im_issue_seq'))::text, 5, '0'); end if;
    new.original_due_date := coalesce(new.original_due_date, new.resolve_due_date, ((new.created_at at time zone 'utc')::date + new.deadline_days));
    select * into v_stage from im_workflow_stages where workflow_key = new.workflow_key and key = new.stage and is_active;
    if not found then raise exception 'unknown_stage: %', new.stage; end if;
    new.status := v_stage.coarse_status;
    return new;
  end if;

  -- due date is only changed through an approved extension
  if (new.deadline_days is distinct from old.deadline_days or new.resolve_due_date is distinct from old.resolve_due_date)
     and coalesce(current_setting('im.ext', true), 'off') <> 'on' then
    raise exception 'due_date_change_requires_extension';
  end if;
  new.original_due_date := old.original_due_date;

  -- legacy clients only know `status`: translate it to the matching stage
  if new.status is distinct from old.status and new.stage is not distinct from old.stage then
    new.stage := case new.status
      when 'open' then 'registered' when 'in_progress' then 'in_progress' when 'pending_approval' then 'resolution_review'
      when 'approved' then 'closed' else 'returned' end;
  end if;

  if new.stage is distinct from old.stage then
    select * into v_tr from im_workflow_transitions where workflow_key = new.workflow_key and from_stage = old.stage and to_stage = new.stage;
    if not found then raise exception 'transition_not_allowed: % -> %', old.stage, new.stage; end if;
    v_roles := im_actor_roles(new);
    if auth.uid() is not null and not (v_roles && v_tr.allowed_roles) then raise exception 'role_not_allowed_for_transition'; end if;
    if v_tr.requires_reason and length(trim(v_reason)) < 3 then raise exception 'reason_required'; end if;
    select * into v_stage from im_workflow_stages where workflow_key = new.workflow_key and key = new.stage;

    if new.stage = 'validated' and new.category is null then raise exception 'category_required_for_validation'; end if;
    if new.stage = 'resolution_review' then
      if coalesce(trim(new.resolution_summary), '') = '' then raise exception 'resolution_summary_required'; end if;
      new.resolution_requested_at := now();
    end if;
    if new.stage = 'closed' then
      v_blockers := im_close_blockers(new);
      if array_length(v_blockers, 1) > 0 then raise exception 'cannot_close: %', array_to_string(v_blockers, ' | '); end if;
      if new.pursuer_id = auth.uid() and new.approver_id is distinct from auth.uid() and not is_admin_user() then
        raise exception 'the assigned pursuer cannot verify their own resolution';
      end if;
      new.closed_at := current_date;
      new.resolution_verified_by := auth.uid();
      new.resolution_verified_at := now();
    end if;
    if old.stage = 'closed' and new.stage = 'reopened' then
      new.reopen_count := old.reopen_count + 1;
      new.last_reopened_at := now();
      new.closed_at := null;
      new.resolution_verified_by := null;
      new.resolution_verified_at := null;
    end if;
    new.status := v_stage.coarse_status;
    new.stage_changed_at := now();
  elsif new.status is distinct from old.status then
    -- same stage but the coarse status was edited directly: keep them consistent
    select * into v_stage from im_workflow_stages where workflow_key = new.workflow_key and key = new.stage;
    new.status := v_stage.coarse_status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_00_im_issue_guard on im_issues;
create trigger trg_00_im_issue_guard before insert or update on im_issues for each row execute function im_issue_guard();

-- Audit trail ------------------------------------------------------------------
create or replace function im_log_event(p_issue uuid, p_code text, p_task uuid, p_kind text, p_field text, p_old text, p_new text, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into im_issue_events (issue_id, issue_code, task_id, kind, field, old_value, new_value, reason, meta)
  values (p_issue, coalesce(p_code, ''), p_task, p_kind, coalesce(p_field, ''), p_old, p_new, coalesce(current_setting('im.reason', true), ''), coalesce(p_meta, '{}'::jsonb));
$$;

create or replace function im_issue_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform im_log_event(new.id, new.code, null, 'created', '', null, new.title, jsonb_build_object('source', new.source, 'project_id', new.project_id));
    return new;
  end if;
  if tg_op = 'DELETE' then
    perform im_log_event(old.id, old.code, null, 'deleted', '', old.title, null, jsonb_build_object('snapshot', to_jsonb(old)));
    return old;
  end if;
  if new.stage is distinct from old.stage then perform im_log_event(new.id, new.code, null, 'stage_change', 'stage', old.stage, new.stage); end if;
  if new.owner_id is distinct from old.owner_id then perform im_log_event(new.id, new.code, null, 'assignment_change', 'owner_id', old.owner_id::text, new.owner_id::text); end if;
  if new.follow_up_id is distinct from old.follow_up_id then perform im_log_event(new.id, new.code, null, 'assignment_change', 'follow_up_id', old.follow_up_id::text, new.follow_up_id::text); end if;
  if new.pursuer_id is distinct from old.pursuer_id then perform im_log_event(new.id, new.code, null, 'assignment_change', 'pursuer_id', old.pursuer_id::text, new.pursuer_id::text); end if;
  if new.approver_id is distinct from old.approver_id then perform im_log_event(new.id, new.code, null, 'assignment_change', 'approver_id', old.approver_id::text, new.approver_id::text); end if;
  if new.severity is distinct from old.severity then perform im_log_event(new.id, new.code, null, 'field_change', 'severity', old.severity, new.severity); end if;
  if new.urgency is distinct from old.urgency then perform im_log_event(new.id, new.code, null, 'field_change', 'urgency', old.urgency, new.urgency); end if;
  if new.priority is distinct from old.priority then perform im_log_event(new.id, new.code, null, 'field_change', 'priority', old.priority, new.priority); end if;
  if new.category is distinct from old.category then perform im_log_event(new.id, new.code, null, 'field_change', 'category', old.category, new.category); end if;
  if new.title is distinct from old.title then perform im_log_event(new.id, new.code, null, 'field_change', 'title', old.title, new.title); end if;
  if new.root_cause_confirmed is distinct from old.root_cause_confirmed then perform im_log_event(new.id, new.code, null, 'field_change', 'root_cause_confirmed', old.root_cause_confirmed::text, new.root_cause_confirmed::text); end if;
  if new.resolve_due_date is distinct from old.resolve_due_date or new.deadline_days is distinct from old.deadline_days then
    perform im_log_event(new.id, new.code, null, 'due_change', 'due_date', old.deadline_date::text, coalesce(new.resolve_due_date, new.deadline_date)::text, jsonb_build_object('extension_count', new.extension_count));
  end if;
  if new.blocked_since is distinct from old.blocked_since then
    perform im_log_event(new.id, new.code, null, case when new.blocked_since is null then 'unblocked' else 'blocked' end, 'blocked', old.blocked_kind, new.blocked_kind);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_im_issue_audit on im_issues;
create trigger trg_im_issue_audit after insert or update on im_issues for each row execute function im_issue_audit();
drop trigger if exists trg_im_issue_audit_del on im_issues;
create trigger trg_im_issue_audit_del before delete on im_issues for each row execute function im_issue_audit();

-- Tasks -------------------------------------------------------------------------
create or replace function im_task_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_issue im_issues%rowtype;
  v_roles text[];
  v_pending int;
begin
  select * into v_issue from im_issues where id = new.issue_id;
  if tg_op = 'INSERT' then
    new.original_due_date := coalesce(new.original_due_date, new.due_date);
    if new.parent_task_id is not null and not exists (select 1 from im_issue_tasks p where p.id = new.parent_task_id and p.issue_id = new.issue_id) then
      raise exception 'parent_task_must_belong_to_same_issue';
    end if;
    return new;
  end if;

  new.updated_at := now();
  new.original_due_date := coalesce(old.original_due_date, new.due_date);
  if new.due_date is distinct from old.due_date and old.due_date is not null and coalesce(current_setting('im.ext', true), 'off') <> 'on' then
    raise exception 'due_date_change_requires_extension';
  end if;
  if new.progress is distinct from old.progress then new.last_progress_at := now(); end if;
  v_roles := im_actor_roles(v_issue);

  if new.status is distinct from old.status then
    if new.status in ('in_progress', 'pending_verification', 'done') then
      select count(*) into v_pending from im_task_deps d join im_issue_tasks p on p.id = d.depends_on_task_id
        where d.task_id = new.id and p.status not in ('done', 'cancelled');
      if v_pending > 0 then raise exception 'blocked_by_dependency'; end if;
    end if;
    if new.status = 'blocked' then
      if coalesce(new.blocked_kind, '') = '' then raise exception 'blocked_reason_required'; end if;
      new.blocked_since := coalesce(new.blocked_since, now());
    elsif old.status = 'blocked' then
      new.blocked_since := null;
    end if;
    if new.status = 'pending_verification' then
      new.completion_claimed_at := now();
      new.completion_claimed_by := auth.uid();
      new.progress := 100;
    end if;
    if new.status = 'done' then
      if old.status <> 'pending_verification' and not (v_roles && array['admin']) then raise exception 'completion_must_be_verified'; end if;
      if auth.uid() is not null and old.completion_claimed_by = auth.uid() and not (v_roles && array['admin']) then raise exception 'executor_cannot_verify_own_completion'; end if;
      if auth.uid() is not null and not (v_roles && array['admin', 'approver', 'owner', 'follow_up']) and new.approver_id is distinct from auth.uid() and new.accountable_id is distinct from auth.uid() then
        raise exception 'role_not_allowed_to_verify_task';
      end if;
      new.verified_by := auth.uid();
      new.verified_at := now();
      new.progress := 100;
    end if;
    if old.status in ('done', 'pending_verification') and new.status in ('not_started', 'in_progress') then
      new.completion_claimed_at := null; new.completion_claimed_by := null; new.verified_by := null; new.verified_at := null;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_im_task_guard on im_issue_tasks;
create trigger trg_im_task_guard before insert or update on im_issue_tasks for each row execute function im_task_guard();

create or replace function im_task_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_blocked timestamptz;
begin
  select code into v_code from im_issues where id = new.issue_id;
  if tg_op = 'INSERT' then
    perform im_log_event(new.issue_id, v_code, new.id, 'task_created', '', null, new.title);
    return new;
  end if;
  if new.status is distinct from old.status then perform im_log_event(new.issue_id, v_code, new.id, 'task_status', 'status', old.status, new.status, jsonb_build_object('title', new.title)); end if;
  if new.executor_id is distinct from old.executor_id then perform im_log_event(new.issue_id, v_code, new.id, 'task_assignment', 'executor_id', old.executor_id::text, new.executor_id::text, jsonb_build_object('title', new.title)); end if;
  if new.accountable_id is distinct from old.accountable_id then perform im_log_event(new.issue_id, v_code, new.id, 'task_assignment', 'accountable_id', old.accountable_id::text, new.accountable_id::text, jsonb_build_object('title', new.title)); end if;
  if new.due_date is distinct from old.due_date then perform im_log_event(new.issue_id, v_code, new.id, 'task_due_change', 'due_date', old.due_date::text, new.due_date::text, jsonb_build_object('title', new.title, 'extension_count', new.extension_count)); end if;
  select min(blocked_since) into v_blocked from im_issue_tasks where issue_id = new.issue_id and status = 'blocked';
  update im_issues set blocked_since = v_blocked,
         blocked_kind = case when v_blocked is null then '' else coalesce((select blocked_kind from im_issue_tasks where issue_id = new.issue_id and status = 'blocked' order by blocked_since limit 1), '') end
   where id = new.issue_id and blocked_since is distinct from v_blocked;
  return new;
end;
$$;
drop trigger if exists trg_im_task_audit on im_issue_tasks;
create trigger trg_im_task_audit after insert or update on im_issue_tasks for each row execute function im_task_audit();

-- Dependency cycles are rejected.
create or replace function im_task_dep_cycle_guard()
returns trigger language plpgsql as $$
begin
  if exists (
    with recursive walk(id) as (
      select new.depends_on_task_id
      union
      select d.depends_on_task_id from im_task_deps d join walk w on d.task_id = w.id
    ) select 1 from walk where id = new.task_id
  ) then
    raise exception 'dependency_cycle';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_im_task_dep_cycle on im_task_deps;
create trigger trg_im_task_dep_cycle before insert on im_task_deps for each row execute function im_task_dep_cycle_guard();
