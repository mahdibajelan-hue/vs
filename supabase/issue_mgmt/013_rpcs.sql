-- ============================================================================
-- Issue Management v2 — RPCs: workflow transition, controlled extensions, bulk create, idempotent ingestion, risk conversion.
-- ============================================================================
alter table im_issues add column if not exists source_snapshot jsonb not null default '{}'::jsonb;

-- Stage transition with reason + a whitelist of fields saved in the same statement (SECURITY INVOKER: RLS applies,
-- the guard trigger enforces workflow, roles and closing blockers).
create or replace function im_transition(p_issue uuid, p_to text, p_reason text default '', p_patch jsonb default '{}'::jsonb)
returns im_issues language plpgsql security invoker set search_path = public as $$
declare r im_issues;
begin
  perform set_config('im.reason', coalesce(p_reason, ''), true);
  update im_issues set
    stage = p_to,
    resolution_summary = coalesce(p_patch->>'resolution_summary', resolution_summary),
    acceptance_criteria = coalesce(p_patch->>'acceptance_criteria', acceptance_criteria),
    effectiveness_result = coalesce(p_patch->>'effectiveness_result', effectiveness_result),
    lessons_learned = coalesce(p_patch->>'lessons_learned', lessons_learned),
    root_cause_summary = coalesce(p_patch->>'root_cause_summary', root_cause_summary),
    root_cause_confirmed = coalesce((p_patch->>'root_cause_confirmed')::boolean, root_cause_confirmed)
  where id = p_issue
  returning * into r;
  if not found then raise exception 'issue_not_found_or_not_visible'; end if;
  return r;
end;
$$;

-- Extension request (issue-level when p_task is null).
create or replace function im_request_extension(p_issue uuid, p_task uuid, p_to date, p_reason text, p_impact text default '')
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_from date; v_id uuid; v_code text;
begin
  if p_task is null then
    select coalesce(resolve_due_date, deadline_date), code into v_from, v_code from im_issues where id = p_issue;
  else
    select due_date into v_from from im_issue_tasks where id = p_task and issue_id = p_issue;
    select code into v_code from im_issues where id = p_issue;
  end if;
  if v_from is null then raise exception 'no_current_due_date'; end if;
  if p_to <= v_from then raise exception 'new_date_must_be_later'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  insert into im_extensions (issue_id, task_id, from_due, to_due, reason, impact) values (p_issue, p_task, v_from, p_to, p_reason, coalesce(p_impact, '')) returning id into v_id;
  perform set_config('im.reason', p_reason, true);
  perform im_log_event(p_issue, v_code, p_task, 'extension_requested', 'due_date', v_from::text, p_to::text, jsonb_build_object('extension_id', v_id, 'impact', p_impact));
  return v_id;
end;
$$;

create or replace function im_decide_extension(p_ext uuid, p_approve boolean, p_note text default '')
returns im_extensions language plpgsql security invoker set search_path = public as $$
declare e im_extensions; i im_issues; v_roles text[]; v_code text;
begin
  select * into e from im_extensions where id = p_ext and status = 'pending';
  if not found then raise exception 'extension_not_pending'; end if;
  select * into i from im_issues where id = e.issue_id;
  v_roles := im_actor_roles(i);
  if not (v_roles && array['admin', 'approver']) then raise exception 'only_approver_or_admin_may_decide'; end if;
  if e.requested_by = auth.uid() and not (v_roles && array['admin']) then raise exception 'cannot_decide_own_request'; end if;
  perform set_config('im.reason', coalesce(nullif(p_note, ''), e.reason), true);
  if p_approve then
    perform set_config('im.ext', 'on', true);
    if e.task_id is null then
      update im_issues set resolve_due_date = e.to_due, extension_count = extension_count + 1 where id = e.issue_id;
    else
      update im_issue_tasks set due_date = e.to_due, extension_count = extension_count + 1 where id = e.task_id;
    end if;
    perform set_config('im.ext', 'off', true);
  end if;
  update im_extensions set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(p_note, '')
   where id = p_ext returning * into e;
  perform im_log_event(e.issue_id, i.code, e.task_id, case when p_approve then 'extension_approved' else 'extension_rejected' end, 'due_date', e.from_due::text, e.to_due::text, jsonb_build_object('extension_id', e.id));
  return e;
end;
$$;

