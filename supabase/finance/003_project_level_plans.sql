-- Finance phase 3 (applied live): the baseline cash plan may be kept at project level (contract_id null) — spending not yet attributed to a contract —
-- so the plan can be completed stage by stage: project phasing first, contract-level plans once contractors propose.
alter table fin_cashflow_plans add column if not exists master_project_id uuid;
update fin_cashflow_plans p set master_project_id = c.master_project_id from fin_contracts c where c.id = p.contract_id and p.master_project_id is null;
alter table fin_cashflow_plans alter column master_project_id set not null;
alter table fin_cashflow_plans alter column contract_id drop not null;
do $d$ declare n text; begin for n in select conname from pg_constraint where conrelid='fin_cashflow_plans'::regclass and contype='u' loop execute format('alter table fin_cashflow_plans drop constraint %I', n); end loop; end $d$;
create unique index if not exists fin_cfp_unique on fin_cashflow_plans (master_project_id, coalesce(contract_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, fund, currency, jalali_year, jalali_month);
alter table fin_cashflow_plans add constraint fin_cfp_contractor_needs_contract check (kind <> 'contractor' or contract_id is not null);
create or replace function fin_save_cashflow_plan2(p_project uuid, p_contract uuid, p_kind text, p_fund text, p_currency text, p_year int, p_month int, p_amount numeric) returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if not fin_can_write(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_contract is not null and fin_contract_project(p_contract) is distinct from p_project then raise exception 'contract_not_in_project'; end if;
  if coalesce(p_amount,0) <= 0 then
    delete from fin_cashflow_plans where master_project_id = p_project and contract_id is not distinct from p_contract and kind = p_kind and fund = p_fund and currency = p_currency and jalali_year = p_year and jalali_month = p_month;
  else
    insert into fin_cashflow_plans (master_project_id, contract_id, kind, fund, currency, jalali_year, jalali_month, amount) values (p_project, p_contract, p_kind, p_fund, coalesce(nullif(p_currency,''),'ریال'), p_year, p_month, p_amount)
    on conflict (master_project_id, coalesce(contract_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, fund, currency, jalali_year, jalali_month) do update set amount = excluded.amount;
  end if;
end $f$;
