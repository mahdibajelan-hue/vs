begin;

-- Preserve legacy certificate amounts until their ledger is edited. FX rates can vary
-- across payments, so persist the sum of their individual rial equivalents.
alter table public.fin_payment_certificates
  add column if not exists paid_ledger_fx_rial numeric;

create or replace function public.fin_lock_payment_certificate() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.certificate_id <> new.certificate_id then
    raise exception 'payment_certificate_immutable';
  end if;
  perform 1 from fin_payment_certificates
  where id = case when tg_op = 'DELETE' then old.certificate_id else new.certificate_id end
  for no key update;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function public.fin_refresh_payment_summary() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cid uuid := case when tg_op = 'DELETE' then old.certificate_id else new.certificate_id end;
  rial numeric; fx numeric; latest date;
begin
  select coalesce(sum(amount), 0), coalesce(sum(amount_fc_rial_equivalent), 0), max(payment_date)
  into rial, fx, latest from fin_payments where certificate_id = cid;

  update fin_payment_certificates c
  set paid_amount = rial, paid_ledger_fx_rial = fx,
      paid_date = case when rial + fx > 0 then latest else null end,
      status = case
        when rial + fx > 0 and rial + fx >= coalesce(c.certified_amount, c.payable_amount) - 1 then 'paid'
        when rial + fx > 0 then 'partially_paid'
        when c.status in ('paid', 'partially_paid') and c.certified_amount is not null then 'certified'
        when c.status in ('paid', 'partially_paid') then 'submitted'
        else c.status end
  where c.id = cid;
  return null;
end $$;
revoke all on function public.fin_lock_payment_certificate() from public, anon, authenticated;
revoke all on function public.fin_refresh_payment_summary() from public, anon, authenticated;
drop trigger if exists trg_fin_lock_payment_certificate on public.fin_payments;
create trigger trg_fin_lock_payment_certificate before insert or update or delete on public.fin_payments
for each row execute function public.fin_lock_payment_certificate();
drop trigger if exists trg_fin_refresh_payment_summary on public.fin_payments;
create trigger trg_fin_refresh_payment_summary after insert or update or delete on public.fin_payments
for each row execute function public.fin_refresh_payment_summary();

commit;
