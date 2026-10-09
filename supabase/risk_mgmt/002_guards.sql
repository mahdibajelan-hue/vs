-- ============================================================================
-- ERM v2 — server-side guards & audit.
--  * inherent (initial) probability/impact are frozen after creation (admin only, logged)
--  * closing a risk needs a reason; «realized» is stamped
--  * assessments are append-only; lowering a score needs a written basis (no undocumented reductions)
--  * completing an action NEVER changes a score; the action's effect is verified separately (with a note)
--  * notable field changes are written to rm_risk_history by the database itself
-- ============================================================================
create index if not exists idx_rm_risks_owner on rm_risks (owner_id) where owner_id is not null;
create index if not exists idx_rm_risks_next_review on rm_risks (next_review_date) where status <> 'closed';
create index if not exists idx_rm_assess_risk on rm_risk_assessments (risk_id, review_date desc);
create index if not exists idx_rm_actions_risk on rm_risk_actions (risk_id);
create index if not exists idx_rm_history_risk on rm_risk_history (risk_id, created_at desc);

create or replace function rm_guard_risk() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.initial_probability <> old.initial_probability or new.initial_impact <> old.initial_impact) and not is_admin_user() then
    raise exception 'initial_assessment_is_immutable';
  end if;
  if new.status = 'closed' and old.status <> 'closed' then
    if length(trim(coalesce(new.closed_reason, ''))) < 3 then raise exception 'closed_reason_required'; end if;
    new.closed_at := now();
  elsif new.status <> 'closed' and old.status = 'closed' then
    new.closed_at := null;
  end if;
  if new.status = 'realized' and old.status <> 'realized' and new.realized_at is null then new.realized_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_rm_guard_risk on rm_risks;
create trigger trg_rm_guard_risk before update on rm_risks for each row execute function rm_guard_risk();

create or replace function rm_audit_risk() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; a jsonb := to_jsonb(old); b jsonb := to_jsonb(new);
begin
  foreach k in array array['owner_id','monitor_id','approver_id','response_owner_id','status','response_strategy','category','subcategory','risk_type','project_phase','escalation_status','escalation_level','next_review_date','review_interval_days','corporate_risk_id','initial_probability','initial_impact'] loop
    if a -> k is distinct from b -> k then
      insert into rm_risk_history (risk_id, user_id, activity, previous_value, new_value, comment)
      values (new.id, auth.uid(), 'field:' || k, a -> k, b -> k, case when k = 'status' and b ->> k = 'closed' then coalesce(new.closed_reason, '') else '' end);
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists trg_rm_audit_risk on rm_risks;
create trigger trg_rm_audit_risk after update on rm_risks for each row execute function rm_audit_risk();

create or replace function rm_guard_assessment() returns trigger language plpgsql security definer set search_path = public as $$
declare v_prev smallint; v_cur smallint; v_init smallint; v_text text;
begin
  if tg_op = 'INSERT' then
    select current_score into v_prev from rm_risk_assessments where risk_id = new.risk_id order by review_date desc, created_at desc limit 1;
    if v_prev is null then select initial_score into v_prev from rm_risks where id = new.risk_id; end if;
    v_text := trim(coalesce(new.basis, '') || ' ' || coalesce(new.reviewer_comment, ''));
    if new.current_score < coalesce(v_prev, 0) and length(v_text) < 5 then raise exception 'basis_required_for_score_reduction'; end if;
    if new.method <> 'qualitative' and length(trim(coalesce(new.basis, ''))) < 5 then raise exception 'basis_required_for_quantitative_method'; end if;
    new.created_by := coalesce(new.created_by, auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    -- only the approval stamp may be added, nothing else may change
    if (to_jsonb(new) - 'approved_by' - 'approved_at') is distinct from (to_jsonb(old) - 'approved_by' - 'approved_at') then raise exception 'assessments_are_immutable'; end if;
    return new;
  else
    if pg_trigger_depth() > 1 or is_admin_user() then return old; end if;   -- cascade from deleting the risk itself, or admin
    raise exception 'assessments_are_immutable';
  end if;
end $$;
drop trigger if exists trg_rm_guard_assessment on rm_risk_assessments;
create trigger trg_rm_guard_assessment before insert or update or delete on rm_risk_assessments for each row execute function rm_guard_assessment();

create or replace function rm_guard_action() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; a jsonb; b jsonb;
begin
  if tg_op = 'INSERT' then
    if new.status = 'blocked' then new.blocked_since := now(); end if;
    return new;
  end if;
  if new.status = 'completed' and old.status <> 'completed' then new.completed_at := now(); new.completion_percentage := 100; end if;
  if old.status = 'completed' and new.status <> 'completed' then new.completed_at := null; new.effect_status := 'pending'; new.effect_note := ''; new.effect_verified_by := null; new.effect_verified_at := null; end if;
  if new.status = 'blocked' and old.status <> 'blocked' then
    if length(trim(coalesce(new.blocked_reason, ''))) < 3 then raise exception 'blocked_reason_required'; end if;
    new.blocked_since := now();
  elsif new.status <> 'blocked' and old.status = 'blocked' then new.blocked_since := null; new.blocked_reason := ''; end if;
  if new.effect_status is distinct from old.effect_status and new.effect_status <> 'pending' then
    if new.status <> 'completed' then raise exception 'effect_requires_completed_action'; end if;
    if new.effect_status <> 'not_applicable' and length(trim(coalesce(new.effect_note, ''))) < 3 then raise exception 'effect_note_required'; end if;
    new.effect_verified_by := auth.uid(); new.effect_verified_at := now();
  end if;
  new.updated_at := now();
  a := to_jsonb(old); b := to_jsonb(new);
  foreach k in array array['status', 'owner_id', 'due_date', 'effect_status', 'action_type'] loop
    if a -> k is distinct from b -> k then
      insert into rm_risk_history (risk_id, user_id, activity, previous_value, new_value, comment)
      values (new.risk_id, auth.uid(), 'action:' || k, a -> k, b -> k, left(new.description, 120));
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists trg_rm_guard_action on rm_risk_actions;
create trigger trg_rm_guard_action before insert or update on rm_risk_actions for each row execute function rm_guard_action();
