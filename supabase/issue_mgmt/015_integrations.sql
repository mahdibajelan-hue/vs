-- Issue Management v2 — integrations. Mission finding → Issue now carries category/severity/discipline, a back-reference
-- (source_ref_type='finding') and an im_issue_links row to the mission, so the full trail is kept. Everything else is unchanged.
create or replace function public.ms_transfer_finding(p_finding_id uuid, p_target text, p_params jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  f ms_findings%rowtype;
  m ms_missions%rowtype;
  v_proj uuid;
  v_new uuid;
  v_label text;
  v_prob smallint;
  v_imp smallint;
  v_cat text;
  v_prio text;
begin
  if not ms_is_manager() then raise exception 'manager_only'; end if;
  select * into f from ms_findings where id = p_finding_id for update;
  if not found then raise exception 'finding_not_found'; end if;
  if ms_is_interested(f.mission_id) then raise exception 'conflict_of_interest'; end if;
  if f.transferred_id is not null then raise exception 'already_transferred'; end if;
  select * into m from ms_missions where id = f.mission_id;
  v_prio := case f.severity when 'critical' then 'critical' when 'high' then 'high' when 'low' then 'low' else 'medium' end;

  if p_target = 'issue' then
    select source_project_id into v_proj from rasta_project_mappings
     where master_project_id = m.master_project_id and source_module = 'issues' and status = 'confirmed' limit 1;
    if v_proj is null then raise exception 'no_issue_mapping'; end if;
    v_cat := case f.topic_key
      when 'engineering' then 'engineering' when 'procurement' then 'procurement' when 'construction' then 'contractor'
      when 'hse' then 'hse' when 'quality' then 'quality' when 'cost' then 'finance' when 'legal' then 'contract_commercial'
      else 'other' end;
    insert into im_issues (project_id, title, description, pursuer_id, priority, severity, urgency, category, discipline, deadline_days, status, created_by, source,
                           source_ref_type, source_ref_id, source_snapshot, owner_id)
    values (v_proj, f.title,
            f.description || E'\n\n— منبع: بازدید ' || m.code,
            coalesce(f.owner_id, nullif(p_params->>'pursuer_id', '')::uuid),
            v_prio, v_prio, 'medium', v_cat, coalesce(f.topic_key, ''), coalesce(nullif(p_params->>'deadline_days', '')::smallint, 7), 'open', auth.uid(), 'mission_debrief',
            'finding', f.id::text, jsonb_build_object('mission_code', m.code, 'mission_id', m.id, 'finding_severity', f.severity, 'topic', f.topic_key),
            coalesce(f.owner_id, auth.uid()))
    returning id into v_new;
    insert into im_issue_links (issue_id, target_type, target_id, target_label, relation, created_by)
    values (v_new, 'mission', m.id::text, 'بازدید ' || m.code, 'derived_from', auth.uid()) on conflict do nothing;
    v_label := 'Issue';
  elsif p_target = 'risk' then
    select source_project_id into v_proj from rasta_project_mappings
     where master_project_id = m.master_project_id and source_module = 'risk' and status = 'confirmed' limit 1;
    if v_proj is null then raise exception 'no_risk_mapping'; end if;
    v_prob := least(5, greatest(1, coalesce(nullif(p_params->>'probability', '')::smallint,
                case f.severity when 'critical' then 4 when 'high' then 4 when 'medium' then 3 else 2 end)));
    v_imp := least(5, greatest(1, coalesce(nullif(p_params->>'impact', '')::smallint,
                case f.severity when 'critical' then 5 when 'high' then 4 when 'medium' then 3 else 2 end)));
    v_cat := case f.topic_key
      when 'engineering' then 'technical' when 'procurement' then 'procurement' when 'construction' then 'technical'
      when 'hse' then 'hse' when 'quality' then 'quality' when 'schedule' then 'schedule' when 'cost' then 'cost'
      else 'other' end;
    insert into rm_risks (project_id, code, title, description, category, risk_type, owner_id, initial_probability, initial_impact, created_by)
    values (v_proj, '', f.title, f.description || E'\n\n— منبع: بازدید ' || m.code, v_cat, 'threat', f.owner_id, v_prob, v_imp, auth.uid())
    returning id into v_new;
    v_label := 'Risk';
  elsif p_target = 'action' then
    insert into rasta_actions (master_project_id, title, owner_id, due_date, priority, status, source, created_by)
    values (m.master_project_id, f.title, f.owner_id, f.due_date, v_prio, 'not_started', 'mission_debrief', auth.uid())
    returning id into v_new;
    v_label := 'Action';
  else
    raise exception 'invalid_target';
  end if;

  perform set_config('ms.transition', 'on', true);
  update ms_findings set approval = 'approved', transferred_to = p_target, transferred_id = v_new, transferred_at = now(),
         manager_note = coalesce(nullif(p_params->>'note', ''), manager_note)
   where id = f.id;
  insert into ms_events (mission_id, actor_id, event, detail)
  values (f.mission_id, auth.uid(), 'transfer_' || p_target, jsonb_build_object('finding_id', f.id, 'target_id', v_new));
  perform set_config('ms.transition', 'off', true);
  return jsonb_build_object('target', p_target, 'id', v_new, 'label', v_label);
end;
$function$;
