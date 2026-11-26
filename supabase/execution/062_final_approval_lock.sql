-- 062 — a report approved with the head of supervision's final signature never changes again: not its status (no reopen),
-- not its rows (no amendment), not its signatures. Checked even inside the supervision's RPCs (ex.rpc), so no path changes it.
-- Reports without a supervision final slot keep the earlier behaviour (reopen / amend by the supervision).
-- Rollback: rollback/062_rollback.sql (run by hand).
create or replace function ex_final_signed(p_report uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select exists (select 1 from ex_reports r join ex_report_signatures g on g.report_id = r.id and g.slot_key = ex_final_slot(r.project_id, r.form_key) where r.id = p_report)
$f$;

create or replace function ex_final_lock_report_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' and ex_final_signed(old.id) then raise exception 'approved_final' using errcode = '42501'; end if;
    return old;
  end if;
  if old.status = 'approved' and ex_final_signed(old.id)
     and (new.status is distinct from old.status or new.data is distinct from old.data or new.report_date is distinct from old.report_date or new.front is distinct from old.front
          or new.station is distinct from old.station or new.notes is distinct from old.notes or new.shift is distinct from old.shift or new.contractor_org_id is distinct from old.contractor_org_id) then
    raise exception 'approved_final' using errcode = '42501';
  end if;
  return new;
end $f$;
create or replace trigger trg_ex_final_lock_report before update or delete on ex_reports for each row execute function ex_final_lock_report_trg();

create or replace function ex_final_lock_child_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare v_rep uuid := case when tg_op = 'DELETE' then old.report_id else new.report_id end;
begin
  if exists (select 1 from ex_reports where id = v_rep and status = 'approved') and ex_final_signed(v_rep) then raise exception 'approved_final' using errcode = '42501'; end if;
  return coalesce(new, old);
end $f$;
create or replace trigger trg_ex_final_lock_lines before insert or update or delete on ex_report_lines for each row execute function ex_final_lock_child_trg();
create or replace trigger trg_ex_final_lock_sigs before update or delete on ex_report_signatures for each row execute function ex_final_lock_child_trg();
