-- Execution control — part 11: trace an activity to issues, risks, change requests and corrective actions (existing records; nothing is duplicated).
alter table ex_links drop constraint if exists ex_links_target_type_check;
alter table ex_links add constraint ex_links_target_type_check check (target_type in ('issue','risk','change','action'));

create or replace function ex_link_add(p_project uuid, p_activity uuid, p_type text, p_target uuid, p_label text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if not ex_allows(p_project, 'raise') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_type not in ('issue','risk','change','action') then raise exception 'bad_type'; end if;
  if not exists (select 1 from ex_activities where id = p_activity and project_id = p_project) then raise exception 'not_found'; end if;
  insert into ex_links (project_id, source_type, source_id, target_type, target_id, label) values (p_project, 'activity', p_activity, p_type, p_target, coalesce(p_label, ''))
  on conflict (source_type, source_id, target_type, target_id) do nothing;
end $f$;

create or replace function ex_link_remove(p_id uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare l ex_links;
begin
  select * into l from ex_links where id = p_id and source_type = 'activity';
  if l.id is null then raise exception 'not_found'; end if;
  if not ex_allows(l.project_id, 'raise') then raise exception 'not_allowed' using errcode = '42501'; end if;
  delete from ex_links where id = p_id;
end $f$;
revoke all on function ex_link_add(uuid, uuid, text, uuid, text) from public; grant execute on function ex_link_add(uuid, uuid, text, uuid, text) to authenticated;
revoke all on function ex_link_remove(uuid) from public; grant execute on function ex_link_remove(uuid) to authenticated;
