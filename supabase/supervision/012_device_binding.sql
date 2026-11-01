-- حضور و غیاب دستگاه نظارت — 012: every person's account bound to their own phone (Passkey / WebAuthn) and the raw
-- material for spotting check-ins made for someone else. Rollback: rollback/012_device_binding.sql.
--
-- • sv_devices: one phone per person (the Passkey credential's public key). A new phone is «pending» until the head of
--   supervision approves it; approving a phone retires the person's previous one. A phone already in use for another
--   person (same install id) is refused when it is registered. Rows are written only by the sv-passkey edge function.
-- • every check-in carries a one-time token that sv-passkey issues after verifying the phone's signature with fingerprint,
--   face or screen lock; sv_settings.require_device makes it mandatory per project (off until the team is registered).
-- • sv_self_punches also keeps the browser install id, the client IP, the phone used and whether it was verified.

alter table sv_settings add column if not exists require_device boolean not null default false;
alter table sv_self_punches
  add column if not exists install_id text not null default '',
  add column if not exists ip text not null default '',
  add column if not exists device_id uuid,
  add column if not exists verified boolean not null default false;

create table if not exists sv_devices (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects(id) on delete cascade,
  person_id uuid not null references sv_people(id) on delete cascade,
  user_id uuid not null,
  credential_id text not null unique,
  public_key text not null,
  sign_count bigint not null default 0,
  transports text[] not null default '{}',
  label text not null default '',
  user_agent text not null default '',
  install_id text not null default '',
  ip text not null default '',
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decide_note text not null default '',
  last_used_at timestamptz
);
create index if not exists idx_sv_devices_person on sv_devices (person_id, status);
create index if not exists idx_sv_devices_project on sv_devices (master_project_id);
create index if not exists idx_sv_devices_install on sv_devices (install_id) where install_id <> '';
alter table sv_devices enable row level security;
-- read: the supervision team of the project, and the person for their own phones; written only by the edge function and sv_decide_device
create policy sv_devices_read on sv_devices for select using (sv_can_read(master_project_id) or user_id = (select auth.uid()));

-- challenges and punch tokens: the edge function's own bookkeeping (service role only; no client policy)
create table if not exists sv_passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  person_id uuid not null references sv_people(id) on delete cascade,
  kind text not null check (kind in ('register', 'punch')),
  challenge text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists idx_sv_passkey_challenges on sv_passkey_challenges (user_id, person_id, kind, created_at desc);
alter table sv_passkey_challenges enable row level security;

create table if not exists sv_punch_tokens (
  token text primary key,
  user_id uuid not null,
  person_id uuid not null references sv_people(id) on delete cascade,
  device_id uuid not null references sv_devices(id) on delete cascade,
  install_id text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table sv_punch_tokens enable row level security;

-- the client address as the API gateway passes it (first hop of x-forwarded-for)
create or replace function sv_client_ip() returns text language sql stable set search_path = public as $$
  select left(trim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''), ',', 1)), 60);
$$;

