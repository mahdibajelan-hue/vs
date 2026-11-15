-- Removes the simulated work reports the end-to-end flow test left on the demo project DEMO-42 (Sarakhs–Mashhad).
-- Run by hand in the SQL editor. It touches only reports of that project whose notes carry the simulation tag
-- («آزمون شبیه‌سازی جریان اجرا»); at the time of writing these are WRK-053 … WRK-072 (10 approved, 10 drafts).
-- Lines, history, versions, signatures, resources, stoppages, crew logs and links go with them (on delete cascade);
-- photos, welds, NCRs and QC findings that pointed at them only lose the reference (on delete set null).

begin;

-- check first: should list only the simulated reports
select report_no, status, report_date from ex_reports
 where project_id = '6b25ebd9-e2f7-4385-90e7-c954a0880232'
   and form_key = 'work'
   and notes like '%آزمون شبیه‌سازی جریان اجرا%'
 order by report_no;

delete from ex_reports
 where project_id = '6b25ebd9-e2f7-4385-90e7-c954a0880232'
   and form_key = 'work'
   and notes like '%آزمون شبیه‌سازی جریان اجرا%';

commit;
