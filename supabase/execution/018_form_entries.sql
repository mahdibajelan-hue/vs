-- data entered on forms designed inside the app (header values + table rows), printed on the frozen designed template
create table if not exists ex_form_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  template_id uuid not null references ex_form_templates(id),
  entry_date date not null default current_date,
  header jsonb not null default '{}'::jsonb,
  rows jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table ex_form_entries enable row level security;
create policy ex_form_entries_sel on ex_form_entries for select to authenticated using (true);
create policy ex_form_entries_w on ex_form_entries for all to authenticated using (ex_allows(project_id, 'record') or ex_can_configure(project_id)) with check (ex_allows(project_id, 'record') or ex_can_configure(project_id));
