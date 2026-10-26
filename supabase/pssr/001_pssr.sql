-- ماژول PSSR — ایمنی و آمادگی پیش از راه‌اندازی (گام ۱: سیستم‌ها، چک‌لیست، جلسه، پانچ، زنجیرهٔ امضای RFSU)

-- سیستم‌ها / بخش‌های راه‌اندازی هر پروژه
create table if not exists pssr_systems (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null default 'pipeline' check (kind in ('pipeline', 'station', 'facility', 'utility')),
  km_from numeric, km_to numeric,
  target_gas_in date,
  note text not null default '',
  created_by text, created_at timestamptz not null default now(),
  unique (master_project_id, code)
);

-- قالب چک‌لیست (سراسری؛ بعداً از فرم‌های واقعی جایگزین می‌شود)
create table if not exists pssr_template_items (
  id bigserial primary key,
  kind text not null default 'all' check (kind in ('all', 'pipeline', 'station', 'facility', 'utility')),
  category text not null,
  seq int not null default 0,
  title text not null,
  mandatory boolean not null default true,
  is_active boolean not null default true
);

-- بندهای چک‌لیست هر سیستم (کپی از قالب در لحظهٔ ساخت سیستم)
create table if not exists pssr_checks (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references pssr_systems (id) on delete cascade,
  template_item_id bigint references pssr_template_items (id) on delete set null,
  category text not null, seq int not null default 0, title text not null,
  mandatory boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'ok', 'fail', 'na')),
  evidence text not null default '', file_url text,
  checked_by text, checked_at timestamptz
);

-- جلسات PSSR
create table if not exists pssr_meetings (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references pssr_systems (id) on delete cascade,
  held_on date not null,
  attendees text not null default '',
  notes text not null default '',
  created_by text, created_at timestamptz not null default now()
);

-- یافته‌ها / پانچ‌ها (A: پیش از RFSU، B: پیش از تحویل موقت، C: بهبود)
create table if not exists pssr_punches (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references pssr_systems (id) on delete cascade,
  meeting_id uuid references pssr_meetings (id) on delete set null,
  category text not null check (category in ('A', 'B', 'C')),
  title text not null,
  discipline text not null default '',
  owner text not null default '',
  due_date date,
  status text not null default 'open' check (status in ('open', 'closed', 'verified')),
  raised_by text, raised_at timestamptz not null default now(),
  close_note text not null default '', closed_by text, closed_at timestamptz,
  verified_by text, verified_at timestamptz
);

-- زنجیرهٔ امضای RFSU هر پروژه (به ترتیب seq)
create table if not exists pssr_signers (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  seq int not null,
  role_label text not null,
  signer_email text not null default '',
  unique (master_project_id, seq)
);

-- امضاهای RFSU هر سیستم
create table if not exists pssr_signoffs (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references pssr_systems (id) on delete cascade,
  seq int not null,
  role_label text not null,
  decision text not null check (decision in ('sign', 'reject')),
  comment text not null default '',
  signed_by text not null,
  signed_at timestamptz not null default now()
);

create index if not exists pssr_checks_system on pssr_checks (system_id);
create index if not exists pssr_punches_system on pssr_punches (system_id);
create index if not exists pssr_signoffs_system on pssr_signoffs (system_id);
create index if not exists pssr_systems_project on pssr_systems (master_project_id);

do $$ declare t text; begin
  foreach t in array array['pssr_systems', 'pssr_template_items', 'pssr_checks', 'pssr_meetings', 'pssr_punches', 'pssr_signers', 'pssr_signoffs'] loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_auth') then
      execute format('create policy %I on %I for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)', t || '_auth', t);
    end if;
  end loop;
end $$;

-- قالب پیش‌فرض (موقت تا فرم‌های واقعی برسد)
insert into pssr_template_items (kind, category, seq, title, mandatory)
select * from (values
  ('all', 'مدارک و طراحی', 1, 'نقشه‌های As-built و P&ID به‌روز و تأییدشده', true),
  ('all', 'مدارک و طراحی', 2, 'همهٔ تغییرات طراحی (MOC) بسته و مستند شده‌اند', true),
  ('all', 'مدارک و طراحی', 3, 'گزارش HAZOP/مطالعات ایمنی و اقدامات آن بسته شده‌اند', true),
  ('pipeline', 'تست‌ها', 10, 'تست هیدرواستاتیک با موفقیت انجام و صورت‌جلسه شده است', true),
  ('pipeline', 'تست‌ها', 11, 'خشک‌کردن و پیگرانی (Cleaning/Gauging) انجام شده است', true),
  ('all', 'تست‌ها', 12, 'گزارش‌های NDT همهٔ جوش‌ها پذیرفته شده است', true),
  ('all', 'تست‌ها', 13, 'تست و کالیبراسیون شیرها و ابزار دقیق انجام شده است', true),
  ('all', 'سامانه‌های ایمنی', 20, 'سامانهٔ قطع اضطراری (ESD) تست عملکرد شده است', true),
  ('station', 'سامانه‌های ایمنی', 21, 'سامانهٔ Fire & Gas نصب و تست شده است', true),
  ('all', 'سامانه‌های ایمنی', 22, 'شیرهای اطمینان (PSV) تنظیم و پلمب شده‌اند', true),
  ('pipeline', 'سامانه‌های ایمنی', 23, 'حفاظت کاتدی راه‌اندازی و پتانسیل‌ها ثبت شده است', true),
  ('all', 'روش‌های اجرایی', 30, 'دستورالعمل راه‌اندازی و تزریق گاز تأیید شده است', true),
  ('all', 'روش‌های اجرایی', 31, 'دستورالعمل بهره‌برداری و واکنش اضطراری ابلاغ شده است', true),
  ('all', 'آموزش و نیروی انسانی', 40, 'اپراتورها و تیم واکنش اضطراری آموزش دیده‌اند', true),
  ('all', 'HSE', 50, 'علائم ایمنی، حریم و دسترسی امدادی آماده است', true),
  ('all', 'HSE', 51, 'تجهیزات ایمنی و گازسنج‌ها در محل و کالیبره هستند', true),
  ('all', 'HSE', 52, 'مجوزهای قانونی و هماهنگی با دیسپچینگ انجام شده است', false)
) v(kind, category, seq, title, mandatory)
where not exists (select 1 from pssr_template_items);
