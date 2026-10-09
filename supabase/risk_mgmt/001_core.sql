-- ============================================================================
-- Enterprise Risk Management v2 — core: configurable categories, richer risk identity card, immutable inherent score,
-- append-only assessments, action effectiveness. Additive & idempotent: existing rows are kept (categories are re-mapped).
-- ============================================================================
create table if not exists rm_categories (
  key text primary key,
  label_fa text not null,
  label_en text not null default '',
  parent_key text references rm_categories (key) on delete set null,
  sort smallint not null default 0,
  active boolean not null default true,
  legacy boolean not null default false
);
alter table rm_categories enable row level security;
drop policy if exists rm_cat_read on rm_categories;
create policy rm_cat_read on rm_categories for select using (auth.uid() is not null);
drop policy if exists rm_cat_admin on rm_categories;
create policy rm_cat_admin on rm_categories for all using (is_admin_user()) with check (is_admin_user());

insert into rm_categories (key, label_fa, label_en, sort) values
 ('engineering',  'مهندسی و طراحی', 'Engineering & design', 10),
 ('procurement',  'تأمین کالا و تجهیزات', 'Procurement & supply', 20),
 ('contractor',   'پیمانکاران و مدیریت قرارداد', 'Contractors & contracts', 30),
 ('schedule',     'زمان‌بندی و پیشرفت پروژه', 'Schedule & progress', 40),
 ('cost',         'هزینه، بودجه و تأمین مالی', 'Cost, budget & funding', 50),
 ('land',         'تملک، معارضین و آزادسازی مسیر', 'Land & right-of-way', 60),
 ('permits',      'مجوزها و هماهنگی‌های بین‌دستگاهی', 'Permits & inter-agency', 70),
 ('construction', 'ساخت، نصب، جوشکاری و پوشش', 'Construction, welding & coating', 80),
 ('quality',      'کنترل کیفیت و آزمون‌ها', 'Quality & testing', 90),
 ('hse',          'HSE و محیط زیست', 'HSE & environment', 100),
 ('logistics',    'لجستیک و حمل‌ونقل', 'Logistics & transport', 110),
 ('hr',           'منابع انسانی و ظرفیت واحدهای تخصصی', 'People & capacity', 120),
 ('stakeholders', 'ذی‌نفعان و تصمیمات مدیریتی', 'Stakeholders & decisions', 130),
 ('commissioning','پیش‌راه‌اندازی، راه‌اندازی و تحویل', 'Pre-commissioning & handover', 140),
 ('legal',        'ریسک‌های حقوقی، قانونی و حاکمیتی', 'Legal & governance', 150),
 ('other',        'سایر', 'Other', 999)
on conflict (key) do nothing;
insert into rm_categories (key, label_fa, parent_key, sort) values
 ('eng_design',  'طراحی تفصیلی و نقشه‌ها', 'engineering', 11), ('eng_change', 'تغییرات مهندسی', 'engineering', 12),
 ('proc_longlead','اقلام با زمان تأمین طولانی', 'procurement', 21), ('proc_supplier', 'تأمین‌کننده و واردات', 'procurement', 22),
 ('land_owner',  'معارض و مالک', 'land', 61), ('land_art9', 'ماده ۹ و ارزیابی', 'land', 62),
 ('con_weld',    'جوشکاری', 'construction', 81), ('con_coat', 'پوشش و عایق', 'construction', 82), ('con_lower', 'خوابانیدن و پرکردن', 'construction', 83),
 ('hse_env',     'محیط زیست', 'hse', 101), ('hse_safety', 'ایمنی کار', 'hse', 102),
 ('comm_hydro',  'تست هیدرواستاتیک', 'commissioning', 141), ('comm_handover', 'تحویل موقت', 'commissioning', 142)
on conflict (key) do nothing;

-- legacy 8-value list → new keys (rows kept; same key where it already existed)
alter table rm_risks drop constraint if exists rm_risks_category_check;
update rm_risks set category = 'engineering' where category = 'technical';
update rm_risks set category = 'stakeholders' where category = 'external';

-- identity card
alter table rm_risks add column if not exists cause text not null default '';
alter table rm_risks add column if not exists risk_event text not null default '';
alter table rm_risks add column if not exists consequence text not null default '';
alter table rm_risks add column if not exists source text not null default 'manual';
alter table rm_risks add column if not exists source_ref_type text;
alter table rm_risks add column if not exists source_ref_id text;
alter table rm_risks add column if not exists source_snapshot jsonb not null default '{}'::jsonb;
alter table rm_risks add column if not exists external_system text;
alter table rm_risks add column if not exists external_id text;
alter table rm_risks add column if not exists sync_status text not null default 'none';
alter table rm_risks add column if not exists synced_at timestamptz;
alter table rm_risks add column if not exists subcategory text;
alter table rm_risks add column if not exists discipline text not null default '';
alter table rm_risks add column if not exists impact_dims jsonb not null default '{}'::jsonb;      -- {time,cost,quality,hse,env,legal,objective}: 0..5
alter table rm_risks add column if not exists impact_time_days integer;
alter table rm_risks add column if not exists impact_cost numeric;
alter table rm_risks add column if not exists impact_objectives text not null default '';
alter table rm_risks add column if not exists assumptions text not null default '';
alter table rm_risks add column if not exists assessment_basis text not null default '';
alter table rm_risks add column if not exists km_from numeric;
alter table rm_risks add column if not exists km_to numeric;
alter table rm_risks add column if not exists route_segment text not null default '';
alter table rm_risks add column if not exists station text not null default '';
alter table rm_risks add column if not exists work_front text not null default '';
alter table rm_risks add column if not exists contractor text not null default '';
alter table rm_risks add column if not exists work_package text not null default '';
alter table rm_risks add column if not exists exec_stage text not null default '';
alter table rm_risks add column if not exists monitor_id uuid references profiles (id);
alter table rm_risks add column if not exists approver_id uuid references profiles (id);
alter table rm_risks add column if not exists response_owner_id uuid references profiles (id);
alter table rm_risks add column if not exists review_interval_days integer check (review_interval_days is null or review_interval_days between 1 and 730);
alter table rm_risks add column if not exists next_review_date date;
alter table rm_risks add column if not exists review_requested_at timestamptz;
alter table rm_risks add column if not exists review_request_reason text not null default '';
alter table rm_risks add column if not exists corporate_risk_id uuid;
alter table rm_risks add column if not exists realized_at timestamptz;
alter table rm_risks add column if not exists closed_at timestamptz;
alter table rm_risks add column if not exists closed_reason text not null default '';
alter table rm_risks add column if not exists tags text[] not null default '{}';

