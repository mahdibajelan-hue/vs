-- Scheduling v4: update review workflow (contractor submits → consultant endorses → employer approves), resources and assignments, actual cost entries,
-- raising issues from schedule alerts, new link types (land parcel, change request), items in the shared inbox.

-- ── link types
alter table sch_links drop constraint if exists sch_links_target_type_check;
alter table sch_links add constraint sch_links_target_type_check check (target_type in ('exec_activity','eng_doc','mtl_package','risk','issue','land_parcel','change_request'));

-- ── resources
create table if not exists sch_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  name text not null,
  kind text not null default 'labor' check (kind in ('labor','equipment')),
  unit text not null default 'نفر',
  max_units numeric not null default 0 check (max_units >= 0),          -- 0 = no stated limit
  rate_per_day numeric not null default 0 check (rate_per_day >= 0),
  exec_match text not null default '',                                   -- name of the row in the daily reports' manpower / machinery table
  sort int not null default 0,
  created_by uuid default auth.uid()
);
create table if not exists sch_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  activity_uid uuid not null,
  resource_id uuid not null references sch_resources(id) on delete cascade,
  units_per_day numeric not null check (units_per_day >= 0),
  unique (activity_uid, resource_id)
);
create index if not exists sch_assignments_project on sch_assignments (project_id);

-- ── actual cost entries (cumulative actual cost is their running sum)
create table if not exists sch_actual_costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  cost_date date not null,
  amount numeric not null,
  note text not null default '',
  created_by uuid default auth.uid()
);

-- ── workflow
alter table sch_versions add column if not exists review_status text not null default 'none' check (review_status in ('none','submitted','endorsed','returned'));
alter table sch_contract add column if not exists require_review boolean not null default false;
create table if not exists sch_version_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  version_id uuid not null references sch_versions(id) on delete cascade,
  step text not null check (step in ('submit','endorse','return','approve')),
  actor uuid default auth.uid(),
  note text not null default '',
  at timestamptz not null default now()
);
create table if not exists sch_raised (
  project_id uuid not null,
  alert_key text not null,
  issue_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (project_id, alert_key)
);

