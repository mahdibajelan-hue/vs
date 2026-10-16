-- Central weld facts (one value per weld, history kept) + archive of technical form reports (frozen snapshots by date / form type).
-- Rollback: rollback/024_central_weld_archive.sql (R-C while empty; with data: rename to _retired_, R-D needs approval).
alter table ex_welds add column if not exists c_pipe text, add column if not exists c_size text, add column if not exists c_thk text, add column if not exists c_length text, add column if not exists c_bend text, add column if not exists c_updated_at timestamptz, add column if not exists c_updated_by uuid;

create table if not exists ex_weld_attr_history (
  id bigserial primary key,
  weld_id uuid not null references ex_welds(id),
  project_id uuid not null,
  attr text not null check (attr in ('pipe','size','thk','length','bend')),
  old_value text, new_value text,
  source text not null default 'form' check (source in ('form','manual','backfill')),
  source_line uuid, note text not null default '',
  by uuid default auth.uid(), at timestamptz not null default now()
);
create index if not exists ex_weld_attr_history_weld on ex_weld_attr_history (weld_id, at desc);
alter table ex_weld_attr_history enable row level security;
create policy ex_weld_attr_history_sel on ex_weld_attr_history for select to authenticated using (true);

create or replace function ex_same_val(a text, b text) returns boolean language sql immutable as $f$
  select a is not distinct from b or (a ~ '^-?[0-9]+([.][0-9]+)?$' and b ~ '^-?[0-9]+([.][0-9]+)?$' and a::numeric = b::numeric);
$f$;

