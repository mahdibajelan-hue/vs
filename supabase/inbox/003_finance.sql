-- Finance work for the signed-in person. Finance writes are limited to administrators (RLS: is_admin_user()), so only they see these items:
-- payment certificates waiting for certification, claims waiting for a decision, retention releases due, guarantees about to expire
-- and certified certificates still unpaid. Merged into the inbox by the client.
create or replace function inbox_my_finance()
returns table (key text, source text, kind text, project_id uuid, project_name text, title text, sub text, due date, since timestamptz, urgent boolean, ref_id uuid, extra jsonb)
language plpgsql stable security definer set search_path = public
as $fn$
declare u uuid := auth.uid();
begin
  if u is null or not coalesce(is_admin_user(), false) then return; end if;

  return query
  select 'fin:cert:' || c.id, 'finance', 'fin_certify', k.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
    'تأیید کارکرد — صورت‌وضعیت ' || c.certificate_number || ' · ' || k.title,
    'قابل پرداخت ' || round(c.payable_amount)::text || ' ' || k.currency || ' · ' || c.certificate_date::text, null::date,
    coalesce(c.submitted_date::timestamptz, c.created_at), coalesce(current_date - c.submitted_date, 0) > 14, c.id,
    jsonb_build_object('payable', c.payable_amount, 'gross', c.gross_amount, 'currency', k.currency, 'status', c.status)
  from fin_payment_certificates c join fin_contracts k on k.id = c.contract_id left join master_projects mp on mp.id = k.master_project_id
  where c.status in ('submitted', 'under_review');

  return query
  select 'fin:claim:' || c.id, 'finance', 'fin_claim', k.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
    'تصمیم دربارهٔ کلایم ' || c.claim_number || ' — ' || c.title,
    k.title || ' · مبلغ ادعا ' || round(c.amount_claimed)::text || ' ' || c.currency, null::date,
    c.submitted_date::timestamptz, current_date - c.submitted_date > 14, c.id,
    jsonb_build_object('claimed', c.amount_claimed, 'currency', c.currency, 'status', c.status)
  from fin_claims c join fin_contracts k on k.id = c.contract_id left join master_projects mp on mp.id = k.master_project_id
  where c.status in ('submitted', 'under_review');

  return query
  select 'fin:ret:' || r.id, 'finance', 'fin_retention', k.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
    'آزادسازی حسن انجام کار — ' || k.title,
    r.release_stage || ' · ' || round(r.planned_amount)::text || ' ' || k.currency, r.planned_date,
    coalesce(r.planned_date::timestamptz, r.created_at), r.planned_date < current_date, r.id,
    jsonb_build_object('planned', r.planned_amount, 'currency', k.currency)
  from fin_retention_releases r join fin_contracts k on k.id = r.contract_id left join master_projects mp on mp.id = k.master_project_id
  where r.status = 'pending' and r.planned_date is not null and r.planned_date <= current_date + 30;

  return query
  select 'fin:grt:' || g.id, 'finance', 'fin_guarantee', k.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
    'ضمانت‌نامه در آستانهٔ انقضا — ' || g.number || ' · ' || k.title,
    round(g.amount)::text || ' ' || g.currency || ' · انقضا ' || g.expiry_date::text, g.expiry_date,
    g.expiry_date::timestamptz, g.expiry_date < current_date + 15, g.id,
    jsonb_build_object('amount', g.amount, 'currency', g.currency)
  from fin_guarantees g join fin_contracts k on k.id = g.contract_id left join master_projects mp on mp.id = k.master_project_id
  where g.status = 'active' and g.expiry_date is not null and g.expiry_date <= current_date + 60;

  return query
  select 'fin:pay:' || c.id, 'finance', 'fin_pay', k.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
    'پرداخت‌نشده — صورت‌وضعیت ' || c.certificate_number || ' · ' || k.title,
    'تأییدشده ' || round(coalesce(c.certified_amount, 0))::text || ' ' || k.currency || ' · پرداخت‌شده ' || round(c.paid_amount)::text, null::date,
    coalesce(c.certified_date::timestamptz, c.created_at), current_date - c.certified_date > 30, c.id,
    jsonb_build_object('certified', c.certified_amount, 'paid', c.paid_amount, 'currency', k.currency)
  from fin_payment_certificates c join fin_contracts k on k.id = c.contract_id left join master_projects mp on mp.id = k.master_project_id
  where c.status in ('certified', 'partially_paid') and c.certified_date is not null and current_date - c.certified_date > 30;
end $fn$;
revoke all on function inbox_my_finance() from public, anon;
grant execute on function inbox_my_finance() to authenticated;
