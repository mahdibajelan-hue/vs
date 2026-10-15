-- Technical forms & QC — phase 1: approved-sheet template library (versioned, immutable once approved) and the many-to-many link between
-- a work-report line (daily report) and a technical record (a form report). The records themselves stay in ex_reports / ex_report_lines.
create table if not exists ex_form_templates (
  id uuid primary key default gen_random_uuid(),
  form_key text not null,
  version int not null default 1,
  title text not null default '',
  code text not null default '',          -- approved form code (given by the form owner; never invented)
  revision text not null default '',      -- approved revision number
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  layout jsonb not null,                  -- frozen grid template produced from the approved Excel sheet
  bindings jsonb not null default '[]'::jsonb,
  source_file text not null default '',
  source_sha256 text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  unique (form_key, version)
);
create table if not exists ex_report_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  line_id uuid not null references ex_report_lines(id) on delete cascade,   -- the work-report line (activity of the day)
  tech_report_id uuid not null references ex_reports(id) on delete cascade, -- the technical form report
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (line_id, tech_report_id)
);
create index if not exists idx_ex_report_links_tech on ex_report_links (tech_report_id);
create index if not exists idx_ex_report_links_proj on ex_report_links (project_id);

alter table ex_form_templates enable row level security;
alter table ex_report_links enable row level security;
create policy ex_form_templates_sel on ex_form_templates for select to authenticated using (true);
create policy ex_form_templates_ins on ex_form_templates for insert to authenticated with check (status = 'draft' and (is_admin_user() or rasta_has_permission(auth.uid(), 'execution', 'configure')));
create policy ex_form_templates_upd on ex_form_templates for update to authenticated using (is_admin_user() or rasta_has_permission(auth.uid(), 'execution', 'configure')) with check (is_admin_user() or rasta_has_permission(auth.uid(), 'execution', 'configure'));
create policy ex_report_links_sel on ex_report_links for select to authenticated using (true);
create policy ex_report_links_w on ex_report_links for all to authenticated using (ex_allows(project_id, 'record') or ex_allows(project_id, 'edit_activities') or ex_can_configure(project_id)) with check (ex_allows(project_id, 'record') or ex_allows(project_id, 'edit_activities') or ex_can_configure(project_id));

-- an approved version never changes (only retirement is allowed); only drafts can be deleted
create or replace function ex_form_templates_guard() returns trigger language plpgsql as $f$
begin
  if tg_op = 'DELETE' then if old.status <> 'draft' then raise exception 'template_locked'; end if; return old; end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if new.layout is distinct from old.layout or new.bindings is distinct from old.bindings or new.form_key <> old.form_key or new.version <> old.version or new.source_sha256 <> old.source_sha256 or new.code <> old.code or new.revision <> old.revision then raise exception 'template_locked'; end if;
    if new.status = 'draft' then raise exception 'template_locked'; end if;
  end if;
  return new;
end $f$;
create trigger trg_ex_form_templates_guard before update or delete on ex_form_templates for each row execute function ex_form_templates_guard();

-- approval needs the form code and revision from the form owner (never invented); the previous approved version is retired
create or replace function ex_form_template_approve(p_id uuid, p_code text, p_revision text) returns void language plpgsql security definer set search_path to 'public' as $f$
declare t ex_form_templates;
begin
  if not (is_admin_user() or rasta_has_permission(auth.uid(), 'execution', 'configure')) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into t from ex_form_templates where id = p_id;
  if t.id is null then raise exception 'not_found'; end if;
  if t.status <> 'draft' then raise exception 'not_draft'; end if;
  if coalesce(trim(p_code), '') = '' or coalesce(trim(p_revision), '') = '' then raise exception 'code_and_revision_required'; end if;
  update ex_form_templates set code = trim(p_code), revision = trim(p_revision), status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
  update ex_form_templates set status = 'retired' where form_key = t.form_key and status = 'approved' and id <> p_id;
end $f$;
revoke all on function ex_form_template_approve(uuid, text, text) from public;
grant execute on function ex_form_template_approve(uuid, text, text) to authenticated;

alter table ex_reports add column if not exists template_id uuid;
