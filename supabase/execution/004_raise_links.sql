-- Execution management — part 4: links to the Issue / Risk modules (nothing is duplicated: the record lives in its own module, this table only remembers where it came from).
create table if not exists ex_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  source_type text not null check (source_type in ('report','stoppage','activity')),
  source_id uuid not null,
  target_type text not null check (target_type in ('issue','risk')),
  target_id uuid not null,
  label text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (source_type, source_id, target_type, target_id)
);
alter table ex_links enable row level security;
create policy ex_links_sel on ex_links for select to authenticated using (true);

create or replace function ex_raise(p_project uuid, p_report uuid, p_stoppage uuid, p_target text, p_title text, p_description text, p_severity text default 'high', p_extra jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_map uuid; v_new uuid; v_sev text; v_ex uuid; v_desc text; v_src_t text; v_src_id uuid;
begin
  if not ex_allows(p_project, 'raise') then raise exception 'not_allowed' using errcode = '42501'; end if;
  v_src_t := case when p_stoppage is not null then 'stoppage' else 'report' end;
  v_src_id := coalesce(p_stoppage, p_report);
  if v_src_id is null then raise exception 'no_source'; end if;
  select target_id into v_ex from ex_links where source_type = v_src_t and source_id = v_src_id and target_type = p_target limit 1;
  if v_ex is not null then return jsonb_build_object('target', p_target, 'id', v_ex, 'existing', true); end if;
  v_sev := case p_severity when 'critical' then 'critical' when 'low' then 'low' when 'medium' then 'medium' else 'high' end;
  v_desc := coalesce(nullif(p_description, ''), p_title) || E'\n\n— منبع: ماژول مدیریت اجرا';
  if p_target = 'issue' then
    select source_project_id into v_map from rasta_project_mappings where master_project_id = p_project and source_module = 'issues' and status = 'confirmed' limit 1;
    if v_map is null then raise exception 'no_issue_mapping'; end if;
    insert into im_issues (project_id, title, description, priority, deadline_days, status, created_by, source, category, location, discipline, impact_time_days, source_ref_type, source_ref_id)
    values (v_map, p_title, v_desc, v_sev, case v_sev when 'critical' then 3 when 'high' then 7 else 14 end, 'open', auth.uid(), 'api', coalesce(nullif(p_extra ->> 'category', ''), 'construction'), coalesce(p_extra ->> 'station', ''), 'construction', nullif(p_extra ->> 'impact_days', '')::int, 'execution', v_src_id::text)
    returning id into v_new;
  elsif p_target = 'risk' then
    select source_project_id into v_map from rasta_project_mappings where master_project_id = p_project and source_module = 'risk' and status = 'confirmed' limit 1;
    if v_map is null then raise exception 'no_risk_mapping'; end if;
    insert into rm_risks (project_id, code, title, description, category, risk_type, initial_probability, initial_impact, created_by, source, source_ref_type, source_ref_id, station, work_front, discipline)
    values (v_map, '', p_title, v_desc, 'schedule', 'threat', case v_sev when 'critical' then 5 when 'high' then 4 else 3 end, case v_sev when 'critical' then 5 when 'high' then 4 else 3 end, auth.uid(), 'api', 'execution', v_src_id::text, coalesce(p_extra ->> 'station', ''), coalesce(p_extra ->> 'front', ''), 'construction')
    returning id into v_new;
  else
    raise exception 'invalid_target';
  end if;
  insert into ex_links (project_id, source_type, source_id, target_type, target_id, label) values (p_project, v_src_t, v_src_id, p_target, v_new, p_title);
  if p_stoppage is not null then
    perform set_config('ex.rpc', '1', true);
    update ex_report_stoppages set issue_ref = v_new where id = p_stoppage;
  end if;
  return jsonb_build_object('target', p_target, 'id', v_new, 'existing', false);
end $f$;
