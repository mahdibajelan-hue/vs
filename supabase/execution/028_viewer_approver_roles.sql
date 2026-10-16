-- Settings restructure: two light module roles for people who are not signatories.
-- viewer = read only (no actions); approver = may review/approve reports.
alter table ex_project_roles drop constraint if exists ex_project_roles_role_check;
alter table ex_project_roles add constraint ex_project_roles_role_check check (role = any (array['contractor','supervision','consultant','employer','manager','site_head','planner','claims','payment','viewer','approver']));
create or replace function ex_default_perms() returns jsonb language sql immutable as $$
  select '{"contractor":["record","submit","edit_activities","edit_baseline","manage_gaps","raise","notice"],
           "site_head":["record","submit","manage_gaps","raise","notice"],
           "supervision":["review","reopen","manage_gaps","raise","assess_delay","measure"],
           "consultant":["review","manage_gaps","approve_activity","raise","assess_delay","measure"],
           "employer":["review","approve_activity","approve_baseline","manage_gaps","raise","assess_delay","measure"],
           "planner":["edit_activities","edit_baseline","manage_gaps","raise"],
           "claims":["assess_delay","notice","manage_gaps","raise"],
           "payment":["raise","measure"],
           "viewer":[],
           "approver":["review","approve_activity","approve_baseline"],
           "manager":["*"]}'::jsonb
$$;
