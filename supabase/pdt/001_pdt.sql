-- دوقلوی دیجیتال خط لوله — دادهٔ ماندگار هر پروژه (بدون DROP تا ابزار SQL سوپابیس بی‌پرسش اجرا کند)
-- مسیر: مشترک با ماژول تحصیل اراضی (la_routes.geometry)؛ اگر کاربر حق ویرایش آن را ندارد، در pdt_settings.geometry.

-- مشخصات لوله و تنظیمات هر پروژه
create table if not exists pdt_settings (
  master_project_id uuid primary key references master_projects (id) on delete cascade,
  diameter_in numeric not null default 48,
  wall_mm numeric not null default 19.1,
  material text not null default 'API 5L X70',
  design_pressure_bar numeric not null default 100,
  fluid text not null default 'گاز طبیعی',
  stock_length_m numeric not null default 12,
  geometry jsonb,
  geometry_name text,
  updated_by text, updated_at timestamptz not null default now()
);

-- وضعیت ساخت هر سرجوش (فقط سرجوش‌هایی که کاری رویشان ثبت شده؛ بقیه «شروع‌نشده»اند)
create table if not exists pdt_joints (
  master_project_id uuid not null references master_projects (id) on delete cascade,
  joint_no int not null,
  welding text not null default 'not_started' check (welding in ('not_started', 'welded', 'repaired', 'accepted')),
  welding_at timestamptz,
  ndt text not null default 'pending' check (ndt in ('pending', 'passed', 'failed', 'repair_required')),
  ndt_at timestamptz,
  coating text not null default 'pending' check (coating in ('pending', 'completed', 'failed')),
  coating_at timestamptz,
  lowering text not null default 'pending' check (lowering in ('pending', 'completed')),
  lowering_at timestamptz,
  backfill text not null default 'pending' check (backfill in ('pending', 'completed')),
  backfill_at timestamptz,
  welders text[] not null default '{}',
  weld_ref text not null default '',
  notes text not null default '',
  updated_by text, updated_at timestamptz not null default now(),
  primary key (master_project_id, joint_no)
);

-- تاریخچهٔ تغییرات (تکی یا گروهی برای یک بازهٔ سرجوش)
create table if not exists pdt_joint_events (
  id bigserial primary key,
  master_project_id uuid not null references master_projects (id) on delete cascade,
  joint_from int not null,
  joint_to int not null,
  field text not null,
  to_value text not null,
  note text not null default '',
  by_user text,
  at timestamptz not null default now()
);
create index if not exists pdt_joint_events_project on pdt_joint_events (master_project_id, joint_from);

-- شناسنامهٔ دارایی‌های فیزیکی روی مسیر
create table if not exists pdt_assets (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  tag text not null,
  kind text not null check (kind in ('valve', 'station', 'crossing', 'launcher', 'cp_post', 'insulating_joint', 'marker', 'other')),
  name text not null default '',
  km numeric not null,
  size text not null default '',
  make text not null default '',
  install_date date,
  condition text not null default 'good' check (condition in ('good', 'fair', 'poor', 'failed')),
  op_state text not null default 'na' check (op_state in ('open', 'closed', 'throttled', 'na')),
  criticality text not null default 'medium' check (criticality in ('high', 'medium', 'low')),
  inspect_every_days int,
  next_inspection date,
  note text not null default '',
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (master_project_id, tag)
);

-- بازرسی، تعمیر، عملیات (باز/بستن شیر) و خرابی هر دارایی
create table if not exists pdt_asset_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references pdt_assets (id) on delete cascade,
  kind text not null check (kind in ('inspection', 'maintenance', 'operation', 'failure', 'note')),
  at date not null default current_date,
  result text not null default '',
  condition text check (condition in ('good', 'fair', 'poor', 'failed')),
  op_state text check (op_state in ('open', 'closed', 'throttled', 'na')),
  note text not null default '',
  by_user text, created_at timestamptz not null default now()
);
create index if not exists pdt_asset_events_asset on pdt_asset_events (asset_id);

do $$ declare t text; begin
  foreach t in array array['pdt_settings', 'pdt_joints', 'pdt_joint_events', 'pdt_assets', 'pdt_asset_events'] loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_auth') then
      execute format('create policy %I on %I for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)', t || '_auth', t);
    end if;
  end loop;
end $$;
