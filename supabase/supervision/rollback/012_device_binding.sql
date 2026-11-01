-- Rollback of 012_device_binding.sql (run by hand): the check-in goes back to the 009 function without the phone check,
-- sv_my_links to its 007 form, and the phone tables / columns are removed (the registered phones and their history are lost).
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

create or replace function sv_my_links() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('person_id', p.id, 'project_id', p.master_project_id, 'project_name', coalesce(nullif(m.short_name, ''), m.official_name),
         'full_name', p.full_name, 'role_title', p.role_title, 'shift_start', to_char(p.shift_start, 'HH24:MI'), 'shift_end', to_char(p.shift_end, 'HH24:MI'),
         'sites', (select count(*) from sv_sites s where s.master_project_id = p.master_project_id and s.active)) order by m.official_name), '[]'::jsonb)
    from sv_people p join master_projects m on m.id = p.master_project_id
   where p.user_id = auth.uid() and p.active;
$$;

drop function if exists sv_decide_device(uuid, text, text);
drop function if exists sv_punch(uuid, text, double precision, double precision, double precision, text, text, text);
drop function if exists sv_client_ip();
drop table if exists sv_punch_tokens;
drop table if exists sv_passkey_challenges;
drop table if exists sv_devices;
alter table sv_self_punches drop column if exists verified, drop column if exists device_id, drop column if exists ip, drop column if exists install_id;
alter table sv_settings drop column if exists require_device;
