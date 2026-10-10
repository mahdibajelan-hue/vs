-- Finance & Contract Control — phase 2 (applied live): dated FX rates, cash plans (baseline / contractor, rial / fx), clearances, human-reviewed insights.
alter table fin_contracts add column if not exists rate_date date;
alter table fin_payment_certificates add column if not exists rate_date date;
alter table fin_payments add column if not exists rate_date date;
alter table fin_budgets add column if not exists rate_date date;
create table if not exists fin_cashflow_plans (id uuid primary key default gen_random_uuid(), contract_id uuid not null references fin_contracts(id) on delete cascade, kind text not null check (kind in ('baseline','contractor')), fund text not null default 'rial' check (fund in ('rial','fx')), currency text not null default 'ریال', jalali_year int not null, jalali_month smallint not null check (jalali_month between 1 and 12), amount numeric not null check (amount >= 0), created_by uuid default auth.uid(), created_at timestamptz not null default now(), unique (contract_id, kind, fund, currency, jalali_year, jalali_month));
create table if not exists fin_clearances (id uuid primary key default gen_random_uuid(), contract_id uuid not null references fin_contracts(id) on delete cascade, kind text not null check (kind in ('social_security','insurance','tax')), status text not null default 'pending' check (status in ('pending','issued','expired')), number text not null default '', issue_date date, expiry_date date, note text not null default '', created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (contract_id, kind));
create table if not exists fin_insight_reviews (insight_key text primary key, master_project_id uuid not null, decision text not null check (decision in ('accepted','dismissed')), note text not null default '', decided_by uuid default auth.uid(), decided_at timestamptz not null default now());
alter table fin_cashflow_plans enable row level security; alter table fin_clearances enable row level security; alter table fin_insight_reviews enable row level security;
create policy fin_cfp_select on fin_cashflow_plans for select to authenticated using (true);
create policy fin_clr_select on fin_clearances for select to authenticated using (true);
create policy fin_ins_select on fin_insight_reviews for select to authenticated using (true);
create or replace function fin_contract_project(p_contract uuid) returns uuid language sql stable security definer set search_path to 'public' as $f$ select master_project_id from fin_contracts where id = p_contract $f$;
create or replace function fin_save_cashflow_plan(p_contract uuid, p_kind text, p_fund text, p_currency text, p_year int, p_month int, p_amount numeric) returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if not fin_can_write(fin_contract_project(p_contract)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(p_amount,0) <= 0 then
    delete from fin_cashflow_plans where contract_id = p_contract and kind = p_kind and fund = p_fund and currency = p_currency and jalali_year = p_year and jalali_month = p_month;
  else
    insert into fin_cashflow_plans (contract_id, kind, fund, currency, jalali_year, jalali_month, amount) values (p_contract, p_kind, p_fund, coalesce(nullif(p_currency,''),'ریال'), p_year, p_month, p_amount)
    on conflict (contract_id, kind, fund, currency, jalali_year, jalali_month) do update set amount = excluded.amount;
  end if;
end $f$;
create or replace function fin_save_clearance(p_contract uuid, p_kind text, p_status text, p_number text, p_issue date, p_expiry date, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if not fin_can_write(fin_contract_project(p_contract)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  insert into fin_clearances (contract_id, kind, status, number, issue_date, expiry_date, note) values (p_contract, p_kind, p_status, coalesce(p_number,''), p_issue, p_expiry, coalesce(p_note,''))
  on conflict (contract_id, kind) do update set status = excluded.status, number = excluded.number, issue_date = excluded.issue_date, expiry_date = excluded.expiry_date, note = excluded.note, updated_at = now();
end $f$;
create or replace function fin_review_insight(p_key text, p_project uuid, p_decision text, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if not fin_can_write(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  insert into fin_insight_reviews (insight_key, master_project_id, decision, note) values (p_key, p_project, p_decision, coalesce(p_note,''))
  on conflict (insight_key) do update set decision = excluded.decision, note = excluded.note, decided_by = auth.uid(), decided_at = now();
end $f$;
create trigger trg_fin_audit after insert or update or delete on fin_cashflow_plans for each row execute function fin_audit_trg();
create trigger trg_fin_audit after insert or update or delete on fin_clearances for each row execute function fin_audit_trg();
