-- S19 (D-6) required forms per activity + S20(b) (D-7) approval of a template's cell mapping. Both new, empty; rollback = drop (R-C, only while empty).
create table if not exists ex_required_forms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  activity_id uuid not null references ex_activities(id) on delete cascade,
  form_key text not null,
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (activity_id, form_key)
);
create index if not exists ex_required_forms_project on ex_required_forms (project_id);
alter table ex_required_forms enable row level security;
create policy ex_required_forms_sel on ex_required_forms for select to authenticated using (true);
create policy ex_required_forms_w on ex_required_forms for all to authenticated using (ex_allows(project_id, 'edit_activities') or ex_can_configure(project_id)) with check (ex_allows(project_id, 'edit_activities') or ex_can_configure(project_id));

create table if not exists ex_form_mapping_approvals (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references ex_form_templates(id) on delete cascade,
  approved_by uuid default auth.uid(),
  approved_at timestamptz not null default now(),
  note text not null default '',
  revoked_at timestamptz,
  revoked_by uuid
);
create unique index if not exists ex_form_mapping_approvals_active on ex_form_mapping_approvals (template_id) where revoked_at is null;
alter table ex_form_mapping_approvals enable row level security;
create policy ex_form_mapping_approvals_sel on ex_form_mapping_approvals for select to authenticated using (true);
create policy ex_form_mapping_approvals_ins on ex_form_mapping_approvals for insert to authenticated with check (is_admin_user() or rasta_has_permission(auth.uid(), 'execution', 'configure'));
create policy ex_form_mapping_approvals_upd on ex_form_mapping_approvals for update to authenticated using (is_admin_user() or rasta_has_permission(auth.uid(), 'execution', 'configure')) with check (is_admin_user() or rasta_has_permission(auth.uid(), 'execution', 'configure'));
