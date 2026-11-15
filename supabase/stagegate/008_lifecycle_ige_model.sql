-- چرخهٔ عمر — مطابق «مدل چرخه عمر پروژه‌های شرکت مهندسی و توسعه گاز ایران» (Project Lifecycle & Stage-Gate Model, Rev. 01, 1405-06-17)
--
-- The company model has ten stages and nine gates (G1…G9 after stages 1…9; the tenth stage, final settlement, closes
-- with «تأیید گزارش نهایی و اعلام خاتمه پروژه»). The module had nine stages: «شناسایی پروژه» held what the model splits
-- into «شفاف‌سازی پروژه» (G2) and «برنامه‌ریزی کلان پروژه» (G3), so every later stage, gate name and probability sat one
-- step off. This migration:
--   1. keeps a copy of the old model and of the project rows it renumbers (sg_bak_1408_*), for the rollback;
--   2. renumbers stages G3…G9 → G4…G10 everywhere a phase code is stored, and inserts the new G3;
--   3. writes each stage's title, owner, phase group, exit criterion, probability (stored in gate_threshold_pct),
--      objectives, key outputs and exit criterion from the model — existing catalog rows are updated in place in order,
--      extra ones are deactivated (is_active = false), missing ones are added; nothing is deleted;
--   4. demo projects only (the two hypothetical pipelines): the old «شناسایی» stage they had passed is split into the
--      new G2 and G3, both passed, and new items of passed stages are marked done, so their progress stays where it was.

-- 1 · backups
create table if not exists sg_bak_1408_phases as select * from sg_lifecycle_phases;
create table if not exists sg_bak_1408_objectives as select * from sg_lifecycle_objectives;
create table if not exists sg_bak_1408_outputs as select * from sg_lifecycle_outputs;
create table if not exists sg_bak_1408_criteria as select * from sg_lifecycle_criteria;
create table if not exists sg_bak_1408_durations as select * from sg_lifecycle_phase_durations;
create table if not exists sg_bak_1408_deps as select * from sg_lifecycle_strategy_phase_dependencies;
create table if not exists sg_bak_1408_project_phases as select * from sg_project_lifecycle_phases;
create table if not exists sg_bak_1408_project_items as select * from sg_project_phase_items;
create table if not exists sg_bak_1408_decisions as select * from sg_lifecycle_gate_decisions;
create table if not exists sg_bak_1408_history as select * from sg_lifecycle_progress_history;
create table if not exists sg_bak_1408_schedule as select * from sg_lifecycle_schedule_items;
do $$ declare t text; begin
  foreach t in array array['phases','objectives','outputs','criteria','durations','deps','project_phases','project_items','decisions','history','schedule'] loop
    execute format('alter table sg_bak_1408_%s enable row level security', t);
    execute format('revoke all on sg_bak_1408_%s from anon, authenticated', t);
  end loop;
end $$;

-- 2 · renumber G3…G9 → G4…G10 (from the end, so no code is ever taken twice)
insert into sg_lifecycle_phases (code, sort_order, phase_group, title, responsible, gate_name, gate_threshold_pct, progress_engine, icon_key, objectives_weight_pct, outputs_weight_pct, criteria_weight_pct, is_active)
select 'G10', 10, phase_group, title, responsible, gate_name, gate_threshold_pct, progress_engine, icon_key, objectives_weight_pct, outputs_weight_pct, criteria_weight_pct, true
from sg_lifecycle_phases where code = 'G9' and not exists (select 1 from sg_lifecycle_phases where code = 'G10');

do $$ declare n int; f text; t text; tb text; begin
  if exists (select 1 from sg_lifecycle_phases where code = 'G10' and title = 'تسویه حساب' and sort_order = 10)
     and exists (select 1 from sg_lifecycle_phases where code = 'G3' and title = 'برنامه‌ریزی کلان پروژه') then
    raise notice 'already renumbered'; return;
  end if;
  for n in reverse 9..3 loop
    f := 'G' || n; t := 'G' || (n + 1);
    foreach tb in array array['sg_lifecycle_objectives','sg_lifecycle_outputs','sg_lifecycle_criteria','sg_lifecycle_phase_durations','sg_project_lifecycle_phases','sg_project_phase_items','sg_lifecycle_gate_decisions','sg_lifecycle_progress_history','sg_lifecycle_schedule_items','sg_lifecycle_audit_log','sg_lifecycle_schedule_success_template_phases','sg_lifecycle_schedule_success_template_items'] loop
      execute format('update %I set phase_code = $1 where phase_code = $2', tb) using t, f;
    end loop;
    update sg_lifecycle_strategy_phase_dependencies set succ_phase_code = t where succ_phase_code = f;
    update sg_lifecycle_strategy_phase_dependencies set pred_phase_code = t where pred_phase_code = f;
  end loop;
  -- what used to start alongside «شناسایی» now follows the new planning stage, which issues the consultant permit
  update sg_lifecycle_strategy_phase_dependencies set pred_phase_code = 'G3' where pred_phase_code = 'G2' and succ_phase_code <> 'G3';
