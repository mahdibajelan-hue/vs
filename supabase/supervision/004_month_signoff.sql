-- حضور و غیاب دستگاه نظارت — monthly sign-off (applied 1405/07/30, statement by statement through the SQL console).
-- A month goes open → prepared (تهیه‌کننده) → reviewed (بررسی‌کننده) → approved (تأیید نهایی). Each step is a signature
-- with the signer's image, name, title, note and a snapshot of the report totals. Once a month is prepared its days are
-- locked: attendance, vehicle days and guest meals of those days cannot be written until someone reopens the month.
-- Required permissions (module «supervision»): prepared = submit, reviewed = review, approved = approve.

create table if not exists sv_month_signoffs (
  master_project_id uuid not null references master_projects(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),           -- Jalali YYYY-MM
  status text not null default 'open' check (status in ('open', 'prepared', 'reviewed', 'approved')),
  from_day date not null,
  to_day date not null,
  updated_at timestamptz not null default now(),
  primary key (master_project_id, month)
);

create table if not exists sv_month_signatures (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects(id) on delete cascade,
  month text not null,
  step text not null check (step in ('prepared', 'reviewed', 'approved')),
  user_id uuid not null,
  signer_name text not null default '',
  signer_title text not null default '',
  image text not null,                                                  -- PNG/JPEG data URL
  note text not null default '',
  snapshot jsonb not null default '{}'::jsonb,                          -- report totals at signing time
  signed_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text
);
create index if not exists idx_sv_month_signatures_month on sv_month_signatures (master_project_id, month);

alter table sv_month_signoffs enable row level security;
alter table sv_month_signatures enable row level security;
-- read only; every write goes through sv_sign / sv_reopen
create policy sv_month_signoffs_read on sv_month_signoffs for select using (sv_can_read(master_project_id));
create policy sv_month_signatures_read on sv_month_signatures for select using (sv_can_read(master_project_id));

create or replace function sv_day_locked(p_project uuid, p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sv_month_signoffs s where s.master_project_id = p_project and s.status <> 'open' and p_day between s.from_day and s.to_day);
$$;

alter policy sv_attendance_write on sv_attendance
  using (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day))
  with check (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day));
alter policy sv_vehicle_days_write on sv_vehicle_days
  using (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day))
  with check (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day));
alter policy sv_guest_meals_write on sv_guest_meals
  using (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day))
  with check (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day));

create or replace function sv_sign(p_project uuid, p_month text, p_from date, p_to date, p_step text, p_image text, p_title text, p_note text, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_status text; v_need text; v_perm text; v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not sv_can_read(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_step not in ('prepared', 'reviewed', 'approved') then raise exception 'bad_step'; end if;
  if coalesce(p_image, '') !~ '^data:image/(png|jpeg);base64,' or length(p_image) > 400000 then raise exception 'bad_signature'; end if;
  v_perm := case p_step when 'prepared' then 'submit' when 'reviewed' then 'review' else 'approve' end;
  if not (is_admin_user() or rasta_has_permission(v_uid, 'supervision', v_perm)) then raise exception 'step_not_allowed' using errcode = '42501'; end if;
  select status into v_status from sv_month_signoffs where master_project_id = p_project and month = p_month for update;
  v_status := coalesce(v_status, 'open');
  v_need := case p_step when 'prepared' then 'open' when 'reviewed' then 'prepared' else 'reviewed' end;
  if v_status <> v_need then raise exception 'wrong_order:%', v_status; end if;
  -- four-eyes: one person signs one step (platform admins excepted)
  if not is_admin_user() and exists (select 1 from sv_month_signatures where master_project_id = p_project and month = p_month and revoked_at is null and user_id = v_uid) then
    raise exception 'same_signer';
  end if;
  select coalesce(nullif(full_name, ''), email, '') into v_name from profiles where id = v_uid;
  insert into sv_month_signatures (master_project_id, month, step, user_id, signer_name, signer_title, image, note, snapshot)
  values (p_project, p_month, p_step, v_uid, coalesce(v_name, ''), coalesce(p_title, ''), p_image, coalesce(p_note, ''), coalesce(p_snapshot, '{}'::jsonb));
  insert into sv_month_signoffs (master_project_id, month, status, from_day, to_day, updated_at) values (p_project, p_month, p_step, p_from, p_to, now())
  on conflict (master_project_id, month) do update set status = excluded.status, from_day = excluded.from_day, to_day = excluded.to_day, updated_at = now();
  return jsonb_build_object('status', p_step);
end $$;

-- Back to «open» for corrections: every active signature of the month is revoked (kept, with reason, for the audit trail).
create or replace function sv_reopen(p_project uuid, p_month text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  if not (is_admin_user() or (sv_can_read(p_project) and (rasta_has_permission(v_uid, 'supervision', 'review') or rasta_has_permission(v_uid, 'supervision', 'approve')
          or exists (select 1 from sv_month_signatures where master_project_id = p_project and month = p_month and revoked_at is null and user_id = v_uid)))) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update sv_month_signatures set revoked_at = now(), revoked_by = v_uid, revoke_reason = trim(p_reason)
   where master_project_id = p_project and month = p_month and revoked_at is null;
  get diagnostics n = row_count;
  update sv_month_signoffs set status = 'open', updated_at = now() where master_project_id = p_project and month = p_month;
  return jsonb_build_object('revoked', n);
end $$;

grant execute on function sv_day_locked(uuid, date), sv_sign(uuid, text, date, date, text, text, text, text, jsonb), sv_reopen(uuid, text, text) to authenticated;

-- The time-clock bridge never writes into a signed month.
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
           true, true, true, 'clock'
      from d join sv_people p on p.master_project_id = p_project and p.card_no = d.card_no and p.card_no <> ''
     where not sv_day_locked(p_project, d.day)
    on conflict (person_id, day) do update set check_in = excluded.check_in, check_out = excluded.check_out, hours = excluded.hours, overtime = excluded.overtime, updated_at = now()
     where sv_attendance.source = 'clock'
    returning 1
  ) select count(*) into n_people from up;
  with d as (
    select e.card_no, (e.at at time zone 'Asia/Tehran')::date as day, extract(epoch from max(e.at) - min(e.at)) / 3600 as h
      from sv_clock_events e
     where e.master_project_id = p_project and (e.at at time zone 'Asia/Tehran')::date between p_from and p_to
     group by 1, 2
  ), up as (
    insert into sv_vehicle_days (master_project_id, vehicle_id, day, status, hours, source)
    select p_project, v.id, d.day, 'present', round(least(24, case when d.h > 0 then d.h else v_vstd end)::numeric, 2), 'clock'
      from d join sv_vehicles v on v.master_project_id = p_project and v.card_no = d.card_no and v.card_no <> ''
     where not sv_day_locked(p_project, d.day)
    on conflict (vehicle_id, day) do update set hours = excluded.hours, updated_at = now() where sv_vehicle_days.source = 'clock'
    returning 1
  ) select count(*) into n_cars from up;
  return jsonb_build_object('people', n_people, 'vehicles', n_cars);
end $$;
