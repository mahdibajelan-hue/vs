-- حضور و غیاب دستگاه نظارت — check-in with the person's own phone and location (applied 1405/08/01, statement by statement).
-- A person row can be linked to a platform user (sv_people.user_id). The project defines one or more sites (camp, office,
-- spread) as a centre + radius. sv_self_punch records every attempt (sv_self_punches, accepted or not, with distance and
-- accuracy) and, when the phone is inside a site with usable accuracy, writes the day: check-in = first «ورود», check-out =
-- «خروج», hours / overtime from the two, source 'gps'. Server time, never the phone's clock. A night shift's «خروج» before
-- noon closes yesterday's open day.

alter table sv_attendance drop constraint sv_attendance_source_check, add constraint sv_attendance_source_check check (source in ('manual', 'clock', 'gps'));
alter table sv_people add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists idx_sv_people_user on sv_people (master_project_id, user_id) where user_id is not null;

create table if not exists sv_sites (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects(id) on delete cascade,
  name text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_m int not null default 300 check (radius_m between 30 and 20000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists sv_self_punches (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects(id) on delete cascade,
  person_id uuid not null references sv_people(id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('in', 'out')),
  at timestamptz not null default now(),
  day date not null,
  lat double precision, lng double precision, accuracy_m double precision,
  site_id uuid references sv_sites(id) on delete set null,
  distance_m double precision,
  accepted boolean not null,
  reason text not null default '',          -- '' | outside | low_accuracy | no_check_in | locked
  device text not null default ''
);
create index if not exists idx_sv_self_punches on sv_self_punches (master_project_id, day);

alter table sv_sites enable row level security;
alter table sv_self_punches enable row level security;
create policy sv_sites_read on sv_sites for select using (sv_can_read(master_project_id));
create policy sv_sites_write on sv_sites for all using (sv_can_write(master_project_id)) with check (sv_can_write(master_project_id));
create policy sv_self_punches_read on sv_self_punches for select using (sv_can_read(master_project_id) or user_id = auth.uid());   -- written only by sv_self_punch

create or replace function sv_self_punch(p_person uuid, p_kind text, p_lat double precision, p_lng double precision, p_accuracy double precision, p_device text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); p sv_people%rowtype;
  v_today date := (now() at time zone 'Asia/Tehran')::date;
  v_time time := date_trunc('minute', now() at time zone 'Asia/Tehran')::time;
  v_site uuid; v_site_name text; v_radius int; v_dist double precision;
  v_ok boolean := true; v_reason text := ''; v_day date := v_today; r sv_attendance%rowtype; v_std numeric; v_h numeric;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into p from sv_people where id = p_person and user_id = v_uid and active;
  if not found then raise exception 'not_linked' using errcode = '42501'; end if;
  if p_kind not in ('in', 'out') then raise exception 'bad_kind'; end if;
  if p_lat is null or p_lng is null then raise exception 'no_location'; end if;
  select s.id, s.name, s.radius_m,
         2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - s.lat) / 2), 2) + cos(radians(s.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - s.lng) / 2), 2)))
    into v_site, v_site_name, v_radius, v_dist
    from sv_sites s where s.master_project_id = p.master_project_id and s.active
   order by 4 limit 1;
  if v_site is null then raise exception 'no_site'; end if;
  if coalesce(p_accuracy, 9999) > 150 then v_ok := false; v_reason := 'low_accuracy';
  elsif v_dist > v_radius + least(coalesce(p_accuracy, 0), 50) then v_ok := false; v_reason := 'outside';
  end if;
  if v_ok and p_kind = 'out' then
    select * into r from sv_attendance where person_id = p.id and day = v_today;
    if not found or r.check_in is null then
      -- a night shift ends the next morning: close yesterday's open day
      select * into r from sv_attendance where person_id = p.id and day = v_today - 1 and check_in is not null and check_out is null;
      if found and v_time < time '12:00' then v_day := v_today - 1; else v_ok := false; v_reason := 'no_check_in'; end if;
    end if;
  end if;
  if v_ok and sv_day_locked(p.master_project_id, v_day) then v_ok := false; v_reason := 'locked'; end if;
  insert into sv_self_punches (master_project_id, person_id, user_id, kind, day, lat, lng, accuracy_m, site_id, distance_m, accepted, reason, device)
  values (p.master_project_id, p.id, v_uid, p_kind, v_day, p_lat, p_lng, p_accuracy, v_site, round(v_dist::numeric, 1), v_ok, v_reason, left(coalesce(p_device, ''), 200));
  if v_ok then
    select coalesce(max(standard_hours), 8) into v_std from sv_settings where master_project_id = p.master_project_id;
    if p_kind = 'in' then
      insert into sv_attendance (master_project_id, person_id, day, status, check_in, hours, overtime, breakfast, lunch, dinner, source)
      values (p.master_project_id, p.id, v_day, 'present', v_time, v_std, 0, true, true, true, 'gps')
      on conflict (person_id, day) do update set status = 'present', breakfast = true, lunch = true, dinner = true, late_reason = '',
        check_in = case when sv_attendance.source = 'gps' and sv_attendance.check_in is not null then sv_attendance.check_in else excluded.check_in end,
        check_out = case when sv_attendance.source = 'gps' then sv_attendance.check_out else null end,
        source = 'gps';
    else
      update sv_attendance set check_out = v_time, source = 'gps', status = 'present' where person_id = p.id and day = v_day;
    end if;
    select * into r from sv_attendance where person_id = p.id and day = v_day;
    if r.check_in is not null and r.check_out is not null then
      v_h := extract(epoch from (r.check_out - r.check_in)) / 3600;
      if v_h < 0 then v_h := v_h + 24; end if;
      update sv_attendance set hours = round(least(24, v_h), 2), overtime = round(greatest(0, least(24, v_h) - v_std), 2) where id = r.id;
      select * into r from sv_attendance where id = r.id;
    end if;
  end if;
  return jsonb_build_object('accepted', v_ok, 'reason', v_reason, 'distance_m', round(v_dist::numeric), 'radius_m', v_radius, 'site', v_site_name, 'day', v_day,
    'check_in', to_char(r.check_in, 'HH24:MI'), 'check_out', to_char(r.check_out, 'HH24:MI'), 'hours', r.hours, 'overtime', r.overtime);
