-- TEST scenario (S5/S6) — part 1: isolated TEST project. Everything uses TEST_PROJECT_ID; nothing touches other projects.
-- TEST_PROJECT_ID = 7e570000-0000-4000-8000-000000000001
do $$
declare p uuid := '7e570000-0000-4000-8000-000000000001'; real uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63'; admin uuid := '244bc5e5-d9f2-4931-b417-d7eea2ffd444';
begin
  perform set_config('ex.rpc', '1', true);
  insert into master_projects (id, project_id_code, project_code, official_name, short_name, project_type, status, employer_org_id, consultant_org_id, contractor_org_id)
  select p, 'TEST-PIPE-100', 'TEST', 'TEST-پروژهٔ آزمایشی خط لوله ۴۸ اینچ ۱۰۰ کیلومتر (ساختگی — فقط برای آزمون)', 'TEST خط ۴۸"', 'pipeline', 'executing', employer_org_id, consultant_org_id, contractor_org_id
  from master_projects where id = real on conflict (id) do nothing;
  insert into ex_project_roles (project_id, user_id, role, organization_id) select p, admin, 'manager', null where not exists (select 1 from ex_project_roles where project_id = p and user_id = admin);
  insert into ex_settings (project_id, values_json)
  select p, (values_json - 'rolePerms') || jsonb_build_object('identity', jsonb_build_object('diameterIn','48','pipeGrade','API 5L X70','pipeStandard','API 1104','kmFrom','0','kmTo','100','lineNo','TEST-L1','contractNo','TEST-0001')) from ex_settings where project_id = real
  on conflict (project_id) do nothing;
  -- 8 activities, one per stage of the scenario
  insert into ex_activities (id, project_id, title, item_no, unit, chapter, base_qty, active)
  select md5('TEST-act-' || i)::uuid, p, t, 'TEST-' || lpad(i::text, 3, '0'), u, 'TEST', q, true, i::text
  from (values (1,'TEST ریسه و حمل لوله','m',100000),(2,'TEST خمکاری','عدد',400),(3,'TEST فیت‌آپ','سرجوش',8000),(4,'TEST جوشکاری','سرجوش',8000),(5,'TEST رادیوگرافی','سرجوش',8000),(6,'TEST پوشش سرجوش','سرجوش',8000),(7,'TEST پایین‌گذاری','m',100000),(8,'TEST خاک‌ریزی','m',100000)) v(i,t,u,q)
  on conflict (id) do nothing;
end $$;