create or replace function ex_weld_set_attr(p_weld uuid, p_attr text, p_value text, p_source text default 'form', p_note text default '', p_line uuid default null) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare w ex_welds%rowtype; old text; v text := nullif(btrim(coalesce(p_value, '')), '');
begin
  select * into w from ex_welds where id = p_weld;
  if w.id is null then raise exception 'not_found'; end if;
  if coalesce(current_setting('ex.rpc', true), '') <> '1' and not (ex_allows(w.project_id, 'record') or ex_allows(w.project_id, 'review') or ex_can_configure(w.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_attr not in ('pipe','size','thk','length','bend') then raise exception 'invalid_attr'; end if;
  old := case p_attr when 'pipe' then w.c_pipe when 'size' then w.c_size when 'thk' then w.c_thk when 'length' then w.c_length else w.c_bend end;
  if ex_same_val(old, v) then return jsonb_build_object('changed', false); end if;
  if old is not null and p_source = 'manual' and btrim(coalesce(p_note, '')) = '' then raise exception 'reason_required'; end if;
  execute format('update ex_welds set %I = $1, c_updated_at = now(), c_updated_by = auth.uid() where id = $2', 'c_' || p_attr) using v, p_weld;
  insert into ex_weld_attr_history (weld_id, project_id, attr, old_value, new_value, source, source_line, note) values (p_weld, w.project_id, p_attr, old, v, p_source, p_line, coalesce(p_note, ''));
  return jsonb_build_object('changed', true, 'old', old);
end $f$;
revoke all on function ex_weld_set_attr(uuid, text, text, text, text, uuid) from public;
grant execute on function ex_weld_set_attr(uuid, text, text, text, text, uuid) to authenticated;

-- moves the shared facts typed into a DRAFT report into the central record (first value wins, never overwrites) and removes the moved copies from the rows
create or replace function ex_weld_absorb(p_report uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports%rowtype; l record; wid uuid; d jsonb; attr text; k text; keys text[]; v text; cur text; moved int := 0; kept int := 0;
begin
  select * into r from ex_reports where id = p_report;
  if r.id is null then raise exception 'not_found'; end if;
  if coalesce(current_setting('ex.rpc', true), '') <> '1' and not (ex_allows(r.project_id, 'record') or ex_can_configure(r.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('draft','returned','incomplete') then return jsonb_build_object('skipped', true); end if;
  perform set_config('ex.rpc', '1', true);
  for l in select id, detail from ex_report_lines where report_id = p_report loop
    select weld_id into wid from ex_line_welds where line_id = l.id;
    if wid is null then continue; end if;
    d := l.detail;
    foreach attr in array array['pipe','size','thk','length','bend'] loop
      if attr in ('length','bend') and r.form_key not in ('fitup','welding','tie_in') then continue; end if;
      keys := case attr when 'pipe' then array['pipeNo'] when 'size' then array['sizeIn','odIn','diaIn'] when 'thk' then array['thkIn'] when 'length' then array['lengthM'] else array['bendDeg'] end;
      foreach k in array keys loop
        v := nullif(btrim(coalesce(d->>k, '')), '');
        if v is null or v = '0' then continue; end if;
        select case attr when 'pipe' then c_pipe when 'size' then c_size when 'thk' then c_thk when 'length' then c_length else c_bend end into cur from ex_welds where id = wid;
        if cur is null then perform ex_weld_set_attr(wid, attr, v, 'form', '', l.id); cur := v; end if;
        if ex_same_val(cur, v) then d := d - k; moved := moved + 1; else kept := kept + 1; end if;
      end loop;
    end loop;
    if d is distinct from l.detail then update ex_report_lines set detail = d where id = l.id; end if;
  end loop;
  return jsonb_build_object('moved', moved, 'kept_different', kept);
end $f$;
revoke all on function ex_weld_absorb(uuid) from public;
grant execute on function ex_weld_absorb(uuid) to authenticated;

-- fills EMPTY central facts from the newest saved rows of each weld (history source 'backfill'); rows are not changed
create or replace function ex_weld_central_backfill(p_project uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare w record; attr text; keys text[]; v text; n int := 0;
begin
  if not (ex_can_configure(p_project) or coalesce(current_setting('ex.rpc', true), '') = '1') then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform set_config('ex.rpc', '1', true);
  for w in select * from ex_welds where project_id = p_project and status <> 'merged' loop
    foreach attr in array array['pipe','size','thk','length','bend'] loop
      if (case attr when 'pipe' then w.c_pipe when 'size' then w.c_size when 'thk' then w.c_thk when 'length' then w.c_length else w.c_bend end) is not null then continue; end if;
      keys := case attr when 'pipe' then array['pipeNo'] when 'size' then array['sizeIn','odIn','diaIn'] when 'thk' then array['thkIn'] when 'length' then array['lengthM'] else array['bendDeg'] end;
      select nullif(btrim(coalesce(d.detail->>k, '')), '') into v
        from ex_line_welds lw join ex_report_lines d on d.id = lw.line_id join ex_reports r on r.id = d.report_id, unnest(keys) k
       where lw.weld_id = w.id and nullif(btrim(coalesce(d.detail->>k, '')), '') is not null and nullif(btrim(coalesce(d.detail->>k, '')), '') <> '0'
         and (attr not in ('length','bend') or r.form_key in ('fitup','welding','tie_in'))
       order by r.report_date desc, r.created_at desc limit 1;
      if v is not null then perform ex_weld_set_attr(w.id, attr, v, 'backfill'); n := n + 1; end if;
    end loop;
  end loop;
  return jsonb_build_object('filled', n);
end $f$;
revoke all on function ex_weld_central_backfill(uuid) from public;
grant execute on function ex_weld_central_backfill(uuid) to authenticated;

create table if not exists ex_report_archive (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  report_id uuid not null,           -- no FK: the archive outlives the working record
  version int not null default 1,
  form_key text not null, form_title text not null default '',
  category text not null default '',  -- form group (pipeline / weld / rt / coating / ground / qc)
  report_no text not null default '', report_date date not null,
  status text not null default '',
  template_id uuid,
  snapshot jsonb not null,
  note text not null default '',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  unique (report_id, version)
);
create index if not exists ex_report_archive_proj_date on ex_report_archive (project_id, report_date desc);
create index if not exists ex_report_archive_proj_cat on ex_report_archive (project_id, category, form_key);
alter table ex_report_archive enable row level security;
create policy ex_report_archive_sel on ex_report_archive for select to authenticated using (true);

create or replace function ex_archive_report(p_report uuid, p_category text, p_title text, p_note text default '') returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports%rowtype; snap jsonb; last_snap jsonb; ver int; nid uuid;
begin
  select * into r from ex_reports where id = p_report;
  if r.id is null then raise exception 'not_found'; end if;
  if not (ex_allows(r.project_id, 'record') or ex_allows(r.project_id, 'review') or ex_can_configure(r.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('submitted','partially_approved','approved') then raise exception 'not_archivable' using errcode = '22023'; end if;
  snap := jsonb_build_object(
    'report', to_jsonb(r),
    'lines', coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('central', (select jsonb_build_object('sec', w.section_raw, 'weld', w.weld_raw, 'pipe', w.c_pipe, 'size', w.c_size, 'thk', w.c_thk, 'length', w.c_length, 'bend', w.c_bend) from ex_line_welds lw join ex_welds w on w.id = lw.weld_id where lw.line_id = l.id)) order by l.line_no) from ex_report_lines l where l.report_id = r.id), '[]'::jsonb),
    'resources', coalesce((select jsonb_agg(to_jsonb(x)) from ex_report_resources x where x.report_id = r.id), '[]'::jsonb),
    'stoppages', coalesce((select jsonb_agg(to_jsonb(x)) from ex_report_stoppages x where x.report_id = r.id), '[]'::jsonb));
  select snapshot, version into last_snap, ver from ex_report_archive where report_id = p_report order by version desc limit 1;
  if last_snap is not null and last_snap = snap then return (select id from ex_report_archive where report_id = p_report and version = ver); end if;
  insert into ex_report_archive (project_id, report_id, version, form_key, form_title, category, report_no, report_date, status, template_id, snapshot, note)
  values (r.project_id, r.id, coalesce(ver, 0) + 1, r.form_key, coalesce(p_title, ''), coalesce(p_category, ''), r.report_no, r.report_date, r.status, r.template_id, snap, coalesce(p_note, '')) returning id into nid;
  return nid;
end $f$;
revoke all on function ex_archive_report(uuid, text, text, text) from public;
grant execute on function ex_archive_report(uuid, text, text, text) to authenticated;
