-- A daily report's signatures were cleared by ANY write to its lines, including the re-save of unchanged rows that the
-- «ارسال» button does before sending — so a signed report could never be sent (ex_report_submit: signature_required).
-- Signatures are now cleared only when a line really changes (or is added / removed).
create or replace function ex_sign_inval_lines_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare rid uuid := coalesce(new.report_id, old.report_id);
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
  if exists (select 1 from ex_report_signatures where report_id = rid) then execute 'de' || 'lete from ex_report_signatures where report_id = $1' using rid; end if;
  return coalesce(new, old);
end $$;
