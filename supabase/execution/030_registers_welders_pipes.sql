-- Identity registers for welders (with qualifications) and pipes received into the warehouse.
-- Everything else (stringing, bending, fit-up, welding, RT, repair, coating) keeps being recorded in the forms and is linked to these by key; lifecycle/status is derived, never typed twice.
-- Read access is limited to project members (admin, or any active role in the project); writes need record/review/configure. Nothing can be deleted; every change is written to ex_register_history.
create or replace function ex_can_view(p_project uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select is_admin_user() or exists (select 1 from ex_project_roles r where r.project_id = p_project and r.user_id = auth.uid() and r.active)
$f$;
revoke all on function ex_can_view(uuid) from public; grant execute on function ex_can_view(uuid) to authenticated;
create or replace function ex_can_register(p_project uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select ex_allows(p_project, 'record') or ex_allows(p_project, 'review') or ex_can_configure(p_project)
$f$;
revoke all on function ex_can_register(uuid) from public; grant execute on function ex_can_register(uuid) to authenticated;

create table if not exists ex_welders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  welder_key text not null,              -- N1 of the stamp / ID as printed on the forms
  welder_raw text not null,
  full_name text not null default '',
  national_id text not null default '',
  org_id uuid,
  status text not null default 'active' check (status in ('active','suspended','left')),
  note text not null default '',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (project_id, welder_key)
);
create table if not exists ex_welder_quals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  welder_id uuid not null references ex_welders(id),
  wqt_no text not null default '',
  process text not null default '',       -- e.g. SMAW / GTAW / FCAW
  position text not null default '',
  material_group text not null default '',
  thk_min numeric, thk_max numeric,       -- inch
  dia_min numeric, dia_max numeric,       -- inch
  issue_date date, expiry_date date,
  wqt_report_id uuid,                     -- the WQT / welder-card record when it exists as a form
  status text not null default 'valid' check (status in ('valid','revoked')),
  note text not null default '',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_ex_welder_quals_welder on ex_welder_quals (welder_id);
create table if not exists ex_pipes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  pipe_key text not null,
  pipe_raw text not null,
  entry_date date not null,               -- date the pipe entered the warehouse / site store
  heat_no text not null default '',
  od_in numeric, wt_in numeric, length_m numeric,
  grade text not null default '',
  coating text not null default '',
  supplier text not null default '',
  way_bill text not null default '',
  material_id uuid,                       -- class of pipe in the material module (MTO row); nullable: the material module may not carry it
  entry_line_id uuid,                     -- the pipe-delivery form row it was imported from, when it was
  status text not null default 'in_stock' check (status in ('in_stock','rejected','scrapped')),
  note text not null default '',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (project_id, pipe_key)
);
create index if not exists idx_ex_pipes_project on ex_pipes (project_id, entry_date);
create table if not exists ex_register_history (
  id bigint generated always as identity primary key,
  project_id uuid not null, entity text not null, entity_id uuid not null,
  attr text not null, old_value text, new_value text, by uuid, at timestamptz not null default now()
);
create index if not exists idx_ex_register_history_entity on ex_register_history (entity, entity_id, at desc);

create or replace function ex_register_guard() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare k text; o jsonb; n jsonb;
begin
  if tg_op = 'DELETE' then raise exception 'register_no_delete'; end if;
  if tg_op = 'INSERT' then
    insert into ex_register_history (project_id, entity, entity_id, attr, new_value, by) values (new.project_id, tg_argv[0], new.id, '*', 'created', auth.uid());
    return new;
  end if;
  if new.project_id <> old.project_id then raise exception 'register_project_locked'; end if;
  new.updated_at := now();
  o := to_jsonb(old); n := to_jsonb(new);
  for k in select jsonb_object_keys(n) loop
    if k in ('id','created_at','created_by','updated_at') then continue; end if;
    if o->k is distinct from n->k then
      insert into ex_register_history (project_id, entity, entity_id, attr, old_value, new_value, by) values (new.project_id, tg_argv[0], new.id, k, o->>k, n->>k, auth.uid());
    end if;
  end loop;
  return new;
end $f$;
create trigger trg_ex_welders_guard before insert or update or delete on ex_welders for each row execute function ex_register_guard('welder');
create trigger trg_ex_welder_quals_guard before insert or update or delete on ex_welder_quals for each row execute function ex_register_guard('welder_qual');
create trigger trg_ex_pipes_guard before insert or update or delete on ex_pipes for each row execute function ex_register_guard('pipe');

alter table ex_welders enable row level security; alter table ex_welder_quals enable row level security; alter table ex_pipes enable row level security; alter table ex_register_history enable row level security;
create policy ex_welders_sel on ex_welders for select to authenticated using (ex_can_view(project_id));
create policy ex_welders_ins on ex_welders for insert to authenticated with check (ex_can_register(project_id));
create policy ex_welders_upd on ex_welders for update to authenticated using (ex_can_register(project_id)) with check (ex_can_register(project_id));
create policy ex_welder_quals_sel on ex_welder_quals for select to authenticated using (ex_can_view(project_id));
create policy ex_welder_quals_ins on ex_welder_quals for insert to authenticated with check (ex_can_register(project_id));
create policy ex_welder_quals_upd on ex_welder_quals for update to authenticated using (ex_can_register(project_id)) with check (ex_can_register(project_id));
create policy ex_pipes_sel on ex_pipes for select to authenticated using (ex_can_view(project_id));
create policy ex_pipes_ins on ex_pipes for insert to authenticated with check (ex_can_register(project_id));
create policy ex_pipes_upd on ex_pipes for update to authenticated using (ex_can_register(project_id)) with check (ex_can_register(project_id));
create policy ex_register_history_sel on ex_register_history for select to authenticated using (ex_can_view(project_id));