end $$;

-- the projects (people rows) the signed-in user can check in for
create or replace function sv_my_links() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('person_id', p.id, 'project_id', p.master_project_id, 'project_name', coalesce(nullif(m.short_name, ''), m.official_name),
         'full_name', p.full_name, 'role_title', p.role_title, 'shift_start', to_char(p.shift_start, 'HH24:MI'), 'shift_end', to_char(p.shift_end, 'HH24:MI'),
         'sites', (select count(*) from sv_sites s where s.master_project_id = p.master_project_id and s.active)) order by m.official_name), '[]'::jsonb)
    from sv_people p join master_projects m on m.id = p.master_project_id
   where p.user_id = auth.uid() and p.active;
$$;

-- one's own days and punches (works without access to the supervision module)
create or replace function sv_my_month(p_person uuid, p_from date, p_to date) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from sv_people where id = p_person and user_id = auth.uid()) then raise exception 'not_linked' using errcode = '42501'; end if;
  return jsonb_build_object(
    'att', coalesce((select jsonb_agg(jsonb_build_object('day', a.day, 'status', a.status, 'check_in', to_char(a.check_in, 'HH24:MI'), 'check_out', to_char(a.check_out, 'HH24:MI'),
             'hours', a.hours, 'overtime', a.overtime, 'source', a.source) order by a.day) from sv_attendance a where a.person_id = p_person and a.day between p_from and p_to), '[]'::jsonb),
    'punches', coalesce((select jsonb_agg(jsonb_build_object('kind', s.kind, 'at', s.at, 'day', s.day, 'accepted', s.accepted, 'reason', s.reason, 'distance_m', s.distance_m, 'site', st.name) order by s.at desc)
             from sv_self_punches s left join sv_sites st on st.id = s.site_id where s.person_id = p_person and s.day between p_from and p_to), '[]'::jsonb));
end $$;

grant execute on function sv_self_punch(uuid, text, double precision, double precision, double precision, text), sv_my_links(), sv_my_month(uuid, date, date) to authenticated;
