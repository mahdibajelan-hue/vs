-- 048: report builder with ISO document control (audit M3).
--
-- ex_report_templates: per-project report templates (type, title, document-number prefix, default sections, header lines,
--   footer, default distribution). Data and layout stay separate: a template only says WHICH sections and HOW the page is
--   headed; every number is computed from the daily reports when the report is built.
-- ex_issued_docs: the register of formally issued reports — document number, revision, title, period, filters, the exact
--   content as issued (so a revision can always be reprinted as it was), status issued → checked → approved, who prepared /
--   checked / approved and when, revision reason, distribution. A new revision of the same report (same type, period and
--   filters) keeps the document number, takes the next revision and marks the previous one «superseded»: only one valid
--   revision exists at a time. Rows are written only through the functions below.
-- Rollback: rollback/048_rollback.sql.

create table if not exists public.ex_report_templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  report_type text not null,
  title text not null,
  doc_prefix text not null default '',
  sections jsonb not null default '[]'::jsonb,
  header jsonb not null default '{}'::jsonb,
  footer text not null default '',
  distribution text not null default '',
  is_default boolean not null default false,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ex_report_templates_project on public.ex_report_templates (project_id, report_type);

create table if not exists public.ex_issued_docs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  template_id uuid references public.ex_report_templates(id) on delete set null,
  report_type text not null,
  doc_key text not null,
  doc_no text not null,
  revision int not null,
  title text not null,
  period_from date,
  period_to date,
  filters jsonb not null default '{}'::jsonb,
  content jsonb not null,
  status text not null default 'issued' check (status in ('issued','checked','approved','superseded')),
  reason text not null default '',
  distribution text not null default '',
  prepared_by uuid default auth.uid(),
  prepared_at timestamptz not null default now(),
  checked_by uuid, checked_at timestamptz,
  approved_by uuid, approved_at timestamptz,
  superseded_by uuid,
  superseded_at timestamptz,
  unique (doc_no, revision)
);
create index if not exists idx_ex_issued_docs_project on public.ex_issued_docs (project_id, report_type, prepared_at desc);
create index if not exists idx_ex_issued_docs_key on public.ex_issued_docs (project_id, doc_key, revision desc);

alter table public.ex_report_templates enable row level security;
alter table public.ex_issued_docs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ex_report_templates' and policyname = 'tpl_read') then
    create policy tpl_read on public.ex_report_templates for select to authenticated using (ex_can_view(project_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ex_report_templates' and policyname = 'tpl_insert') then
    create policy tpl_insert on public.ex_report_templates for insert to authenticated with check (ex_can_configure(project_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ex_report_templates' and policyname = 'tpl_update') then
    create policy tpl_update on public.ex_report_templates for update to authenticated using (ex_can_configure(project_id)) with check (ex_can_configure(project_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ex_report_templates' and policyname = 'tpl_delete') then
    create policy tpl_delete on public.ex_report_templates for delete to authenticated using (ex_can_configure(project_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ex_issued_docs' and policyname = 'doc_read') then
    create policy doc_read on public.ex_issued_docs for select to authenticated using (ex_can_view(project_id));
  end if;
end $$;
grant select, insert, update, delete on public.ex_report_templates to authenticated;
grant select on public.ex_issued_docs to authenticated;

-- issue a report (or its next revision); returns the new row's id
create or replace function public.ex_doc_issue(p_project uuid, p_template uuid, p_type text, p_title text, p_from date, p_to date,
  p_filters jsonb, p_content jsonb, p_reason text default '', p_distribution text default '')
returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare k text; prev ex_issued_docs; no text; rev int; pfx text; seq int; nid uuid;
begin
  if not ex_can_register(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(btrim(p_title), '') = '' or p_content is null then raise exception 'bad_input'; end if;
  k := md5(coalesce(p_type, '') || '|' || coalesce(p_from::text, '') || '|' || coalesce(p_to::text, '') || '|' || coalesce(p_filters, '{}'::jsonb)::text);
  select * into prev from ex_issued_docs where project_id = p_project and doc_key = k order by revision desc limit 1 for update;
  if prev.id is not null then
    if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
    no := prev.doc_no; rev := prev.revision + 1;
  else
    select coalesce(nullif(btrim(t.doc_prefix), ''), nullif(btrim(mp.project_code), ''), 'PRJ') into pfx
      from master_projects mp left join ex_report_templates t on t.id = p_template where mp.id = p_project;
    pfx := coalesce(pfx, 'PRJ');
    select count(distinct doc_key) + 1 into seq from ex_issued_docs where project_id = p_project and report_type = p_type;
    no := upper(pfx) || '-EX-' || upper(left(regexp_replace(p_type, '[^a-zA-Z]', '', 'g'), 3)) || '-' || lpad(seq::text, 4, '0');
    while exists (select 1 from ex_issued_docs where doc_no = no) loop seq := seq + 1; no := upper(pfx) || '-EX-' || upper(left(regexp_replace(p_type, '[^a-zA-Z]', '', 'g'), 3)) || '-' || lpad(seq::text, 4, '0'); end loop;
    rev := 0;
  end if;
  insert into ex_issued_docs (project_id, template_id, report_type, doc_key, doc_no, revision, title, period_from, period_to, filters, content, reason, distribution)
  values (p_project, p_template, p_type, k, no, rev, btrim(p_title), p_from, p_to, coalesce(p_filters, '{}'::jsonb), p_content, coalesce(btrim(p_reason), ''), coalesce(p_distribution, ''))
  returning id into nid;
  if prev.id is not null then
    update ex_issued_docs set status = 'superseded', superseded_by = nid, superseded_at = now() where project_id = p_project and doc_key = k and id <> nid and status <> 'superseded';
  end if;
  return nid;
end $f$;

-- check / approve an issued revision: the checker and the approver are not the preparer; order issued → checked → approved
create or replace function public.ex_doc_sign(p_doc uuid, p_step text)
returns void language plpgsql security definer set search_path to 'public' as $f$
declare d ex_issued_docs;
begin
  select * into d from ex_issued_docs where id = p_doc for update;
  if d.id is null then raise exception 'not_found'; end if;
  if d.status = 'superseded' then raise exception 'superseded'; end if;
  if d.prepared_by = auth.uid() then raise exception 'own_document'; end if;
  if p_step = 'checked' then
    if d.status <> 'issued' then raise exception 'bad_state'; end if;
    if not (ex_allows(d.project_id, 'review') or ex_can_configure(d.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
    update ex_issued_docs set status = 'checked', checked_by = auth.uid(), checked_at = now() where id = p_doc;
  elsif p_step = 'approved' then
    if d.status <> 'checked' then raise exception 'bad_state'; end if;
    if d.checked_by = auth.uid() then raise exception 'same_checker'; end if;
    if not (ex_allows(d.project_id, 'approve_activity') or ex_allows(d.project_id, 'approve_baseline') or ex_can_configure(d.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
    update ex_issued_docs set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_doc;
  else raise exception 'bad_step'; end if;
end $f$;

revoke all on function public.ex_doc_issue(uuid, uuid, text, text, date, date, jsonb, jsonb, text, text) from public, anon;
revoke all on function public.ex_doc_sign(uuid, text) from public, anon;
grant execute on function public.ex_doc_issue(uuid, uuid, text, text, date, date, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.ex_doc_sign(uuid, text) to authenticated;
