-- Speed: lists no longer load photos and signature images (loaded per person on demand); the history no longer copies those images into its rows.
alter table ex_welders add column if not exists has_photo boolean generated always as (photo <> '') stored;
create or replace function ex_register_guard() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare k text; o jsonb; n jsonb;
begin
  if tg_op = 'DELETE' then raise exception 'register_no_delete'; end if;
  if tg_op = 'INSERT' then
    insert into ex_register_history (project_id, entity, entity_id, attr, new_value, by) values (new.project_id, tg_argv[0], new.id, '*', 'created', auth.uid());
    return new;
  end if;
  if new.project_id <> old.project_id then raise exception 'register_project_locked'; end if;
  new.updated_at := now();
  o := to_jsonb(old); n := to_jsonb(new);
  for k in select jsonb_object_keys(n) loop
    if k in ('id','created_at','created_by','updated_at','has_photo') then continue; end if;
    if o->k is distinct from n->k then
      if k in ('photo','card_sign_a','card_sign_b','wqt_sign_a','wqt_sign_b') then
        insert into ex_register_history (project_id, entity, entity_id, attr, old_value, new_value, by) values (new.project_id, tg_argv[0], new.id, k, case when o->>k is null or o->>k = '' then null else '(تصویر)' end, case when n->>k is null or n->>k = '' then null else '(تصویر)' end, auth.uid());
      else
        insert into ex_register_history (project_id, entity, entity_id, attr, old_value, new_value, by) values (new.project_id, tg_argv[0], new.id, k, o->>k, n->>k, auth.uid());
      end if;
    end if;
  end loop;
  return new;
end $f$;
