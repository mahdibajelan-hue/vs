-- Reusable document ↔ activity link templates: the links of one project, saved once and applied to similar (pipeline)
-- projects. Items carry keys (document number without the project number, normalised titles, the price-book item number
-- of the activity), never ids — the target project's own documents and activities are matched by those keys at apply time.
create table if not exists ex_link_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  source_project_id uuid,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  item_count int not null default 0,
  archived boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ex_link_templates enable row level security;
-- a template is organisation knowledge: every signed-in user can read and use it; its author (or an admin) maintains it
create policy ex_link_templates_sel on ex_link_templates for select to authenticated using (true);
create policy ex_link_templates_ins on ex_link_templates for insert to authenticated with check (created_by = auth.uid());
create policy ex_link_templates_upd on ex_link_templates for update to authenticated using (created_by = auth.uid() or is_admin_user()) with check (created_by = auth.uid() or is_admin_user());
