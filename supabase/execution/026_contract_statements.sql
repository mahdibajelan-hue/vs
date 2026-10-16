-- Contract statements (صورت‌وضعیت پیمان): every contract row carries THREE stored cumulative values — system (from approved executed quantities), contractor request, consultant opinion —
-- plus the previous statement's values; the month = cumulative − previous, and every calculation uses the CONSULTANT column. A finalized statement is frozen and is the "previous" of the next one.
-- Rollback: rollback/026_contract_statements.sql (R-C while empty; with data rename to _retired_ and ask, R-D).
create table if not exists ex_statements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  no int not null,
  period_from date not null, period_to date not null,
  status text not null default 'draft' check (status in ('draft','finalized')),
  note text not null default '',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  finalized_by uuid, finalized_at timestamptz,
  unique (project_id, no), unique (project_id, period_from)
);
create table if not exists ex_statement_rows (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references ex_statements(id) on delete cascade,
  project_id uuid not null,
  activity_id uuid not null references ex_activities(id),
  unit_price numeric not null default 0, base_qty numeric not null default 0,
  sys_cum numeric not null default 0, req_cum numeric, con_cum numeric, req_edited boolean not null default false,
  prev_sys numeric not null default 0, prev_req numeric not null default 0, prev_con numeric not null default 0,
  updated_by uuid, updated_at timestamptz not null default now(),
  unique (statement_id, activity_id)
);
create index if not exists ex_statement_rows_stmt on ex_statement_rows (statement_id);
alter table ex_statements enable row level security;
alter table ex_statement_rows enable row level security;
create policy ex_statements_sel on ex_statements for select to authenticated using (true);
create policy ex_statement_rows_sel on ex_statement_rows for select to authenticated using (true);
create trigger trg_ex_audit after insert or update or delete on ex_statements for each row execute function ex_audit_trg();
create trigger trg_ex_audit after insert or update or delete on ex_statement_rows for each row execute function ex_audit_trg();

create or replace function ex_statement_prev(p_stmt uuid) returns uuid language sql stable security definer set search_path to 'public' as $f$
  select p.id from ex_statements s join ex_statements p on p.project_id = s.project_id and p.status = 'finalized' and p.period_to < s.period_from where s.id = p_stmt order by p.period_to desc limit 1
$f$;

