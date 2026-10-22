-- ============================================================================
-- حضور و غیاب دستگاه نظارت (Supervision attendance) — module key 'supervision'.
-- Supervisors and employer representatives working on a project (master_projects), their daily attendance,
-- meals taken, rented vehicles and the vehicles' working days. A monthly report is computed in the client
-- from these rows (lib/svCalc.ts). Time-clock ready: devices write raw punches to sv_clock_events and
-- sv_apply_clock() turns them into attendance rows (manual rows are never overwritten).
-- Applied 1405/07/30 (statement by statement; the SQL tool times out on long multi-statement requests).
-- Access: read = anyone with access to the master project; write = platform admin or 'supervision' create/edit.
-- ============================================================================

create or replace function sv_can_read(p_project uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and rasta_user_can_access_master_project(p_project);
$$;
create or replace function sv_can_write(p_project uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (is_admin_user() or (rasta_user_can_access_master_project(p_project)
    and (rasta_has_permission(auth.uid(), 'supervision', 'edit') or rasta_has_permission(auth.uid(), 'supervision', 'create'))));
$$;

-- Rules per project (defaults: 23 duty days a month, 8-hour day, overtime band 60–80 hours a month).
create table if not exists sv_settings (
  master_project_id uuid primary key references master_projects(id) on delete cascade,
  duty_days int not null default 23 check (duty_days between 1 and 31),
  standard_hours numeric(4,2) not null default 8 check (standard_hours > 0 and standard_hours <= 24),
  overtime_min int not null default 60 check (overtime_min >= 0),
  overtime_max int not null default 80 check (overtime_max >= 0),
  vehicle_hours numeric(4,2) not null default 8 check (vehicle_hours > 0 and vehicle_hours <= 24),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists sv_people (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  side text not null default 'supervision' check (side in ('supervision', 'employer')),
  role_title text not null default '',
  national_id text not null default '',
  mobile text not null default '',
  card_no text not null default '',            -- time-clock card / badge number
  overtime_cap int check (overtime_cap is null or overtime_cap between 0 and 200),  -- null = project overtime_max
  meal_breakfast boolean not null default true,
  meal_lunch boolean not null default true,
  meal_dinner boolean not null default true,
  start_date date,
  end_date date,
  active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists idx_sv_people_project on sv_people (master_project_id, active);
create unique index if not exists idx_sv_people_card on sv_people (master_project_id, card_no) where card_no <> '';

create table if not exists sv_vehicles (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),   -- e.g. «پژو پارس سفید»
  plate text not null default '',
  kind text not null default 'sedan' check (kind in ('sedan', 'pickup', 'suv', 'van', 'minibus', 'other')),
  lessor text not null default '',
  driver text not null default '',
  person_id uuid references sv_people(id) on delete set null,   -- supervisor the car serves (optional)
  card_no text not null default '',
  start_date date,
  end_date date,
  active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists idx_sv_vehicles_project on sv_vehicles (master_project_id, active);

-- One row per person per day. present/mission count as working days; rest = the monthly rest allowance; absent = unexcused.
create table if not exists sv_attendance (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects(id) on delete cascade,
  person_id uuid not null references sv_people(id) on delete cascade,
  day date not null,
  status text not null check (status in ('present', 'mission', 'rest', 'absent')),
  check_in time,
  check_out time,
  hours numeric(4,2) not null default 0 check (hours between 0 and 24),
  overtime numeric(4,2) not null default 0 check (overtime between 0 and 24),
  breakfast boolean not null default false,
  lunch boolean not null default false,
  dinner boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'clock')),
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  unique (person_id, day)
);
create index if not exists idx_sv_att_project_day on sv_attendance (master_project_id, day);

create table if not exists sv_vehicle_days (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects(id) on delete cascade,
  vehicle_id uuid not null references sv_vehicles(id) on delete cascade,
  day date not null,
  status text not null check (status in ('present', 'absent', 'repair')),
  hours numeric(4,2) not null default 0 check (hours between 0 and 24),
  km numeric(8,1) check (km is null or km >= 0),
  source text not null default 'manual' check (source in ('manual', 'clock')),
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  unique (vehicle_id, day)
);
create index if not exists idx_sv_vd_project_day on sv_vehicle_days (master_project_id, day);

-- Raw punches from a time-clock / card reader (one row per swipe).
create table if not exists sv_clock_events (
  id bigint generated always as identity primary key,
  master_project_id uuid not null references master_projects(id) on delete cascade,
  card_no text not null,
  at timestamptz not null,
  device text not null default '',
  direction text check (direction is null or direction in ('in', 'out')),
  created_at timestamptz not null default now(),
  unique (master_project_id, card_no, at)
);
create index if not exists idx_sv_clock_project_at on sv_clock_events (master_project_id, at);

-- updated_at / updated_by are written by the app on every save (no triggers).

-- ── row-level security
alter table sv_settings enable row level security;
create policy sv_settings_read on sv_settings for select using (sv_can_read(master_project_id));
create policy sv_settings_write on sv_settings for all using (sv_can_write(master_project_id)) with check (sv_can_write(master_project_id));
alter table sv_people enable row level security;
create policy sv_people_read on sv_people for select using (sv_can_read(master_project_id));
create policy sv_people_write on sv_people for all using (sv_can_write(master_project_id)) with check (sv_can_write(master_project_id));
alter table sv_vehicles enable row level security;
create policy sv_vehicles_read on sv_vehicles for select using (sv_can_read(master_project_id));
create policy sv_vehicles_write on sv_vehicles for all using (sv_can_write(master_project_id)) with check (sv_can_write(master_project_id));
alter table sv_attendance enable row level security;
create policy sv_attendance_read on sv_attendance for select using (sv_can_read(master_project_id));
create policy sv_attendance_write on sv_attendance for all using (sv_can_write(master_project_id)) with check (sv_can_write(master_project_id));
alter table sv_vehicle_days enable row level security;
create policy sv_vehicle_days_read on sv_vehicle_days for select using (sv_can_read(master_project_id));
create policy sv_vehicle_days_write on sv_vehicle_days for all using (sv_can_write(master_project_id)) with check (sv_can_write(master_project_id));
alter table sv_clock_events enable row level security;
create policy sv_clock_events_read on sv_clock_events for select using (sv_can_read(master_project_id));
create policy sv_clock_events_write on sv_clock_events for all using (sv_can_write(master_project_id)) with check (sv_can_write(master_project_id));

-- Turn the punches of a date range into attendance: per card and day, first punch = check-in, last = check-out.
-- Hours = check-out − check-in; overtime = hours beyond the standard day. Rows typed by hand are left alone.
create or replace function sv_apply_clock(p_project uuid, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_std numeric; v_vstd numeric; n_people int := 0; n_cars int := 0;
begin
  if not sv_can_write(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select coalesce(max(standard_hours), 8), coalesce(max(vehicle_hours), 8) into v_std, v_vstd from sv_settings where master_project_id = p_project;
  with d as (
    select e.card_no, (e.at at time zone 'Asia/Tehran')::date as day,
           min((e.at at time zone 'Asia/Tehran')::time) as t_in, max((e.at at time zone 'Asia/Tehran')::time) as t_out
      from sv_clock_events e
     where e.master_project_id = p_project and (e.at at time zone 'Asia/Tehran')::date between p_from and p_to
     group by 1, 2
  ), up as (
    insert into sv_attendance (master_project_id, person_id, day, status, check_in, check_out, hours, overtime, breakfast, lunch, dinner, source)
    select p_project, p.id, d.day, 'present', d.t_in, case when d.t_out > d.t_in then d.t_out end,
           round(least(24, greatest(0, extract(epoch from (d.t_out - d.t_in)) / 3600))::numeric, 2),
           round(least(24, greatest(0, extract(epoch from (d.t_out - d.t_in)) / 3600 - v_std))::numeric, 2),
           p.meal_breakfast, p.meal_lunch, p.meal_dinner, 'clock'
      from d join sv_people p on p.master_project_id = p_project and p.card_no = d.card_no and p.card_no <> ''
    on conflict (person_id, day) do update set check_in = excluded.check_in, check_out = excluded.check_out, hours = excluded.hours, overtime = excluded.overtime, updated_at = now()
     where sv_attendance.source = 'clock'
    returning 1
  ) select count(*) into n_people from up;
  with d as (
    select e.card_no, (e.at at time zone 'Asia/Tehran')::date as day,
           extract(epoch from max(e.at) - min(e.at)) / 3600 as h
      from sv_clock_events e
     where e.master_project_id = p_project and (e.at at time zone 'Asia/Tehran')::date between p_from and p_to
     group by 1, 2
  ), up as (
    insert into sv_vehicle_days (master_project_id, vehicle_id, day, status, hours, source)
    select p_project, v.id, d.day, 'present', round(least(24, case when d.h > 0 then d.h else v_vstd end)::numeric, 2), 'clock'
      from d join sv_vehicles v on v.master_project_id = p_project and v.card_no = d.card_no and v.card_no <> ''
    on conflict (vehicle_id, day) do update set hours = excluded.hours, updated_at = now() where sv_vehicle_days.source = 'clock'
    returning 1
  ) select count(*) into n_cars from up;
  return jsonb_build_object('people', n_people, 'vehicles', n_cars);
end $$;
grant execute on function sv_apply_clock(uuid, date, date) to authenticated;
grant execute on function sv_can_read(uuid), sv_can_write(uuid) to authenticated;

-- ── module registration (access matrix + permissions)
insert into rasta_modules (key, label_fa) values ('supervision', 'حضور و غیاب دستگاه نظارت') on conflict (key) do nothing;
insert into rasta_permissions (module_key, action)
select 'supervision', a.action from (values ('view'),('create'),('edit'),('delete'),('submit'),('review'),('approve'),('reject'),('export'),('configure')) as a(action)
on conflict (module_key, action) do nothing;
