-- Station piping & welding (ایستگاه‌ها: پایپینگ، جوشکاری و پیشرفت). Block-valve, launcher / receiver, PCS / CGS stations of a
-- line project; their scope by discipline (civil, mechanical, piping, electrical…), the daily quantities done, the drawings
-- (piping, isometric, weld map), the piping lines and every weld with its welder, NDT and position on the weld-map drawing.
-- Records are archived, never deleted (no delete policy). Files live in the private bucket «sp-drawings».
create table if not exists sp_stations (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  code text not null,
  name text not null default '',
  kind text not null default 'valve' check (kind in ('valve', 'launcher', 'receiver', 'launcher_receiver', 'pcs', 'cgs', 'other')),
  km numeric,
  twin_asset_id uuid,
  planned_start date,
  planned_finish date,
  weights jsonb,
  note text not null default '',
  archived boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (master_project_id, code)
);
create table if not exists sp_items (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  station_id uuid not null references sp_stations (id) on delete cascade,
  discipline text not null,
  code text not null default '',
  title text not null,
  unit text not null default '',
  qty numeric not null default 0,
  weight numeric not null default 1,
  planned_start date,
  planned_finish date,
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists sp_logs (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  station_id uuid not null references sp_stations (id) on delete cascade,
  item_id uuid not null references sp_items (id) on delete cascade,
  at date not null,
  qty numeric not null,
  note text not null default '',
  by_user text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists sp_drawings (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  station_id uuid not null references sp_stations (id) on delete cascade,
  kind text not null default 'piping' check (kind in ('piping', 'iso', 'weld_map', 'pid', 'civil', 'other')),
  number text not null default '',
  title text not null default '',
  rev text not null default '0',
  status text not null default 'afc' check (status in ('for_review', 'ifc', 'afc', 'as_built')),
  file_path text,
  file_name text,
  mime text,
  note text not null default '',
  archived boolean not null default false,
  by_user text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists sp_lines (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  station_id uuid not null references sp_stations (id) on delete cascade,
  line_no text not null,
  iso_no text not null default '',
  size_in numeric,
  material text not null default '',
  spec text not null default '',
  service text not null default '',
  length_m numeric,
  drawing_id uuid references sp_drawings (id),
  test_pack text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists sp_welds (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  station_id uuid not null references sp_stations (id) on delete cascade,
  line_id uuid references sp_lines (id),
  drawing_id uuid references sp_drawings (id),
  weld_no text not null,
  size_in numeric not null default 0,
  thk_mm numeric,
  joint_type text not null default 'BW' check (joint_type in ('BW', 'SW', 'FW', 'BR')),
  shop_field text not null default 'field' check (shop_field in ('shop', 'field')),
  material text not null default '',
  wps text not null default '',
  welder text not null default '',
  fitup_date date,
  weld_date date,
  ndt_method text not null default 'RT',
  ndt_date date,
  ndt_result text not null default 'pending' check (ndt_result in ('pending', 'accepted', 'rejected', 'na')),
  repairs int not null default 0,
  x numeric,
  y numeric,
  note text not null default '',
  archived boolean not null default false,
  by_user text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (station_id, weld_no)
);
create index if not exists sp_items_station on sp_items (station_id);
create index if not exists sp_logs_station on sp_logs (station_id, at);
create index if not exists sp_welds_station on sp_welds (station_id);
create index if not exists sp_drawings_station on sp_drawings (station_id);
create index if not exists sp_lines_station on sp_lines (station_id);
create index if not exists sp_stations_project on sp_stations (master_project_id);

alter table sp_stations enable row level security;
alter table sp_items enable row level security;
alter table sp_logs enable row level security;
alter table sp_drawings enable row level security;
alter table sp_lines enable row level security;
alter table sp_welds enable row level security;
create policy sp_stations_sel on sp_stations for select to authenticated using (auth.uid() is not null);
create policy sp_stations_ins on sp_stations for insert to authenticated with check (auth.uid() is not null);
create policy sp_stations_upd on sp_stations for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy sp_items_sel on sp_items for select to authenticated using (auth.uid() is not null);
create policy sp_items_ins on sp_items for insert to authenticated with check (auth.uid() is not null);
create policy sp_items_upd on sp_items for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy sp_logs_sel on sp_logs for select to authenticated using (auth.uid() is not null);
create policy sp_logs_ins on sp_logs for insert to authenticated with check (auth.uid() is not null);
create policy sp_logs_upd on sp_logs for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy sp_drawings_sel on sp_drawings for select to authenticated using (auth.uid() is not null);
create policy sp_drawings_ins on sp_drawings for insert to authenticated with check (auth.uid() is not null);
create policy sp_drawings_upd on sp_drawings for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy sp_lines_sel on sp_lines for select to authenticated using (auth.uid() is not null);
create policy sp_lines_ins on sp_lines for insert to authenticated with check (auth.uid() is not null);
create policy sp_lines_upd on sp_lines for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy sp_welds_sel on sp_welds for select to authenticated using (auth.uid() is not null);
create policy sp_welds_ins on sp_welds for insert to authenticated with check (auth.uid() is not null);
create policy sp_welds_upd on sp_welds for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- drawing files: <master_project_id>/<station_id>/<uuid>-<file name>
insert into storage.buckets (id, name, public, file_size_limit) values ('sp-drawings', 'sp-drawings', false, 31457280) on conflict (id) do nothing;
create policy sp_drawings_read on storage.objects for select to authenticated using (bucket_id = 'sp-drawings');
create policy sp_drawings_write on storage.objects for insert to authenticated with check (bucket_id = 'sp-drawings');
