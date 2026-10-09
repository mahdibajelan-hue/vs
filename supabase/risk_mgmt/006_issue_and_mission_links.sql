-- ============================================================================
-- ERM v2 — two-way Issue link, mission hand-off traceability.
--  * im_convert_risk_to_issue: idempotent; risk becomes «realized» (history kept, never deleted), review is requested, both sides are linked
--  * ms_transfer_finding (risk branch): idempotent on (external_system='missions', finding id); source fields + link back to the report
--  * a manual risk link added from an Issue marks the risk for review and appears in the risk's links
-- Full function bodies are installed live; see the definitions below.
-- ============================================================================
create or replace function im_convert_risk_to_issue(p_risk uuid, p_cause text default '', p_pursuer uuid default null, p_deadline_days integer default 7)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k rm_risks%rowtype; v_master uuid; v_project uuid; v_id uuid; v_created boolean := false; v_sev text; v_cat text; v_score int; v_code text;
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
    select coalesce((select current_score from rm_risk_assessments where risk_id = p_risk order by review_date desc, created_at desc limit 1), k.initial_score) into v_score;
    v_sev := case when v_score >= 16 then 'critical' when v_score >= 11 then 'high' when v_score >= 6 then 'medium' else 'low' end;
    v_cat := case k.category when 'engineering' then 'engineering' when 'procurement' then 'procurement' when 'contractor' then 'contractor' when 'cost' then 'finance'
                             when 'land' then 'land_right_of_way' when 'permits' then 'permits' when 'hse' then 'hse' when 'quality' then 'quality' when 'legal' then 'contract_commercial' else 'other' end;
    insert into im_issues (project_id, title, description, priority, severity, urgency, category, deadline_days, source, source_ref_type, source_ref_id, source_snapshot, created_by, pursuer_id, owner_id)
    values (v_project, k.title, coalesce(nullif(p_cause, ''), 'ریسک محقق‌شده') || E'\n\n— ریسک مبدأ: ' || k.code || E'\n' || k.description,
            v_sev, v_sev, 'high', v_cat, greatest(1, coalesce(p_deadline_days, 7)), 'risk', 'risk', p_risk::text,
            jsonb_build_object('risk_code', k.code, 'risk_status', k.status, 'initial_probability', k.initial_probability, 'initial_impact', k.initial_impact, 'initial_score', k.initial_score,
                               'current_score', v_score, 'response_strategy', k.response_strategy, 'realization_cause', p_cause, 'cause', k.cause, 'risk_event', k.risk_event, 'consequence', k.consequence),
            auth.uid(), p_pursuer, coalesce(k.owner_id, auth.uid()))
    returning id, code into v_id, v_code;
    insert into im_issue_links (issue_id, target_type, target_id, target_label, relation) values (v_id, 'risk', p_risk::text, k.code || ' · ' || k.title, 'derived_from') on conflict do nothing;
    insert into rm_risk_links (risk_id, target_type, target_id, target_label, relation, created_by) values (p_risk, 'issue', v_id::text, coalesce(v_code, ''), 'derived_issue', auth.uid()) on conflict do nothing;
    if k.status not in ('closed', 'realized') then update rm_risks set status = 'realized', review_requested_at = now(), review_request_reason = 'ریسک محقق شد و به مسئله تبدیل شد؛ ارزیابی بازنگری شود' where id = p_risk; end if;
    insert into rm_risk_history (risk_id, user_id, activity, new_value, comment) values (p_risk, auth.uid(), 'realized_to_issue', jsonb_build_object('issue_id', v_id, 'issue_code', v_code), left(coalesce(p_cause, ''), 200));
    v_created := true;
  end if;
  return jsonb_build_object('id', v_id, 'created', v_created);
end;
$$;

create or replace function rm_on_issue_link() returns trigger language plpgsql security definer set search_path = public as $$
declare v_risk uuid; v_code text;
begin
  if new.target_type <> 'risk' then return null; end if;
  begin v_risk := new.target_id::uuid; exception when others then return null; end;
  if not exists (select 1 from rm_risks where id = v_risk) then return null; end if;
  select code into v_code from im_issues where id = new.issue_id;
  insert into rm_risk_links (risk_id, target_type, target_id, target_label, relation) values (v_risk, 'issue', new.issue_id::text, coalesce(v_code, ''), case when new.relation = 'derived_from' then 'derived_issue' else 'related' end) on conflict do nothing;
  update rm_risks set review_requested_at = coalesce(review_requested_at, now()), review_request_reason = case when review_request_reason = '' then 'مسئلهٔ مرتبط ثبت شد: ' || coalesce(v_code, '') || '؛ ارزیابی بازنگری شود' else review_request_reason end where id = v_risk and status <> 'closed';
  return null;
end $$;
drop trigger if exists trg_rm_on_issue_link on im_issue_links;
create trigger trg_rm_on_issue_link after insert on im_issue_links for each row execute function rm_on_issue_link();

-- ms_transfer_finding: see supabase/schema.sql section 61 for the full body; the risk branch is replaced by:
--   select id into v_new from rm_risks where external_system = 'missions' and external_id = f.id::text;
--   if v_new is null then insert into rm_risks (..., source, source_ref_type, source_ref_id, external_system, external_id, sync_status, synced_at, source_snapshot) ...; insert link 'finding'; end if;
--   update rm_suggestions set status = 'accepted', created_risk_id = v_new ... where source = 'mission_debrief' and source_ref_id = f.id::text and status = 'pending';
