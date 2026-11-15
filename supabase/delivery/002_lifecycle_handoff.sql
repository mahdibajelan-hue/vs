-- delivery 002 — propose the approved execution strategy to the Stage-Gate lifecycle (the lifecycle of record).
-- The proposal is kept on the study; Stage-Gate shows it next to its own strategy selector and a person applies it there
-- with Stage-Gate's own «اعمال به برنامه فازها» (which handles draft → proposed and baselined → revised itself).
-- Only an approved study can be handed over, and only by someone allowed to approve.

alter table ds_studies add column if not exists lifecycle_strategy text;
alter table ds_studies add column if not exists lifecycle_applied_at timestamptz;
alter table ds_studies add column if not exists lifecycle_applied_name text;

create or replace function ds_apply_to_lifecycle(p_study uuid, p_strategy text) returns text
language plpgsql security definer set search_path to 'public' as $f$
declare s ds_studies;
begin
  select * into s from ds_studies where id = p_study;
  if not found then raise exception 'ds_not_found'; end if;
  if not ds_can(s.project_id, 'approve') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if s.status <> 'approved' then raise exception 'ds_not_approved'; end if;
  if p_strategy not in ('sequential', 'overlapping', 'fast_track', 'emergency_fast_track') then raise exception 'ds_bad_strategy'; end if;
  update ds_studies set lifecycle_strategy = p_strategy, lifecycle_applied_at = now(), lifecycle_applied_name = ds_me() where id = p_study;
  return p_strategy;
end $f$;
revoke all on function ds_apply_to_lifecycle(uuid, text) from public, anon;
grant execute on function ds_apply_to_lifecycle(uuid, text) to authenticated;