-- Bulk create (RLS applies per row). Rows carrying (source, source_ref_id) are de-duplicated.
create or replace function im_bulk_create(p_project uuid, p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r jsonb; v_created int := 0; v_skipped int := 0; v_id uuid;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into im_issues (project_id, title, description, priority, severity, urgency, category, deadline_days, location, discipline, source, source_ref_id, source_ref_type, created_by)
    values (p_project, r->>'title', coalesce(r->>'description', ''), coalesce(r->>'priority', 'medium'), coalesce(r->>'severity', coalesce(r->>'priority', 'medium')),
            coalesce(r->>'urgency', coalesce(r->>'priority', 'medium')), nullif(r->>'category', ''), coalesce((r->>'deadline_days')::int, 7), coalesce(r->>'location', ''), coalesce(r->>'discipline', ''),
            coalesce(r->>'source', 'import'), nullif(r->>'source_ref_id', ''), nullif(r->>'source_ref_type', ''), auth.uid())
    on conflict do nothing
    returning id into v_id;
    if v_id is null then v_skipped := v_skipped + 1; else v_created := v_created + 1; end if;
    v_id := null;
  end loop;
  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;

-- Idempotent ingestion for external systems (visit reports, correspondence, land acquisition, …).
create or replace function im_ingest_issue(p_source text, p_external_system text, p_external_id text, p_master_project uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_project uuid; v_id uuid; v_created boolean := false;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_source not in ('mission_debrief', 'land_acquisition', 'risk', 'correspondence', 'meeting', 'report', 'api', 'lifecycle_action') then raise exception 'invalid_source'; end if;
  if coalesce(p_external_id, '') = '' or coalesce(p_external_system, '') = '' then raise exception 'external_reference_required'; end if;
  if not rasta_user_can_access_master_project(p_master_project) then raise exception 'not_authorized_for_project'; end if;
  select source_project_id into v_project from rasta_project_mappings where master_project_id = p_master_project and source_module = 'issues' and status = 'confirmed' limit 1;
  if v_project is null then raise exception 'no_issue_mapping'; end if;

  select id into v_id from im_issues where external_system = p_external_system and external_id = p_external_id;
  if v_id is null then
    insert into im_issues (project_id, title, description, priority, severity, urgency, category, deadline_days, location, discipline, source, source_ref_type, source_ref_id,
                           external_system, external_id, sync_status, synced_at, source_snapshot, created_by, pursuer_id, owner_id)
    values (v_project, p_payload->>'title', coalesce(p_payload->>'description', ''), coalesce(p_payload->>'priority', 'medium'), coalesce(p_payload->>'severity', coalesce(p_payload->>'priority', 'medium')),
            coalesce(p_payload->>'urgency', 'medium'), nullif(p_payload->>'category', ''), coalesce((p_payload->>'deadline_days')::int, 7), coalesce(p_payload->>'location', ''), coalesce(p_payload->>'discipline', ''),
            p_source, p_external_system, p_external_id, p_external_system, p_external_id, 'synced', now(), coalesce(p_payload->'snapshot', '{}'::jsonb), auth.uid(),
            nullif(p_payload->>'pursuer_id', '')::uuid, coalesce(nullif(p_payload->>'owner_id', '')::uuid, auth.uid()))
    returning id into v_id;
    v_created := true;
  else
    perform set_config('im.reason', 'همگام‌سازی از ' || p_external_system, true);
    update im_issues set
      title = coalesce(p_payload->>'title', title),
      description = coalesce(p_payload->>'description', description),
      location = coalesce(p_payload->>'location', location),
      source_snapshot = coalesce(p_payload->'snapshot', source_snapshot),
      sync_status = 'synced', synced_at = now()
    where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'created', v_created);
end;
$$;

-- Realised risk → Issue. The risk record is never modified or removed; a link and a snapshot of its assessment are kept.
create or replace function im_convert_risk_to_issue(p_risk uuid, p_cause text default '', p_pursuer uuid default null, p_deadline_days integer default 7)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k rm_risks%rowtype; v_master uuid; v_project uuid; v_id uuid; v_created boolean := false; v_sev text; v_cat text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into k from rm_risks where id = p_risk;
  if not found then raise exception 'risk_not_found'; end if;
  select master_project_id into v_master from rasta_project_mappings where source_module = 'risk' and source_project_id = k.project_id and status = 'confirmed' limit 1;
  if v_master is null then raise exception 'risk_project_not_mapped'; end if;
  if not rasta_user_can_access_master_project(v_master) then raise exception 'not_authorized_for_project'; end if;
  select source_project_id into v_project from rasta_project_mappings where source_module = 'issues' and master_project_id = v_master and status = 'confirmed' limit 1;
  if v_project is null then raise exception 'no_issue_mapping'; end if;

  select id into v_id from im_issues where source = 'risk' and source_ref_id = p_risk::text;
  if v_id is null then
    v_sev := case when k.initial_probability * k.initial_impact >= 15 then 'critical' when k.initial_probability * k.initial_impact >= 10 then 'high' when k.initial_probability * k.initial_impact >= 5 then 'medium' else 'low' end;
    v_cat := case k.category when 'technical' then 'engineering' when 'procurement' then 'procurement' when 'hse' then 'hse' when 'quality' then 'quality' when 'cost' then 'finance' else 'other' end;
    insert into im_issues (project_id, title, description, priority, severity, urgency, category, deadline_days, source, source_ref_type, source_ref_id, source_snapshot, created_by, pursuer_id, owner_id)
    values (v_project, k.title, coalesce(nullif(p_cause, ''), 'ریسک محقق‌شده') || E'\n\n— ریسک مبدأ: ' || k.code || E'\n' || k.description,
            v_sev, v_sev, 'high', v_cat, greatest(1, coalesce(p_deadline_days, 7)), 'risk', 'risk', p_risk::text,
            jsonb_build_object('risk_code', k.code, 'risk_status', k.status, 'initial_probability', k.initial_probability, 'initial_impact', k.initial_impact, 'initial_score', k.initial_probability * k.initial_impact,
                               'response_strategy', k.response_strategy, 'realization_cause', p_cause),
            auth.uid(), p_pursuer, coalesce(k.owner_id, auth.uid()))
    returning id into v_id;
    insert into im_issue_links (issue_id, target_type, target_id, target_label, relation) values (v_id, 'risk', p_risk::text, k.code || ' · ' || k.title, 'derived_from') on conflict do nothing;
    v_created := true;
  end if;
  return jsonb_build_object('id', v_id, 'created', v_created);
end;
$$;

grant execute on function im_transition(uuid, text, text, jsonb) to authenticated;
grant execute on function im_request_extension(uuid, uuid, date, text, text) to authenticated;
grant execute on function im_decide_extension(uuid, boolean, text) to authenticated;
grant execute on function im_bulk_create(uuid, jsonb) to authenticated;
grant execute on function im_ingest_issue(text, text, text, uuid, jsonb) to authenticated;
grant execute on function im_convert_risk_to_issue(uuid, text, uuid, integer) to authenticated;
