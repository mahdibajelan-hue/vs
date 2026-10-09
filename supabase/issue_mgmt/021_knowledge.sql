-- Issue Management v2 — knowledge base (phase 3): lessons learned captured from closed issues, published after review.
create table if not exists im_lessons (
  id uuid primary key default gen_random_uuid(),
  source_issue_id uuid references im_issues (id) on delete set null,
  project_id uuid references im_projects (id) on delete set null,
  title text not null check (length(trim(title)) > 3),
  context text not null default '',
  root_cause text not null default '',
  solution text not null default '',
  prevention text not null default '',
  category text references im_categories (key),
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references profiles (id) default auth.uid(),
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_im_lessons_status on im_lessons (status, category);
create unique index if not exists idx_im_lessons_source on im_lessons (source_issue_id) where source_issue_id is not null;

alter table im_lessons enable row level security;
drop policy if exists im_lessons_read on im_lessons;
create policy im_lessons_read on im_lessons for select using (status = 'published' and auth.uid() is not null or created_by = auth.uid() or is_admin_user() or (project_id is not null and im_can_manage(project_id)));
drop policy if exists im_lessons_insert on im_lessons;
create policy im_lessons_insert on im_lessons for insert with check (created_by = auth.uid() and status = 'draft' and (project_id is null or im_is_project_member(project_id) or is_admin_user()));
drop policy if exists im_lessons_update on im_lessons;
create policy im_lessons_update on im_lessons for update using (is_admin_user() or (project_id is not null and im_can_manage(project_id)) or (created_by = auth.uid() and status = 'draft'))
  with check (is_admin_user() or (project_id is not null and im_can_manage(project_id)) or (created_by = auth.uid() and status = 'draft'));
drop policy if exists im_lessons_delete on im_lessons;
create policy im_lessons_delete on im_lessons for delete using (is_admin_user() or (created_by = auth.uid() and status = 'draft'));

-- publishing stamps the approver (and only managers can publish)
create or replace function im_lesson_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if not (is_admin_user() or (new.project_id is not null and im_can_manage(new.project_id))) then raise exception 'only_manager_may_publish'; end if;
    new.approved_by := auth.uid(); new.approved_at := now();
  end if;
  return new;
end; $$;
-- create trigger trg_im_lesson_guard before insert or update on im_lessons for each row execute function im_lesson_guard();
