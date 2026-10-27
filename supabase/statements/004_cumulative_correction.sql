-- Every statement is cumulative: the month = cumulative to the end of the selected month − the cumulative APPROVED in the previous
-- statement. A reviewer may set a line's cumulative below what was approved before; that line's month becomes a negative correction.
create or replace function pst_set_line(p_line uuid, p_cum numeric, p_note text, p_totals jsonb) returns void language plpgsql security definer set search_path to 'public' as $f$
declare l pst_lines%rowtype; s pst_statements%rowtype;
begin
  select * into l from pst_lines where id = p_line;
  if l.id is null then raise exception 'not_found'; end if;
  select * into s from pst_statements where id = l.statement_id;
  if s.status = 'draft' then if not pst_can_write(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  elsif s.status = 'submitted' then if not pst_can_approve(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  else raise exception 'locked'; end if;
  if p_cum < 0 then raise exception 'negative'; end if;
  update pst_lines set cum_amount = p_cum, edited = abs(p_cum - l.sys_cum_amount) > 0.5, note = coalesce(p_note, note) where id = p_line;
  update pst_statements set cum_amount = coalesce((p_totals->>'cum_amount')::numeric, cum_amount), this_amount = coalesce((p_totals->>'this_amount')::numeric, this_amount),
    deductions = coalesce(p_totals->'deductions', deductions), payable = coalesce((p_totals->>'payable')::numeric, payable) where id = s.id;
end $f$;
