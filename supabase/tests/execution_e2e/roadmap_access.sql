-- Only run against the isolated synthetic project from gen_scenario.py.
begin;

insert into master_projects (id, project_id_code, project_code, official_name, short_name, project_type, status)
values ('7e570000-0000-4000-8000-0000000000e3', 'TEST-OTHER-42', 'TEST-OTHER', 'پروژه ساختگی دوم برای جداسازی دسترسی', 'آزمون دوم', 'pipeline', 'executing');

insert into rasta_user_project_scope (user_id, scope_level, project_id)
values ('c0000000-0000-4000-8000-000000000003', 'project', '7e570000-0000-4000-8000-0000000000e2');

insert into rasta_user_module_access (user_id, module_key, has_access)
select 'c0000000-0000-4000-8000-000000000003', key, true
from rasta_modules where key in ('finance', 'stagegate', 'testing')
on conflict (user_id, module_key) do update set has_access = excluded.has_access;

insert into rasta_permissions (module_key, action)
values ('testing', 'create') on conflict do nothing;
insert into rasta_user_permission_overrides (user_id, permission_id, effect)
select 'c0000000-0000-4000-8000-000000000003', id, 'allow'
from rasta_permissions where (module_key, action) in (('testing', 'create'), ('stagegate', 'edit'));

insert into fin_contracts (id, master_project_id, contract_number, title, contract_value, status)
values
 ('fc000000-0000-4000-8000-000000000051', '7e570000-0000-4000-8000-0000000000e2', 'TEST-FILE-1', 'پایلوت ۴۲ اینچ', 100, 'active'),
 ('fc000000-0000-4000-8000-000000000052', '7e570000-0000-4000-8000-0000000000e3', 'TEST-FILE-2', 'پروژه ساختگی دوم', 100, 'active');

insert into fin_payment_certificates (contract_id, certificate_number, attachment_url)
values
 ('fc000000-0000-4000-8000-000000000051', 'TEST-FILE-1', 'pilot/sarakhs.txt'),
 ('fc000000-0000-4000-8000-000000000052', 'TEST-FILE-2', 'pilot/other.txt');
insert into storage.objects (bucket_id, name) values
 ('finance-docs', 'pilot/sarakhs.txt'),
 ('finance-docs', 'pilot/other.txt'),
 ('lifecycle-evidence', '7e570000-0000-4000-8000-0000000000e2/pilot/sarakhs.txt'),
 ('lifecycle-evidence', '7e570000-0000-4000-8000-0000000000e3/pilot/other.txt');

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'lifecycle-evidence' and public is false) then
    raise exception 'Lifecycle evidence bucket is not private';
  end if;
  if has_table_privilege('authenticated', 'sg_lifecycle_audit_log', 'UPDATE')
     or has_table_privilege('authenticated', 'sg_lifecycle_audit_log', 'DELETE') then
    raise exception 'Application role can modify existing audit entries';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
begin
  if (select array_agg(name order by name) from storage.objects where bucket_id = 'finance-docs') is distinct from array['pilot/sarakhs.txt'] then
    raise exception 'Finance attachment visibility differs from project scope';
  end if;
  if (select array_agg(name order by name) from storage.objects where bucket_id = 'lifecycle-evidence') is distinct from array['7e570000-0000-4000-8000-0000000000e2/pilot/sarakhs.txt'] then
    raise exception 'Lifecycle evidence visibility differs from project scope';
  end if;
  insert into ht_forms (master_project_id, target_kind, target_id, kind)
  values ('7e570000-0000-4000-8000-0000000000e2', 'section', gen_random_uuid(), 'permit');
  begin
    insert into ht_forms (master_project_id, target_kind, target_id, kind)
    values ('7e570000-0000-4000-8000-0000000000e3', 'section', gen_random_uuid(), 'permit');
    raise exception 'Out-of-project quality record was accepted';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;

select 'PASS: project-scoped finance and lifecycle evidence; project-scoped QC writes; immutable audit grants' as acceptance;
rollback;