-- check-in / check-out with the phone: as sv_self_punch, plus the phone check and the audit fields
create or replace function sv_punch(p_person uuid, p_kind text, p_lat double precision, p_lng double precision, p_accuracy double precision,
  p_device text default '', p_install text default '', p_token text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); p sv_people%rowtype; t sv_punch_tokens%rowtype;
  v_today date := (now() at time zone 'Asia/Tehran')::date;
  v_time time := date_trunc('minute', now() at time zone 'Asia/Tehran')::time;
  v_site uuid; v_site_name text; v_radius int; v_dist double precision; v_acc double precision := coalesce(p_accuracy, 99999);
  v_netmax int; v_quality text := 'gps'; v_req boolean; v_verified boolean := false; v_dev uuid;
  v_ok boolean := true; v_reason text := ''; v_day date := v_today; r sv_attendance%rowtype; v_std numeric; v_h numeric;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into p from sv_people where id = p_person and user_id = v_uid and active;
  if not found then raise exception 'not_linked' using errcode = '42501'; end if;
  if p_kind not in ('in', 'out') then raise exception 'bad_kind'; end if;
  if p_lat is null or p_lng is null then raise exception 'no_location'; end if;
  -- the phone's signed token: one use, two minutes, for this account and this person
  if coalesce(p_token, '') <> '' then
    select * into t from sv_punch_tokens where token = p_token for update;
    if not found or t.user_id <> v_uid or t.person_id <> p.id or t.used_at is not null or t.expires_at < now() then raise exception 'bad_token' using errcode = '42501'; end if;
    update sv_punch_tokens set used_at = now() where token = p_token;
    if exists (select 1 from sv_devices where id = t.device_id and status = 'active') then v_verified := true; v_dev := t.device_id; end if;
  end if;
  select s.id, s.name, s.radius_m,
         2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - s.lat) / 2), 2) + cos(radians(s.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - s.lng) / 2), 2)))
    into v_site, v_site_name, v_radius, v_dist
    from sv_sites s where s.master_project_id = p.master_project_id and s.active
   order by 4 limit 1;
  if v_site is null then raise exception 'no_site'; end if;
  select coalesce(max(network_max_m), 2000), coalesce(max(standard_hours), 8), coalesce(bool_or(require_device), false) into v_netmax, v_std, v_req from sv_settings where master_project_id = p.master_project_id;
  v_netmax := coalesce(v_netmax, 2000); v_std := coalesce(v_std, 8); v_req := coalesce(v_req, false);
  if v_req and not v_verified then
    v_ok := false;
    v_reason := case when exists (select 1 from sv_devices where person_id = p.id and status = 'active') then 'device_required'
                     when exists (select 1 from sv_devices where person_id = p.id and status = 'pending') then 'device_pending'
                     else 'no_device' end;
  elsif v_acc <= 150 then
    if v_dist > v_radius + least(v_acc, 50) then v_ok := false; v_reason := 'outside'; end if;
  elsif v_acc <= v_netmax then
    v_quality := 'network';
    if v_dist - v_acc > v_radius then v_ok := false; v_reason := 'outside'; end if;
  else
    v_ok := false; v_reason := 'low_accuracy';
  end if;
  if v_ok and p_kind = 'out' then
    select * into r from sv_attendance where person_id = p.id and day = v_today;
    if not found or r.check_in is null then
      select * into r from sv_attendance where person_id = p.id and day = v_today - 1 and check_in is not null and check_out is null;
      if found and v_time < time '12:00' then v_day := v_today - 1; else v_ok := false; v_reason := 'no_check_in'; end if;
    end if;
  end if;
  if v_ok and sv_day_locked(p.master_project_id, v_day) then v_ok := false; v_reason := 'locked'; end if;
  insert into sv_self_punches (master_project_id, person_id, user_id, kind, day, lat, lng, accuracy_m, site_id, distance_m, accepted, reason, device, quality, install_id, ip, device_id, verified)
  values (p.master_project_id, p.id, v_uid, p_kind, v_day, p_lat, p_lng, p_accuracy, v_site, round(v_dist::numeric, 1), v_ok, v_reason, left(coalesce(p_device, ''), 200), v_quality,
          left(coalesce(p_install, ''), 64), coalesce(sv_client_ip(), ''), v_dev, v_verified);
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
  return jsonb_build_object('accepted', v_ok, 'reason', v_reason, 'quality', v_quality, 'verified', v_verified, 'distance_m', round(v_dist::numeric), 'radius_m', v_radius, 'site', v_site_name, 'day', v_day,
    'accuracy_m', round(v_acc::numeric), 'network_max_m', v_netmax,
    'check_in', to_char(r.check_in, 'HH24:MI'), 'check_out', to_char(r.check_out, 'HH24:MI'), 'hours', r.hours, 'overtime', r.overtime);
end $$;
grant execute on function sv_punch(uuid, text, double precision, double precision, double precision, text, text, text) to authenticated;

-- the older entry point stays for clients not yet updated: no phone token, so it is refused where a phone is required
create or replace function sv_self_punch(p_person uuid, p_kind text, p_lat double precision, p_lng double precision, p_accuracy double precision, p_device text default '')
returns jsonb language sql security definer set search_path = public as $$
  select sv_punch(p_person, p_kind, p_lat, p_lng, p_accuracy, p_device, '', null);
$$;

-- the head of supervision approves or revokes a phone; approving retires the person's other active phones
create or replace function sv_decide_device(p_device uuid, p_status text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare d sv_devices%rowtype; v_retired int := 0;
begin
  if p_status not in ('active', 'revoked') then raise exception 'bad_status'; end if;
  select * into d from sv_devices where id = p_device for update;
  if not found then raise exception 'not_found'; end if;
  if not sv_is_head(d.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_status = 'active' then
    update sv_devices set status = 'revoked', decided_by = auth.uid(), decided_at = now(), decide_note = 'جایگزین با گوشی جدید'
     where person_id = d.person_id and status = 'active' and id <> d.id;
    get diagnostics v_retired = row_count;
  end if;
  update sv_devices set status = p_status, decided_by = auth.uid(), decided_at = now(), decide_note = left(coalesce(p_note, ''), 300) where id = d.id;
  return jsonb_build_object('status', p_status, 'retired', v_retired);
end $$;
grant execute on function sv_decide_device(uuid, text, text) to authenticated;

-- the phone page needs to know whether a phone is required and the state of this person's phone
create or replace function sv_my_links() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('person_id', p.id, 'project_id', p.master_project_id, 'project_name', coalesce(nullif(m.short_name, ''), m.official_name),
         'full_name', p.full_name, 'role_title', p.role_title, 'shift_start', to_char(p.shift_start, 'HH24:MI'), 'shift_end', to_char(p.shift_end, 'HH24:MI'),
         'sites', (select count(*) from sv_sites s where s.master_project_id = p.master_project_id and s.active),
         'require_device', coalesce((select require_device from sv_settings st where st.master_project_id = p.master_project_id), false),
         'device_status', coalesce((select case when bool_or(d.status = 'active') then 'active' when bool_or(d.status = 'pending') then 'pending' else 'revoked' end
                                      from sv_devices d where d.person_id = p.id), 'none')) order by m.official_name), '[]'::jsonb)
    from sv_people p join master_projects m on m.id = p.master_project_id
   where p.user_id = auth.uid() and p.active;
$$;
