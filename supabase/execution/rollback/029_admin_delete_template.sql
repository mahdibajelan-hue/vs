drop function if exists ex_form_template_delete(uuid);
create or replace function ex_form_templates_guard() returns trigger language plpgsql as $f$
begin
  if tg_op = 'DELETE' then if old.status <> 'draft' then raise exception 'template_locked'; end if; return old; end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if new.layout is distinct from old.layout or new.bindings is distinct from old.bindings or new.form_key <> old.form_key or new.version <> old.version or new.source_sha256 <> old.source_sha256 or new.code <> old.code or new.revision <> old.revision then raise exception 'template_locked'; end if;
    if new.status = 'draft' then raise exception 'template_locked'; end if;
  end if;
  return new;
end $f$;
