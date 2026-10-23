-- Rollback of 010. sv_people rows stay (with their attendance); only the link to the team is dropped.
drop function if exists my_supervision_notifications();
drop function if exists sv_my_menu(uuid, date, date);
drop function if exists sv_rate_meal(uuid, int, text);
drop table if exists sv_meal_ratings;
drop table if exists sv_menu;
alter table sv_settings drop column if exists cook_team;
drop trigger if exists sv_team_sync on master_project_team;
drop trigger if exists sv_team_unsync on master_project_team;
drop function if exists sv_team_sync();
drop function if exists sv_team_unsync();
alter table sv_people drop column if exists team_member_id;
-- team rows created by the backfill keep their positions; remove them by hand if not wanted:
--   delete from master_project_team where position_key in ('supervision_head', 'site_supervisor');
alter table master_project_team drop column if exists national_id, drop column if exists shift_start, drop column if exists shift_end,
  drop column if exists overtime_cap, drop column if exists start_date, drop column if exists end_date, drop column if exists card_no;
