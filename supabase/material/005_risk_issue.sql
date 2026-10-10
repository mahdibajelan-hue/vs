-- Material control — part 5: raising and linking risks / issues. The records live in rm_risks / im_issues (their own modules, workflows and permissions);
-- mtl_links only remembers which material records they came from. Many sources can share one target. (The sources' check constraints are left as they are: 'api' marks these, source_ref_type = 'material' says where from.)

create or replace function mtl_raise(p_project uuid, p_sources jsonb, p_target text, p_title text, p_description text, p_severity text default 'high', p_extra jsonb default '{}'::jsonb, p_force boolean default false) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_map uuid; v_new uuid; v_sev text; v_ex uuid; v_desc text; v_src jsonb; v_first jsonb; v_prob smallint; v_imp smallint; v_cat text;
begin
  if not mtl_allows(p_project, 'raise') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_sources is null or jsonb_array_length(p_sources) = 0 then raise exception 'no_sources'; end if;
  v_first := p_sources -> 0;
  if not p_force then
    select l.target_id into v_ex from mtl_links l, jsonb_array_elements(p_sources) s
      where l.target_type = p_target and l.source_type = s ->> 'type' and l.source_id = (s ->> 'id')::uuid and l.rel <> 'realized' limit 1;
    if v_ex is not null then return jsonb_build_object('target', p_target, 'id', v_ex, 'existing', true); end if;
  end if;
  v_sev := case p_severity when 'critical' then 'critical' when 'low' then 'low' when 'medium' then 'medium' else 'high' end;
  v_desc := coalesce(nullif(p_description, ''), p_title) || E'\n\n— منبع: ماژول کنترل متریال';
  if p_target = 'issue' then
    select source_project_id into v_map from rasta_project_mappings where master_project_id = p_project and source_module = 'issues' and status = 'confirmed' limit 1;
    if v_map is null then raise exception 'no_issue_mapping'; end if;
    insert into im_issues (project_id, title, description, priority, deadline_days, status, created_by, source, category, location, discipline, impact_time_days, source_ref_type, source_ref_id)
    values (v_map, p_title, v_desc, v_sev, coalesce(nullif(p_extra ->> 'deadline_days', '')::int, case v_sev when 'critical' then 3 when 'high' then 7 else 14 end), 'open', auth.uid(), 'api', 'procurement',
      coalesce(p_extra ->> 'station', ''), 'procurement', nullif(p_extra ->> 'impact_days', '')::int, 'material', v_first ->> 'id')
    returning id into v_new;
  elsif p_target = 'risk' then
    select source_project_id into v_map from rasta_project_mappings where master_project_id = p_project and source_module = 'risk' and status = 'confirmed' limit 1;
    if v_map is null then raise exception 'no_risk_mapping'; end if;
    v_prob := coalesce(nullif(p_extra ->> 'probability', '')::smallint, case v_sev when 'critical' then 5 when 'high' then 4 when 'medium' then 3 else 2 end);
    v_imp := coalesce(nullif(p_extra ->> 'impact', '')::smallint, case v_sev when 'critical' then 5 when 'high' then 4 when 'medium' then 3 else 2 end);
    v_cat := case when p_extra ->> 'category' in ('proc_longlead','proc_supplier','procurement','logistics','quality','cost','schedule') then p_extra ->> 'category' else 'procurement' end;
    insert into rm_risks (project_id, code, title, description, category, risk_type, initial_probability, initial_impact, created_by, source, source_ref_type, source_ref_id, station, work_front, work_package, discipline, time_to_impact_days)
    values (v_map, '', p_title, v_desc, v_cat, 'threat', v_prob, v_imp, auth.uid(), 'api', 'material', v_first ->> 'id', coalesce(p_extra ->> 'station', ''), coalesce(p_extra ->> 'front', ''), coalesce(p_extra ->> 'package', ''), 'procurement', nullif(p_extra ->> 'days_to_impact', '')::int)
    returning id into v_new;
  else
    raise exception 'invalid_target';
  end if;
  for v_src in select * from jsonb_array_elements(p_sources) loop
    insert into mtl_links (master_project_id, source_type, source_id, target_type, target_id, rel, label) values (p_project, v_src ->> 'type', (v_src ->> 'id')::uuid, p_target, v_new, 'raised', p_title) on conflict do nothing;
  end loop;
  return jsonb_build_object('target', p_target, 'id', v_new, 'existing', false);
end $f$;

create or replace function mtl_link_existing(p_project uuid, p_sources jsonb, p_target text, p_target_id uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare v_src jsonb; v_ok boolean;
begin
  if not mtl_allows(p_project, 'raise') then raise exception 'not_allowed' using errcode = '42501'; end if;
  v_ok := case p_target when 'issue' then exists (select 1 from im_issues where id = p_target_id) when 'risk' then exists (select 1 from rm_risks where id = p_target_id) else false end;
  if not v_ok then raise exception 'target_not_found'; end if;
  for v_src in select * from jsonb_array_elements(p_sources) loop
    insert into mtl_links (master_project_id, source_type, source_id, target_type, target_id, rel) values (p_project, v_src ->> 'type', (v_src ->> 'id')::uuid, p_target, p_target_id, 'attached') on conflict do nothing;
  end loop;
end $f$;

-- a risk that has materialised becomes an issue; the risk and its controls stay, and every material record tied to the risk is tied to the issue too
create or replace function mtl_risk_to_issue(p_project uuid, p_risk uuid, p_title text, p_description text, p_severity text default 'high') returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_map uuid; v_new uuid; v_sev text; r record;
begin
  if not mtl_allows(p_project, 'raise') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not exists (select 1 from mtl_links where target_type = 'risk' and target_id = p_risk) then raise exception 'risk_not_linked'; end if;
  select target_id into v_new from mtl_links where source_type = 'risk' and source_id = p_risk and target_type = 'issue' and rel = 'realized' limit 1;
  if v_new is not null then return jsonb_build_object('target', 'issue', 'id', v_new, 'existing', true); end if;
  v_sev := case p_severity when 'critical' then 'critical' when 'low' then 'low' when 'medium' then 'medium' else 'high' end;
  select source_project_id into v_map from rasta_project_mappings where master_project_id = p_project and source_module = 'issues' and status = 'confirmed' limit 1;
  if v_map is null then raise exception 'no_issue_mapping'; end if;
  insert into im_issues (project_id, title, description, priority, deadline_days, status, created_by, source, category, discipline, source_ref_type, source_ref_id)
  values (v_map, p_title, coalesce(nullif(p_description, ''), p_title) || E'\n\n— تحقق ریسک مرتبط؛ منبع: ماژول کنترل متریال', v_sev, case v_sev when 'critical' then 3 when 'high' then 7 else 14 end, 'open', auth.uid(), 'risk', 'procurement', 'procurement', 'risk', p_risk::text)
  returning id into v_new;
  update rm_risks set realized_at = now() where id = p_risk and realized_at is null;
  insert into mtl_links (master_project_id, source_type, source_id, target_type, target_id, rel, label) values (p_project, 'risk', p_risk, 'issue', v_new, 'realized', p_title);
  for r in select source_type, source_id from mtl_links where target_type = 'risk' and target_id = p_risk and source_type <> 'risk' loop
    insert into mtl_links (master_project_id, source_type, source_id, target_type, target_id, rel, label) values (p_project, r.source_type, r.source_id, 'issue', v_new, 'raised', p_title) on conflict do nothing;
  end loop;
  return jsonb_build_object('target', 'issue', 'id', v_new, 'existing', false);
end $f$;

-- legacy consumption kept on allocations becomes ledger entries (once)
insert into mtl_txns (master_project_id, material_id, kind, qty, txn_date, allocation_id, doc_ref, status, is_demo, notes)
select a.master_project_id, a.material_id, 'issue', a.quantity_consumed, a.allocation_date, a.id, 'legacy', 'posted', true, 'منتقل‌شده از مصرف تجمعی تخصیص'
from mtl_allocations a where a.quantity_consumed > 0 and not exists (select 1 from mtl_txns t where t.allocation_id = a.id and t.doc_ref = 'legacy');
