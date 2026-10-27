-- Statement approvers of a project (statements:approve, or finance configure; and the system admin as before) may certify /
-- finally approve statements and record their payments — they do it from «تأیید نهایی و پرداخت» in the statements module.
-- Creating or removing a statement row in the finance register stays with the system admin.
create or replace function pst_contract_project(p_contract uuid) returns uuid language sql stable security definer set search_path to 'public' as $f$
  select master_project_id from fin_contracts where id = p_contract
$f$;
create or replace function pst_certificate_project(p_cert uuid) returns uuid language sql stable security definer set search_path to 'public' as $f$
  select c.master_project_id from fin_payment_certificates p join fin_contracts c on c.id = p.contract_id where p.id = p_cert
$f$;
create policy fin_payment_certificates_update_pst_approver on fin_payment_certificates for update to authenticated
  using (pst_can_approve(pst_contract_project(contract_id))) with check (pst_can_approve(pst_contract_project(contract_id)));
create policy fin_payments_write_pst_approver on fin_payments for all to authenticated
  using (pst_can_approve(pst_certificate_project(certificate_id))) with check (pst_can_approve(pst_certificate_project(certificate_id)));
