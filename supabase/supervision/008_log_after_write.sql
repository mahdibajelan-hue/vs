-- حضور و غیاب دستگاه نظارت — history written after the change (applied 1405/08/01).
-- 006 logged from a BEFORE trigger, so an upsert that hit an existing row was recorded twice («ثبت» + «تغییر»).
-- Now: BEFORE trigger only stamps server time / user; AFTER trigger logs what was really written.
-- sv_stamp_log (006) is no longer used by any trigger.

create or replace function sv_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); new.created_by := auth.uid(); end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; new.created_by := old.created_by; end if;
  if tg_table_name <> 'sv_guest_meals' then new.updated_at := now(); new.updated_by := auth.uid(); end if;
  return new;
end $$;

create or replace function sv_log() returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text := case tg_table_name when 'sv_attendance' then 'person' when 'sv_vehicle_days' then 'vehicle' else 'guest' end;
        v_row jsonb; v_old jsonb; v_strip text[] := array['master_project_id', 'id', 'updated_at', 'updated_by', 'created_at', 'created_by'];
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  if tg_op = 'UPDATE' and (v_old - v_strip) = (v_row - v_strip) then return null; end if;
  insert into sv_entry_log (master_project_id, kind, subject_id, day, action, old_val, new_val, late_reason, user_id)
  values ((v_row->>'master_project_id')::uuid, v_kind, coalesce((v_row->>'person_id')::uuid, (v_row->>'vehicle_id')::uuid, (v_row->>'id')::uuid),
          (v_row->>'day')::date, lower(tg_op), v_old - v_strip, case when tg_op = 'DELETE' then null else v_row - v_strip end,
          coalesce(v_row->>'late_reason', ''), auth.uid());
  return null;
end $$;

create or replace trigger sv_attendance_stamp before insert or update on sv_attendance for each row execute function sv_stamp();
create or replace trigger sv_vehicle_days_stamp before insert or update on sv_vehicle_days for each row execute function sv_stamp();
create or replace trigger sv_guest_meals_stamp before insert or update on sv_guest_meals for each row execute function sv_stamp();
create or replace trigger sv_attendance_log after insert or update or delete on sv_attendance for each row execute function sv_log();
create or replace trigger sv_vehicle_days_log after insert or update or delete on sv_vehicle_days for each row execute function sv_log();
create or replace trigger sv_guest_meals_log after insert or update or delete on sv_guest_meals for each row execute function sv_log();
