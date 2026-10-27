-- Rollback of 001_pst_core.sql (statements posted to finance stay in fin_payment_certificates)
drop function if exists pst_post(uuid), pst_delete(uuid), pst_set_status(uuid, text, text), pst_set_line(uuid, numeric, text, jsonb), pst_save(jsonb, jsonb);
drop table if exists pst_lines, pst_statements, pst_pay_sequences, pst_contract_cfg;
drop function if exists pst_can_view(uuid), pst_can_write(uuid), pst_can_approve(uuid);
delete from rasta_role_permissions where permission_id in (select id from rasta_permissions where module_key = 'statements');
delete from rasta_permissions where module_key = 'statements';
delete from rasta_modules where key = 'statements';
