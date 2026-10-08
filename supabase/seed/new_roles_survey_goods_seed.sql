-- New job roles: "ناظر نقشه‌برداری" (survey_inspector) and "ناظر امور کالا" (goods_materials_inspector).
-- Adds the role config row, its competency requirements (mapped to the existing 12 comp_competencies
-- rows) and a default behavioral profile (same pattern as supabase/seed/personality_job_profiles.sql).
-- Idempotent: every insert is guarded by on conflict do nothing / not-exists.

begin;

insert into comp_job_role_config (job_role, label_fa, description, sort_order) values
  ('survey_inspector', 'ناظر نقشه‌برداری',
   'ناظر نقشه‌برداری مسئول کنترل و تأیید کلیه عملیات ژئودتیک و نقشه‌برداری پروژه خط لوله است؛ از پیاده‌سازی مسیر و کریدور عبور (ROW) و ایستگاه‌های کنترل زمینی، کنترل مختصات و تراز نقاط کیلومتراژ (KP)، بازرسی دقت دستگاه‌های توتال استیشن و GPS-RTK و گواهی کالیبراسیون آن‌ها، تا تطبیق برداشت‌های as-built با نقشه‌های طراحی (Alignment Sheet) و کنترل تلورانس‌های مجاز عمق دفن، شیب و انحنای لوله. او همچنین بر ثبت دقیق مختصات نقاط بحرانی (عبور از رودخانه، جاده، خطوط دیگر)، هماهنگی برای حل اختلافات حریم و مالکیت اراضی (ROW) و تهیه نقشه‌های نهایی as-built برای تحویل به کارفرما نظارت دارد.',
   23),
  ('goods_materials_inspector', 'ناظر امور کالا',
   'ناظر امور کالا مسئول کنترل کمی و کیفی کالاهای وارده به انبار پروژه (لوله، اتصالات، پوشش، تجهیزات مکانیکی و برقی) در تطابق با مشخصات خرید و اسناد سفارش است؛ شامل بازرسی حین تخلیه (Receiving Inspection)، تطبیق گواهی‌های متریال (MTC/Mill Test Certificate) و گواهی‌های کیفیت سازنده با استاندارد پروژه، کنترل آسیب‌دیدگی حمل‌ونقل و ثبت ادعای کسری/آسیب (Shortage/Damage Claim) نزد پیمانکار حمل یا فروشنده. او همچنین بر نحوه انبارش و نگهداری صحیح کالاهای حساس (لوله با پوشش FBE/3LPE، الکترود، فلنج) مطابق دستورالعمل نگهداری سازنده، رعایت الزامات HSE انبار، ردیابی و برچسب‌گذاری (Traceability/Heat Number Tagging) اقلام تا لحظه مصرف در کارگاه، و مدیریت سیستم صدور و کنترل موجودی انبار نظارت می‌کند.',
   24)
on conflict (job_role) do nothing;

insert into comp_job_competency_requirements (job_role, competency_id, required_level, is_critical, weight)
select v.job_role, c.id, v.required_level, v.is_critical, v.weight
from (values
  ('survey_inspector', 'technical_knowledge', 4, true, 2),
  ('survey_inspector', 'quality_compliance', 4, true, 1.5),
  ('survey_inspector', 'practical_experience', 3, false, 1.5),
  ('survey_inspector', 'professional_judgment', 3, false, 1),
  ('survey_inspector', 'accountability_reliability', 3, false, 1),
  ('survey_inspector', 'hse_awareness', 2, false, 0.5),
  ('survey_inspector', 'communication', 2, false, 0.5),

  ('goods_materials_inspector', 'quality_compliance', 4, true, 2),
  ('goods_materials_inspector', 'technical_knowledge', 3, true, 1.5),
  ('goods_materials_inspector', 'accountability_reliability', 4, false, 1),
  ('goods_materials_inspector', 'practical_experience', 3, false, 1),
  ('goods_materials_inspector', 'hse_awareness', 3, false, 1),
  ('goods_materials_inspector', 'commercial_contract_awareness', 2, false, 1),
  ('goods_materials_inspector', 'communication', 2, false, 0.5)
) as v(job_role, competency_key, required_level, is_critical, weight)
join comp_competencies c on c.key = v.competency_key
where not exists (
  select 1 from comp_job_competency_requirements r
  where r.job_role = v.job_role
);

with spec(job_role, dim_key, weight, min_threshold, is_critical) as (
  values
  ('survey_inspector','DETAIL_ORIENTATION',18,80,true), ('survey_inspector','ANALYTICAL_THINKING',15,70,true),
  ('survey_inspector','INTEGRITY_ORIENTATION',12,70,true), ('survey_inspector','DOCUMENTATION_DISCIPLINE',12,70,false),
  ('survey_inspector','RULE_ORIENTATION',10,65,false), ('survey_inspector','ACCOUNTABILITY',10,65,false),
  ('survey_inspector','COMMUNICATION',8,60,false),

  ('goods_materials_inspector','DETAIL_ORIENTATION',18,80,true), ('goods_materials_inspector','RULE_ORIENTATION',14,70,true),
  ('goods_materials_inspector','INTEGRITY_ORIENTATION',14,70,true), ('goods_materials_inspector','DOCUMENTATION_DISCIPLINE',12,70,false),
  ('goods_materials_inspector','SAFETY_ORIENTATION',10,65,false), ('goods_materials_inspector','ACCOUNTABILITY',10,65,false),
  ('goods_materials_inspector','COMMUNICATION',8,60,false)
),
missing_roles as (
  select distinct s.job_role
  from spec s
  join comp_job_role_config c on c.job_role = s.job_role
  where not exists (select 1 from personality_job_behavioral_profiles p where p.job_role = s.job_role)
),
new_profiles as (
  insert into personality_job_behavioral_profiles (job_role, version, title, active)
  select m.job_role, 1, 'نیم‌رخ رفتاری پیش‌فرض — ' || c.label_fa, true
  from missing_roles m join comp_job_role_config c on c.job_role = m.job_role
  returning id, job_role
)
insert into personality_job_behavioral_requirements (profile_id, dimension_id, weight, min_threshold, is_critical)
select np.id, d.id, s.weight, s.min_threshold, s.is_critical
from new_profiles np
join spec s on s.job_role = np.job_role
join personality_behavioral_dimensions d on d.key = s.dim_key;

commit;
