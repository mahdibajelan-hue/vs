-- حضور و غیاب دستگاه نظارت — phone by default, head of supervision for manual entries, automatic absence
-- (applied 1405/08/01, statement by statement).
-- • status «leave» (مرخصی, excused like sick days); source «auto» for the nightly absence
-- • sv_people.is_head: only the head of supervision (or a platform admin; anyone with edit access while no head is named)
--   writes attendance by hand — sv_is_head in the write policy. People check in with their phone (sv_self_punch).
-- • sv_fill_absent: every night at 00:00 Tehran (pg_cron 20:30 UTC) an active person with no row for the day gets
--   «absent» (source auto). It looks back 7 days so a missed night is caught up, never before 1405/08/01, never into a
--   signed month. A later phone check-in on that day replaces it; the head can turn it into rest/leave/sick/mission.
-- • phone location: when GPS is not precise, the phone's cell / Wi-Fi position is accepted up to sv_settings.network_max_m
--   if its error circle reaches the site, and the punch is marked quality = 'network'.

alter table sv_attendance drop constraint sv_attendance_status_check, add constraint sv_attendance_status_check check (status in ('present', 'mission', 'rest', 'leave', 'sick', 'absent')), drop constraint sv_attendance_source_check, add constraint sv_attendance_source_check check (source in ('manual', 'clock', 'gps', 'auto'));
alter table sv_people add column if not exists is_head boolean not null default false;
alter table sv_settings add column if not exists network_max_m int not null default 2000 check (network_max_m between 150 and 10000);
alter table sv_self_punches add column if not exists quality text not null default 'gps' check (quality in ('gps', 'network'));

create or replace function sv_is_head(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin_user()
      or exists (select 1 from sv_people where master_project_id = p_project and is_head and active and user_id = auth.uid())
      or (not exists (select 1 from sv_people where master_project_id = p_project and is_head and active) and sv_can_write(p_project));
$$;
grant execute on function sv_is_head(uuid) to authenticated;

create or replace function sv_entry_ok(p_project uuid, p_day date, p_status text, p_reason text) returns boolean
language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone 'Asia/Tehran')::date as today,
                    coalesce((select entry_grace_days from sv_settings where master_project_id = p_project), 2) as grace)
  select case
    when p_day > t.today then coalesce(p_status in ('rest', 'mission', 'leave'), false)
    when p_day >= t.today - t.grace then true
    else length(trim(coalesce(p_reason, ''))) >= 5
  end from t;
$$;

alter policy sv_attendance_write on sv_attendance
  using (sv_is_head(master_project_id) and not sv_day_locked(master_project_id, day))
  with check (sv_is_head(master_project_id) and not sv_day_locked(master_project_id, day) and sv_entry_ok(master_project_id, day, status, late_reason));

create or replace function sv_fill_absent(p_upto date default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_upto date := coalesce(p_upto, (now() at time zone 'Asia/Tehran')::date - 1); n int;
begin
  insert into sv_attendance (master_project_id, person_id, day, status, hours, overtime, breakfast, lunch, dinner, source, note)
  select p.master_project_id, p.id, d::date, 'absent', 0, 0, false, false, false, 'auto', 'تردد ثبت نشد'
    from sv_people p
    cross join lateral generate_series(greatest(v_upto - 6, date '2026-10-23', coalesce(p.start_date, date '2000-01-01')), v_upto, interval '1 day') d
   where p.active and (p.end_date is null or d::date <= p.end_date)
     and not exists (select 1 from sv_attendance a where a.person_id = p.id and a.day = d::date)
     and not sv_day_locked(p.master_project_id, d::date)
  on conflict (person_id, day) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function sv_fill_absent(date) from public, anon, authenticated;
select cron.schedule('sv-fill-absent', '30 20 * * *', $c$select public.sv_fill_absent()$c$);

create or replace function sv_self_punch(p_person uuid, p_kind text, p_lat double precision, p_lng double precision, p_accuracy double precision, p_device text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); p sv_people%rowtype;
  v_today date := (now() at time zone 'Asia/Tehran')::date;
  v_time time := date_trunc('minute', now() at time zone 'Asia/Tehran')::time;
  v_site uuid; v_site_name text; v_radius int; v_dist double precision; v_acc double precision := coalesce(p_accuracy, 99999);
  v_netmax int; v_quality text := 'gps';
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
  select coalesce(max(network_max_m), 2000), coalesce(max(standard_hours), 8) into v_netmax, v_std from sv_settings where master_project_id = p.master_project_id;
  v_netmax := coalesce(v_netmax, 2000); v_std := coalesce(v_std, 8);
  if v_acc <= 150 then
    -- GPS: the point must be inside the site (with up to 50 m allowance for its error)
    if v_dist > v_radius + least(v_acc, 50) then v_ok := false; v_reason := 'outside'; end if;
  elsif v_acc <= v_netmax then
    -- cell / Wi-Fi position: accepted when its error circle reaches the site; marked as network for the supervisor
    v_quality := 'network';
    if v_dist - v_acc > v_radius then v_ok := false; v_reason := 'outside'; end if;
  else
    v_ok := false; v_reason := 'low_accuracy';
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
  insert into sv_self_punches (master_project_id, person_id, user_id, kind, day, lat, lng, accuracy_m, site_id, distance_m, accepted, reason, device, quality)
  values (p.master_project_id, p.id, v_uid, p_kind, v_day, p_lat, p_lng, p_accuracy, v_site, round(v_dist::numeric, 1), v_ok, v_reason, left(coalesce(p_device, ''), 200), v_quality);
  if v_ok then
    if p_kind = 'in' then
      insert into sv_attendance (master_project_id, person_id, day, status, check_in, hours, overtime, breakfast, lunch, dinner, source)
      values (p.master_project_id, p.id, v_day, 'present', v_time, v_std, 0, true, true, true, 'gps')
      on conflict (person_id, day) do update set status = 'present', breakfast = true, lunch = true, dinner = true, late_reason = '', note = case when sv_attendance.source = 'auto' then '' else sv_attendance.note end,
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
  return jsonb_build_object('accepted', v_ok, 'reason', v_reason, 'quality', v_quality, 'accuracy_m', round(v_acc::numeric), 'network_max_m', v_netmax, 'distance_m', round(v_dist::numeric), 'radius_m', v_radius, 'site', v_site_name, 'day', v_day,
    'check_in', to_char(r.check_in, 'HH24:MI'), 'check_out', to_char(r.check_out, 'HH24:MI'), 'hours', r.hours, 'overtime', r.overtime);
end $$;
