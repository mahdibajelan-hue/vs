-- ============================================================================
-- Issue Management v2 — core extension (additive; nothing is dropped, legacy `status` is kept).
-- ============================================================================

-- Scope of an Issue container: a normal project, or a program-/organisation-level space.
alter table im_projects add column if not exists scope_level text not null default 'project';
alter table im_projects drop constraint if exists im_projects_scope_level_check;
alter table im_projects add constraint im_projects_scope_level_check check (scope_level in ('project', 'program', 'organization'));
alter table im_projects add column if not exists master_ref_id uuid;
alter table im_projects add column if not exists short_code text not null default '';

-- Standard classification (admin-managed, org-wide).
create table if not exists im_categories (
  key text primary key,
  label_fa text not null,
  sort smallint not null default 0,
  default_severity text not null default 'medium' check (default_severity in ('low', 'medium', 'high', 'critical')),
  require_evidence boolean not null default false,
  require_root_cause boolean not null default false,
  acceptance_hint text not null default '',
  is_active boolean not null default true
);
insert into im_categories (key, label_fa, sort, default_severity, require_evidence, require_root_cause, acceptance_hint) values
  ('engineering', 'مهندسی و طراحی', 10, 'medium', true, false, 'نقشه/سند بازنگری‌شده و تأییدشده'),
  ('document_approval', 'تأیید مدارک', 20, 'medium', true, false, 'نامه یا گواهی تأیید مدرک'),
  ('procurement', 'تأمین و کالا', 30, 'high', true, true, 'سند ورود کالا یا برنامه تحویل مصوب'),
  ('contractor', 'عملکرد پیمانکار', 40, 'high', false, true, 'صورتجلسه یا مکاتبه رفع'),
  ('contract_commercial', 'قرارداد و بازرگانی', 50, 'medium', true, false, 'الحاقیه، مصوبه یا نامه رسمی'),
  ('land_right_of_way', 'آزادسازی مسیر و اراضی', 60, 'high', true, false, 'صورتجلسه تحویل زمین'),
  ('permits', 'مجوزها و استعلام‌ها', 70, 'medium', true, false, 'مجوز صادرشده'),
  ('hse', 'ایمنی، بهداشت و محیط‌زیست', 80, 'high', true, true, 'گزارش بازرسی و اقدام اصلاحی'),
  ('quality', 'کیفیت', 90, 'medium', true, true, 'گزارش بازرسی/آزمون پذیرفته‌شده'),
  ('finance', 'مالی و پرداخت', 100, 'medium', false, false, 'سند پرداخت یا تأیید مالی'),
  ('interface', 'تعامل بین‌واحدی', 110, 'medium', false, false, 'صورتجلسه توافق'),
  ('other', 'سایر', 999, 'medium', false, false, '')
on conflict (key) do nothing;

-- Configurable workflow: stages (custom statuses are just more rows) + allowed transitions.
create table if not exists im_workflow_stages (
  workflow_key text not null default 'standard',
  key text not null,
  label_fa text not null,
  sort smallint not null default 0,
  coarse_status text not null check (coarse_status in ('open', 'in_progress', 'pending_approval', 'approved', 'rejected')),
  is_terminal boolean not null default false,
  color text not null default '#8b93a7',
  is_system boolean not null default false,
  is_active boolean not null default true,
  primary key (workflow_key, key)
);
create table if not exists im_workflow_transitions (
  workflow_key text not null default 'standard',
  from_stage text not null,
  to_stage text not null,
  requires_reason boolean not null default false,
  allowed_roles text[] not null default '{admin,owner,pursuer,approver,follow_up,member}',
  primary key (workflow_key, from_stage, to_stage),
  foreign key (workflow_key, from_stage) references im_workflow_stages (workflow_key, key) on delete cascade,
  foreign key (workflow_key, to_stage) references im_workflow_stages (workflow_key, key) on delete cascade
);
insert into im_workflow_stages (workflow_key, key, label_fa, sort, coarse_status, is_terminal, color, is_system) values
  ('standard', 'registered', 'ثبت‌شده', 10, 'open', false, '#8b7cf6', true),
  ('standard', 'validated', 'اعتبارسنجی‌شده', 20, 'open', false, '#a78bfa', true),
  ('standard', 'analysis', 'در تحلیل', 30, 'open', false, '#60a5fa', true),
  ('standard', 'action_plan', 'برنامه اقدام', 40, 'open', false, '#38bdf8', true),
  ('standard', 'in_progress', 'در حال اجرا', 50, 'in_progress', false, '#f5b248', true),
  ('standard', 'resolution_review', 'درخواست تأیید رفع', 60, 'pending_approval', false, '#c8cedb', true),
  ('standard', 'effectiveness_check', 'کنترل اثربخشی', 70, 'pending_approval', false, '#2dd4bf', true),
  ('standard', 'closed', 'بسته‌شده (رفع تأییدشده)', 80, 'approved', true, '#4ade9e', true),
  ('standard', 'returned', 'برگشت برای اصلاح', 55, 'rejected', false, '#fb923c', true),
  ('standard', 'reopened', 'بازگشایی‌شده', 15, 'open', false, '#f472b6', true),
  ('standard', 'cancelled', 'ابطال‌شده', 90, 'rejected', true, '#64748b', true),
  ('standard', 'duplicate', 'تکراری', 91, 'rejected', true, '#64748b', true)
