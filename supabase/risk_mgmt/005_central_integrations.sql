-- ============================================================================
-- ERM v2 — central master data (projects/people), idempotent ingestion (missions, API, import), suggestions, Issue link.
-- ============================================================================
alter table rm_projects add column if not exists master_ref_id uuid;
alter table rm_projects add column if not exists short_code text not null default '';

create or replace function rm_sync_master_projects() returns jsonb language plpgsql security definer set search_path = public as $$
declare mp record; v_new uuid; n_created int := 0; n_renamed int := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not is_admin_user() then return jsonb_build_object('created', 0, 'renamed', 0, 'skipped', 'admin_only'); end if;
  for mp in select id, project_code, official_name from master_projects loop
    select source_project_id into v_new from rasta_project_mappings where master_project_id = mp.id and source_module = 'risk' and status = 'confirmed' limit 1;
    if v_new is null then
      insert into rm_projects (name, client, created_by, master_ref_id, short_code) values (mp.official_name, '', auth.uid(), mp.id, coalesce(mp.project_code, '')) returning id into v_new;
      insert into rasta_project_mappings (master_project_id, source_module, source_project_id, alias_name, status) values (mp.id, 'risk', v_new, mp.official_name, 'confirmed');
      n_created := n_created + 1;
    else
      update rm_projects set name = mp.official_name, master_ref_id = mp.id, short_code = coalesce(mp.project_code, short_code)
       where id = v_new and (name is distinct from mp.official_name or master_ref_id is distinct from mp.id or short_code is distinct from coalesce(mp.project_code, short_code));
      if found then n_renamed := n_renamed + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('created', n_created, 'renamed', n_renamed);
end $$;
grant execute on function rm_sync_master_projects() to authenticated;
revoke execute on function rm_sync_master_projects() from public, anon;

