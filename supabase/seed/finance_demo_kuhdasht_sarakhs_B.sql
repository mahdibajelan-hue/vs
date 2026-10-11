-- Part B: payment certificates (monthly, status spread from draft to paid), adjustment certificates and payments. Run after part A.
do $seed$
declare
  p constant uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
  u constant uuid := '244bc5e5-d9f2-4931-b417-d7eea2ffd444';
  r record; i int; n int; rk int; first_m date; d date; x numeric; cum numeric; prev numeric; st text;
  gross numeric; gfc numeric; rate numeric; adv numeric; ret numeric; tax numeric; ins numeric; pay numeric; paidr numeric; paidfc numeric;
  sub date; cert date; paid date; cid uuid; epcish boolean; pc5 uuid;
begin
  if exists (select 1 from fin_payment_certificates c join fin_contracts k on k.id = c.contract_id where k.master_project_id = p) then return; end if;
  for r in select * from fin_contracts where master_project_id = p order by contract_number loop
    first_m := case r.contract_number when 'KS-EPC-01' then date '2025-09-25' when 'KS-EPC-02' then date '2025-11-25' when 'KS-SUP-01' then date '2025-09-25' when 'KS-SUP-PIPE' then date '2025-10-25' else date '2025-11-25' end;
    n := (extract(year from age(date '2026-09-25', first_m)) * 12 + extract(month from age(date '2026-09-25', first_m)))::int + 1;
    epcish := r.contract_number in ('KS-EPC-01','KS-EPC-02','KS-SUP-PIPE');
    for i in 0 .. n - 1 loop
      rk := n - 1 - i;
      d := (first_m + (i || ' month')::interval)::date;
      x := least(1, greatest(0, (d - r.start_date)::numeric / nullif(r.planned_completion_date - r.start_date, 0)));
      cum := case when epcish then x * x * (3 - 2 * x) else x end * 0.93;
      x := least(1, greatest(0, ((d - interval '1 month')::date - r.start_date)::numeric / nullif(r.planned_completion_date - r.start_date, 0)));
      prev := case when epcish then x * x * (3 - 2 * x) else x end * 0.93;
      gross := round(r.contract_value * (cum - prev) / 1000000) * 1000000;
      gfc := case when r.contract_value_fc > 0 then round(r.contract_value_fc * (cum - prev)) else 0 end;
      rate := case when r.contract_value_fc > 0 then r.exchange_rate + 6000 * i else 0 end;
      adv := round(gross * r.advance_payment_percent / 100 / 1000000) * 1000000;
      ret := round(gross * r.retention_percent / 100 / 1000000) * 1000000;
      tax := round(gross * 0.025 / 1000000) * 1000000;
      ins := round(gross * 0.05 / 1000000) * 1000000;
      pay := gross - tax - ins - ret - adv;
      st := case when epcish then case rk when 0 then 'draft' when 1 then 'submitted' when 2 then 'under_review' when 3 then 'certified' when 4 then 'partially_paid' else 'paid' end
                 else case rk when 0 then 'submitted' when 1 then 'certified' when 2 then 'partially_paid' else 'paid' end end;
      if r.contract_number = 'KS-EPC-02' and rk = 6 then st := 'rejected'; end if;
      sub := case when st = 'draft' then null else d + 2 end;
      cert := case when st in ('certified','partially_paid','paid') then d + 12 + (i % 4) * 4 end;
      paid := case st when 'paid' then cert + 18 + (i % 5) * 8 when 'partially_paid' then cert + 40 end;
      paidr := case st when 'paid' then pay when 'partially_paid' then round(pay * 0.6 / 1000000) * 1000000 else 0 end;
      paidfc := case when r.contract_value_fc > 0 then case st when 'paid' then round(gfc * 0.775) when 'partially_paid' then round(gfc * 0.775 * 0.6) else 0 end else 0 end;
      insert into fin_payment_certificates (contract_id, certificate_number, certificate_date, gross_amount, adjustments, retention_amount, advance_recovery_amount, certified_amount, paid_amount, status, submitted_date, certified_date, paid_date, notes, certificate_type, gross_amount_fc, fc_currency, exchange_rate, paid_amount_fc, paid_exchange_rate, tax_deduction, insurance_deduction, other_deduction, certified_by, approved_by, approved_date, rate_date, created_by)
      values (r.id, 'PC-' || lpad((i + 1)::text, 2, '0'), d, gross, 0, ret, adv, case when st in ('certified','partially_paid','paid') then pay else 0 end, paidr, st, sub, cert, paid,
              case st when 'rejected' then 'مغایرت متره با صورت‌جلسه؛ بازگشت به پیمانکار' when 'under_review' then 'در انتظار تأیید متره توسط مشاور' else '' end,
              'work', gfc, 'EUR', rate, paidfc, case when rate > 0 then rate + 25000 else 0 end, tax, ins, 0,
              case when cert is not null then u end, case when cert is not null then u end, case when cert is not null then cert + 3 end, case when rate > 0 then d end, u)
      returning id into cid;
      if r.contract_number = 'KS-EPC-01' and i = 4 then pc5 := cid; end if;
      if paidr > 0 or paidfc > 0 then
        insert into fin_payments (certificate_id, payment_date, amount, amount_fc, fc_currency, exchange_rate, method, reference_number, rate_date, created_by)
        values (cid, paid, paidr, paidfc, 'EUR', case when rate > 0 then rate + 25000 else 0 end, case when i % 3 = 0 then 'اسناد خزانه' else 'واریز به حساب' end, 'RCP-' || right(r.contract_number, 2) || '-' || lpad((i + 1)::text, 2, '0'), case when rate > 0 then paid end, u);
      end if;
    end loop;
  end loop;

  -- price-adjustment certificates linked to a work certificate
  insert into fin_payment_certificates (contract_id, certificate_number, certificate_date, gross_amount, adjustments, retention_amount, advance_recovery_amount, certified_amount, paid_amount, status, submitted_date, certified_date, notes, certificate_type, related_certificate_id, adjustment_factor, certified_by, approved_by, approved_date, created_by)
  select c.id, 'PC-05-ADJ', date '2026-07-30', 38000000000, 0, 1900000000, 0, 36100000000, 0, 'certified', date '2026-08-01', date '2026-08-20', 'تعدیل نرخ مصالح و سوخت دورهٔ فروردین تا تیر', 'adjustment', pc5, 1.024, u, u, date '2026-08-23', u
  from fin_contracts c where c.master_project_id = p and c.contract_number = 'KS-EPC-01';
  insert into fin_payment_certificates (contract_id, certificate_number, certificate_date, gross_amount, adjustments, retention_amount, advance_recovery_amount, certified_amount, paid_amount, status, submitted_date, notes, certificate_type, adjustment_factor, created_by)
  select c.id, 'PC-ADJ-01', date '2026-09-10', 21000000000, 0, 1050000000, 0, 0, 0, 'submitted', date '2026-09-12', 'تعدیل بر اثر افزایش نرخ حمل', 'adjustment', 1.018, u
  from fin_contracts c where c.master_project_id = p and c.contract_number = 'KS-EPC-02';
end
$seed$;