on conflict do nothing;
insert into im_workflow_transitions (workflow_key, from_stage, to_stage, requires_reason, allowed_roles) values
  ('standard', 'registered', 'validated', false, '{admin,owner,follow_up,approver}'),
  ('standard', 'registered', 'in_progress', false, '{admin,owner,pursuer,follow_up}'),
  ('standard', 'registered', 'cancelled', true, '{admin,owner,approver}'),
  ('standard', 'registered', 'duplicate', true, '{admin,owner,approver,follow_up}'),
  ('standard', 'validated', 'analysis', false, '{admin,owner,follow_up,pursuer}'),
  ('standard', 'validated', 'action_plan', false, '{admin,owner,follow_up,pursuer}'),
  ('standard', 'validated', 'in_progress', false, '{admin,owner,pursuer,follow_up}'),
  ('standard', 'validated', 'cancelled', true, '{admin,owner,approver}'),
  ('standard', 'validated', 'duplicate', true, '{admin,owner,approver,follow_up}'),
  ('standard', 'analysis', 'action_plan', false, '{admin,owner,follow_up,pursuer}'),
  ('standard', 'analysis', 'in_progress', false, '{admin,owner,follow_up,pursuer}'),
  ('standard', 'action_plan', 'in_progress', false, '{admin,owner,pursuer,follow_up}'),
  ('standard', 'in_progress', 'resolution_review', false, '{admin,owner,pursuer,follow_up}'),
  ('standard', 'in_progress', 'action_plan', false, '{admin,owner,pursuer,follow_up}'),
  ('standard', 'resolution_review', 'effectiveness_check', false, '{admin,approver}'),
  ('standard', 'resolution_review', 'closed', false, '{admin,approver}'),
  ('standard', 'resolution_review', 'returned', true, '{admin,approver}'),
  ('standard', 'effectiveness_check', 'closed', false, '{admin,approver}'),
  ('standard', 'effectiveness_check', 'returned', true, '{admin,approver}'),
  ('standard', 'returned', 'in_progress', false, '{admin,owner,pursuer,follow_up}'),
  ('standard', 'closed', 'reopened', true, '{admin,owner,approver,follow_up}'),
  ('standard', 'reopened', 'analysis', false, '{admin,owner,follow_up,pursuer}'),
  ('standard', 'reopened', 'action_plan', false, '{admin,owner,follow_up,pursuer}'),
  ('standard', 'reopened', 'in_progress', false, '{admin,owner,pursuer,follow_up}')
on conflict do nothing;

-- Service levels per severity (organisation default; response = first reaction, resolve = target closing).
create table if not exists im_sla_policies (
  severity text primary key check (severity in ('low', 'medium', 'high', 'critical')),
  respond_hours integer not null,
  resolve_days integer not null,
  review_days integer not null default 2
);
insert into im_sla_policies (severity, respond_hours, resolve_days, review_days) values
  ('critical', 4, 3, 1), ('high', 24, 7, 2), ('medium', 72, 14, 3), ('low', 120, 30, 5)
on conflict do nothing;

