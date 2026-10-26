-- PSSR: زنجیرهٔ امضای چندنفره (پیمانکار ← مشاور ← کارفرما ← بهره‌بردار دستی) + فاز ۲: مجوز و ثبت عملیات تزریق گاز. پس از 001 اجرا شود.

-- هر مرحلهٔ امضا (seq) یک یا چند نفر دارد؛ any = امضای یکی کافی است، all = همه باید امضا کنند؛
-- is_manual = فرم دستی امضا می‌شود و اسکن آن توسط افراد همین مرحله (مثلاً مدیر پروژهٔ کارفرما) در سامانه تأیید می‌شود
alter table pssr_signers drop constraint if exists pssr_signers_master_project_id_seq_key;
alter table pssr_signers add column if not exists person_label text not null default '';
alter table pssr_signers add column if not exists step_rule text not null default 'any';
alter table pssr_signers add column if not exists is_manual boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pssr_signers_rule_chk') then
    alter table pssr_signers add constraint pssr_signers_rule_chk check (step_rule in ('any', 'all'));
  end if;
end $$;
alter table pssr_signoffs add column if not exists person_label text not null default '';
alter table pssr_signoffs add column if not exists manual_signer text not null default '';
alter table pssr_signoffs add column if not exists manual_signed_on date;
alter table pssr_signoffs add column if not exists file_url text;

-- مجوز تزریق گاز (یکی برای هر سیستم) و ثبت لحظه‌به‌لحظهٔ عملیات
create table if not exists pssr_gasin_permits (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null unique references pssr_systems (id) on delete cascade,
  ptw_no text not null default '',
  planned_at timestamptz,
  checks jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved', 'in_progress', 'completed', 'aborted')),
  approved_by text, approved_at timestamptz,
  started_at timestamptz, completed_at timestamptz,
  final_pressure numeric, notes text not null default '',
  created_by text, created_at timestamptz not null default now()
);
create table if not exists pssr_gasin_logs (
  id uuid primary key default gen_random_uuid(),
  permit_id uuid not null references pssr_gasin_permits (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('valve_open', 'valve_close', 'pressure', 'purge', 'leak_check', 'hold', 'incident', 'note')),
  pressure numeric, location text not null default '', note text not null default '',
  by_user text not null
);
create index if not exists pssr_gasin_logs_permit on pssr_gasin_logs (permit_id);

do $$ declare t text; begin
  foreach t in array array['pssr_systems', 'pssr_template_items', 'pssr_checks', 'pssr_meetings', 'pssr_punches', 'pssr_signers', 'pssr_signoffs', 'pssr_gasin_permits', 'pssr_gasin_logs'] loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_auth') then
      execute format('create policy %I on %I for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)', t || '_auth', t);
    end if;
  end loop;
end $$;

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

-- اسکن فرم‌های دستی امضاشده (خصوصی؛ با لینک موقت باز می‌شود)
insert into storage.buckets (id, name, public, file_size_limit) values ('pssr-docs', 'pssr-docs', false, 20971520) on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'pssr_docs_read') then
    create policy pssr_docs_read on storage.objects for select to authenticated using (bucket_id = 'pssr-docs');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'pssr_docs_write') then
    create policy pssr_docs_write on storage.objects for insert to authenticated with check (bucket_id = 'pssr-docs');
  end if;
end $$;