end $$;

-- 3 · the stages
create temporary table _m (code text, ord int, grp text, title text, owner text, gate text, pct numeric, engine text, icon text, days int);
insert into _m values
 ('G1', 1, 'fel', 'تعریف پروژه', 'شرکت ملی گاز', 'تصویب و ابلاغ', 30, 'step', 'target', 60),
 ('G2', 2, 'fel', 'شفاف‌سازی پروژه', 'برنامه‌ریزی و کنترل طرح‌ها', 'تصویب منشور و ابلاغ آغاز مقدمات پروژه', 50, 'step', 'users', 30),
 ('G3', 3, 'fel', 'برنامه‌ریزی کلان پروژه', 'مجری طرح', 'صدور مجوز خرید خدمات', 70, 'step', 'calendar', 60),
 ('G4', 4, 'execution', 'خرید خدمات مشاور طراحی پایه', 'مجری طرح', 'ابلاغ شروع به کار مهندسی', 80, 'step', 'fileText', 120),
 ('G5', 5, 'execution', 'طراحی پایه', 'مجری طرح', 'مجوز کمیسیون / هیات برای برگزاری مناقصات', 90, 'basic_design', 'edit', 180),
 ('G6', 6, 'execution', 'مناقصه انتخاب پیمانکار و ناظر', 'مجری طرح', 'ابلاغ شروع به کار اجرا', 100, 'step', 'clipboard', 180),
 ('G7', 7, 'execution', 'اجرا', 'مجری طرح', 'تایید شروع پیش‌راه‌اندازی', 100, 'epc', 'zap', 600),
 ('G8', 8, 'commissioning', 'پیش‌راه‌اندازی و راه‌اندازی', 'مجری طرح', 'امضای صورتجلسه تحویل موقت توسط بهره‌بردار', 100, 'step', 'gauge', 60),
 ('G9', 9, 'commissioning', 'دوره نگهداری', 'مجری طرح', 'امضای صورتجلسه تحویل قطعی', 100, 'step', 'shield', 120),
 ('G10', 10, 'commissioning', 'تسویه حساب', 'مجری طرح', 'تأیید گزارش نهایی و اعلام خاتمه پروژه', 100, 'step', 'logOut', 30);

insert into sg_lifecycle_phases (code, sort_order, phase_group, title, responsible, gate_name, gate_threshold_pct, progress_engine, icon_key, objectives_weight_pct, outputs_weight_pct, criteria_weight_pct, is_active)
select code, ord, grp, title, owner, gate, pct, engine, icon, 50, 30, 20, true from _m where not exists (select 1 from sg_lifecycle_phases p where p.code = _m.code);
update sg_lifecycle_phases p set sort_order = m.ord, phase_group = m.grp, title = m.title, responsible = m.owner, gate_name = m.gate, gate_threshold_pct = m.pct, progress_engine = m.engine, icon_key = m.icon, is_active = true, updated_at = now()
from _m m where p.code = m.code;
insert into sg_lifecycle_phase_durations (phase_code, duration_days) select code, days from _m where not exists (select 1 from sg_lifecycle_phase_durations d where d.phase_code = _m.code);
update sg_lifecycle_phase_durations d set duration_days = m.days, updated_at = now() from _m m where d.phase_code = m.code and m.code in ('G2', 'G3');

