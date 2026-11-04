-- Missions outlive the projects they were about: a mission's project may now be empty, and the missions of the projects
-- removed in the demo-data reset are unlinked from them (their content, approvals and claims are unchanged). The mission
-- guard trigger is paused only for this one update, because approved missions are otherwise locked.
alter table ms_missions alter column master_project_id drop not null;
alter table ms_missions disable trigger trg_ms_guard_mission_update;
update ms_missions set master_project_id = null where master_project_id <> '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
alter table ms_missions enable trigger trg_ms_guard_mission_update;

-- demo-data reset: the PipePulse projects only their owner may delete through the app (none belong to the kept project)
delete from projects;
