-- حضور و غیاب دستگاه نظارت — entry integrity without a time clock (applied 1405/08/01, statement by statement).
-- 1) server timestamps: created_at / updated_at / *_by are set by a trigger from now() and auth.uid(), never from the browser;
-- 2) entry window: a day can be written freely until today − entry_grace_days; after that a written reason (late_reason,
--    ≥ 5 chars) is required, enforced in the write policies; future days accept only rest / mission (planning);
-- 3) sv_entry_log: every insert / update / delete of attendance, vehicle days and guest meals (who, when, before, after, reason).

alter table sv_attendance add column if not exists late_reason text not null default '', add column if not exists created_at timestamptz not null default now(), add column if not exists created_by uuid default auth.uid();
alter table sv_vehicle_days add column if not exists late_reason text not null default '', add column if not exists created_at timestamptz not null default now(), add column if not exists created_by uuid default auth.uid();
alter table sv_guest_meals add column if not exists late_reason text not null default '';
alter table sv_settings add column if not exists entry_grace_days int not null default 2 check (entry_grace_days between 0 and 31);

create table if not exists sv_entry_log (
  id bigint generated always as identity primary key,
  master_project_id uuid not null references master_projects(id) on delete cascade,
  kind text not null,                 -- person | vehicle | guest
  subject_id uuid,                    -- person_id / vehicle_id / guest row id
  day date not null,
  action text not null,               -- insert | update | delete
  old_val jsonb, new_val jsonb,
  late_reason text not null default '',
  user_id uuid,
  at timestamptz not null default now()
);
create index if not exists idx_sv_entry_log on sv_entry_log (master_project_id, day);
alter table sv_entry_log enable row level security;
create policy sv_entry_log_read on sv_entry_log for select using (sv_can_read(master_project_id));   -- no write policy: only the trigger writes

create or replace function sv_stamp_log() returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text := case tg_table_name when 'sv_attendance' then 'person' when 'sv_vehicle_days' then 'vehicle' else 'guest' end;
        v_sub uuid; v_row jsonb; v_old jsonb;
begin
  -- server clock and signed-in user, never what the browser sends
  if tg_op = 'INSERT' then new.created_at := now(); new.created_by := auth.uid(); end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.created_by := old.created_by; end if;
  if tg_op <> 'DELETE' and tg_table_name <> 'sv_guest_meals' then new.updated_at := now(); new.updated_by := auth.uid(); end if;
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  if tg_op = 'UPDATE' and (v_old - 'updated_at' - 'updated_by') = (v_row - 'updated_at' - 'updated_by') then return new; end if;
  v_sub := coalesce((v_row->>'person_id')::uuid, (v_row->>'vehicle_id')::uuid, (v_row->>'id')::uuid);
  insert into sv_entry_log (master_project_id, kind, subject_id, day, action, old_val, new_val, late_reason, user_id)
  values ((v_row->>'master_project_id')::uuid, v_kind, v_sub, (v_row->>'day')::date, lower(tg_op),
          v_old - 'master_project_id' - 'id' - 'updated_at' - 'updated_by' - 'created_at' - 'created_by',
          case when tg_op = 'DELETE' then null else v_row - 'master_project_id' - 'id' - 'updated_at' - 'updated_by' - 'created_at' - 'created_by' end,
          coalesce(v_row->>'late_reason', ''), auth.uid());
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger sv_attendance_stamp before insert or update or delete on sv_attendance for each row execute function sv_stamp_log();
create trigger sv_vehicle_days_stamp before insert or update or delete on sv_vehicle_days for each row execute function sv_stamp_log();
create trigger sv_guest_meals_stamp before insert or update or delete on sv_guest_meals for each row execute function sv_stamp_log();

create or replace function sv_entry_ok(p_project uuid, p_day date, p_status text, p_reason text) returns boolean
language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone 'Asia/Tehran')::date as today,
                    coalesce((select entry_grace_days from sv_settings where master_project_id = p_project), 2) as grace)
  select case
    when p_day > t.today then coalesce(p_status in ('rest', 'mission'), false)
    when p_day >= t.today - t.grace then true
    else length(trim(coalesce(p_reason, ''))) >= 5
  end from t;
$$;
grant execute on function sv_entry_ok(uuid, date, text, text) to authenticated;

alter policy sv_attendance_write on sv_attendance
  using (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day))
  with check (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day) and sv_entry_ok(master_project_id, day, status, late_reason));
alter policy sv_vehicle_days_write on sv_vehicle_days
  using (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day))
  with check (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day) and sv_entry_ok(master_project_id, day, null, late_reason));
alter policy sv_guest_meals_write on sv_guest_meals
  using (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day))
  with check (sv_can_write(master_project_id) and not sv_day_locked(master_project_id, day) and sv_entry_ok(master_project_id, day, null, late_reason));

-- demo project only (run before the triggers): seeded rows get an on-time entry stamp (the same evening)
-- update sv_attendance set created_at = (day + time '19:00') at time zone 'Asia/Tehran', updated_at = (day + time '19:00') at time zone 'Asia/Tehran' where master_project_id = '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
-- update sv_vehicle_days set created_at = (day + time '19:05') at time zone 'Asia/Tehran', updated_at = (day + time '19:05') at time zone 'Asia/Tehran' where master_project_id = '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
-- update sv_guest_meals set created_at = (day + time '20:00') at time zone 'Asia/Tehran' where master_project_id = '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
