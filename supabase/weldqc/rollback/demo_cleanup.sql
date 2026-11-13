-- Removes the demo QC records of the two demo projects (run by hand only). The weld register and the welding reports are
-- not touched. The demo welders added to the register (stamps 1–8, A1, B4, note «جوشکار نمونهٔ داده‌های آزمایشی») are
-- removed at the end; the film files stay in the bucket «wq-films» under the two project folders (Storage, if needed).
begin;
create temporary table _p (id uuid) on commit drop;
insert into _p values ('5aa1afc2-c569-4546-a07f-2ca4160c2e63'), ('6b25ebd9-e2f7-4385-90e7-c954a0880232');
delete from wq_opinions where project_id in (select id from _p);
delete from wq_repairs where project_id in (select id from _p);
delete from wq_evaluations where project_id in (select id from _p);
delete from wq_defects where project_id in (select id from _p);
delete from wq_marks where project_id in (select id from _p);
delete from wq_films where project_id in (select id from _p);
delete from wq_vt where project_id in (select id from _p);
delete from wq_joints where project_id in (select id from _p);
delete from wq_settings where project_id in (select id from _p);
delete from ex_welders w where w.project_id in (select id from _p) and w.note = 'جوشکار نمونهٔ داده‌های آزمایشی'
  and not exists (select 1 from ex_welder_quals q where q.welder_id = w.id);
commit;
