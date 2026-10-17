-- Engineering documents circulate only between the contractor and the supervision consultant; the employer is never the ball holder (this system tracks status, it does not carry files).
-- The consultant now decides directly (approved / approved with restrictions / back for correction); the employer may only leave comments on a document.
update ex_eng_docs set status = 'issued' where status = 'pending_approval';

create or replace function ex_doc_transition(p_doc uuid, p_to text, p_note text default '') returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare d ex_eng_docs; ok boolean := false;
begin
  select * into d from ex_eng_docs where id = p_doc;
  if d.id is null then raise exception 'not_found'; end if;
  if p_to not in ('in_preparation','issued','approved','restricted') then raise exception 'invalid_status'; end if;
  if d.status in ('required','in_preparation') and p_to in ('in_preparation','issued') then ok := ex_allows(d.project_id, 'edit_activities') or ex_can_configure(d.project_id);
  elsif d.status in ('issued','pending_approval','restricted') and p_to in ('approved','restricted','in_preparation') then ok := ex_has_role(d.project_id, array['supervision','consultant']) or ex_can_configure(d.project_id);
  end if;
  if not ok then raise exception 'not_allowed' using errcode = '42501'; end if;
  update ex_eng_docs set status = p_to,
    note = case when p_note <> '' then p_note else note end,
    restriction_note = case when p_to = 'restricted' then coalesce(nullif(p_note, ''), restriction_note) else restriction_note end
  where id = p_doc;
  return jsonb_build_object('ok', true, 'status', p_to);
end $f$;

create table if not exists ex_doc_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  doc_id uuid not null references ex_eng_docs(id) on delete cascade,
  author uuid default auth.uid(),
  author_name text not null default '',
  author_role text not null default '',
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists ex_doc_comments_doc on ex_doc_comments (doc_id, created_at);
alter table ex_doc_comments enable row level security;
drop policy if exists ex_doc_comments_sel on ex_doc_comments;
create policy ex_doc_comments_sel on ex_doc_comments for select to authenticated using (ex_can_view(project_id));

create or replace function ex_doc_comment_add(p_doc uuid, p_body text) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare d ex_eng_docs; v_id uuid; v_name text; v_role text;
begin
  select * into d from ex_eng_docs where id = p_doc;
  if d.id is null then raise exception 'not_found'; end if;
  if ex_has_role(d.project_id, array['employer']) then v_role := 'employer';
  elsif ex_has_role(d.project_id, array['supervision','consultant']) then v_role := 'consultant';
  elsif ex_can_configure(d.project_id) then v_role := 'manager';
  else raise exception 'not_allowed' using errcode = '42501'; end if;
  select coalesce(nullif(full_name, ''), email, '') into v_name from profiles where id = auth.uid();
  insert into ex_doc_comments (project_id, doc_id, author, author_name, author_role, body) values (d.project_id, p_doc, auth.uid(), coalesce(v_name, ''), v_role, btrim(p_body)) returning id into v_id;
  return v_id;
end $f$;
revoke all on function ex_doc_comment_add(uuid, text) from public; grant execute on function ex_doc_comment_add(uuid, text) to authenticated;
