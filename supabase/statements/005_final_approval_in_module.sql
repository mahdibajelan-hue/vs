-- Final approval of statements moves from the finance module into the statements module: approving a submitted statement
-- (pst_set_status 'approved') certifies it in the finance register at once (status certified, certified amount = gross −
-- retention, certified/approved by and date) and marks the statement «posted». Payments are recorded from the same module.
create or replace function pst_certify_in_finance(p_stmt uuid) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare s pst_statements%rowtype; cid uuid; d jsonb;
begin
  select * into s from pst_statements where id = p_stmt;
  d := s.deductions;
  insert into fin_payment_certificates (contract_id, certificate_number, certificate_date, gross_amount, retention_amount, advance_recovery_amount,
      tax_deduction, insurance_deduction, certified_amount, certified_by, certified_date, approved_by, approved_date, status, submitted_date, certificate_type, notes, created_by)
    values (s.contract_id, s.part || '-' || lpad(s.no::text, 2, '0') || ' (' || s.period_key || ')', s.period_to, round(s.this_amount),
      round(coalesce((d->>'retention')::numeric, 0)), round(coalesce((d->>'advance')::numeric, 0)), round(coalesce((d->>'tax')::numeric, 0)), round(coalesce((d->>'insurance')::numeric, 0)),
      round(s.this_amount) - round(coalesce((d->>'retention')::numeric, 0)), auth.uid(), current_date, auth.uid(), current_date,
      'certified', coalesce(s.submitted_at::date, current_date), 'work',
      'تأیید نهایی در ماژول «تولید صورت‌وضعیت» — بخش ' || case s.part when 'E' then 'مهندسی (E)' when 'P' then 'تأمین کالا (P)' else 'اجرا (C)' end || '، دورهٔ ' || s.period_key, auth.uid())
    returning id into cid;
  update pst_statements set status = 'posted', fin_certificate_id = cid, approved_by = auth.uid(), approved_at = now(), posted_by = auth.uid(), posted_at = now() where id = p_stmt;
  return cid;
end $f$;
revoke execute on function pst_certify_in_finance(uuid) from public, anon, authenticated;

create or replace function pst_set_status(p_stmt uuid, p_status text, p_reason text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare s pst_statements%rowtype;
begin
  select * into s from pst_statements where id = p_stmt;
  if s.id is null then raise exception 'not_found'; end if;
  if p_status = 'submitted' and s.status = 'draft' then
    if not pst_can_write(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    update pst_statements set status = 'submitted', submitted_by = auth.uid(), submitted_at = now() where id = p_stmt;
  elsif p_status = 'approved' and s.status = 'submitted' then
    if not pst_can_approve(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    perform pst_certify_in_finance(p_stmt);
  elsif p_status = 'rejected' and s.status = 'submitted' then
    if not pst_can_approve(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
    update pst_statements set status = 'rejected', reject_reason = p_reason where id = p_stmt;
  elsif p_status = 'draft' and s.status in ('submitted','rejected') then
    if not pst_can_write(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    update pst_statements set status = 'draft', submitted_by = null, submitted_at = null where id = p_stmt;
  else raise exception 'bad_transition';
  end if;
end $f$;

update fin_payment_certificates c set status = 'certified', certified_amount = c.gross_amount - c.retention_amount, certified_by = s.approved_by, certified_date = s.approved_at::date, approved_by = s.approved_by, approved_date = s.approved_at::date
  from pst_statements s where s.fin_certificate_id = c.id and c.status = 'submitted';