alter table rm_risks drop constraint if exists rm_risks_status_check;
alter table rm_risks add constraint rm_risks_status_check check (status in ('open', 'monitoring', 'escalated', 'closed', 'realized'));
alter table rm_risks drop constraint if exists rm_risks_source_check;
alter table rm_risks add constraint rm_risks_source_check check (source in ('manual', 'mission_debrief', 'issue', 'import', 'meeting', 'api', 'ai', 'lifecycle', 'kri'));
alter table rm_risks drop constraint if exists rm_risks_category_fk;
alter table rm_risks add constraint rm_risks_category_fk foreign key (category) references rm_categories (key) on update cascade;
create unique index if not exists uq_rm_risks_external on rm_risks (external_system, external_id) where external_id is not null;
create index if not exists idx_rm_risks_project_status on rm_risks (project_id, status);
create index if not exists idx_rm_risks_owner on rm_risks (owner_id) where owner_id is not null;
create index if not exists idx_rm_risks_next_review on rm_risks (next_review_date) where status <> 'closed';
update rm_risks set closed_at = updated_at where status = 'closed' and closed_at is null;

-- assessments: method/basis/multi-dimension + kind. Still append-only.
alter table rm_risk_assessments add column if not exists method text not null default 'qualitative' check (method in ('qualitative', 'semi_quantitative', 'quantitative'));
alter table rm_risk_assessments add column if not exists basis text not null default '';
alter table rm_risk_assessments add column if not exists impact_dims jsonb not null default '{}'::jsonb;
alter table rm_risk_assessments add column if not exists probability_pct numeric check (probability_pct is null or probability_pct between 0 and 100);
alter table rm_risk_assessments add column if not exists exposure_cost numeric;
alter table rm_risk_assessments add column if not exists kind text not null default 'review' check (kind in ('review', 'post_action', 'kri_triggered', 'periodic'));
alter table rm_risk_assessments add column if not exists related_action_ids uuid[] not null default '{}';
alter table rm_risk_assessments add column if not exists approved_by uuid references profiles (id);
alter table rm_risk_assessments add column if not exists approved_at timestamptz;
create index if not exists idx_rm_assess_risk on rm_risk_assessments (risk_id, review_date desc);

-- actions: type, deliverable, resources, completion rule, blocking, sub-actions, and the verified EFFECT (completion ≠ effect)
alter table rm_risk_actions add column if not exists action_type text not null default 'mitigating' check (action_type in ('preventive', 'mitigating', 'corrective', 'contingency'));
alter table rm_risk_actions add column if not exists expected_output text not null default '';
alter table rm_risk_actions add column if not exists expected_effect text not null default '';
alter table rm_risk_actions add column if not exists resources text not null default '';
alter table rm_risk_actions add column if not exists completion_criteria text not null default '';
alter table rm_risk_actions add column if not exists cost_estimate numeric;
alter table rm_risk_actions add column if not exists benefit_estimate numeric;
alter table rm_risk_actions add column if not exists planned_start date;
alter table rm_risk_actions add column if not exists parent_action_id uuid references rm_risk_actions (id) on delete cascade;
alter table rm_risk_actions add column if not exists blocked_reason text not null default '';
alter table rm_risk_actions add column if not exists blocked_since timestamptz;
alter table rm_risk_actions add column if not exists completed_at timestamptz;
alter table rm_risk_actions add column if not exists evidence_note text not null default '';
alter table rm_risk_actions add column if not exists effect_status text not null default 'pending' check (effect_status in ('pending', 'effective', 'partial', 'ineffective', 'not_applicable'));
alter table rm_risk_actions add column if not exists effect_note text not null default '';
alter table rm_risk_actions add column if not exists effect_verified_by uuid references profiles (id);
alter table rm_risk_actions add column if not exists effect_verified_at timestamptz;
alter table rm_risk_actions drop constraint if exists rm_risk_actions_status_check;
alter table rm_risk_actions add constraint rm_risk_actions_status_check check (status in ('not_started', 'in_progress', 'completed', 'blocked', 'cancelled'));
create index if not exists idx_rm_actions_risk on rm_risk_actions (risk_id);
update rm_risk_actions set completed_at = updated_at where status = 'completed' and completed_at is null;
