-- 061 — a report signed by the contractor is final on the contractor's side.
--   · once every required contractor signature (technical office + site manager) is on a draft, nothing in it changes:
--     header, rows, manpower/machinery, crews, stoppages, and the draft cannot be deleted. Corrections go the official way:
--     send → supervision returns it → the contractor corrects (signatures are given again on the corrected version).
--   · sent / approved reports were already locked (ex_reports_guard_trg, ex_lines_guard_trg, ex_children_guard_trg);
--     approved stays locked for good (only the supervision's own RPCs — reopen / amend — act on it).
--   · history: when a correction clears earlier signatures, who had signed is written into the report's history first.
-- Only rows of reports whose form HAS required contractor slots are affected. RPCs (ex.rpc) are never blocked.
-- Rollback: rollback/061_rollback.sql (run by hand).

create or replace function ex_contractor_signed(p_report uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select exists (select 1 from ex_reports r join ex_sign_slots s on s.project_id = r.project_id and s.form_key = r.form_key
                 where r.id = p_report and s.active and s.required and s.party = 'contractor')
     and not exists (select 1 from ex_reports r join ex_sign_slots s on s.project_id = r.project_id and s.form_key = r.form_key
                 where r.id = p_report and s.active and s.required and s.party = 'contractor'
                   and not exists (select 1 from ex_report_signatures g where g.report_id = r.id and g.slot_key = s.slot_key))
$f$;

-- the report itself: content columns and deletion
create or replace function ex_signed_lock_report_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if coalesce(current_setting('ex.rpc', true), '') = '1' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from ex_report_signatures where report_id = old.id) then raise exception 'signed_locked' using errcode = '42501'; end if;
    return old;
  end if;
  if old.status in ('draft', 'incomplete') and ex_contractor_signed(old.id)
     and (new.data is distinct from old.data or new.report_date is distinct from old.report_date or new.front is distinct from old.front or new.station is distinct from old.station
          or new.contractor_org_id is distinct from old.contractor_org_id or new.notes is distinct from old.notes or new.shift is distinct from old.shift) then
    raise exception 'signed_locked' using errcode = '42501';
  end if;
  return new;
end $f$;
create or replace trigger trg_ex_signed_lock_report before update or delete on ex_reports for each row execute function ex_signed_lock_report_trg();

-- rows, manpower/machinery, crews, stoppages of a signed draft
create or replace function ex_signed_lock_child_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare v_rep uuid := case when tg_op = 'DELETE' then old.report_id else new.report_id end; v_status text;
begin
  if coalesce(current_setting('ex.rpc', true), '') = '1' then return coalesce(new, old); end if;
  select status into v_status from ex_reports where id = v_rep;
  -- a report being deleted (cascade) has no row any more: nothing to protect here
  if v_status in ('draft', 'incomplete') and ex_contractor_signed(v_rep) then raise exception 'signed_locked' using errcode = '42501'; end if;
  return coalesce(new, old);
end $f$;
create or replace trigger trg_ex_signed_lock_lines before insert or update or delete on ex_report_lines for each row execute function ex_signed_lock_child_trg();
create or replace trigger trg_ex_signed_lock_res before insert or update or delete on ex_report_resources for each row execute function ex_signed_lock_child_trg();
create or replace trigger trg_ex_signed_lock_crew before insert or update or delete on ex_crew_logs for each row execute function ex_signed_lock_child_trg();
create or replace trigger trg_ex_signed_lock_stop before insert or update or delete on ex_report_stoppages for each row execute function ex_signed_lock_child_trg();

-- a correction (returned report edited) clears the signatures given on the earlier version: keep who had signed in the history
create or replace function ex_sign_inval_lines_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare rid uuid := coalesce(new.report_id, old.report_id); who text;
begin
  if coalesce(current_setting('ex.rpc', true), '') = '1' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE'
     and new.activity_id is not distinct from old.activity_id and new.qty is not distinct from old.qty
     and new.km_from is not distinct from old.km_from and new.km_to is not distinct from old.km_to
     and new.location is not distinct from old.location and new.note is not distinct from old.note
     and new.detail is not distinct from old.detail and new.source_report_id is not distinct from old.source_report_id
     and new.line_no is not distinct from old.line_no then
    return new;
  end if;
  select string_agg(label || ': ' || user_name || ' (' || to_char(signed_at, 'YYYY-MM-DD HH24:MI') || ')', ' · ' order by signed_at) into who from ex_report_signatures where report_id = rid;
  if who is not null then
    perform ex_hist(rid, 'signatures_cleared', 'اصلاح گزارش؛ امضاهای نسخهٔ قبلی: ' || who);
    execute 'de' || 'lete from ex_report_signatures where report_id = $1' using rid;
  end if;
  return coalesce(new, old);
end $f$;

create or replace function ex_sign_inval_reports_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare who text;
begin
  if coalesce(current_setting('ex.rpc', true), '') = '1' then return new; end if;
  if new.data is not distinct from old.data and new.notes is not distinct from old.notes and new.report_date is not distinct from old.report_date and new.front is not distinct from old.front and new.station is not distinct from old.station and new.shift is not distinct from old.shift then return new; end if;
  select string_agg(label || ': ' || user_name || ' (' || to_char(signed_at, 'YYYY-MM-DD HH24:MI') || ')', ' · ' order by signed_at) into who from ex_report_signatures where report_id = new.id;
  if who is not null then
    perform ex_hist(new.id, 'signatures_cleared', 'اصلاح گزارش؛ امضاهای نسخهٔ قبلی: ' || who);
    execute 'de' || 'lete from ex_report_signatures where report_id = $1' using new.id;
  end if;
  return new;
end $f$;

-- once the contractor's signatures are complete, a signer can no longer withdraw theirs on their own (that would reopen
-- the draft for editing); only the project's manager / system admin can, and it is written into the history
create or replace function public.ex_report_unsign(p_report uuid, p_slot text) returns void language plpgsql security definer set search_path to 'public' as $function$
declare r ex_reports%rowtype; g ex_report_signatures%rowtype;
begin
  select * into r from ex_reports where id = p_report;
  if r.id is null then raise exception 'not_found'; end if;
  select * into g from ex_report_signatures where report_id = p_report and slot_key = p_slot;
  if g.id is null then return; end if;
  if not (g.user_id = auth.uid() or ex_can_configure(r.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('draft','returned','incomplete') and not ex_can_configure(r.project_id) then raise exception 'bad_state'; end if;
  if r.status in ('draft','incomplete') and ex_contractor_signed(p_report) and not ex_can_configure(r.project_id) then raise exception 'signed_locked' using errcode = '42501'; end if;
  perform ex_hist(p_report, 'unsign', g.label || ': ' || g.user_name);
  execute 'de' || 'lete from ex_report_signatures where id = $1' using g.id;
end $function$;
