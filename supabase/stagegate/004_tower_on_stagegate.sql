-- برج کنترل روی Stage-Gate: Milestoneهای پروژه‌های وصل‌شده به Stage-Gate به‌جای ۱۱ مرحلهٔ ماژول قدیمی
-- به کد مرحلهٔ G1…G9 اشاره می‌کنند (همان نگاشت PLC_TO_SG در src/modules/lifecycle/lib/stageGateBundle.ts).
-- فقط UPDATE؛ پروژه‌های بدون پیوند Stage-Gate دست نمی‌خورند.
update plc_milestones m
set stage_key = map.sg
from (values
  ('idea', 'G1'), ('pre_project', 'G1'), ('initiation', 'G2'), ('planning', 'G3'), ('engineering', 'G4'),
  ('procurement', 'G5'), ('execution', 'G6'), ('commissioning', 'G7'), ('handover', 'G8'),
  ('close_out', 'G9'), ('lessons_learned', 'G9')
) as map(plc, sg)
where m.stage_key = map.plc
  and exists (select 1 from sg_projects p where p.master_project_id::text = m.project_id::text);
