-- rollback of delivery 001. Run by hand; it removes every delivery-strategy study, version and decision.
-- (if 002 was applied, run 002_rollback.sql first)
drop function if exists ds_decide(uuid, text, text, text[], text[], text[], text);
drop function if exists ds_set_narrative(uuid, jsonb);
drop function if exists ds_save_version(uuid, jsonb, jsonb, jsonb, text, text);
drop function if exists ds_save_study(uuid, uuid, text, jsonb, jsonb, jsonb);
drop function if exists ds_me();
drop function if exists ds_my_caps(uuid);
drop table if exists ds_decisions;
drop table if exists ds_versions;
drop table if exists ds_studies;
drop function if exists ds_can(uuid, text);
delete from rasta_role_permissions where permission_id in (select id from rasta_permissions where module_key = 'delivery');
delete from rasta_roles where name in ('تحلیلگر راهبرد اجرا', 'تصویب‌کنندهٔ راهبرد اجرا');
delete from rasta_permissions where module_key = 'delivery';
delete from rasta_modules where key = 'delivery';
