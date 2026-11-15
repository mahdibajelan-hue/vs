-- Removes the two CAPA cases the gate test left on the demo project DEMO-42 (both already voided).
-- Run by hand. Attendees, actions and history go with them (on delete cascade).
begin;
select code, status, title from wq_capa where project_id = '6b25ebd9-e2f7-4385-90e7-c954a0880232' and title like 'آزمون % CAPA (قابل حذف)';
delete from wq_capa where project_id = '6b25ebd9-e2f7-4385-90e7-c954a0880232' and title like 'آزمون % CAPA (قابل حذف)' and status = 'void';
commit;