-- ---- im_issues: new columns --------------------------------------------------
alter table im_issues add column if not exists seq_no bigint;
alter table im_issues add column if not exists code text;
alter table im_issues add column if not exists category text references im_categories (key);
alter table im_issues add column if not exists discipline text not null default '';
alter table im_issues add column if not exists location text not null default '';
alter table im_issues add column if not exists identified_at date not null default current_date;
alter table im_issues add column if not exists severity text not null default 'medium';
alter table im_issues add column if not exists urgency text not null default 'medium';
alter table im_issues add column if not exists impact_time_days integer;
alter table im_issues add column if not exists impact_cost numeric;
alter table im_issues add column if not exists impact_quality smallint not null default 0;
alter table im_issues add column if not exists impact_safety smallint not null default 0;
alter table im_issues add column if not exists impact_contract smallint not null default 0;
alter table im_issues add column if not exists impact_objectives text not null default '';
alter table im_issues add column if not exists owner_id uuid references profiles (id);
alter table im_issues add column if not exists follow_up_id uuid references profiles (id);
alter table im_issues add column if not exists review_due_date date;
alter table im_issues add column if not exists resolve_due_date date;
alter table im_issues add column if not exists original_due_date date;
alter table im_issues add column if not exists extension_count integer not null default 0;
alter table im_issues add column if not exists authority_level text not null default 'project_team';
alter table im_issues add column if not exists workflow_key text not null default 'standard';
alter table im_issues add column if not exists stage text not null default 'registered';
alter table im_issues add column if not exists stage_changed_at timestamptz not null default now();
alter table im_issues add column if not exists root_cause_summary text not null default '';
alter table im_issues add column if not exists root_cause_confirmed boolean not null default false;
alter table im_issues add column if not exists acceptance_criteria text not null default '';
alter table im_issues add column if not exists resolution_summary text not null default '';
alter table im_issues add column if not exists resolution_requested_at timestamptz;
alter table im_issues add column if not exists resolution_verified_by uuid references profiles (id);
alter table im_issues add column if not exists resolution_verified_at timestamptz;
alter table im_issues add column if not exists effectiveness_result text not null default '';
alter table im_issues add column if not exists lessons_learned text not null default '';
alter table im_issues add column if not exists reopen_count integer not null default 0;
alter table im_issues add column if not exists last_reopened_at timestamptz;
alter table im_issues add column if not exists blocked_since timestamptz;
alter table im_issues add column if not exists blocked_kind text not null default '';
alter table im_issues add column if not exists blocked_note text not null default '';
alter table im_issues add column if not exists source_ref_type text;
alter table im_issues add column if not exists source_ref_id text;
alter table im_issues add column if not exists external_system text;
alter table im_issues add column if not exists external_id text;
alter table im_issues add column if not exists sync_status text not null default 'native';
alter table im_issues add column if not exists synced_at timestamptz;
alter table im_issues add column if not exists tags text[] not null default '{}';
alter table im_issues add column if not exists template_key text;
alter table im_issues add column if not exists corporate_issue_id uuid;

alter table im_issues drop constraint if exists im_issues_severity_check;
alter table im_issues add constraint im_issues_severity_check check (severity in ('low', 'medium', 'high', 'critical'));
alter table im_issues drop constraint if exists im_issues_urgency_check;
alter table im_issues add constraint im_issues_urgency_check check (urgency in ('low', 'medium', 'high', 'critical'));
alter table im_issues drop constraint if exists im_issues_impact_levels_check;
alter table im_issues add constraint im_issues_impact_levels_check check (impact_quality between 0 and 3 and impact_safety between 0 and 3 and impact_contract between 0 and 3);
alter table im_issues drop constraint if exists im_issues_authority_check;
alter table im_issues add constraint im_issues_authority_check check (authority_level in ('project_team', 'project_manager', 'program_manager', 'management'));
alter table im_issues drop constraint if exists im_issues_sync_status_check;
alter table im_issues add constraint im_issues_sync_status_check check (sync_status in ('native', 'synced', 'pending', 'error', 'stale'));
alter table im_issues drop constraint if exists im_issues_source_check;
alter table im_issues add constraint im_issues_source_check
  check (source in ('manual', 'lifecycle_action', 'mission_debrief', 'land_acquisition', 'risk', 'correspondence', 'meeting', 'report', 'import', 'api'));