-- objectives (اهداف مرحله), key outputs (خروجی کلیدی) and the exit criterion (معیار عبور)
create temporary table _i (code text, kind text, seq int, title text);
insert into _i (code, kind, seq, title)
select code, kind, ord::int, title from (values
 ('G1', 'objective', array['طرح ایده پروژه', 'امکان‌سنجی', 'تهیه گزارش و ابلاغیه پروژه', 'گزارش توجیهی']),
 ('G1', 'output', array['گزارش امکان‌سنجی و توجیه فنی–اقتصادی', 'تعریف اولیه محدوده و نیازمندی‌ها', 'گزینه منتخب و برآورد اولیه زمان و هزینه']),
 ('G1', 'criterion', array['تصویب و ابلاغ']),
 ('G2', 'objective', array['بررسی مصوبه هیات مدیره', 'بررسی گزارش امکان‌سنجی / گزارش توجیهی', 'تعیین مجری طرح', 'تعیین دپارتمان مهندسی یا مدیر پروژه', 'استخراج ابهامات پروژه', 'رفع ابهامات پروژه']),
 ('G2', 'output', array['منشور پروژه', 'اهداف و معیارهای موفقیت', 'محدوده سطح‌بالا و ساختار مسئولیت‌ها', 'مبانی اولیه طراحی']),
 ('G2', 'criterion', array['تصویب منشور و ابلاغ آغاز مقدمات پروژه']),
 ('G3', 'objective', array['تعیین روش اجرا', 'تهیه زمان‌بندی و برآورد کلی پروژه', 'مجوز مدیرعامل', 'تایید مدت زمان', 'تعیین ردیف بودجه', 'تهیه شرح کار و اسناد خرید خدمات مشاور', 'کمیته تسهیلات', 'اخذ مجوزات لازم', 'بارگذاری اسناد ارزیابی کیفی', 'تحصیل اراضی (در صورت نیاز)']),
 ('G3', 'output', array['برنامه مدیریت پروژه (PMP)', 'خط مبنای اولیه محدوده، زمان و هزینه', 'استراتژی اجرا و قراردادها', 'شرح خدمات و اسناد انتخاب مشاور']),
 ('G3', 'criterion', array['صدور مجوز خرید خدمات']),
 ('G4', 'objective', array['تکمیل اسناد ارزیابی کیفی توسط مشاور', 'ارزیابی کیفی توسط کمیته فنی و بازرگانی', 'تهیه فهرست کوتاه مشاورین', 'بارگذاری اسناد خرید خدمات و تکمیل توسط مشاور', 'ارزیابی فنی توسط کمیته فنی و بازرگانی', 'ارزیابی مالی و تعیین برنده توسط هیات انتخاب مشاور', 'تصویب توسط هیات مدیره', 'ابلاغ پذیرش مشاور']),
 ('G4', 'output', array['گزارش ارزیابی پیشنهادها', 'مصوبه انتخاب مشاور', 'قرارداد مشاور', 'برنامه کار و صورت‌جلسه آغاز پروژه']),
 ('G4', 'criterion', array['ابلاغ شروع به کار مهندسی']),
 ('G5', 'objective', array['تهیه نقشه‌ها و مدارک مهندسی', 'تهیه اسناد مناقصه پیمانکار و در صورت نیاز نظارت', 'کمیته تعیین روش (در صورت نیاز)', 'کمیته تسهیلات', 'استعلام موجودی کارفرما', 'انتخاب مدیر پروژه اجرا', 'تایید مدت زمان', 'تکمیل فرم اخذ مجوز فراخوان', 'انتشار آگهی فراخوان عمومی (در صورت نیاز)', 'گواهی پایان کار مشاور طراحی']),
 ('G5', 'output', array['بسته مصوب طراحی پایه', 'نقشه‌ها و مشخصات فنی پایه', 'برآورد به‌روز زمان و هزینه', 'اسناد فنی مناقصه اجرا']),
 ('G5', 'criterion', array['مجوز کمیسیون / هیات برای برگزاری مناقصات']),
 ('G6', 'objective', array['تکمیل اسناد ارزیابی کیفی توسط مشاور / پیمانکار', 'ارزیابی کیفی توسط کمیته فنی و بازرگانی', 'تهیه فهرست کوتاه مشاورین / پیمانکاران', 'بارگذاری اسناد خرید خدمات و تکمیل توسط مشاور / مناقصه و تکمیل اسناد', 'ارزیابی فنی توسط کمیته فنی و بازرگانی', 'ارزیابی مالی و تعیین برنده توسط هیات انتخاب مشاور / کمیسیون مناقصات', 'تصویب توسط هیات مدیره', 'ابلاغ پذیرش مشاور / پیمانکار']),
 ('G6', 'output', array['گزارش ارزیابی پیشنهادها', 'مصوبه انتخاب پیمانکار و ناظر', 'قراردادهای امضاشده', 'برنامه مبنا و ابلاغ شروع کار']),
 ('G6', 'criterion', array['ابلاغ شروع به کار اجرا']),
 ('G7', 'objective', array['تحویل زمین', 'تهیه و تصویب پکیج برنامه زمان‌بندی پروژه و رویه هماهنگی', 'اجرای شرح کار مطابق پیمان', 'اعلام آمادگی پیمانکار جهت پیش‌راه‌اندازی']),
 ('G7', 'output', array['مدارک تفصیلی مهندسی مصوب', 'سوابق خرید، بازرسی و کنترل کیفیت', 'نقشه‌های ازبیلت اولیه', 'گواهی تکمیل مکانیکی']),
 ('G7', 'criterion', array['تایید شروع پیش‌راه‌اندازی']),
 ('G8', 'objective', array['PSSR', 'انجام تست‌های پیش‌راه‌اندازی و رفع موانع', 'اعلام آمادگی پیمانکار جهت راه‌اندازی', 'اخذ مجوز راه‌اندازی', 'راه‌اندازی', 'تهیه لیست نواقص (پانچ لیست) توسط بهره‌بردار', 'تایید راه‌اندازی', 'تکمیل و ارسال فرم صورتجلسه تحویل موقت']),
 ('G8', 'output', array['سوابق پیش‌راه‌اندازی و راه‌اندازی', 'تأییدیه آمادگی بهره‌برداری - PSSR', 'گزارش آزمون عملکرد', 'گواهی تحویل موقت و فهرست نواقص']),
 ('G8', 'criterion', array['امضای صورتجلسه تحویل موقت توسط بهره‌بردار']),
 ('G9', 'objective', array['رفع پانچ‌ها', 'تحویل کلیه مدارک و مستندات پروژه (فاینال‌بوک، مستندات تحصیل اراضی، نقشه‌های ازبیلت)', 'اعلام آمادگی جهت تحویل دائم']),
 ('G9', 'output', array['تأیید رفع نواقص', 'مدارک نهایی ازبیلت', 'پرونده نهایی تحویل به بهره‌بردار', 'گواهی تحویل قطعی']),
 ('G9', 'criterion', array['امضای صورتجلسه تحویل قطعی']),
 ('G10', 'objective', array['صورت‌وضعیت قطعی', 'صورت‌وضعیت تعدیل قطعی', 'نهایی شدن لایحه تاخیرات', 'بالانس متریال', 'اخذ مفاصا حساب', 'آزادسازی تضامین', 'تعهدنامه عدم ادعا', 'گواهی پایان‌کار نظارت']),
 ('G10', 'output', array['صورت‌حساب و تسویه نهایی', 'مفاصاحساب‌ها و آزادسازی تضامین', 'گزارش نهایی عملکرد و درس‌آموخته‌ها', 'صورت‌جلسه خاتمه پروژه']),
 ('G10', 'criterion', array['تأیید گزارش نهایی و اعلام خاتمه پروژه'])
) v(code, kind, arr), unnest(arr) with ordinality as u(title, ord);

