-- Station piping 002: the coating chain of every weld (surface preparation / blasting → field-joint coating) and the
-- stations' share of the EPC construction progress.
--   sp_welds.buried      true → the joint is buried and gets a field-joint coating; false → above ground (painted with the piping)
--   sp_welds.blast_date  surface preparation (blasting / derusting) of the joint done
--   sp_welds.coat_date   field-joint coating done; coat_type = the system (heat-shrink sleeve, tape, liquid epoxy…)
--   sp_settings.cons_share  percent of the project's construction (C) progress the stations stand for (the rest is the line)
alter table sp_welds add column if not exists buried boolean not null default true;
alter table sp_welds add column if not exists blast_date date;
alter table sp_welds add column if not exists coat_date date;
alter table sp_welds add column if not exists coat_type text not null default '';

create table if not exists sp_settings (
  master_project_id uuid primary key references master_projects (id) on delete cascade,
  cons_share numeric not null default 20 check (cons_share >= 0 and cons_share <= 100),
  in_epc boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table sp_settings enable row level security;
create policy sp_settings_sel on sp_settings for select to authenticated using (auth.uid() is not null);
create policy sp_settings_ins on sp_settings for insert to authenticated with check (auth.uid() is not null);
create policy sp_settings_upd on sp_settings for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