do $$
declare t text;
begin
  foreach t in array array['sch_resources','sch_assignments','sch_actual_costs','sch_version_reviews','sch_raised'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (ex_can_view(project_id))', t || '_sel', t);
  end loop;
  foreach t in array array['sch_resources','sch_assignments','sch_actual_costs'] loop
    execute format('create policy %I on %I for insert to authenticated with check (sch_can_edit(project_id))', t || '_ins', t);
    execute format('create policy %I on %I for update to authenticated using (sch_can_edit(project_id)) with check (sch_can_edit(project_id))', t || '_upd', t);
    execute format('create policy %I on %I for delete to authenticated using (sch_can_edit(project_id))', t || '_del', t);
  end loop;
end $$;

create or replace function sch_can_review(p_project uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select ex_allows(p_project, 'review') or ex_can_configure(p_project)
$f$;
revoke all on function sch_can_review(uuid) from public; grant execute on function sch_can_review(uuid) to authenticated;

-- review state may only change through the RPCs; a version under review is frozen for editing
create or replace function sch_version_guard() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare via_rpc boolean := coalesce(current_setting('sch.rpc', true), '') = '1';
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' or old.is_baseline then raise exception 'version_locked'; end if;
    return old;
  end if;
  if (new.is_baseline is distinct from old.is_baseline or new.is_current is distinct from old.is_current or new.status is distinct from old.status or new.approved_by is distinct from old.approved_by or new.review_status is distinct from old.review_status) and not via_rpc then
    raise exception 'use_rpc';
  end if;
  if old.status <> 'draft' and (new.label is distinct from old.label or new.data_date is distinct from old.data_date or new.kind is distinct from old.kind or new.source is distinct from old.source) then
    raise exception 'version_locked';
  end if;
  if old.status = 'draft' and old.review_status in ('submitted','endorsed') and not via_rpc and (new.label is distinct from old.label or new.data_date is distinct from old.data_date) then
    raise exception 'in_review';
  end if;
  return new;
end $f$;

create or replace function sch_child_guard() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare v uuid := case when tg_op = 'DELETE' then old.version_id else new.version_id end; s text; b boolean; rs text;
begin
  select status, is_baseline, review_status into s, b, rs from sch_versions where id = v;
  if s is null then return case when tg_op = 'DELETE' then old else new end; end if;
  if s <> 'draft' or b then raise exception 'version_locked'; end if;
  if rs in ('submitted','endorsed') then raise exception 'in_review'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $f$;

create or replace function sch_submit_version(p_version uuid, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare v sch_versions;
begin
  select * into v from sch_versions where id = p_version;
  if v.id is null then raise exception 'not_found'; end if;
  if not sch_can_edit(v.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v.status <> 'draft' then raise exception 'already_approved'; end if;
  if v.review_status in ('submitted','endorsed') then raise exception 'in_review'; end if;
  if not exists (select 1 from sch_activities where version_id = p_version) then raise exception 'empty_version'; end if;
  perform set_config('sch.rpc', '1', true);
  update sch_versions set review_status = 'submitted' where id = p_version;
  insert into sch_version_reviews (project_id, version_id, step, note) values (v.project_id, p_version, 'submit', coalesce(p_note, ''));
  insert into sch_history (project_id, version_id, action, detail) values (v.project_id, p_version, 'submit', jsonb_build_object('label', v.label));
end $f$;

create or replace function sch_review_version(p_version uuid, p_decision text, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare v sch_versions;
begin
  select * into v from sch_versions where id = p_version;
  if v.id is null then raise exception 'not_found'; end if;
  if not sch_can_review(v.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v.status <> 'draft' or v.review_status <> 'submitted' then raise exception 'not_submitted'; end if;
  if p_decision not in ('endorse','return') then raise exception 'bad_decision'; end if;
  if p_decision = 'return' and coalesce(btrim(p_note), '') = '' then raise exception 'note_required'; end if;
  perform set_config('sch.rpc', '1', true);
  update sch_versions set review_status = case p_decision when 'endorse' then 'endorsed' else 'returned' end where id = p_version;
  insert into sch_version_reviews (project_id, version_id, step, note) values (v.project_id, p_version, p_decision, coalesce(p_note, ''));
  insert into sch_history (project_id, version_id, action, detail) values (v.project_id, p_version, p_decision, jsonb_build_object('label', v.label, 'note', coalesce(p_note, '')));
end $f$;

create or replace function sch_approve(p_version uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare v sch_versions; need boolean;
begin
  select * into v from sch_versions where id = p_version;
  if v.id is null then raise exception 'not_found'; end if;
  if not sch_can_approve(v.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v.status <> 'draft' then raise exception 'already_approved'; end if;
  if not exists (select 1 from sch_activities where version_id = p_version) then raise exception 'empty_version'; end if;
  select coalesce((select require_review from sch_contract where project_id = v.project_id), false) into need;
  if need and v.review_status <> 'endorsed' then raise exception 'review_required'; end if;
  perform set_config('sch.rpc', '1', true);
  update sch_versions set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_version;
  insert into sch_version_reviews (project_id, version_id, step, note) values (v.project_id, p_version, 'approve', '');
  insert into sch_history (project_id, version_id, action, detail) values (v.project_id, p_version, 'approve', jsonb_build_object('label', v.label));
end $f$;
do $$
declare f text;
begin
  foreach f in array array['sch_submit_version(uuid,text)','sch_review_version(uuid,text,text)','sch_approve(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ── raise an issue from a schedule alert (once per alert key)
create or replace function sch_raise_issue(p_project uuid, p_key text, p_title text, p_description text, p_severity text default 'high', p_impact_days int default null) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_map uuid; v_new uuid; v_ex uuid; v_sev text;
begin
  if not sch_can_edit(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select issue_id into v_ex from sch_raised where project_id = p_project and alert_key = p_key;
  if v_ex is not null then return jsonb_build_object('id', v_ex, 'existing', true); end if;
  select source_project_id into v_map from rasta_project_mappings where master_project_id = p_project and source_module = 'issues' and status = 'confirmed' limit 1;
  if v_map is null then raise exception 'no_issue_mapping'; end if;
  v_sev := case p_severity when 'critical' then 'critical' when 'low' then 'low' when 'medium' then 'medium' else 'high' end;
  insert into im_issues (project_id, title, description, priority, deadline_days, status, created_by, source, category, location, discipline, impact_time_days, source_ref_type, source_ref_id)
  values (v_map, p_title, coalesce(nullif(p_description, ''), p_title) || E'\n\n— منبع: برنامه‌ریزی و کنترل زمان', v_sev, case v_sev when 'critical' then 3 when 'high' then 7 else 14 end, 'open', auth.uid(), 'api', 'schedule', '', '', p_impact_days, 'schedule', p_project)
  returning id into v_new;
  insert into sch_raised (project_id, alert_key, issue_id) values (p_project, p_key, v_new);
  insert into sch_history (project_id, version_id, action, detail) values (p_project, null, 'raise_issue', jsonb_build_object('key', p_key, 'issue', v_new));
  return jsonb_build_object('id', v_new, 'existing', false);
end $f$;
revoke all on function sch_raise_issue(uuid, text, text, text, text, int) from public; grant execute on function sch_raise_issue(uuid, text, text, text, text, int) to authenticated;

-- ── shared inbox: what waits for the person in the scheduling module
alter function inbox_my_items() rename to inbox_my_items_base;
create or replace function inbox_my_items() returns table(key text, source text, kind text, project_id uuid, project_name text, title text, sub text, due date, since timestamptz, urgent boolean, ref_id uuid, extra jsonb)
language plpgsql stable security definer set search_path to 'public' as $f$
begin
  if auth.uid() is null then return; end if;
  return query select * from inbox_my_items_base();
  return query
  select 'sch:review:' || v.id, 'scheduling', 'sch_review', v.project_id, coalesce(mp.short_name, mp.official_name, ''), 'بررسی به‌روزرسانی برنامه — ' || v.label,
    'ارسال‌شده برای بررسی مشاور', null::date, coalesce((select max(r.at) from sch_version_reviews r where r.version_id = v.id and r.step = 'submit'), v.created_at),
    coalesce((select max(r.at) from sch_version_reviews r where r.version_id = v.id and r.step = 'submit'), v.created_at) < now() - interval '2 days', v.id, jsonb_build_object('label', v.label)
  from sch_versions v left join master_projects mp on mp.id = v.project_id
  where v.status = 'draft' and v.review_status = 'submitted' and sch_can_review(v.project_id);
  return query
  select 'sch:approve:' || v.id, 'scheduling', 'sch_approve', v.project_id, coalesce(mp.short_name, mp.official_name, ''), 'تأیید نسخهٔ برنامه — ' || v.label,
    case v.review_status when 'endorsed' then 'تأییدشده توسط مشاور' else 'بدون الزام بررسی مشاور' end, null::date, v.created_at, v.created_at < now() - interval '3 days', v.id, jsonb_build_object('label', v.label)
  from sch_versions v left join master_projects mp on mp.id = v.project_id
  where v.status = 'draft' and sch_can_approve(v.project_id)
    and (v.review_status = 'endorsed' or (v.review_status = 'submitted' and not coalesce((select c.require_review from sch_contract c where c.project_id = v.project_id), false)));
  return query
  select 'sch:fix:' || v.id, 'scheduling', 'sch_fix', v.project_id, coalesce(mp.short_name, mp.official_name, ''), 'اصلاح و ارسال دوبارهٔ برنامه — ' || v.label,
    coalesce((select r.note from sch_version_reviews r where r.version_id = v.id and r.step = 'return' order by r.at desc limit 1), 'برگشت‌خورده'), null::date, v.created_at, true, v.id, jsonb_build_object('label', v.label)
  from sch_versions v left join master_projects mp on mp.id = v.project_id
  where v.status = 'draft' and v.review_status = 'returned' and sch_can_edit(v.project_id);
  return query
  select 'sch:eot:' || e.id, 'scheduling', 'sch_eot', e.project_id, coalesce(mp.short_name, mp.official_name, ''), 'تصمیم دربارهٔ تمدید زمان — ' || e.title,
    e.claimed_days::text || ' روز ادعا', null::date, e.created_at, e.created_at < now() - interval '7 days', e.id, jsonb_build_object('days', e.claimed_days)
  from sch_delay_events e left join master_projects mp on mp.id = e.project_id
  where e.status = 'assessed' and sch_can_approve(e.project_id);
end $f$;
revoke all on function inbox_my_items() from public; grant execute on function inbox_my_items() to authenticated;
revoke all on function inbox_my_items_base() from public;
