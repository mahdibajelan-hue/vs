-- execution 044 — photos of the site work: uploaded with the daily reports (or on their own), shown per project, and one
-- of them chosen as the photo of the day, of the week and of the month (used in the period reports).
-- Files: <project_id>/<uuid>.webp in the private bucket «ex-photos» (a large copy and a small one).
create table if not exists ex_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  report_id uuid references ex_reports (id) on delete set null,
  taken_on date not null default current_date,
  path text not null,
  thumb_path text not null,
  caption text not null default '',
  subject text not null default '',
  front text not null default '',
  km numeric,
  width int, height int,
  by_user uuid default auth.uid(), by_name text not null default '',
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists ex_photos_project on ex_photos (project_id, taken_on desc);
create index if not exists ex_photos_report on ex_photos (report_id);
create table if not exists ex_photo_picks (
  project_id uuid not null,
  period text not null check (period in ('day', 'week', 'month')),
  period_key text not null,
  photo_id uuid not null references ex_photos (id) on delete cascade,
  by_user uuid default auth.uid(), by_name text not null default '',
  at timestamptz not null default now(),
  primary key (project_id, period, period_key)
);
alter table ex_photos enable row level security;
alter table ex_photo_picks enable row level security;
create policy ex_photos_read on ex_photos for select to authenticated using (ex_can_view(project_id));
create policy ex_photos_add on ex_photos for insert to authenticated with check (ex_allows(project_id, 'record') or ex_allows(project_id, 'review') or ex_can_configure(project_id));
create policy ex_photos_change on ex_photos for update to authenticated using (by_user = auth.uid() or ex_can_configure(project_id)) with check (by_user = auth.uid() or ex_can_configure(project_id));
create policy ex_photo_picks_read on ex_photo_picks for select to authenticated using (ex_can_view(project_id));
create policy ex_photo_picks_add on ex_photo_picks for insert to authenticated with check (ex_allows(project_id, 'record') or ex_allows(project_id, 'review') or ex_can_configure(project_id));
create policy ex_photo_picks_change on ex_photo_picks for update to authenticated using (ex_allows(project_id, 'record') or ex_allows(project_id, 'review') or ex_can_configure(project_id)) with check (ex_allows(project_id, 'record') or ex_allows(project_id, 'review') or ex_can_configure(project_id));
revoke all on ex_photos, ex_photo_picks from anon;

insert into storage.buckets (id, name, public, file_size_limit) values ('ex-photos', 'ex-photos', false, 8388608) on conflict (id) do nothing;
create policy ex_photos_obj_read on storage.objects for select to authenticated using (bucket_id = 'ex-photos' and ex_can_view(wq_path_project(name)));
create policy ex_photos_obj_write on storage.objects for insert to authenticated with check (bucket_id = 'ex-photos' and (ex_allows(wq_path_project(name), 'record') or ex_allows(wq_path_project(name), 'review') or ex_can_configure(wq_path_project(name))));