do $$ declare r record; tb text; k text; n int; begin
  foreach k in array array['objective', 'output', 'criterion'] loop
    tb := case k when 'objective' then 'sg_lifecycle_objectives' when 'output' then 'sg_lifecycle_outputs' else 'sg_lifecycle_criteria' end;
    for r in select distinct code from _i loop
      -- existing rows of the stage, in their order, take the model's titles one by one; the rest are switched off
      execute format($q$
        with cur as (select id, row_number() over (order by seq, id) rn from %I where phase_code = $1),
             tgt as (select seq, title from _i where code = $1 and kind = $2)
        update %I t set title = tgt.title, seq = tgt.seq, description = '', is_active = true
        from cur join tgt on tgt.seq = cur.rn where t.id = cur.id$q$, tb, tb) using r.code, k;
      execute format($q$
        with cur as (select id, row_number() over (order by seq, id) rn from %I where phase_code = $1)
        update %I t set is_active = false from cur where t.id = cur.id and cur.rn > (select count(*) from _i where code = $1 and kind = $2)$q$, tb, tb) using r.code, k;
      execute format('select count(*) from %I where phase_code = $1', tb) into n using r.code;
      if k = 'criterion' then
        execute format($q$insert into %I (phase_code, seq, title, description, is_mandatory, is_active) select $1, seq, title, '', true, true from _i where code = $1 and kind = $2 and seq > $3 order by seq$q$, tb) using r.code, k, n;
        execute format('update %I set is_mandatory = true where phase_code = $1 and is_active', tb) using r.code;
      else
        execute format($q$insert into %I (phase_code, seq, title, description, is_active) select $1, seq, title, '', true from _i where code = $1 and kind = $2 and seq > $3 order by seq$q$, tb) using r.code, k, n;
      end if;
    end loop;
  end loop;
end $$;

