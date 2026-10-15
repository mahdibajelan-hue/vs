-- Saved exam templates had no BEHAVIORAL cell, so the 144 STAR questions (019) were never drawn into interviews.
-- Add 2 x BEHAVIORAL (L3 — all STAR rows are L3) to every template that lacks one.
update comp_assessment_templates
set question_mix = question_mix || '[{"count":2,"category":"BEHAVIORAL","difficulty":"L3"}]'::jsonb, updated_at = now()
where not (question_mix::text like '%BEHAVIORAL%');
