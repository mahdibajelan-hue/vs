-- rollback of weldqc/001 — run by hand only (removes the QC records; the weld and welder registers are not touched)
drop policy if exists wq_films_obj_read on storage.objects;
drop policy if exists wq_films_obj_write on storage.objects;
drop function if exists wq_my_caps(uuid);
drop function if exists wq_repair(uuid, text, text, text, text, text, text);
drop function if exists wq_sign(uuid, boolean, text);
drop function if exists wq_evaluate(uuid, text, text, jsonb, numeric, text);
drop function if exists wq_ensure_joint(uuid);
drop table if exists wq_opinions;
drop table if exists wq_repairs;
drop table if exists wq_evaluations;
drop table if exists wq_defects;
drop table if exists wq_marks;
drop table if exists wq_films;
drop table if exists wq_vt;
drop table if exists wq_joints;
drop table if exists wq_settings;
drop function if exists wq_open(uuid);
drop function if exists wq_path_project(text);
drop function if exists wq_can(uuid, text);
delete from rasta_role_permissions where permission_id in (select id from rasta_permissions where module_key = 'weldqc');
delete from rasta_roles where name in ('مفسر فیلم رادیوگرافی', 'بازرس NDT', 'مهندس ناظر جوش', 'مدیر کنترل کیفیت جوش');
delete from rasta_user_permission_overrides where permission_id in (select id from rasta_permissions where module_key = 'weldqc');
delete from rasta_permissions where module_key = 'weldqc';
delete from rasta_user_module_access where module_key = 'weldqc';
delete from rasta_modules where key = 'weldqc';
-- the bucket «wq-films» and its files are removed from the Supabase dashboard (Storage) if needed
