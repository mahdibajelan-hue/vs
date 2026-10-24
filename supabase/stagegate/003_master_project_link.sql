-- Stage-Gate is the lifecycle of record: each Stage-Gate project points at its master project (one to one).
-- Stage-Gate tables keep keying on project_name; the link lets Project Radar, Scheduling and the portfolio report
-- open the right Stage-Gate project for a master project.
-- Rollback: alter table sg_projects drop column if exists master_project_id;
alter table sg_projects add column if not exists master_project_id uuid references master_projects(id) on delete set null;
create unique index if not exists sg_projects_master_project_uq on sg_projects(master_project_id) where master_project_id is not null;

-- Test data (2026-10): the Stage-Gate projects that hold gate data, linked to master projects that also have
-- lifecycle/control-tower data. Names do not match on purpose — the data is a test set; links can be changed later.
update sg_projects s set master_project_id = m.id
  from (values
    ('پروژه احداث ایستگاه رسیور گاز کیلومتر ۵۳ خط پنجم سراسری (نمونه آزمایشی)', 'PRJ-000023'),
    ('01. احداث رسیور گاز ترش خط پنجم', 'PRJ-000020'),
    ('02. ایستگاه لانچر کیلومتر ۵۹ خط پنجم سراسری', 'PRJ-000021'),
    ('03. پروژه خط انتقال 56 اینچ عجب شیر - تبریز', 'PRJ-000022'),
    ('04. پروژه خط انتقال 56 اینچ میاندوآب - عجب شیر', 'PRJ-000024'),
    ('06. خط انتقال گاز ۱۶ اینچ هفتگل- ایذه', 'PRJ-000025'),
    ('07. خط انتقال گاز ۴۲ اینچ سیریک / کوه مبارک', 'PRJ-000026'),
    ('08. خط لوله 36 اینچ تقویتی مارون - گندمکار', 'PRJ-000027'),
    ('09. خط لوله انتقال گاز 30 اینچ بندرعباس/لافت/گورزین', 'PRJ-000029'),
    ('۱۳. اکتیو مخابرات خط انتقال گاز ۴۲ اینچ میناب / سیریک / کوه مبارک', 'PRJ-000030')
  ) as v(sg_name, code)
  join master_projects m on coalesce(nullif(m.project_id_code, ''), m.project_code) = v.code
 where s.name = v.sg_name and s.master_project_id is null;