create or replace function rm_people(p_project uuid default null)
returns table (id uuid, full_name text, email text, position_title text, organization text, project_roles text[], rm_role text, is_admin boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_project is not null and not rm_can_view(p_project) then return; end if;
  return query
  select p.id, p.full_name, p.email, coalesce(p.position_title, ''), coalesce(p.organization, ''),
         coalesce((select array_agg(distinct r.name) from rasta_project_role_assignments a join rasta_project_roles r on r.id = a.project_role_id
                    join rasta_project_mappings m on m.master_project_id = a.project_id and m.source_module = 'risk' and m.status = 'confirmed'
                   where a.user_id = p.id and (p_project is null or m.source_project_id = p_project)), '{}'),
         (select x.role from rm_project_members x where x.project_id = p_project and x.user_id = p.id limit 1),
         coalesce(p.is_admin, false)
    from profiles p
   where p.account_status = 'active'
     and (p_project is null or p.is_admin or rm_central_access(p_project, p.id) or exists (select 1 from rm_project_members x where x.project_id = p_project and x.user_id = p.id))
   order by p.full_name;
end $$;
grant execute on function rm_people(uuid) to authenticated;
revoke execute on function rm_people(uuid) from public, anon;

create or replace function rm_cat_from_topic(p_topic text) returns text language sql immutable as $$
  select case p_topic when 'engineering' then 'engineering' when 'procurement' then 'procurement' when 'construction' then 'construction' when 'hse' then 'hse'
                      when 'quality' then 'quality' when 'schedule' then 'schedule' when 'cost' then 'cost' when 'land' then 'land' when 'contract' then 'contractor'
                      when 'legal' then 'legal' when 'logistics' then 'logistics' else 'other' end;
$$;

-- Idempotent creation of ONE risk from an external source; re-sending never duplicates and never overwrites an assessment.
create or replace function rm_ingest_risk(p_source text, p_external_system text, p_external_id text, p_master_project uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_id uuid; v_created boolean := false; v_cat text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_source not in ('mission_debrief', 'issue', 'import', 'meeting', 'api', 'ai', 'lifecycle') then raise exception 'invalid_source'; end if;
  if coalesce(p_external_id, '') = '' or coalesce(p_external_system, '') = '' then raise exception 'external_reference_required'; end if;
  select source_project_id into v_project from rasta_project_mappings where master_project_id = p_master_project and source_module = 'risk' and status = 'confirmed' limit 1;
  if v_project is null then raise exception 'no_risk_mapping'; end if;
  if not (rm_can_edit(v_project) or is_admin_user()) then raise exception 'not_authorized_for_project'; end if;
  select id into v_id from rm_risks where external_system = p_external_system and external_id = p_external_id;
  if v_id is null then
    v_cat := coalesce(nullif(p_payload ->> 'category', ''), 'other');
    if not exists (select 1 from rm_categories where key = v_cat) then v_cat := 'other'; end if;
    insert into rm_risks (project_id, code, title, description, category, risk_type, owner_id, initial_probability, initial_impact, created_by,
                          cause, risk_event, consequence, source, source_ref_type, source_ref_id, source_snapshot, external_system, external_id, sync_status, synced_at,
                          route_segment, station, discipline)
    values (v_project, '', left(p_payload ->> 'title', 300), coalesce(p_payload ->> 'description', ''), v_cat, 'threat', nullif(p_payload ->> 'owner_id', '')::uuid,
            least(5, greatest(1, coalesce((p_payload ->> 'probability')::int, 3))), least(5, greatest(1, coalesce((p_payload ->> 'impact')::int, 3))), auth.uid(),
            coalesce(p_payload ->> 'cause', ''), coalesce(p_payload ->> 'risk_event', ''), coalesce(p_payload ->> 'consequence', ''),
            p_source, nullif(p_payload ->> 'source_ref_type', ''), nullif(p_payload ->> 'source_ref_id', ''), coalesce(p_payload -> 'snapshot', '{}'::jsonb), p_external_system, p_external_id, 'synced', now(),
            coalesce(p_payload ->> 'route_segment', ''), coalesce(p_payload ->> 'station', ''), coalesce(p_payload ->> 'discipline', ''))
    returning id into v_id;
    v_created := true;
    if p_payload ->> 'source_ref_type' in ('mission', 'finding') then
      insert into rm_risk_links (risk_id, target_type, target_id, target_label, relation, created_by)
      values (v_id, case when p_payload ->> 'source_ref_type' = 'mission' then 'mission' else 'finding' end, p_payload ->> 'source_ref_id', coalesce(p_payload #>> '{snapshot,mission_code}', ''), 'source', auth.uid()) on conflict do nothing;
    end if;
  else
    update rm_risks set source_snapshot = coalesce(p_payload -> 'snapshot', source_snapshot), sync_status = 'synced', synced_at = now() where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'created', v_created);
end $$;
grant execute on function rm_ingest_risk(text, text, text, uuid, jsonb) to authenticated;
revoke execute on function rm_ingest_risk(text, text, text, uuid, jsonb) from public, anon;

-- Accept one suggestion → creates the risk through the same idempotent path.
create or replace function rm_accept_suggestion(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s rm_suggestions; v_master uuid; v_res jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into s from rm_suggestions where id = p_id for update;
  if not found then raise exception 'suggestion_not_found'; end if;
  if not (rm_can_edit(s.project_id) or is_admin_user()) then raise exception 'not_authorized_for_project'; end if;
  if s.status = 'accepted' and s.created_risk_id is not null then return jsonb_build_object('id', s.created_risk_id, 'created', false); end if;
  select master_project_id into v_master from rasta_project_mappings where source_module = 'risk' and source_project_id = s.project_id and status = 'confirmed' limit 1;
  v_res := rm_ingest_risk(s.source, s.source_ref_type, s.source_ref_id, v_master, s.payload || jsonb_build_object('title', s.title, 'description', s.description));
  update rm_suggestions set status = 'accepted', created_risk_id = (v_res ->> 'id')::uuid, decided_by = auth.uid(), decided_at = now() where id = p_id;
  return v_res;
end $$;
grant execute on function rm_accept_suggestion(uuid) to authenticated;
revoke execute on function rm_accept_suggestion(uuid) from public, anon;

-- Scan approved/unapproved mission debrief findings of risk nature for one project and queue them as suggestions
-- (rule: kind = 'risk', or an observation/issue with high/critical severity). With policy.auto_accept_confidence set, confident + manager-approved ones are created directly.
create or replace function rm_scan_mission_findings(p_project uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_master uuid; f record; v_n int := 0; v_auto int := 0; pol rm_policy; v_new uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not (rm_can_manage(p_project) or is_admin_user()) then raise exception 'not_authorized_for_project'; end if;
  select master_project_id into v_master from rasta_project_mappings where source_module = 'risk' and source_project_id = p_project and status = 'confirmed' limit 1;
  if v_master is null then return jsonb_build_object('queued', 0, 'auto', 0, 'skipped', 'no_mapping'); end if;
  pol := rm_policy_for(p_project);
  for f in
    select fi.*, m.code as mission_code, m.id as mission_uuid, m.destination, m.start_date
      from ms_findings fi join ms_missions m on m.id = fi.mission_id
     where m.master_project_id = v_master and fi.approval <> 'rejected' and coalesce(fi.transferred_to, '') <> 'risk'
       and (fi.kind = 'risk' or (fi.kind in ('observation', 'issue') and fi.severity in ('high', 'critical')))
       and not exists (select 1 from rm_suggestions s where s.source = 'mission_debrief' and s.source_ref_id = fi.id::text)
       and not exists (select 1 from rm_risks r where r.external_system = 'missions' and r.external_id = fi.id::text)
  loop
    insert into rm_suggestions (project_id, source, source_ref_type, source_ref_id, title, description, confidence, payload)
    values (p_project, 'mission_debrief', 'missions', f.id::text, f.title, f.description, f.confidence,
            jsonb_build_object('category', rm_cat_from_topic(f.topic_key),
                               'probability', case f.severity when 'critical' then 4 when 'high' then 4 when 'medium' then 3 else 2 end,
                               'impact', case f.severity when 'critical' then 5 when 'high' then 4 when 'medium' then 3 else 2 end,
                               'snapshot', jsonb_build_object('mission_id', f.mission_uuid, 'mission_code', f.mission_code, 'finding_id', f.id, 'finding_kind', f.kind, 'topic', f.topic_key, 'destination', f.destination, 'visit_date', f.start_date),
                               'source_ref_type', 'finding', 'source_ref_id', f.id::text))
    on conflict (source, source_ref_id) do nothing returning id into v_new;
    if v_new is not null then
      v_n := v_n + 1;
      if pol.auto_accept_confidence is not null and f.confidence >= pol.auto_accept_confidence and f.approval = 'approved' then perform rm_accept_suggestion(v_new); v_auto := v_auto + 1; end if;
    end if;
    v_new := null;
  end loop;
  return jsonb_build_object('queued', v_n, 'auto', v_auto);
end $$;
grant execute on function rm_scan_mission_findings(uuid) to authenticated;
revoke execute on function rm_scan_mission_findings(uuid) from public, anon;
