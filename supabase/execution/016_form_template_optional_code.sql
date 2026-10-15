-- form code / revision are optional (the owner does not number these forms): approval no longer requires them
create or replace function ex_form_template_approve(p_id uuid, p_code text default '', p_revision text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare t ex_form_templates;
begin
  if not (is_admin_user() or rasta_has_permission(auth.uid(), 'execution', 'configure')) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into t from ex_form_templates where id = p_id;
  if t.id is null then raise exception 'not_found'; end if;
  if t.status <> 'draft' then raise exception 'not_draft'; end if;
  update ex_form_templates set code = trim(coalesce(p_code, '')), revision = trim(coalesce(p_revision, '')), status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
  update ex_form_templates set status = 'retired' where form_key = t.form_key and status = 'approved' and id <> p_id;
end $f$;
