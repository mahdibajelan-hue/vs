-- Run on the isolated Sarakhs–Mashhad fixture only.
\set ON_ERROR_STOP on
begin;
insert into ex_welds (id, project_id, section_key, weld_key)
values ('ad000000-0000-4000-8000-000000000042', '7e570000-0000-4000-8000-0000000000e2', 'KP-42', 'TEST-42');
insert into ex_reports (id, project_id, form_key, report_date, front, status)
values ('ad100000-0000-4000-8000-000000000042', '7e570000-0000-4000-8000-0000000000e2', 'tie_in', '2026-11-25', 'آزمون آزادسازی', 'draft');
insert into ex_report_lines (id, report_id, line_no, qty, km_from)
values ('ad200000-0000-4000-8000-000000000042', 'ad100000-0000-4000-8000-000000000042', 1, 1, 14.25);
select set_config('ex.rpc', '1', true);
update ex_report_lines set status = 'approved' where id = 'ad200000-0000-4000-8000-000000000042';
update ex_reports set status = 'approved' where id = 'ad100000-0000-4000-8000-000000000042';
insert into ex_line_welds (line_id, weld_id, project_id)
values ('ad200000-0000-4000-8000-000000000042', 'ad000000-0000-4000-8000-000000000042', '7e570000-0000-4000-8000-0000000000e2')
on conflict (line_id) do update set weld_id = excluded.weld_id;
insert into ht_sections (id, master_project_id, seq, code, km_from, km_to, stage, failed)
values
 ('ad300000-0000-4000-8000-000000000042','7e570000-0000-4000-8000-0000000000e2',1,'TEST-WRONG',15,20,'accepted',false),
 ('ad300000-0000-4000-8000-000000000043','7e570000-0000-4000-8000-0000000000e2',2,'TEST-SAME',10,15,'accepted',true);
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000007","role":"authenticated"}';
do $$
begin
  perform wq_passport_sign('ad000000-0000-4000-8000-000000000042','supervision_head','ناظر آزمایشی');
  raise exception 'Missing NDT unexpectedly permitted release';
exception when raise_exception then
  if sqlerrm <> 'release_requires_ndt' then raise; end if;
end $$;

insert into wq_joints (weld_id, project_id, is_closed, final_status)
values ('ad000000-0000-4000-8000-000000000042', '7e570000-0000-4000-8000-0000000000e2', true, 'accept')
on conflict (weld_id) do update set is_closed = true, final_status = 'accept';
insert into wq_evaluations (id, project_id, weld_id, round, overall_status, signed_by, signed_at)
values ('ad400000-0000-4000-8000-000000000042','7e570000-0000-4000-8000-0000000000e2','ad000000-0000-4000-8000-000000000042',0,'accept',auth.uid(),now());
do $$
begin
  perform wq_passport_sign('ad000000-0000-4000-8000-000000000042','supervision_head','ناظر آزمایشی');
  raise exception 'Failed test unexpectedly permitted release';
exception when raise_exception then
  if sqlerrm <> 'release_requires_hydrotest' then raise; end if;
end $$;

update ht_sections set failed = false where code = 'TEST-SAME';
select wq_passport_sign('ad000000-0000-4000-8000-000000000042','supervision_head','ناظر آزمایشی');
do $$
begin
  if not exists (select 1 from wq_joints where weld_id = 'ad000000-0000-4000-8000-000000000042'
    and signs #>> '{supervision_head,hydro_section_id}' = 'ad300000-0000-4000-8000-000000000043'
    and signs #>> '{supervision_head,ndt_evaluation_id}' = 'ad400000-0000-4000-8000-000000000042') then
    raise exception 'Release evidence identifiers not recorded';
  end if;
end $$;

insert into fin_contracts (id, master_project_id, contract_number, title, contract_value, status)
values ('ad500000-0000-4000-8000-000000000042','7e570000-0000-4000-8000-0000000000e2','TEST-LEDGER','پایلوت مالی سرخس–مشهد',10000,'active');
insert into fin_payment_certificates (id, contract_id, certificate_number, gross_amount, certified_amount, status)
values ('ad600000-0000-4000-8000-000000000042','ad500000-0000-4000-8000-000000000042','TEST-PARTIAL',10000,10000,'certified');

insert into fin_payments (certificate_id, payment_date, amount, reference_number)
values ('ad600000-0000-4000-8000-000000000042','2026-11-24',4000,'TEST-RIAL-PARTIAL');
do $$ begin
  if not exists (select 1 from fin_payment_certificates where certificate_number = 'TEST-PARTIAL' and paid_amount = 4000
    and paid_ledger_fx_rial = 0 and status = 'partially_paid' and certified_amount - paid_amount - paid_ledger_fx_rial = 6000) then
    raise exception 'Unexpected partial payment balance'; end if;
end $$;

insert into fin_payments (certificate_id, payment_date, amount_fc, fc_currency, exchange_rate, reference_number)
values ('ad600000-0000-4000-8000-000000000042','2026-11-25',10,'EUR',600,'TEST-FX');
do $$ begin
  if not exists (select 1 from fin_payment_certificates where certificate_number = 'TEST-PARTIAL' and paid_amount = 4000
    and paid_ledger_fx_rial = 6000 and status = 'paid' and certified_amount - paid_amount - paid_ledger_fx_rial = 0) then
    raise exception 'Unexpected equivalent or final status for FX payment'; end if;
end $$;

insert into fin_payments (certificate_id, payment_date, amount_fc, fc_currency, exchange_rate, reference_number)
values ('ad600000-0000-4000-8000-000000000042','2026-11-26',-10,'EUR',600,'TEST-FX-REVERSAL');
do $$ begin
  if not exists (select 1 from fin_payment_certificates c where certificate_number = 'TEST-PARTIAL'
    and paid_amount + paid_ledger_fx_rial = (select sum(p.amount + p.amount_fc_rial_equivalent) from fin_payments p where p.certificate_id = c.id)
    and certified_amount - paid_amount - paid_ledger_fx_rial = 6000 and status = 'partially_paid') then
    raise exception 'Reversal did not restore ledger balance'; end if;
end $$;

select 'PASS: weld-specific NDT/hydrotest, partial rial payment, FX settlement, FX reversal and ledger reconciliation' as acceptance;
rollback;