-- 4 · the two demo projects: split the passed «شناسایی» stage into the new G2 and G3, keep their progress
do $$ declare p record; g2 sg_project_lifecycle_phases; mid date; amid date; begin
  for p in select name from sg_projects where name like 'پروژهٔ فرضی:%' loop
    select * into g2 from sg_project_lifecycle_phases where project_name = p.name and phase_code = 'G2';
    if not found or exists (select 1 from sg_project_lifecycle_phases where project_name = p.name and phase_code = 'G3') then continue; end if;
    mid := g2.planned_start + (g2.planned_finish - g2.planned_start) / 2;
    amid := g2.actual_start + (coalesce(g2.actual_finish, g2.actual_start) - g2.actual_start) / 2;
    update sg_project_lifecycle_phases set planned_finish = mid, actual_finish = case when actual_finish is null then null else amid end, weight_pct = round(coalesce(weight_pct, 0) / 2, 2), updated_at = now() where id = g2.id;
    insert into sg_project_lifecycle_phases (project_name, phase_code, weight_pct, planned_start, planned_finish, actual_start, actual_finish, gate_status, updated_by)
    values (p.name, 'G3', round(coalesce(g2.weight_pct, 0) / 2, 2), mid + 1, g2.planned_finish, case when g2.actual_finish is null then null else amid + 1 end, g2.actual_finish, g2.gate_status, 'lifecycle-model-1405');
    insert into sg_lifecycle_gate_decisions (project_name, phase_code, decision, reason, decided_by, decided_at)
    select project_name, 'G3', decision, reason, decided_by, decided_at from sg_lifecycle_gate_decisions where project_name = p.name and phase_code = 'G2';
    update sg_lifecycle_gate_decisions set decided_at = amid::timestamptz where project_name = p.name and phase_code = 'G2' and amid is not null;
  end loop;
  -- every active item of a stage these projects have passed is done (new items included)
  insert into sg_project_phase_items (project_name, phase_code, kind, item_id, status, completion_date, verified_by, verification_date, updated_by)
  select pp.project_name, pp.phase_code, x.kind, x.id, case when x.kind = 'criterion' then 'verified' else 'completed' end, pp.actual_finish, 'demo-seed', pp.actual_finish, 'lifecycle-model-1405'
  from sg_project_lifecycle_phases pp
  join (select id, phase_code, 'objective' kind from sg_lifecycle_objectives where is_active
        union all select id, phase_code, 'output' from sg_lifecycle_outputs where is_active
        union all select id, phase_code, 'criterion' from sg_lifecycle_criteria where is_active) x on x.phase_code = pp.phase_code
  where pp.project_name like 'پروژهٔ فرضی:%' and pp.gate_status = 'passed'
  on conflict (project_name, phase_code, kind, item_id) do update set status = excluded.status, completion_date = coalesce(sg_project_phase_items.completion_date, excluded.completion_date), verified_by = coalesce(sg_project_phase_items.verified_by, excluded.verified_by), verification_date = coalesce(sg_project_phase_items.verification_date, excluded.verification_date), updated_at = now();
end $$;

-- 5 · demo projects: the old «شناسایی» schedule row now covers the new G2 window, and G3 gets its own row with the same
--     progress (a stage's actual progress is read from its schedule)
with g as (
  select pp.project_name, pp.phase_code, pp.planned_start, pp.planned_finish from sg_project_lifecycle_phases pp where pp.project_name like 'پروژهٔ فرضی:%' and pp.phase_code in ('G2', 'G3')
), upd as (
  update sg_lifecycle_schedule_items s set title = 'بررسی مصوبه، تعیین مجری طرح و رفع ابهامات پروژه', planned_start = g.planned_start, planned_finish = g.planned_finish, updated_at = now(), updated_by = 'lifecycle-model-1405'
  from g where g.project_name = s.project_name and g.phase_code = 'G2' and s.phase_code = 'G2' and s.parent_id is null and s.seq = 1
  returning s.project_name, s.manual_actual_pct
)
insert into sg_lifecycle_schedule_items (project_name, phase_code, parent_id, seq, title, planned_start, planned_finish, weight_pct, manual_actual_pct, updated_by)
select g.project_name, 'G3', null, 1, 'تهیه PMP، زمان‌بندی و برآورد کلی، ردیف بودجه و اخذ مجوز خرید خدمات', g.planned_start, g.planned_finish, null, upd.manual_actual_pct, 'lifecycle-model-1405'
from g join upd on upd.project_name = g.project_name
where g.phase_code = 'G3' and not exists (select 1 from sg_lifecycle_schedule_items x where x.project_name = g.project_name and x.phase_code = 'G3');
