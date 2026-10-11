-- Part C: cash-flow plans (project baseline rial/euro, contractor plans) and annual budgets. Run after A and B.
do $seed$
declare
  p constant uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
  k int; y int; m int; tot numeric; c record; n int; k0 int; amt numeric;
begin
  if exists (select 1 from fin_cashflow_plans where master_project_id = p) then return; end if;
  select sum(power(sin(pi() * (g + 0.5) / 27), 1.4)) into tot from generate_series(0, 26) g;
  for k in 0 .. 26 loop
    y := 1404 + (3 + k) / 12; m := (3 + k) % 12 + 1;
    amt := round(3900000000000 * power(sin(pi() * (k + 0.5) / 27), 1.4) / tot / 1000000) * 1000000;
    insert into fin_cashflow_plans (master_project_id, contract_id, kind, fund, currency, jalali_year, jalali_month, amount) values (p, null, 'baseline', 'rial', 'IRR', y, m, amt);
  end loop;
  select sum(sin(pi() * (g + 0.5) / 20)) into tot from generate_series(0, 19) g;
  for k in 1 .. 20 loop
    y := 1404 + (3 + k) / 12; m := (3 + k) % 12 + 1;
    insert into fin_cashflow_plans (master_project_id, contract_id, kind, fund, currency, jalali_year, jalali_month, amount) values (p, null, 'baseline', 'fx', 'EUR', y, m, round(1400000 * sin(pi() * (k - 0.5) / 20) / tot));
  end loop;
  for c in select id, contract_number, contract_value, contract_value_fc from fin_contracts where master_project_id = p and contract_number in ('KS-EPC-01','KS-EPC-02','KS-SUP-PIPE') loop
    n := case c.contract_number when 'KS-EPC-01' then 24 when 'KS-EPC-02' then 24 else 17 end;
    k0 := case c.contract_number when 'KS-EPC-01' then 0 when 'KS-EPC-02' then 2 else 1 end;
    select sum(power(sin(pi() * (g + 0.5) / n), 1.2)) into tot from generate_series(0, n - 1) g;
    for k in 0 .. n - 1 loop
      y := 1404 + (3 + k0 + k) / 12; m := (3 + k0 + k) % 12 + 1;
      insert into fin_cashflow_plans (master_project_id, contract_id, kind, fund, currency, jalali_year, jalali_month, amount)
      values (p, c.id, 'contractor', 'rial', 'IRR', y, m, round(c.contract_value * 0.9 * power(sin(pi() * (k + 0.5) / n), 1.2) / tot / 1000000) * 1000000);
      if c.contract_value_fc > 0 then
        insert into fin_cashflow_plans (master_project_id, contract_id, kind, fund, currency, jalali_year, jalali_month, amount)
        values (p, c.id, 'contractor', 'fx', 'EUR', y, m, round(c.contract_value_fc * power(sin(pi() * (k + 0.5) / n), 1.2) / tot));
      end if;
    end loop;
  end loop;
  insert into fin_annual_budgets (master_project_id, jalali_year, budget_amount, currency, notes)
  select p, jalali_year, round(sum(amount) * 1.04 / 1000000000) * 1000000000, 'IRR', 'سقف بودجهٔ سالانه (مصوب)' from fin_cashflow_plans where master_project_id = p and kind = 'baseline' and fund = 'rial' group by jalali_year;
end
$seed$;
