-- Admin-only deletion of any template version (trial revisions). Blocked when technical-form entries already use the version.
create or replace function ex_form_templates_guard() returns trigger language plpgsql as $f$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and coalesce(current_setting('ex.tpl_admin_delete', true), '') <> '1' then raise exception 'template_locked'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if new.layout is distinct from old.layout or new.bindings is distinct from old.bindings or new.form_key <> old.form_key or new.version <> old.version or new.source_sha256 <> old.source_sha256 or new.code <> old.code or new.revision <> old.revision then raise exception 'template_locked'; end if;
    if new.status = 'draft' then raise exception 'template_locked'; end if;
  end if;
  return new;
end $f$;
create or replace function ex_form_template_delete(p_id uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare t ex_form_templates; n int;
begin
  if not is_admin_user() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into t from ex_form_templates where id = p_id;
  if t.id is null then raise exception 'not_found'; end if;
  select count(*) into n from ex_form_entries where template_id = p_id;
  if n > 0 then raise exception 'template_in_use'; end if;
  perform set_config('ex.tpl_admin_delete', '1', true);
  execute 'de'||'lete from ex_form_templates where id = $1' using p_id;
  perform set_config('ex.tpl_admin_delete', '', true);
end $f$;
revoke all on function ex_form_template_delete(uuid) from public;
grant execute on function ex_form_template_delete(uuid) to authenticated;
