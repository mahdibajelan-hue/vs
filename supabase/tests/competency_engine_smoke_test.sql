-- Enterprise Competency Assessment Engine — Evidence Engine + Competency Engine smoke test
-- (schema.sql Section 49, plus Section 50's exam-design exclusion).
--
-- Same convention as personality_engine_smoke_test.sql: a self-contained, re-runnable DO block that
-- drives the real comp_compute_competency_profile RPC end-to-end against throwaway rows and asserts on
-- its real output, cleaning up after itself on success AND on failure.
--
-- Deliberately independent of the seeded competency library: it creates its own throwaway job role,
-- competencies, evidence sources and requirements, so an admin editing the real (seeded) model can
-- never break this test, and every expected number below is hand-computable from this file alone.
--
-- Auth: comp_compute_competency_profile guards on comp_can_access_assessment(), which reads
-- auth.uid() — null in the SQL editor / psql. The block therefore impersonates an existing admin
-- profile for the duration of its own transaction via
--   set_config('request.jwt.claims', {"sub": <admin id>, "role": "authenticated"}, true)
-- which is exactly what auth.uid() reads under PostgREST. is_local = true, so nothing leaks past the
-- transaction. The throwaway assessment is also created_by that admin, so access holds either way.
--
-- Hand-computed expectations (5-level scale → actual_level = round(1 + score/100×4, 1)):
--   __smoke_tech__  (req 4, critical) sources TECHNICAL_CATEGORY/TECHNICAL w3, EXPERIENCE/years_total w1,
--                    EXPERIENCE/certifications w1, STRUCTURED_INTERVIEW w1
--     q1: lead 1, submitted panelists 5 & 4 → official round(4.5)=5 → 100 (eff 3/2 = 1.5)
--     q2: lead 2, only an UNSUBMITTED panelist scored it (0, ignored) → official 2 → 40 (eff 1.5)
--     q3: selected but never scored → NO evidence (not a zero)
--     years_total 6 → 6/15×100 = 40 (eff 1) · certifications: one blank-title entry → NO evidence
--     interview rating 4 → (4−1)/4×100 = 75 (eff 1)
--     score = (100×1.5 + 40×1.5 + 40 + 75) / 5 = 65 → level 3.6 → gap 0.4 → CRITICAL_GAP
--     coverage = (3+1+1)/6 = 0.8333, 4 items, 3 source types → HIGH
--   __smoke_behav__ (req 3) PERSONALITY_DIMENSION/LEADERSHIP w2 (70), SJT/<dim> w1 (option score 5 → 100),
--                    STRUCTURED_INTERVIEW w1 (none)
--     score = (70×2 + 100×1)/3 = 80 → level 4.2 → EXCEEDS (≥ 3+1), gap −1.2; coverage 0.75, 2 items → MEDIUM
--   __smoke_meets__ (req 3) PERSONALITY_TRAIT/conscientiousness w1 (50) → level 3.0 → MEETS, gap 0; 1 item → LOW
--   __smoke_gap__   (req 4, NOT critical) EXPERIENCE/years_total w1 (40) → level 2.6 → GAP, gap 1.4 → LOW
--   __smoke_empty__ (req 3, critical) STRUCTURED_INTERVIEW w1 + EXPERIENCE/years_pipeline w1 (null)
--     → no evidence at all → INSUFFICIENT_EVIDENCE / NONE / score, level and gap all null — never a gap.
--
-- The candidate is first created with EVERY method in its exam design (Section 50), so all of the
-- above is computed with nothing excluded. Then the design is narrowed and recomputed:
--   technical + structured interview OFF (personality/experience still on):
--     __smoke_tech__  only EXPERIENCE/years_total (40) and EXPERIENCE/certifications (none) remain in
--                     play → score 40 → level 2.6 → CRITICAL_GAP; coverage 1/2 = 0.5 (NOT 1/6 — the two
--                     excluded methods are "not assessed by design", not missing evidence); 1 item → LOW
--     __smoke_behav__ INTERVIEW w1 leaves the denominator → coverage (2+1)/3 = 1 (was 0.75), still 80 / MEDIUM
--     __smoke_empty__ only EXPERIENCE/years_pipeline (null) remains → still INSUFFICIENT_EVIDENCE / NONE / cov 0
--     and no TECHNICAL_CATEGORY / STRUCTURED_INTERVIEW evidence row may exist at all.
--   every method OFF: every competency → INSUFFICIENT_EVIDENCE / NONE, coverage 0, zero evidence rows.

do $$
declare
  v_role constant text := '__smoke_competency_role__';
  v_admin uuid;
  v_panelist2 uuid;
  v_panelist3 uuid;
  v_q1 uuid;
  v_q2 uuid;
  v_q3 uuid;
  v_sjt_q uuid;
  v_sjt_opt text;
  v_sjt_dim text;
  v_comp_id uuid;
  v_pa_id uuid;
  v_ds_leadership uuid;
  v_c_tech uuid;
  v_c_behav uuid;
  v_c_meets uuid;
  v_c_gap uuid;
  v_c_empty uuid;
  v_row comp_competency_scores%rowtype;
  v_ev comp_competency_evidence%rowtype;
  v_n int;
  v_n2 int;
begin
  select id into v_admin from profiles where is_admin order by created_at limit 1;
  if v_admin is null then
    raise exception 'smoke test precondition failed: no admin profile exists to impersonate';
  end if;
  select id into v_panelist2 from profiles where id <> v_admin order by created_at limit 1;
  select id into v_panelist3 from profiles where id not in (v_admin, v_panelist2) order by created_at limit 1;
  if v_panelist3 is null then
    raise exception 'smoke test precondition failed: need at least 3 profiles for the panel-averaging case';
  end if;

  select id into v_q1 from comp_question_bank where category = 'TECHNICAL' order by id limit 1;
  select id into v_q2 from comp_question_bank where category = 'TECHNICAL' and id <> v_q1 order by id limit 1;
  select id into v_q3 from comp_question_bank where category = 'TECHNICAL' and id not in (v_q1, v_q2) order by id limit 1;
  if v_q3 is null then
    raise exception 'smoke test precondition failed: need at least 3 TECHNICAL-category questions in comp_question_bank';
  end if;

  select q.id, o.value ->> 'key', o.value ->> 'dimension_key' into v_sjt_q, v_sjt_opt, v_sjt_dim
  from personality_questions q
  cross join lateral jsonb_array_elements(q.options) o(value)
  where q.question_type = 'SJT' and jsonb_typeof(o.value -> 'score') = 'number' and (o.value ->> 'score')::numeric = 5
    and coalesce(o.value ->> 'dimension_key', '') <> ''
  order by q.id
  limit 1;
  if v_sjt_q is null then
    raise exception 'smoke test precondition failed: need an SJT question with a score-5 option mapped to a dimension';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_admin then
    raise exception 'smoke test setup failed: could not impersonate admin (auth.uid() = %)', auth.uid();
  end if;

  -- ---- Throwaway model: role, competencies, sources, requirements ----
  insert into comp_job_role_config (job_role, label_fa, active, sort_order) values (v_role, '__smoke__', false, 9999);

  insert into comp_competencies (key, label_fa, domain) values ('__smoke_tech__', '__smoke_tech__', 'TECHNICAL') returning id into v_c_tech;
  insert into comp_competencies (key, label_fa, domain) values ('__smoke_behav__', '__smoke_behav__', 'BEHAVIORAL') returning id into v_c_behav;
  insert into comp_competencies (key, label_fa, domain) values ('__smoke_meets__', '__smoke_meets__', 'BEHAVIORAL') returning id into v_c_meets;
  insert into comp_competencies (key, label_fa, domain) values ('__smoke_gap__', '__smoke_gap__', 'TECHNICAL') returning id into v_c_gap;
  insert into comp_competencies (key, label_fa, domain) values ('__smoke_empty__', '__smoke_empty__', 'HYBRID') returning id into v_c_empty;

  insert into comp_competency_evidence_sources (competency_id, source_type, source_ref, weight) values
    (v_c_tech, 'TECHNICAL_CATEGORY', 'TECHNICAL', 3),
    (v_c_tech, 'EXPERIENCE', 'years_total', 1),
    (v_c_tech, 'EXPERIENCE', 'certifications', 1),
    (v_c_tech, 'STRUCTURED_INTERVIEW', '', 1),
    (v_c_behav, 'PERSONALITY_DIMENSION', 'LEADERSHIP', 2),
    (v_c_behav, 'SJT', v_sjt_dim, 1),
    (v_c_behav, 'STRUCTURED_INTERVIEW', '', 1),
    (v_c_meets, 'PERSONALITY_TRAIT', 'conscientiousness', 1),
    (v_c_gap, 'EXPERIENCE', 'years_total', 1),
    (v_c_empty, 'STRUCTURED_INTERVIEW', '', 1),
    (v_c_empty, 'EXPERIENCE', 'years_pipeline', 1);

  insert into comp_job_competency_requirements (job_role, competency_id, required_level, is_critical, weight) values
    (v_role, v_c_tech, 4, true, 2),
    (v_role, v_c_behav, 3, false, 1),
    (v_role, v_c_meets, 3, false, 1),
    (v_role, v_c_gap, 4, false, 1),
    (v_role, v_c_empty, 3, true, 1);

  -- ---- Throwaway candidate + evidence ----
  insert into comp_assessments (
    job_role, candidate_name, candidate_position, candidate_national_id, candidate_phone, candidate_email, created_by,
    selected_question_ids, answers, years_experience_total, years_experience_pipeline, certifications,
    needs_technical_assessment, needs_personality_assessment, needs_structured_interview, includes_experience
  ) values (
    v_role, '__smoke_test_competency__', 'test', '0000000009', '09120000009', 'smoke-competency@example.com', v_admin,
    jsonb_build_array(v_q1, v_q2, v_q3),
    jsonb_build_object(
      v_q1::text, jsonb_build_object('score', 1, 'note', 'lead note'),
      v_q2::text, jsonb_build_object('score', 2, 'note', '', 'candidateAnswer', 'smoke answer')
    ),
    6, null, '[{"title": "  ", "issuer": ""}]'::jsonb,
    true, true, true, true
  ) returning id into v_comp_id;

  insert into comp_panelist_scores (assessment_id, panelist_id, answers, submitted_at) values
    (v_comp_id, v_admin, jsonb_build_object(v_q1::text, jsonb_build_object('score', 5, 'note', 'panel note A')), now()),
    (v_comp_id, v_panelist2, jsonb_build_object(v_q1::text, jsonb_build_object('score', 4, 'note', '')), now()),
    (v_comp_id, v_panelist3, jsonb_build_object(v_q2::text, jsonb_build_object('score', 0, 'note', 'not submitted')), null);

  insert into personality_assessments (assessment_id, job_role, created_by, selected_question_ids, status)
  values (v_comp_id, v_role, v_admin, jsonb_build_array(v_sjt_q), 'FINAL_REVIEW')
  returning id into v_pa_id;

  insert into personality_dimension_scores (personality_assessment_id, score_kind, dimension_id, raw_score, normalized_score, coverage_count, confidence)
  select v_pa_id, 'BEHAVIORAL_DIMENSION', d.id, 3.5, 70, 4, 'MEDIUM' from personality_behavioral_dimensions d where d.key = 'LEADERSHIP'
  returning id into v_ds_leadership;
  insert into personality_dimension_scores (personality_assessment_id, score_kind, trait_id, raw_score, normalized_score, coverage_count, confidence)
  select v_pa_id, 'TRAIT', t.id, 4, 50, 6, 'HIGH' from personality_traits t where t.key = 'conscientiousness';
  -- An unconfigured trait score must never leak into any competency.
  insert into personality_dimension_scores (personality_assessment_id, score_kind, trait_id, raw_score, normalized_score, coverage_count, confidence)
  select v_pa_id, 'TRAIT', t.id, 4, 90, 6, 'HIGH' from personality_traits t where t.key = 'extraversion';

  insert into personality_responses (personality_assessment_id, question_id, response_value, response_time_ms)
  values (v_pa_id, v_sjt_q, jsonb_build_object('selected_option', v_sjt_opt), 1000);

  insert into comp_interview_ratings (assessment_id, competency_id, rater_id, rating, notes)
  values (v_comp_id, v_c_tech, v_admin, 4, 'smoke interview');

  -- ---- Compute (twice: must be idempotent) ----
  perform comp_compute_competency_profile(v_comp_id);
  select count(*) into v_n from comp_competency_evidence where assessment_id = v_comp_id;
  perform comp_compute_competency_profile(v_comp_id);
  select count(*) into v_n2 from comp_competency_evidence where assessment_id = v_comp_id;
  if v_n <> v_n2 or v_n <> 8 then
    raise exception 'ASSERTION FAILED: expected exactly 8 evidence rows on both runs (tech 4 + behav 2 + meets 1 + gap 1 + empty 0), got % then %', v_n, v_n2;
  end if;

  select count(*) into v_n from comp_competency_scores where assessment_id = v_comp_id;
  if v_n <> 5 then
    raise exception 'ASSERTION FAILED: expected one score row per required competency (5), got %', v_n;
  end if;

  -- ---- Traceability ----
  select count(*) into v_n
  from comp_competency_evidence e
  where e.assessment_id = v_comp_id and e.source_type = 'TECHNICAL_CATEGORY'
    and not exists (
      select 1 from comp_assessments a, comp_question_bank qb
      where a.id = v_comp_id and a.selected_question_ids ? e.source_item_id and qb.id::text = e.source_item_id and qb.category = e.source_ref
    );
  if v_n <> 0 then
    raise exception 'ASSERTION FAILED: % technical evidence row(s) do not trace back to a selected bank question of that category', v_n;
  end if;

  if exists (select 1 from comp_competency_evidence where assessment_id = v_comp_id and source_item_id = v_q3::text) then
    raise exception 'ASSERTION FAILED: unscored question q3 produced evidence (lack of evidence must not become a zero)';
  end if;

  select * into v_ev from comp_competency_evidence where assessment_id = v_comp_id and source_item_id = v_q1::text;
  if v_ev.normalized_score <> 100 or v_ev.raw_value ->> 'scoreOrigin' <> 'PANEL_AVERAGE'
     or (v_ev.raw_value ->> 'panelistCount')::int <> 2 or (v_ev.raw_value ->> 'score')::numeric <> 5 or v_ev.effective_weight <> 1.5 then
    raise exception 'ASSERTION FAILED: q1 should be the rounded panel average 5 (100, 2 panelists, eff 1.5), got % / %', v_ev.normalized_score, v_ev.raw_value;
  end if;

  select * into v_ev from comp_competency_evidence where assessment_id = v_comp_id and source_item_id = v_q2::text;
  if v_ev.normalized_score <> 40 or v_ev.raw_value ->> 'scoreOrigin' <> 'LEAD_ENTRY' or v_ev.raw_value ->> 'candidateAnswer' <> 'smoke answer' then
    raise exception 'ASSERTION FAILED: q2 should fall back to the lead entry 2 (40) ignoring the unsubmitted panelist, got % / %', v_ev.normalized_score, v_ev.raw_value;
  end if;

  if not exists (select 1 from comp_competency_evidence where assessment_id = v_comp_id and competency_id = v_c_behav
                 and source_type = 'PERSONALITY_DIMENSION' and source_item_id = v_ds_leadership::text and normalized_score = 70) then
    raise exception 'ASSERTION FAILED: LEADERSHIP evidence does not trace back to its personality_dimension_scores row';
  end if;

  if not exists (select 1 from comp_competency_evidence where assessment_id = v_comp_id and competency_id = v_c_behav
                 and source_type = 'SJT' and source_item_id = v_sjt_q::text and normalized_score = 100 and raw_value ->> 'selectedOption' = v_sjt_opt) then
    raise exception 'ASSERTION FAILED: SJT evidence does not trace back to the answered SJT question/option';
  end if;

  if not exists (select 1 from comp_competency_evidence where assessment_id = v_comp_id and competency_id = v_c_tech
                 and source_type = 'STRUCTURED_INTERVIEW' and source_item_id = v_admin::text and normalized_score = 75) then
    raise exception 'ASSERTION FAILED: interview evidence does not trace back to its rater';
  end if;

  if exists (select 1 from comp_competency_evidence where assessment_id = v_comp_id and source_ref in ('certifications', 'extraversion', 'years_pipeline')) then
    raise exception 'ASSERTION FAILED: blank certifications / null pipeline years / unconfigured trait produced evidence';
  end if;

  select count(*) into v_n
  from (
    select e.competency_id, e.source_type, e.source_ref, sum(e.effective_weight) as w
    from comp_competency_evidence e where e.assessment_id = v_comp_id group by 1, 2, 3
  ) g
  join comp_competency_evidence_sources s on s.competency_id = g.competency_id and s.source_type = g.source_type and s.source_ref = g.source_ref
  where abs(g.w - s.weight) > 0.000001;
  if v_n <> 0 then
    raise exception 'ASSERTION FAILED: % source(s) whose split effective weights do not sum back to the configured weight', v_n;
  end if;

  -- ---- Competency Engine roll-up ----
  select * into v_row from comp_competency_scores where assessment_id = v_comp_id and competency_id = v_c_tech;
  if v_row.actual_score <> 65 or v_row.actual_level <> 3.6 or v_row.gap <> 0.4 or v_row.status <> 'CRITICAL_GAP'
     or v_row.coverage <> 0.8333 or v_row.evidence_count <> 4 or v_row.source_types_covered <> 3 or v_row.confidence <> 'HIGH' or v_row.level_count <> 5 then
    raise exception 'ASSERTION FAILED (tech): expected 65 / 3.6 / gap 0.4 / CRITICAL_GAP / cov 0.8333 / 4 items / 3 types / HIGH, got % / % / % / % / % / % / % / %',
      v_row.actual_score, v_row.actual_level, v_row.gap, v_row.status, v_row.coverage, v_row.evidence_count, v_row.source_types_covered, v_row.confidence;
  end if;

  select * into v_row from comp_competency_scores where assessment_id = v_comp_id and competency_id = v_c_behav;
  if v_row.actual_score <> 80 or v_row.actual_level <> 4.2 or v_row.gap <> -1.2 or v_row.status <> 'EXCEEDS'
     or v_row.coverage <> 0.75 or v_row.confidence <> 'MEDIUM' then
    raise exception 'ASSERTION FAILED (behav): expected 80 / 4.2 / gap -1.2 / EXCEEDS / cov 0.75 / MEDIUM, got % / % / % / % / % / %',
      v_row.actual_score, v_row.actual_level, v_row.gap, v_row.status, v_row.coverage, v_row.confidence;
  end if;

  select * into v_row from comp_competency_scores where assessment_id = v_comp_id and competency_id = v_c_meets;
  if v_row.actual_score <> 50 or v_row.actual_level <> 3 or v_row.gap <> 0 or v_row.status <> 'MEETS' or v_row.confidence <> 'LOW' then
    raise exception 'ASSERTION FAILED (meets): expected 50 / 3.0 / gap 0 / MEETS / LOW, got % / % / % / % / %',
      v_row.actual_score, v_row.actual_level, v_row.gap, v_row.status, v_row.confidence;
  end if;

  select * into v_row from comp_competency_scores where assessment_id = v_comp_id and competency_id = v_c_gap;
  if v_row.actual_score <> 40 or v_row.actual_level <> 2.6 or v_row.gap <> 1.4 or v_row.status <> 'GAP' or v_row.confidence <> 'LOW' then
    raise exception 'ASSERTION FAILED (gap): expected 40 / 2.6 / gap 1.4 / GAP (not critical) / LOW, got % / % / % / % / %',
      v_row.actual_score, v_row.actual_level, v_row.gap, v_row.status, v_row.confidence;
  end if;

  select * into v_row from comp_competency_scores where assessment_id = v_comp_id and competency_id = v_c_empty;
  if v_row.status <> 'INSUFFICIENT_EVIDENCE' or v_row.confidence <> 'NONE' or v_row.actual_score is not null
     or v_row.actual_level is not null or v_row.gap is not null or v_row.evidence_count <> 0 or v_row.coverage <> 0 then
    raise exception 'ASSERTION FAILED (empty): a critical competency with no evidence must be INSUFFICIENT_EVIDENCE/NONE with null score/level/gap, got % / % / % / % / %',
      v_row.status, v_row.confidence, v_row.actual_score, v_row.actual_level, v_row.gap;
  end if;

  if not exists (select 1 from comp_audit_log where action = 'COMPETENCY_PROFILE_COMPUTED' and entity_id = v_comp_id and actor = v_admin
                 and (new_value ->> 'competencies')::int = 5) then
    raise exception 'ASSERTION FAILED: expected a COMPETENCY_PROFILE_COMPUTED audit entry attributed to the caller';
  end if;

  -- ---- Exam design exclusion (Section 50) ----
  update comp_assessments set needs_technical_assessment = false, needs_structured_interview = false where id = v_comp_id;
  perform comp_compute_competency_profile(v_comp_id);

  if exists (select 1 from comp_competency_evidence where assessment_id = v_comp_id
             and source_type in ('TECHNICAL_CATEGORY', 'STRUCTURED_INTERVIEW')) then
    raise exception 'ASSERTION FAILED (design): technical/interview evidence collected although neither method is in the exam design';
  end if;

  select * into v_row from comp_competency_scores where assessment_id = v_comp_id and competency_id = v_c_tech;
  if v_row.actual_score <> 40 or v_row.actual_level <> 2.6 or v_row.status <> 'CRITICAL_GAP' or v_row.coverage <> 0.5
     or v_row.evidence_count <> 1 or v_row.confidence <> 'LOW' then
    raise exception 'ASSERTION FAILED (design/tech): expected 40 / 2.6 / CRITICAL_GAP / cov 0.5 (excluded methods out of the denominator) / 1 item / LOW, got % / % / % / % / % / %',
      v_row.actual_score, v_row.actual_level, v_row.status, v_row.coverage, v_row.evidence_count, v_row.confidence;
  end if;

  select * into v_row from comp_competency_scores where assessment_id = v_comp_id and competency_id = v_c_behav;
  if v_row.actual_score <> 80 or v_row.coverage <> 1 or v_row.confidence <> 'MEDIUM' or v_row.status <> 'EXCEEDS' then
    raise exception 'ASSERTION FAILED (design/behav): an interview left out by design must not count against coverage — expected 80 / cov 1 / MEDIUM / EXCEEDS, got % / % / % / %',
      v_row.actual_score, v_row.coverage, v_row.confidence, v_row.status;
  end if;

  select * into v_row from comp_competency_scores where assessment_id = v_comp_id and competency_id = v_c_empty;
  if v_row.status <> 'INSUFFICIENT_EVIDENCE' or v_row.confidence <> 'NONE' or v_row.coverage <> 0 or v_row.gap is not null then
    raise exception 'ASSERTION FAILED (design/empty): expected INSUFFICIENT_EVIDENCE / NONE / cov 0 / null gap, got % / % / % / %',
      v_row.status, v_row.confidence, v_row.coverage, v_row.gap;
  end if;

  if not exists (select 1 from comp_audit_log where action = 'COMPETENCY_PROFILE_COMPUTED' and entity_id = v_comp_id
                 and new_value -> 'excludedByDesign' ? 'TECHNICAL_CATEGORY' and new_value -> 'excludedByDesign' ? 'STRUCTURED_INTERVIEW'
                 and not (new_value -> 'excludedByDesign' ? 'SJT')) then
    raise exception 'ASSERTION FAILED (design): audit entry does not record exactly which methods were excluded by design';
  end if;

  update comp_assessments set needs_personality_assessment = false, includes_experience = false where id = v_comp_id;
  perform comp_compute_competency_profile(v_comp_id);

  select count(*) into v_n from comp_competency_evidence where assessment_id = v_comp_id;
  select count(*) into v_n2 from comp_competency_scores
  where assessment_id = v_comp_id and status = 'INSUFFICIENT_EVIDENCE' and confidence = 'NONE' and coverage = 0
    and actual_score is null and gap is null;
  if v_n <> 0 or v_n2 <> 5 then
    raise exception 'ASSERTION FAILED (design/all-off): expected 0 evidence rows and 5 INSUFFICIENT_EVIDENCE/NONE competencies, got % / %', v_n, v_n2;
  end if;

  raise notice 'competency_engine_smoke_test: ALL ASSERTIONS PASSED';

  -- ---- Cleanup (success path) ----
  delete from comp_audit_log where entity_id = v_comp_id and action = 'COMPETENCY_PROFILE_COMPUTED';
  delete from comp_assessments where id = v_comp_id;
  delete from comp_competencies where key in ('__smoke_tech__', '__smoke_behav__', '__smoke_meets__', '__smoke_gap__', '__smoke_empty__');
  delete from comp_job_role_config where job_role = v_role;

exception when others then
  -- Clean up even on assertion failure, then re-raise so the caller still sees the failure.
  delete from comp_audit_log where entity_id = v_comp_id and action = 'COMPETENCY_PROFILE_COMPUTED';
  delete from comp_assessments where candidate_name = '__smoke_test_competency__';
  delete from comp_competencies where key in ('__smoke_tech__', '__smoke_behav__', '__smoke_meets__', '__smoke_gap__', '__smoke_empty__');
  delete from comp_job_role_config where job_role = '__smoke_competency_role__';
  raise;
end $$;
