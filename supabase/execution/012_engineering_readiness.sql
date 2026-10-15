-- Engineering progress monitoring & execution readiness (light): extends the existing ex_eng_docs register — no parallel table.
-- Scope: register + dates + weights + links to activities + readiness + delay impact. File storage, revisions and correspondence are OUT of scope.
alter table ex_eng_docs
  add column if not exists contract text not null default '',
  add column if not exists preparer text not null default '',
  add column if not exists approver text not null default '',
  add column if not exists weight numeric not null default 1 check (weight >= 0),
  add column if not exists planned_prepared date,
  add column if not exists planned_approved date,
  add column if not exists actual_prepared date,
  add column if not exists actual_approved date,
  add column if not exists critical boolean not null default false,
  add column if not exists note text not null default '',
  add column if not exists updated_at timestamptz not null default now();
alter table ex_eng_docs drop constraint if exists ex_eng_docs_status_check;
alter table ex_eng_docs add constraint ex_eng_docs_status_check check (status in ('required','in_preparation','issued','pending_approval','approved','restricted','superseded'));
alter table ex_eng_docs drop constraint if exists ex_eng_docs_check;

-- date sanity and automatic actual dates when a status is reached (the manager can still correct them)
create or replace function ex_eng_docs_trg() returns trigger language plpgsql as $f$
begin
  if new.planned_prepared is not null and new.planned_approved is not null and new.planned_approved < new.planned_prepared then raise exception 'plan_dates_order'; end if;
  if new.actual_prepared is not null and new.actual_approved is not null and new.actual_approved < new.actual_prepared then raise exception 'actual_dates_order'; end if;
  if new.status in ('issued','pending_approval','approved','restricted') and new.actual_prepared is null then new.actual_prepared := current_date; end if;
  if new.status in ('approved','restricted') and new.actual_approved is null then new.actual_approved := current_date; end if;
  if new.status in ('required','in_preparation') then new.actual_approved := null; end if;
  new.updated_at := now();
  return new;
end $f$;
drop trigger if exists trg_ex_eng_docs on ex_eng_docs;
create trigger trg_ex_eng_docs before insert or update on ex_eng_docs for each row execute function ex_eng_docs_trg();

-- document ↔ activity: what kind of prerequisite, when it is needed (independent of the planned issue date) and the status it must reach
create table if not exists ex_doc_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  doc_id uuid not null references ex_eng_docs(id) on delete cascade,
  activity_id uuid not null references ex_activities(id) on delete cascade,
  front text not null default '',
  contract text not null default '',
  need_kind text not null default 'start' check (need_kind in ('start','continue')),
  need_date date,
  min_status text not null default 'approved' check (min_status in ('issued','approved')),
  allow_restricted boolean not null default false,
  alt_activity_id uuid references ex_activities(id) on delete set null,
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (doc_id, activity_id)
);
create index if not exists idx_ex_doc_links_activity on ex_doc_links (activity_id);
alter table ex_doc_links enable row level security;
drop policy if exists ex_doc_links_sel on ex_doc_links;
create policy ex_doc_links_sel on ex_doc_links for select to authenticated using (true);
drop policy if exists ex_doc_links_w on ex_doc_links;
create policy ex_doc_links_w on ex_doc_links for all to authenticated using (ex_allows(project_id, 'edit_activities') or ex_can_configure(project_id)) with check (ex_allows(project_id, 'edit_activities') or ex_can_configure(project_id));
drop trigger if exists trg_ex_audit on ex_doc_links;
create trigger trg_ex_audit after insert or update or delete on ex_doc_links for each row execute function ex_audit_trg();

-- one issue / risk per document cause: the same document raised twice updates the record instead of creating another
alter table ex_links drop constraint if exists ex_links_source_type_check;
alter table ex_links add constraint ex_links_source_type_check check (source_type in ('report','stoppage','activity','doc'));

create or replace function ex_raise_doc(p_project uuid, p_doc uuid, p_target text, p_title text, p_description text, p_severity text default 'high', p_extra jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_map uuid; v_new uuid; v_sev text; v_ex uuid; v_desc text; d ex_eng_docs;
begin
  if not ex_allows(p_project, 'raise') then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into d from ex_eng_docs where id = p_doc and project_id = p_project;
  if d.id is null then raise exception 'not_found'; end if;
  if p_target not in ('issue','risk') then raise exception 'invalid_target'; end if;
  v_sev := case p_severity when 'critical' then 'critical' when 'low' then 'low' when 'medium' then 'medium' else 'high' end;
  v_desc := coalesce(nullif(p_description, ''), p_title) || E'\n\n— منبع: پایش پیشرفت مهندسی (مدرک ' || d.doc_no || ')';
  select target_id into v_ex from ex_links where source_type = 'doc' and source_id = p_doc and target_type = p_target limit 1;
  if v_ex is not null then
    if p_target = 'issue' then
      update im_issues set description = v_desc, priority = v_sev, impact_time_days = coalesce(nullif(p_extra ->> 'impact_days', '')::int, impact_time_days) where id = v_ex;
    else
      update rm_risks set description = v_desc where id = v_ex;
    end if;
    return jsonb_build_object('target', p_target, 'id', v_ex, 'existing', true);
  end if;
  if p_target = 'issue' then
    select source_project_id into v_map from rasta_project_mappings where master_project_id = p_project and source_module = 'issues' and status = 'confirmed' limit 1;
    if v_map is null then raise exception 'no_issue_mapping'; end if;
    insert into im_issues (project_id, title, description, priority, deadline_days, status, created_by, source, category, location, discipline, impact_time_days, source_ref_type, source_ref_id)
    values (v_map, p_title, v_desc, v_sev, case v_sev when 'critical' then 3 when 'high' then 7 else 14 end, 'open', auth.uid(), 'api', 'engineering', coalesce(p_extra ->> 'station', ''), coalesce(nullif(d.discipline, ''), 'engineering'), nullif(p_extra ->> 'impact_days', '')::int, 'engineering_doc', p_doc::text)
    returning id into v_new;
  else
    select source_project_id into v_map from rasta_project_mappings where master_project_id = p_project and source_module = 'risk' and status = 'confirmed' limit 1;
    if v_map is null then raise exception 'no_risk_mapping'; end if;
    insert into rm_risks (project_id, code, title, description, category, risk_type, initial_probability, initial_impact, created_by, source, source_ref_type, source_ref_id, station, work_front, discipline)
    values (v_map, '', p_title, v_desc, 'schedule', 'threat', case v_sev when 'critical' then 5 when 'high' then 4 else 3 end, case v_sev when 'critical' then 5 when 'high' then 4 else 3 end, auth.uid(), 'api', 'engineering_doc', p_doc::text, coalesce(p_extra ->> 'station', ''), coalesce(p_extra ->> 'front', ''), coalesce(nullif(d.discipline, ''), 'engineering'))
    returning id into v_new;
  end if;
  insert into ex_links (project_id, source_type, source_id, target_type, target_id, label) values (p_project, 'doc', p_doc, p_target, v_new, p_title);
  return jsonb_build_object('target', p_target, 'id', v_new, 'existing', false);
end $f$;
revoke all on function ex_raise_doc(uuid, uuid, text, text, text, text, jsonb) from public;
grant execute on function ex_raise_doc(uuid, uuid, text, text, text, text, jsonb) to authenticated;