create or replace function ex_statement_create(p_project uuid, p_from date, p_to date, p_rows jsonb) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare sid uuid; n int; ps uuid;
begin
  if not (ex_has_role(p_project, array['contractor','consultant','supervision','planner']) or ex_can_configure(p_project)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_to < p_from then raise exception 'invalid_period'; end if;
  if exists (select 1 from ex_statements where project_id = p_project and period_from = p_from) then raise exception 'exists'; end if;
  if exists (select 1 from ex_statements where project_id = p_project and status = 'draft') then raise exception 'draft_exists'; end if;
  select coalesce(max(no), 0) + 1 into n from ex_statements where project_id = p_project;
  insert into ex_statements (project_id, no, period_from, period_to) values (p_project, n, p_from, p_to) returning id into sid;
  ps := ex_statement_prev(sid);
  insert into ex_statement_rows (statement_id, project_id, activity_id, unit_price, base_qty, sys_cum, req_cum, prev_sys, prev_req, prev_con)
  select sid, p_project, (e->>'activity_id')::uuid, coalesce((e->>'unit_price')::numeric, 0), coalesce((e->>'base_qty')::numeric, 0), coalesce((e->>'sys')::numeric, 0), coalesce((e->>'sys')::numeric, 0),
         coalesce(pr.sys_cum, 0), coalesce(pr.req_cum, 0), coalesce(pr.con_cum, 0)
    from jsonb_array_elements(p_rows) e left join ex_statement_rows pr on pr.statement_id = ps and pr.activity_id = (e->>'activity_id')::uuid;
  return sid;
end $f$;

create or replace function ex_statement_refresh(p_stmt uuid, p_rows jsonb) returns void language plpgsql security definer set search_path to 'public' as $f$
declare s ex_statements%rowtype; ps uuid; e jsonb;
begin
  select * into s from ex_statements where id = p_stmt;
  if s.id is null then raise exception 'not_found'; end if;
  if not (ex_has_role(s.project_id, array['contractor','consultant','supervision','planner']) or ex_can_configure(s.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if s.status <> 'draft' then raise exception 'locked'; end if;
  ps := ex_statement_prev(p_stmt);
  for e in select * from jsonb_array_elements(p_rows) loop
    insert into ex_statement_rows (statement_id, project_id, activity_id, unit_price, base_qty, sys_cum, req_cum, prev_sys, prev_req, prev_con)
    select p_stmt, s.project_id, (e->>'activity_id')::uuid, coalesce((e->>'unit_price')::numeric, 0), coalesce((e->>'base_qty')::numeric, 0), coalesce((e->>'sys')::numeric, 0), coalesce((e->>'sys')::numeric, 0),
           coalesce(pr.sys_cum, 0), coalesce(pr.req_cum, 0), coalesce(pr.con_cum, 0)
      from (select 1) x left join ex_statement_rows pr on pr.statement_id = ps and pr.activity_id = (e->>'activity_id')::uuid
    on conflict (statement_id, activity_id) do update set unit_price = excluded.unit_price, base_qty = excluded.base_qty, sys_cum = excluded.sys_cum,
      req_cum = case when ex_statement_rows.req_edited then ex_statement_rows.req_cum else excluded.sys_cum end, updated_by = auth.uid(), updated_at = now();
  end loop;
end $f$;

create or replace function ex_statement_set(p_row uuid, p_col text, p_value numeric) returns void language plpgsql security definer set search_path to 'public' as $f$
declare r ex_statement_rows%rowtype; s ex_statements%rowtype;
begin
  select * into r from ex_statement_rows where id = p_row;
  if r.id is null then raise exception 'not_found'; end if;
  select * into s from ex_statements where id = r.statement_id;
  if s.status <> 'draft' then raise exception 'locked'; end if;
  if p_value is not null and p_value < 0 then raise exception 'negative'; end if;
  if p_col = 'req' then
    if not (ex_has_role(s.project_id, array['contractor']) or ex_can_configure(s.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
    update ex_statement_rows set req_cum = p_value, req_edited = true, updated_by = auth.uid(), updated_at = now() where id = p_row;
  elsif p_col = 'con' then
    if not (ex_has_role(s.project_id, array['consultant','supervision']) or ex_can_configure(s.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
    update ex_statement_rows set con_cum = p_value, updated_by = auth.uid(), updated_at = now() where id = p_row;
  elsif p_col in ('prev_sys','prev_req','prev_con') then
    -- opening balances: only for the very first statement of the project (before it, statements were made outside the system)
    if exists (select 1 from ex_statements x where x.project_id = s.project_id and x.no < s.no) then raise exception 'not_first' using errcode = '22023'; end if;
    if not ex_can_configure(s.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    execute format('update ex_statement_rows set %I = coalesce($1, 0), updated_by = auth.uid(), updated_at = now() where id = $2', p_col) using p_value, p_row;
  else raise exception 'invalid_col'; end if;
end $f$;

create or replace function ex_statement_accept(p_stmt uuid) returns int language plpgsql security definer set search_path to 'public' as $f$
declare s ex_statements%rowtype; n int;
begin
  select * into s from ex_statements where id = p_stmt;
  if s.id is null then raise exception 'not_found'; end if;
  if s.status <> 'draft' then raise exception 'locked'; end if;
  if not (ex_has_role(s.project_id, array['consultant','supervision']) or ex_can_configure(s.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  update ex_statement_rows set con_cum = req_cum, updated_by = auth.uid(), updated_at = now() where statement_id = p_stmt and con_cum is null and req_cum is not null;
  get diagnostics n = row_count; return n;
end $f$;

create or replace function ex_statement_finalize(p_stmt uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare s ex_statements%rowtype;
begin
  select * into s from ex_statements where id = p_stmt;
  if s.id is null then raise exception 'not_found'; end if;
  if s.status <> 'draft' then raise exception 'locked'; end if;
  if not (ex_has_role(s.project_id, array['consultant','supervision']) or ex_can_configure(s.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  update ex_statements set status = 'finalized', finalized_by = auth.uid(), finalized_at = now() where id = p_stmt;
end $f$;

create or replace function ex_statement_reopen(p_stmt uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare s ex_statements%rowtype;
begin
  select * into s from ex_statements where id = p_stmt;
  if s.id is null then raise exception 'not_found'; end if;
  if not ex_can_configure(s.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if exists (select 1 from ex_statements x where x.project_id = s.project_id and x.no > s.no) then raise exception 'has_later' using errcode = '22023'; end if;
  update ex_statements set status = 'draft', finalized_by = null, finalized_at = null where id = p_stmt;
end $f$;

do $$ declare f text; begin
  foreach f in array array['ex_statement_create(uuid, date, date, jsonb)','ex_statement_refresh(uuid, jsonb)','ex_statement_set(uuid, text, numeric)','ex_statement_accept(uuid)','ex_statement_finalize(uuid)','ex_statement_reopen(uuid)','ex_statement_prev(uuid)'] loop
    execute format('revoke all on function %s from public', f); execute format('grant execute on function %s to authenticated', f);
  end loop; end $$;
