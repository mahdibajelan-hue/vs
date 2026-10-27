-- fin_payment_certificates computes `deductions` (tax + insurance + other) and `payable_amount` itself (generated columns),
-- so posting sends only the parts; finance's payable then equals the statement's.
create or replace function pst_post(p_stmt uuid) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare s pst_statements%rowtype; cid uuid; d jsonb;
begin
  select * into s from pst_statements where id = p_stmt;
  if s.id is null then raise exception 'not_found'; end if;
  if not pst_can_approve(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if s.status <> 'approved' then raise exception 'not_approved'; end if;
  d := s.deductions;
  insert into fin_payment_certificates (contract_id, certificate_number, certificate_date, gross_amount, retention_amount, advance_recovery_amount,
      tax_deduction, insurance_deduction, certified_amount, status, submitted_date, certificate_type, notes, created_by)
    values (s.contract_id, s.part || '-' || lpad(s.no::text, 2, '0') || ' (' || s.period_key || ')', s.period_to, round(s.this_amount),
      round(coalesce((d->>'retention')::numeric, 0)), round(coalesce((d->>'advance')::numeric, 0)), round(coalesce((d->>'tax')::numeric, 0)), round(coalesce((d->>'insurance')::numeric, 0)),
      0, 'submitted', current_date, 'work',
      'تولیدشده از ماژول «تولید صورت‌وضعیت» — بخش ' || case s.part when 'E' then 'مهندسی (E)' when 'P' then 'تأمین کالا (P)' else 'اجرا (C)' end || '، دورهٔ ' || s.period_key, auth.uid())
    returning id into cid;
  update pst_statements set status = 'posted', fin_certificate_id = cid, posted_by = auth.uid(), posted_at = now() where id = p_stmt;
  return cid;
end $f$;
