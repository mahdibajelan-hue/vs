-- مدیریت ذینفعان پروژه: شناسنامهٔ ذینفعان (قدرت، علاقه، نگرش، سطح تعامل فعلی و مطلوب)، ثبت تعاملات و پیگیری‌ها،
-- و نگرانی‌ها و انتظارات ذینفعان. همه به یک پروژه وابسته‌اند و دسترسی از دسترسی کاربر به همان پروژه پیروی می‌کند.
-- ردیف‌ها حذف نمی‌شوند: ذینفع «غیرفعال» و نگرانی «بسته» می‌شود. بازگشت: 001_stakeholders_down.sql.

-- may the current user work on this project's stakeholders? (project access, and the module not explicitly denied)
create or replace function public.sh_can_access(p uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce(rasta_user_can_access_master_project(p), false)
    and not exists (select 1 from rasta_user_module_access a where a.user_id = auth.uid() and a.module_key = 'stakeholders' and a.has_access = false)
$$;
grant execute on function public.sh_can_access(uuid) to authenticated;

create table if not exists public.sh_stakeholders (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references public.master_projects(id) on delete cascade,
  code text not null,
  name text not null,
  organization text not null default '',
  role_title text not null default '',
  category text not null default 'other' check (category in ('employer', 'consultant', 'contractor', 'subcontractor', 'supplier', 'government', 'regulator', 'local_authority', 'community', 'landowner', 'ngo', 'media', 'internal', 'other')),
  side text not null default 'external' check (side in ('internal', 'external')),
  phone text not null default '',
  email text not null default '',
  power smallint not null default 3 check (power between 1 and 5),
  interest smallint not null default 3 check (interest between 1 and 5),
  attitude text not null default 'neutral' check (attitude in ('champion', 'supporter', 'neutral', 'critic', 'blocker')),
  engagement_current text not null default 'neutral' check (engagement_current in ('unaware', 'resistant', 'neutral', 'supportive', 'leading')),
  engagement_desired text not null default 'supportive' check (engagement_desired in ('unaware', 'resistant', 'neutral', 'supportive', 'leading')),
  owner text not null default '',
  owner_email text not null default '',
  channel text not null default '',
  frequency_days integer check (frequency_days is null or frequency_days > 0),
  expectations text not null default '',
  strategy text not null default '',
  note text not null default '',
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (master_project_id, code)
);
create index if not exists sh_stakeholders_project on public.sh_stakeholders (master_project_id);

create table if not exists public.sh_engagements (
  id uuid primary key default gen_random_uuid(),
  stakeholder_id uuid not null references public.sh_stakeholders(id) on delete cascade,
  master_project_id uuid not null references public.master_projects(id) on delete cascade,
  happened_on date not null,
  kind text not null default 'meeting' check (kind in ('meeting', 'call', 'letter', 'email', 'visit', 'workshop', 'public_meeting', 'other')),
  subject text not null,
  summary text not null default '',
  attendees text not null default '',
  sentiment text not null default 'neutral' check (sentiment in ('positive', 'neutral', 'negative')),
  next_action text not null default '',
  next_due date,
  next_owner text not null default '',
  next_owner_email text not null default '',
  next_done boolean not null default false,
  next_done_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists sh_engagements_project on public.sh_engagements (master_project_id, happened_on desc);
create index if not exists sh_engagements_stakeholder on public.sh_engagements (stakeholder_id);

create table if not exists public.sh_concerns (
  id uuid primary key default gen_random_uuid(),
  stakeholder_id uuid not null references public.sh_stakeholders(id) on delete cascade,
  master_project_id uuid not null references public.master_projects(id) on delete cascade,
  raised_on date not null default current_date,
  title text not null,
  description text not null default '',
  category text not null default 'other' check (category in ('land', 'environment', 'social', 'safety', 'schedule', 'payment', 'technical', 'legal', 'permit', 'other')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  owner text not null default '',
  owner_email text not null default '',
  due_date date,
  resolution text not null default '',
  resolved_on date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sh_concerns_project on public.sh_concerns (master_project_id, status);

alter table public.sh_stakeholders enable row level security;
alter table public.sh_engagements enable row level security;
alter table public.sh_concerns enable row level security;

create policy sh_stakeholders_read on public.sh_stakeholders for select to authenticated using (sh_can_access(master_project_id));
create policy sh_stakeholders_insert on public.sh_stakeholders for insert to authenticated with check (sh_can_access(master_project_id));
create policy sh_stakeholders_update on public.sh_stakeholders for update to authenticated using (sh_can_access(master_project_id)) with check (sh_can_access(master_project_id));
create policy sh_engagements_read on public.sh_engagements for select to authenticated using (sh_can_access(master_project_id));
create policy sh_engagements_insert on public.sh_engagements for insert to authenticated with check (sh_can_access(master_project_id));
create policy sh_engagements_update on public.sh_engagements for update to authenticated using (sh_can_access(master_project_id)) with check (sh_can_access(master_project_id));
create policy sh_concerns_read on public.sh_concerns for select to authenticated using (sh_can_access(master_project_id));
create policy sh_concerns_insert on public.sh_concerns for insert to authenticated with check (sh_can_access(master_project_id));
create policy sh_concerns_update on public.sh_concerns for update to authenticated using (sh_can_access(master_project_id)) with check (sh_can_access(master_project_id));

grant select, insert, update on public.sh_stakeholders, public.sh_engagements, public.sh_concerns to authenticated;
