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
--
-- Section 51 additions:
--   comp_get_competency_evidence_detail — shape (competency/requirement/score/design/sources/evidence),
--     contributions summing back to the competency score (65), q1 drilling down to its bank question with
--     exactly the 2 SUBMITTED panel ratings and no reference answer, interview → rater rating + notes,
--     experience → recorded years, SJT items gated by personality_can_access_assessment, an empty
--     competency listing its configured sources with no evidence, and an outsider refused ('forbidden').
--   Default blueprint auto-apply — a candidate created without a blueprint gets the role's active default
--     (flags + blueprint_id + audit entry); a later comp_set_exam_design is never overridden; an explicit
--     blueprint_id at insert is kept as given; an inactive default is never applied.
--
-- Section 52 additions (Phase 5 — development plans + reassessment), on the same throwaway candidate
-- with its full design restored (tech CRITICAL_GAP 3.6/4, gap GAP 2.6/4, behav EXCEEDS, meets MEETS,
-- empty INSUFFICIENT_EVIDENCE):
--   comp_seed_development_plan — a DRAFT plan; exactly one GAP_ENGINE development action for each of
--     tech (HIGH, due +60, current 3.6 → target 4) and gap (MEDIUM since gap 1.4 ≥ 1, due +90), exactly
--     one EVIDENCE_COLLECTION action for empty (never a training action), nothing for behav/meets; the
--     cached AI analysis' 3 training_recommendations merged as source=AI (the one naming __smoke_gap__
--     linked to it, the one naming the INSUFFICIENT_EVIDENCE __smoke_empty__ left unlinked, the general
--     one unlinked); re-seeding adds nothing (idempotent); DONE stamps completed_at; an outsider is
--     refused by the RPC and sees / writes nothing through RLS; audit entry.
--   comp_create_reassessment — linked via previous_assessment_id, candidate/profile fields copied, the
--     PREVIOUS design copied even though the role now has an active default blueprint (the default-
--     blueprint trigger leaves reassessments alone), fresh answers/tokens, idempotent, outsider refused.
--   comp_get_reassessment_comparison — with years_total 15 and interview ratings on the reassessment:
--     tech 3.6 → 5.0 (+1.4, CLOSED, 1 of 1 actions DONE), gap 2.6 → 5.0 (+2.4, CLOSED, 2 actions),
--     behav/meets → INSUFFICIENT_EVIDENCE = UNKNOWN with null delta (never "declined"), empty
--     INSUFFICIENT_EVIDENCE → CRITICAL_GAP 2.0 = GAP_IDENTIFIED; summary gapsBefore 2 / gapsAfter 1 /
--     closed 2 / improved 2 / declined 0; outsider refused.

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
  v_num numeric;
  v_detail jsonb;
  v_json jsonb;
  v_outsider uuid;
  v_bp_default uuid;
  v_bp_other uuid;
  v_comp_bp uuid;
  v_comp_bp2 uuid;
  v_comp_bp3 uuid;
  v_assessment comp_assessments%rowtype;
  v_seed jsonb;
  v_plan_id uuid;
  v_act comp_development_actions%rowtype;
  v_outsider2 uuid;
  v_re uuid;
  v_re2 uuid;
  v_cmp jsonb;
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

  -- ---- Evidence drill-down RPC (Section 51): shape + traceability ----
  v_detail := comp_get_competency_evidence_detail(v_comp_id, v_c_tech);
  if not (v_detail ?& array['assessmentId', 'competency', 'requirement', 'score', 'design', 'sources', 'evidence', 'personalityItemsVisible']) then
    raise exception 'ASSERTION FAILED (detail): missing top-level keys, got %', (select jsonb_agg(k) from jsonb_object_keys(v_detail) k);
  end if;
  if v_detail -> 'competency' ->> 'key' <> '__smoke_tech__' or (v_detail -> 'requirement' ->> 'requiredLevel')::numeric <> 4
     or (v_detail -> 'requirement' ->> 'isCritical')::boolean is not true or v_detail -> 'score' ->> 'status' <> 'CRITICAL_GAP'
     or (v_detail -> 'score' ->> 'actualLevel')::numeric <> 3.6 then
    raise exception 'ASSERTION FAILED (detail): competency/requirement/score block does not match the engine row, got % / % / %',
      v_detail -> 'competency', v_detail -> 'requirement', v_detail -> 'score';
  end if;
  if jsonb_array_length(v_detail -> 'evidence') <> 4 or jsonb_array_length(v_detail -> 'sources') <> 4
     or exists (select 1 from jsonb_array_elements(v_detail -> 'sources') s where (s ->> 'excludedByDesign')::boolean) then
    raise exception 'ASSERTION FAILED (detail): expected 4 evidence rows and 4 configured sources (none excluded), got % / %',
      jsonb_array_length(v_detail -> 'evidence'), v_detail -> 'sources';
  end if;
  -- Contributions must add back up to the competency score (65) — the drill-down explains the number.
  select sum((e ->> 'contribution')::numeric) into v_num from jsonb_array_elements(v_detail -> 'evidence') e;
  if abs(v_num - 65) > 0.05 then
    raise exception 'ASSERTION FAILED (detail): evidence contributions sum to %, expected the competency score 65', v_num;
  end if;
  select e into v_json from jsonb_array_elements(v_detail -> 'evidence') e where e ->> 'sourceItemId' = v_q1::text;
  if v_json -> 'items' -> 0 ->> 'kind' <> 'TECHNICAL_QUESTION' or v_json -> 'items' -> 0 ->> 'questionId' <> v_q1::text
     or jsonb_array_length(v_json -> 'items' -> 0 -> 'ratings') <> 2
     or (v_json -> 'items' -> 0 ->> 'leadScore')::numeric <> 1
     or v_json -> 'items' -> 0 ? 'referenceAnswer' or v_json -> 'items' -> 0 ? 'reference_answer' then
    raise exception 'ASSERTION FAILED (detail): q1 should drill down to its bank question with exactly the 2 SUBMITTED panel ratings, the lead score and no reference answer, got %', v_json;
  end if;
  select e into v_json from jsonb_array_elements(v_detail -> 'evidence') e where e ->> 'sourceType' = 'STRUCTURED_INTERVIEW';
  if (v_json -> 'items' -> 0 ->> 'rating')::numeric <> 4 or v_json -> 'items' -> 0 ->> 'notes' <> 'smoke interview'
     or v_json -> 'items' -> 0 ->> 'raterId' <> v_admin::text then
    raise exception 'ASSERTION FAILED (detail): interview evidence should drill down to the rater''s rating + notes, got %', v_json;
  end if;
  select e into v_json from jsonb_array_elements(v_detail -> 'evidence') e where e ->> 'sourceRef' = 'years_total';
  if v_json -> 'items' -> 0 ->> 'kind' <> 'EXPERIENCE' or (v_json -> 'items' -> 0 ->> 'yearsExperienceTotal')::numeric <> 6 then
    raise exception 'ASSERTION FAILED (detail): experience evidence should drill down to the recorded experience, got %', v_json;
  end if;

  v_detail := comp_get_competency_evidence_detail(v_comp_id, v_c_behav);
  select e into v_json from jsonb_array_elements(v_detail -> 'evidence') e where e ->> 'sourceType' = 'SJT';
  if (v_json ->> 'itemsRestricted')::boolean is distinct from not personality_can_access_assessment(v_pa_id) then
    raise exception 'ASSERTION FAILED (detail): SJT itemsRestricted must mirror personality_can_access_assessment, got %', v_json ->> 'itemsRestricted';
  end if;
  if personality_can_access_assessment(v_pa_id) and not exists (
    select 1 from jsonb_array_elements(v_json -> 'items' -> 0 -> 'options') o where (o ->> 'chosen')::boolean and o ->> 'key' = v_sjt_opt
  ) then
    raise exception 'ASSERTION FAILED (detail): SJT evidence should drill down to the question with the chosen option marked, got %', v_json;
  end if;

  v_detail := comp_get_competency_evidence_detail(v_comp_id, v_c_empty);
  if jsonb_array_length(v_detail -> 'evidence') <> 0 or v_detail -> 'score' ->> 'status' <> 'INSUFFICIENT_EVIDENCE'
     or jsonb_array_length(v_detail -> 'sources') <> 2 then
    raise exception 'ASSERTION FAILED (detail/empty): expected no evidence, INSUFFICIENT_EVIDENCE and both configured sources listed, got %', v_detail;
  end if;

  -- Access guard: a user who is neither creator, panelist nor module admin must be refused.
  select p.id into v_outsider
  from profiles p
  where not coalesce(p.is_admin, false)
    and not exists (select 1 from comp_module_admins m where m.user_id = p.id)
    and not exists (select 1 from comp_panelists cp where cp.assessment_id = v_comp_id and cp.user_id = p.id)
  order by p.created_at
  limit 1;
  if v_outsider is null then
    raise notice 'competency_engine_smoke_test: no non-admin profile available — evidence-detail access-guard check skipped';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
    begin
      perform comp_get_competency_evidence_detail(v_comp_id, v_c_tech);
      raise exception 'ASSERTION FAILED (detail): an outsider could read the evidence drill-down';
    exception when others then
      if sqlerrm <> 'forbidden' then
        raise;
      end if;
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
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

  -- ---- Default blueprint auto-apply on creation (Section 51) ----
  insert into comp_assessment_blueprints (job_role, title, is_default, active, includes_technical, includes_personality, includes_structured_interview, includes_experience)
  values (v_role, '__smoke_default_bp__', true, true, false, true, true, false)
  returning id into v_bp_default;
  insert into comp_assessment_blueprints (job_role, title, is_default, active, includes_technical, includes_personality, includes_structured_interview, includes_experience)
  values (v_role, '__smoke_other_bp__', false, true, true, false, false, true)
  returning id into v_bp_other;

  -- Created without a blueprint → the role's active default is applied (overriding the column defaults).
  insert into comp_assessments (job_role, candidate_name, candidate_position, candidate_national_id, candidate_phone, candidate_email, created_by)
  values (v_role, '__smoke_test_competency_bp__', 'test', '0000000010', '09120000010', 'smoke-bp@example.com', v_admin)
  returning id into v_comp_bp;
  select * into v_assessment from comp_assessments where id = v_comp_bp;
  if v_assessment.blueprint_id is distinct from v_bp_default or v_assessment.needs_technical_assessment or not v_assessment.needs_personality_assessment
     or not v_assessment.needs_structured_interview or v_assessment.includes_experience then
    raise exception 'ASSERTION FAILED (blueprint): default blueprint not auto-applied on creation, got bp % / tech % / pers % / int % / exp %',
      v_assessment.blueprint_id, v_assessment.needs_technical_assessment, v_assessment.needs_personality_assessment,
      v_assessment.needs_structured_interview, v_assessment.includes_experience;
  end if;
  if not exists (select 1 from comp_audit_log where action = 'EXAM_DESIGN_DEFAULT_BLUEPRINT_APPLIED' and entity_id = v_comp_bp
                 and new_value ->> 'blueprintId' = v_bp_default::text and (new_value ->> 'blueprintVersion')::int = 1) then
    raise exception 'ASSERTION FAILED (blueprint): auto-apply did not write an audit entry recording the blueprint version';
  end if;

  -- A later explicit design is never overridden (neither by the trigger nor by an unrelated update).
  perform comp_set_exam_design(v_comp_bp, false, true, false, true);
  update comp_assessments set candidate_position = 'test 2' where id = v_comp_bp;
  select * into v_assessment from comp_assessments where id = v_comp_bp;
  if not v_assessment.needs_technical_assessment or v_assessment.needs_personality_assessment
     or v_assessment.needs_structured_interview or not v_assessment.includes_experience or v_assessment.blueprint_id is distinct from v_bp_default then
    raise exception 'ASSERTION FAILED (blueprint): explicit design after creation was overridden, got tech % / pers % / int % / exp % / bp %',
      v_assessment.needs_technical_assessment, v_assessment.needs_personality_assessment, v_assessment.needs_structured_interview,
      v_assessment.includes_experience, v_assessment.blueprint_id;
  end if;

  -- An insert that names its own blueprint is left exactly as given.
  insert into comp_assessments (job_role, candidate_name, candidate_position, candidate_national_id, candidate_phone, candidate_email, created_by,
    blueprint_id, needs_technical_assessment, needs_personality_assessment, needs_structured_interview, includes_experience)
  values (v_role, '__smoke_test_competency_bp2__', 'test', '0000000011', '09120000011', 'smoke-bp2@example.com', v_admin,
    v_bp_other, true, false, false, true)
  returning id into v_comp_bp2;
  select * into v_assessment from comp_assessments where id = v_comp_bp2;
  if v_assessment.blueprint_id is distinct from v_bp_other or not v_assessment.needs_technical_assessment or v_assessment.needs_personality_assessment
     or v_assessment.needs_structured_interview or not v_assessment.includes_experience
     or exists (select 1 from comp_audit_log where action = 'EXAM_DESIGN_DEFAULT_BLUEPRINT_APPLIED' and entity_id = v_comp_bp2) then
    raise exception 'ASSERTION FAILED (blueprint): an explicit blueprint_id at creation was overridden by the default';
  end if;

  -- No active default for the role → nothing applied, column defaults kept.
  update comp_assessment_blueprints set active = false where id = v_bp_default;
  insert into comp_assessments (job_role, candidate_name, candidate_position, candidate_national_id, candidate_phone, candidate_email, created_by)
  values (v_role, '__smoke_test_competency_bp3__', 'test', '0000000012', '09120000012', 'smoke-bp3@example.com', v_admin)
  returning id into v_comp_bp3;
  select * into v_assessment from comp_assessments where id = v_comp_bp3;
  if v_assessment.blueprint_id is not null or not v_assessment.needs_technical_assessment or v_assessment.needs_personality_assessment then
    raise exception 'ASSERTION FAILED (blueprint): an inactive default blueprint must not be applied, got bp %', v_assessment.blueprint_id;
  end if;

  -- ---- Development plan seeding (Section 52) ----
  update comp_assessments
  set needs_technical_assessment = true, needs_personality_assessment = true, needs_structured_interview = true, includes_experience = true
  where id = v_comp_id;
  perform comp_compute_competency_profile(v_comp_id);
  select count(*) into v_n from comp_competency_scores where assessment_id = v_comp_id and (
    (competency_id = v_c_tech and status = 'CRITICAL_GAP') or (competency_id = v_c_gap and status = 'GAP')
    or (competency_id = v_c_behav and status = 'EXCEEDS') or (competency_id = v_c_meets and status = 'MEETS')
    or (competency_id = v_c_empty and status = 'INSUFFICIENT_EVIDENCE'));
  if v_n <> 5 then
    raise exception 'ASSERTION FAILED (idp setup): restoring the full design should restore the five original statuses, got % matching', v_n;
  end if;

  insert into comp_candidate_ai_analysis (assessment_id, model, analysis, generated_by)
  values (v_comp_id, 'smoke', jsonb_build_object('training_recommendations', jsonb_build_array(
    'دوره تخصصی برای __smoke_gap__ و کارگاه عملی',
    'دوره عمومی مدیریت زمان',
    'بازبینی __smoke_empty__ در مصاحبه بعدی',
    '   ')), v_admin);

  v_seed := comp_seed_development_plan(v_comp_id);
  v_plan_id := (v_seed ->> 'planId')::uuid;
  if not (v_seed ->> 'created')::boolean or (v_seed ->> 'gapActions')::int <> 2 or (v_seed ->> 'evidenceActions')::int <> 1
     or (v_seed ->> 'aiActions')::int <> 3 then
    raise exception 'ASSERTION FAILED (idp seed): expected created / 2 gap / 1 evidence / 3 AI actions, got %', v_seed;
  end if;
  if not exists (select 1 from comp_development_plans where id = v_plan_id and assessment_id = v_comp_id and status = 'DRAFT' and owner_id = v_admin) then
    raise exception 'ASSERTION FAILED (idp seed): expected a DRAFT plan owned by the caller';
  end if;

  select * into v_act from comp_development_actions where plan_id = v_plan_id and competency_id = v_c_tech;
  if v_act.source <> 'GAP_ENGINE' or v_act.action_type <> 'TRAINING' or v_act.priority <> 'HIGH' or v_act.current_level <> 3.6
     or v_act.target_level <> 4 or v_act.due_date <> current_date + 60 or v_act.status <> 'NOT_STARTED' or v_act.sort_order <> 1 then
    raise exception 'ASSERTION FAILED (idp seed/tech): expected GAP_ENGINE TRAINING HIGH 3.6→4 due +60, first in order, got % % % % % % %',
      v_act.source, v_act.action_type, v_act.priority, v_act.current_level, v_act.target_level, v_act.due_date, v_act.sort_order;
  end if;
  select * into v_act from comp_development_actions where plan_id = v_plan_id and competency_id = v_c_gap and source = 'GAP_ENGINE';
  if v_act.priority <> 'MEDIUM' or v_act.current_level <> 2.6 or v_act.target_level <> 4 or v_act.due_date <> current_date + 90 then
    raise exception 'ASSERTION FAILED (idp seed/gap): expected MEDIUM 2.6→4 due +90, got % % % %', v_act.priority, v_act.current_level, v_act.target_level, v_act.due_date;
  end if;
  select count(*) into v_n from comp_development_actions where plan_id = v_plan_id and competency_id = v_c_empty;
  select * into v_act from comp_development_actions where plan_id = v_plan_id and competency_id = v_c_empty;
  if v_n <> 1 or v_act.action_type <> 'EVIDENCE_COLLECTION' or v_act.current_level is not null or v_act.target_level is not null or v_act.priority <> 'HIGH' then
    raise exception 'ASSERTION FAILED (idp seed/empty): INSUFFICIENT_EVIDENCE must get exactly one EVIDENCE_COLLECTION action (no levels), got % rows / % / %', v_n, v_act.action_type, v_act.current_level;
  end if;
  if exists (select 1 from comp_development_actions where plan_id = v_plan_id and competency_id in (v_c_behav, v_c_meets)) then
    raise exception 'ASSERTION FAILED (idp seed): MEETS/EXCEEDS competencies must not get development actions';
  end if;
  select count(*) into v_n from comp_development_actions where plan_id = v_plan_id and source = 'AI';
  select count(*) into v_n2 from comp_development_actions where plan_id = v_plan_id and source = 'AI' and competency_id = v_c_gap
    and description like '%\_\_smoke\_gap\_\_%';
  if v_n <> 3 or v_n2 <> 1
     or exists (select 1 from comp_development_actions where plan_id = v_plan_id and source = 'AI' and competency_id is not null and competency_id <> v_c_gap) then
    raise exception 'ASSERTION FAILED (idp seed/AI): expected 3 AI actions, only the __smoke_gap__ one linked (never to the INSUFFICIENT_EVIDENCE competency), got % / %', v_n, v_n2;
  end if;
  if not exists (select 1 from comp_audit_log where action = 'DEVELOPMENT_PLAN_SEEDED' and entity_id = v_comp_id and actor = v_admin
                 and new_value ->> 'planId' = v_plan_id::text) then
    raise exception 'ASSERTION FAILED (idp seed): missing DEVELOPMENT_PLAN_SEEDED audit entry';
  end if;

  -- Idempotent: a second seed finds the same plan and adds nothing.
  v_seed := comp_seed_development_plan(v_comp_id);
  select count(*) into v_n from comp_development_actions where plan_id = v_plan_id;
  if (v_seed ->> 'planId')::uuid <> v_plan_id or (v_seed ->> 'created')::boolean or v_n <> 6
     or (v_seed ->> 'gapActions')::int + (v_seed ->> 'evidenceActions')::int + (v_seed ->> 'aiActions')::int <> 0 then
    raise exception 'ASSERTION FAILED (idp seed): re-seeding must be idempotent (same plan, still 6 actions), got % / %', v_seed, v_n;
  end if;

  update comp_development_actions set status = 'DONE', progress_note = 'smoke done' where plan_id = v_plan_id and competency_id = v_c_tech;
  if not exists (select 1 from comp_development_actions where plan_id = v_plan_id and competency_id = v_c_tech and completed_at is not null) then
    raise exception 'ASSERTION FAILED (idp): marking an action DONE must stamp completed_at';
  end if;

  -- Access guards: an outsider (not creator/panelist/module admin/designer) is refused by the RPCs and
  -- sees/writes nothing through RLS.
  select p.id into v_outsider2
  from profiles p
  where not coalesce(p.is_admin, false)
    and not exists (select 1 from comp_module_admins m where m.user_id = p.id)
    and not exists (select 1 from comp_panelists cp where cp.assessment_id = v_comp_id and cp.user_id = p.id)
    and not rasta_has_permission(p.id, 'competency', 'configure')
  order by p.created_at
  limit 1;
  if v_outsider2 is null then
    raise notice 'competency_engine_smoke_test: no outsider profile available — IDP/reassessment access-guard checks skipped';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_outsider2, 'role', 'authenticated')::text, true);
    begin
      perform comp_seed_development_plan(v_comp_id);
      raise exception 'ASSERTION FAILED (idp): an outsider could seed a development plan';
    exception when others then
      if sqlerrm <> 'forbidden' then raise; end if;
    end;
    begin
      perform comp_create_reassessment(v_comp_id);
      raise exception 'ASSERTION FAILED (reassessment): an outsider could create a reassessment';
    exception when others then
      if sqlerrm <> 'forbidden' then raise; end if;
    end;
    execute 'set local role authenticated';
    select count(*) into v_n from comp_development_plans where assessment_id = v_comp_id;
    select count(*) into v_n2 from comp_development_actions where plan_id = v_plan_id;
    if v_n <> 0 or v_n2 <> 0 then
      execute 'reset role';
      raise exception 'ASSERTION FAILED (idp RLS): an outsider can read % plan(s) / % action(s)', v_n, v_n2;
    end if;
    begin
      insert into comp_development_actions (plan_id, title) values (v_plan_id, 'outsider');
      execute 'reset role';
      raise exception 'ASSERTION FAILED (idp RLS): an outsider could insert a development action';
    exception when insufficient_privilege then
      null;
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  end if;

  -- ---- Reassessment (Section 52) ----
  -- The role now has an ACTIVE default blueprint again (tech/exp off) — the reassessment must still copy
  -- the previous design (everything on, no blueprint) instead.
  update comp_assessment_blueprints set active = true where id = v_bp_default;
  -- Section 54 (L-10): a reassessment only follows a finalized assessment.
  update comp_assessments set status = 'completed' where id = v_comp_id;
  v_re := comp_create_reassessment(v_comp_id);
  select * into v_assessment from comp_assessments where id = v_re;
  if v_assessment.previous_assessment_id is distinct from v_comp_id or v_assessment.candidate_name <> '__smoke_test_competency__'
     or v_assessment.job_role <> v_role or v_assessment.candidate_national_id <> '0000000009' or v_assessment.years_experience_total <> 6
     or v_assessment.status <> 'draft' or v_assessment.answers <> '{}'::jsonb or v_assessment.selected_question_ids <> '[]'::jsonb
     or v_assessment.created_by <> v_admin
     or v_assessment.self_service_token = (select self_service_token from comp_assessments where id = v_comp_id) then
    raise exception 'ASSERTION FAILED (reassessment): wrong link / copied identity / fresh state, got prev % name % role % status %',
      v_assessment.previous_assessment_id, v_assessment.candidate_name, v_assessment.job_role, v_assessment.status;
  end if;
  if v_assessment.blueprint_id is not null or not v_assessment.needs_technical_assessment or not v_assessment.needs_personality_assessment
     or not v_assessment.needs_structured_interview or not v_assessment.includes_experience
     or exists (select 1 from comp_audit_log where action = 'EXAM_DESIGN_DEFAULT_BLUEPRINT_APPLIED' and entity_id = v_re) then
    raise exception 'ASSERTION FAILED (reassessment): the previous design must be copied, not the role default, got bp % tech % pers % int % exp %',
      v_assessment.blueprint_id, v_assessment.needs_technical_assessment, v_assessment.needs_personality_assessment,
      v_assessment.needs_structured_interview, v_assessment.includes_experience;
  end if;
  if not exists (select 1 from comp_audit_log where action = 'REASSESSMENT_CREATED' and entity_id = v_re and previous_value ->> 'previousAssessmentId' = v_comp_id::text) then
    raise exception 'ASSERTION FAILED (reassessment): missing REASSESSMENT_CREATED audit entry';
  end if;
  v_re2 := comp_create_reassessment(v_comp_id);
  if v_re2 <> v_re or (select count(*) from comp_assessments where previous_assessment_id = v_comp_id) <> 1 then
    raise exception 'ASSERTION FAILED (reassessment): a second call must return the existing follow-up, got %', v_re2;
  end if;

  -- ---- Reassessment comparison (Section 52) ----
  update comp_assessments set years_experience_total = 15 where id = v_re;
  insert into comp_interview_ratings (assessment_id, competency_id, rater_id, rating, notes) values
    (v_re, v_c_tech, v_admin, 5, 'smoke re tech'),
    (v_re, v_c_empty, v_admin, 2, 'smoke re empty');
  perform comp_compute_competency_profile(v_re);
  v_cmp := comp_get_reassessment_comparison(v_re);
  if v_cmp ->> 'previousAssessmentId' <> v_comp_id::text or jsonb_array_length(v_cmp -> 'competencies') <> 5
     or v_cmp -> 'plan' ->> 'id' <> v_plan_id::text then
    raise exception 'ASSERTION FAILED (comparison): wrong shape, got %', v_cmp;
  end if;
  select c into v_json from jsonb_array_elements(v_cmp -> 'competencies') c where c ->> 'competencyId' = v_c_tech::text;
  if (v_json ->> 'levelDelta')::numeric <> 1.4 or v_json ->> 'gapOutcome' <> 'CLOSED' or v_json -> 'previous' ->> 'status' <> 'CRITICAL_GAP'
     or v_json -> 'current' ->> 'status' <> 'EXCEEDS' or (v_json -> 'actions' ->> 'total')::int <> 1 or (v_json -> 'actions' ->> 'done')::int <> 1
     or (v_json ->> 'scoreDelta')::numeric <> 35 then
    raise exception 'ASSERTION FAILED (comparison/tech): expected 3.6→5.0 (+1.4, +35), CRITICAL_GAP→EXCEEDS, CLOSED, 1/1 actions done, got %', v_json;
  end if;
  select c into v_json from jsonb_array_elements(v_cmp -> 'competencies') c where c ->> 'competencyId' = v_c_gap::text;
  if (v_json ->> 'levelDelta')::numeric <> 2.4 or v_json ->> 'gapOutcome' <> 'CLOSED' or (v_json -> 'actions' ->> 'total')::int <> 2
     or (v_json -> 'actions' ->> 'done')::int <> 0 then
    raise exception 'ASSERTION FAILED (comparison/gap): expected 2.6→5.0 (+2.4), CLOSED, 2 actions / 0 done, got %', v_json;
  end if;
  select c into v_json from jsonb_array_elements(v_cmp -> 'competencies') c where c ->> 'competencyId' = v_c_behav::text;
  if v_json ->> 'gapOutcome' <> 'UNKNOWN' or v_json ->> 'levelDelta' is not null or v_json -> 'current' ->> 'status' <> 'INSUFFICIENT_EVIDENCE' then
    raise exception 'ASSERTION FAILED (comparison/behav): missing evidence now must be UNKNOWN with a null delta, never a decline, got %', v_json;
  end if;
  select c into v_json from jsonb_array_elements(v_cmp -> 'competencies') c where c ->> 'competencyId' = v_c_empty::text;
  if v_json ->> 'gapOutcome' <> 'GAP_IDENTIFIED' or v_json -> 'current' ->> 'status' <> 'CRITICAL_GAP' or (v_json -> 'current' ->> 'actualLevel')::numeric <> 2
     or v_json ->> 'levelDelta' is not null then
    raise exception 'ASSERTION FAILED (comparison/empty): INSUFFICIENT_EVIDENCE → CRITICAL_GAP 2.0 must be GAP_IDENTIFIED with a null delta, got %', v_json;
  end if;
  if (v_cmp -> 'summary' ->> 'gapsBefore')::int <> 2 or (v_cmp -> 'summary' ->> 'gapsAfter')::int <> 1 or (v_cmp -> 'summary' ->> 'closed')::int <> 2
     or (v_cmp -> 'summary' ->> 'improved')::int <> 2 or (v_cmp -> 'summary' ->> 'declined')::int <> 0 or (v_cmp -> 'summary' ->> 'unknown')::int <> 2
     or (v_cmp -> 'summary' ->> 'closedWithDoneActions')::int <> 1 then
    raise exception 'ASSERTION FAILED (comparison): summary mismatch, got %', v_cmp -> 'summary';
  end if;
  if comp_get_reassessment_comparison(v_comp_id) is not null then
    raise exception 'ASSERTION FAILED (comparison): an assessment without a predecessor must return null';
  end if;
  if v_outsider2 is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_outsider2, 'role', 'authenticated')::text, true);
    begin
      perform comp_get_reassessment_comparison(v_re);
      raise exception 'ASSERTION FAILED (comparison): an outsider could read the reassessment comparison';
    exception when others then
      if sqlerrm <> 'forbidden' then raise; end if;
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  end if;

  raise notice 'competency_engine_smoke_test: ALL ASSERTIONS PASSED';

  -- ---- Cleanup (success path) ----
  -- L-7: also the audit rows of the throwaway personality assessments (e.g. PERSONALITY_ASSESSMENT_SCORED).
  delete from comp_audit_log where entity_id in (select id from comp_assessments where candidate_name like '\_\_smoke\_test\_competency%')
    or entity_id in (select pa.id from personality_assessments pa join comp_assessments a on a.id = pa.assessment_id
                     where a.candidate_name like '\_\_smoke\_test\_competency%');
  delete from comp_assessments where candidate_name like '\_\_smoke\_test\_competency%';
  delete from comp_competencies where key in ('__smoke_tech__', '__smoke_behav__', '__smoke_meets__', '__smoke_gap__', '__smoke_empty__');
  delete from comp_job_role_config where job_role = v_role;

exception when others then
  -- Clean up even on assertion failure, then re-raise so the caller still sees the failure.
  -- L-7: also the audit rows of the throwaway personality assessments (e.g. PERSONALITY_ASSESSMENT_SCORED).
  delete from comp_audit_log where entity_id in (select id from comp_assessments where candidate_name like '\_\_smoke\_test\_competency%')
    or entity_id in (select pa.id from personality_assessments pa join comp_assessments a on a.id = pa.assessment_id
                     where a.candidate_name like '\_\_smoke\_test\_competency%');
  delete from comp_assessments where candidate_name like '\_\_smoke\_test\_competency%';
  delete from comp_competencies where key in ('__smoke_tech__', '__smoke_behav__', '__smoke_meets__', '__smoke_gap__', '__smoke_empty__');
  delete from comp_job_role_config where job_role = '__smoke_competency_role__';
  raise;
end $$;

-- ============================================================================
-- Section 53 regressions (docs/demo-test-report.md C-1, M-4, M-6, M-7, M-8, M-9) — a second,
-- independent block with its own throwaway role/competency/candidate, same conventions as above
-- (impersonation via request.jwt.claims + `role`, cleanup on success AND failure).
--   M-8  a TECHNICAL_CATEGORY source with no bank question for the role and nothing scored is left
--        out of the coverage denominator and recorded in unassessable_sources (+ drill-down flag +
--        audit); once a scored item of that category exists it counts again.
--   C-1  comp_set_photo: outsider refused, attachment path refused, own photo path accepted and
--        publicly readable only while it is not an attachment; self-service photo only under the
--        link's own token folder.
--   M-7  self-service submit accepted while pending, refused after 'reviewed' and on a completed
--        assessment.
--   M-4  anon cannot execute comp_log_audit; an authenticated caller cannot log a non-whitelisted
--        action or claim an entity it has no standing on; a whitelisted own entry is accepted.
--   M-6  completed ⇒ panelist sheets, interview ratings, question selection and exam design are
--        frozen and the lead cannot un-complete directly; comp_ensure_competency_profile keeps the
--        stored profile; comp_reopen_assessment unlocks again and clears is_approved.
--   M-9  the question selection cannot change under existing answers except through
--        comp_set_selected_questions with explicit discard, which archives + clears them.
-- ============================================================================
do $$
declare
  v_role constant text := '__smoke_s53_role__';
  v_admin uuid;
  v_out uuid;
  v_p2 uuid;
  v_q1 uuid;
  v_c uuid;
  v_a uuid;
  v_token uuid;
  v_row comp_competency_scores%rowtype;
  v_detail jsonb;
  v_json jsonb;
  v_path text;
  v_n int;
  v_b boolean;
  v_status text;
begin
  select id into v_admin from profiles where is_admin order by created_at limit 1;
  select p.id into v_out from profiles p
  where not coalesce(p.is_admin, false)
    and not exists (select 1 from comp_module_admins m where m.user_id = p.id)
    and not exists (select 1 from personality_module_admins m where m.user_id = p.id)
    and not rasta_has_permission(p.id, 'competency', 'configure')
    and not rasta_has_permission(p.id, 'personality', 'configure')
  order by p.created_at limit 1;
  select id into v_p2 from profiles where id not in (v_admin, coalesce(v_out, v_admin)) order by created_at limit 1;
  select id into v_q1 from comp_question_bank where category = 'TECHNICAL' order by id limit 1;
  if v_admin is null or v_out is null or v_p2 is null or v_q1 is null then
    raise exception 'section 53 smoke precondition failed: need an admin, a plain (outsider) profile, a third profile and a TECHNICAL bank question';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  insert into comp_job_role_config (job_role, label_fa, active, sort_order) values (v_role, '__smoke_s53__', false, 9998);
  insert into comp_competencies (key, label_fa, domain) values ('__smoke_s53_c__', '__smoke_s53_c__', 'TECHNICAL') returning id into v_c;
  insert into comp_competency_evidence_sources (competency_id, source_type, source_ref, weight) values
    (v_c, 'TECHNICAL_CATEGORY', 'TECHNICAL', 2),
    (v_c, 'EXPERIENCE', 'years_total', 1);
  insert into comp_job_competency_requirements (job_role, competency_id, required_level, is_critical, weight) values (v_role, v_c, 4, false, 1);
  insert into comp_assessments (
    job_role, candidate_name, candidate_position, candidate_national_id, candidate_phone, candidate_email, created_by,
    years_experience_total, needs_technical_assessment, needs_personality_assessment, needs_structured_interview, includes_experience
  ) values (
    v_role, '__smoke_test_s53__', 'test', '0000000053', '09120000053', 'smoke-s53@example.com', v_admin,
    6, true, false, true, true
  ) returning id, self_service_token into v_a, v_token;

  -- ---- M-8: no bank question for the role + nothing scored → not assessable ----
  perform comp_compute_competency_profile(v_a);
  select * into v_row from comp_competency_scores where assessment_id = v_a and competency_id = v_c;
  if v_row.coverage <> 1 or v_row.actual_score <> 40 or jsonb_array_length(v_row.unassessable_sources) <> 1
     or v_row.unassessable_sources -> 0 ->> 'sourceRef' <> 'TECHNICAL' or v_row.unassessable_sources -> 0 ->> 'reason' <> 'NO_BANK_QUESTIONS' then
    raise exception 'ASSERTION FAILED (M-8): an unassessable technical source must leave the denominator (coverage 1, score 40) and be recorded, got cov % score % unassessable %',
      v_row.coverage, v_row.actual_score, v_row.unassessable_sources;
  end if;
  v_detail := comp_get_competency_evidence_detail(v_a, v_c);
  select s into v_json from jsonb_array_elements(v_detail -> 'sources') s where s ->> 'sourceType' = 'TECHNICAL_CATEGORY';
  if (v_json ->> 'noBankQuestions')::boolean is distinct from true or jsonb_array_length(v_detail -> 'score' -> 'unassessableSources') <> 1 then
    raise exception 'ASSERTION FAILED (M-8): drill-down must flag the no-bank source, got %', v_json;
  end if;
  if not exists (select 1 from comp_audit_log where entity_id = v_a and action = 'COMPETENCY_PROFILE_COMPUTED'
                 and new_value -> 'noBankQuestionCategories' ? 'TECHNICAL') then
    raise exception 'ASSERTION FAILED (M-8): the audit entry must record the not-assessable category';
  end if;
  -- A scored snapshot item of that category makes the source assessable again (lead score 5 → 100).
  update comp_assessments set selected_question_ids = jsonb_build_array(v_q1), answers = jsonb_build_object(v_q1::text, jsonb_build_object('score', 5)) where id = v_a;
  perform comp_compute_competency_profile(v_a);
  select * into v_row from comp_competency_scores where assessment_id = v_a and competency_id = v_c;
  if v_row.unassessable_sources <> '[]'::jsonb or v_row.actual_score <> 80 or v_row.coverage <> 1 or v_row.evidence_count <> 2 then
    raise exception 'ASSERTION FAILED (M-8): a scored item must make the source count again ((100×2+40)/3 = 80, 2 items), got score % items % unassessable %',
      v_row.actual_score, v_row.evidence_count, v_row.unassessable_sources;
  end if;

  -- ---- C-1: photo paths ----
  v_path := v_a::text || '/' || gen_random_uuid()::text || '.jpg';
  perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform comp_set_photo(v_a, v_path);
    raise exception 'ASSERTION FAILED (C-1): an outsider could set the photo';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into comp_attachments (assessment_id, kind, file_name, storage_path, uploaded_by) values (v_a, 'resume', 'cv.jpg', v_a::text || '/11111111-1111-4111-8111-111111111111.jpg', v_admin);
  perform set_config('role', 'authenticated', true);
  begin
    perform comp_set_photo(v_a, v_a::text || '/11111111-1111-4111-8111-111111111111.jpg');
    raise exception 'ASSERTION FAILED (C-1): an attachment path was accepted as the photo';
  exception when others then
    if sqlerrm <> 'invalid photo path' then raise; end if;
  end;
  begin
    perform comp_set_photo(v_a, '00000000-0000-4000-8000-000000000000/' || gen_random_uuid()::text || '.jpg');
    raise exception 'ASSERTION FAILED (C-1): another assessment''s folder was accepted as the photo';
  exception when others then
    if sqlerrm <> 'invalid photo path' then raise; end if;
  end;
  perform comp_set_photo(v_a, v_path);
  perform set_config('role', 'postgres', true);
  if not comp_is_public_photo(v_path) or comp_is_public_photo(v_a::text || '/11111111-1111-4111-8111-111111111111.jpg') then
    raise exception 'ASSERTION FAILED (C-1): only the current, non-attachment photo may be public';
  end if;
  -- Even a photo_url written directly (bypassing the RPC) never makes a document public.
  update comp_assessments set photo_url = v_a::text || '/11111111-1111-4111-8111-111111111111.jpg' where id = v_a;
  if comp_is_public_photo(v_a::text || '/11111111-1111-4111-8111-111111111111.jpg') then
    raise exception 'ASSERTION FAILED (C-1): an attachment set as photo_url became publicly readable';
  end if;

  -- ---- C-1 / M-7: self-service ----
  update comp_assessments set self_service_status = 'pending' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  perform comp_self_service_set_photo(v_token, v_a::text || '/' || v_token::text || '/' || gen_random_uuid()::text || '.png');
  begin
    perform comp_self_service_set_photo(v_token, v_a::text || '/' || gen_random_uuid()::text || '.png');
    raise exception 'ASSERTION FAILED (C-1): a self-service photo outside the token folder was accepted';
  exception when others then
    if sqlerrm <> 'invalid photo path' then raise; end if;
  end;
  perform comp_self_service_submit(v_token, '__smoke_test_s53__', '0000000053', '0912', 'smoke-s53@example.com', null, 30, false, '', 6, null, 'x', '[]', '[]', '[]', 'p');
  if (select self_service_editable from comp_self_service_get(v_token)) is distinct from true then
    raise exception 'ASSERTION FAILED (M-7): a submitted-but-unreviewed form must still be editable';
  end if;
  perform set_config('role', 'postgres', true);
  update comp_assessments set self_service_status = 'reviewed' where id = v_a;
  perform set_config('role', 'anon', true);
  begin
    perform comp_self_service_submit(v_token, 'x', '', '', '', null, null, false, '', null, null, '', '[]', '[]', '[]', '');
    raise exception 'ASSERTION FAILED (M-7): a reviewed self-service form could be resubmitted';
  exception when others then
    if sqlerrm not like 'self_service_closed%' then raise; end if;
  end;
  if (select self_service_editable from comp_self_service_get(v_token)) is distinct from false then
    raise exception 'ASSERTION FAILED (M-7): comp_self_service_get must report a reviewed form as not editable';
  end if;

  -- ---- M-4: audit log ----
  begin
    perform comp_log_audit('FORGED', 'comp_assessments', v_a, null, '{}'::jsonb);
    raise exception 'ASSERTION FAILED (M-4): anon could execute comp_log_audit';
  exception when insufficient_privilege then
    null;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform comp_log_audit('ASSESSMENT_REOPENED', 'comp_assessments', v_a, null, '{}'::jsonb);
    raise exception 'ASSERTION FAILED (M-4): a client could forge a server-side action';
  exception when others then
    if sqlerrm <> 'audit action not allowed' then raise; end if;
  end;
  begin
    perform comp_log_audit('ASSESSMENT_CREATED', 'comp_assessments', v_a, null, '{}'::jsonb);
    raise exception 'ASSERTION FAILED (M-4): an outsider could log an entry for someone else''s assessment';
  exception when others then
    if sqlerrm <> 'audit action not allowed' then raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform comp_log_audit('ASSESSMENT_CREATED', 'comp_assessments', v_a, null, '{"smoke": true}'::jsonb);
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from comp_audit_log where entity_id = v_a and action = 'ASSESSMENT_CREATED' and actor = v_admin) then
    raise exception 'ASSERTION FAILED (M-4): a whitelisted own entry must be written';
  end if;

  -- ---- M-6: completed = immutable, reopen unlocks ----
  insert into comp_panelists (assessment_id, user_id, is_lead) values (v_a, v_p2, false);
  insert into comp_panelist_scores (assessment_id, panelist_id, answers, submitted_at)
  values (v_a, v_p2, jsonb_build_object(v_q1::text, jsonb_build_object('score', 4)), now());
  insert into comp_interview_ratings (assessment_id, competency_id, rater_id, rating, notes) values (v_a, v_c, v_admin, 3, 'smoke s53');
  perform set_config('role', 'authenticated', true);
  update comp_assessments set status = 'completed', is_approved = true where id = v_a;
  perform comp_log_audit('ASSESSMENT_FINALIZED', 'comp_assessments', v_a, '{"status":"draft"}'::jsonb, '{"status":"completed"}'::jsonb);
  begin
    update comp_interview_ratings set rating = 5 where assessment_id = v_a;
    raise exception 'ASSERTION FAILED (M-6): an interview rating changed on a completed assessment';
  exception when others then
    if sqlerrm not like 'assessment_locked%' then raise; end if;
  end;
  begin
    update comp_assessments set selected_question_ids = '[]'::jsonb where id = v_a;
    raise exception 'ASSERTION FAILED (M-6): the question selection changed on a completed assessment';
  exception when others then
    if sqlerrm not like 'assessment_locked%' then raise; end if;
  end;
  begin
    perform comp_set_exam_design(v_a, true, true, false, true, null);
    raise exception 'ASSERTION FAILED (M-6): the exam design changed on a completed assessment';
  exception when others then
    if sqlerrm not like 'assessment_locked%' then raise; end if;
  end;
  begin
    update comp_assessments set status = 'draft' where id = v_a;
    raise exception 'ASSERTION FAILED (M-6): the lead un-completed the assessment without comp_reopen_assessment';
  exception when others then
    if sqlerrm not like 'assessment_locked%' then raise; end if;
  end;
  update comp_assessments set strengths = 'final review note' where id = v_a; -- the final-review fields stay editable
  if comp_ensure_competency_profile(v_a) then
    raise exception 'ASSERTION FAILED (M-6/N-9): a completed assessment''s stored profile must not be recomputed on load';
  end if;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_p2, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into comp_panelist_scores (assessment_id, panelist_id, answers) values (v_a, v_p2, '{}'::jsonb)
    on conflict (assessment_id, panelist_id) do update set answers = excluded.answers;
    raise exception 'ASSERTION FAILED (M-6): a panelist sheet changed on a completed assessment';
  exception when others then
    if sqlerrm not like 'assessment_locked%' then raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform comp_reopen_assessment(v_a);
  perform set_config('role', 'postgres', true);
  select status, is_approved into v_status, v_b from comp_assessments where id = v_a;
  if v_status <> 'draft' or v_b or exists (select 1 from comp_panelist_scores where assessment_id = v_a and submitted_at is not null) then
    raise exception 'ASSERTION FAILED (M-6/N-10): reopen must return to draft, clear is_approved and every submission, got % / %', v_status, v_b;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_p2, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  update comp_panelist_scores set answers = jsonb_build_object(v_q1::text, jsonb_build_object('score', 3)) where assessment_id = v_a and panelist_id = v_p2;
  get diagnostics v_n = row_count;
  perform set_config('role', 'postgres', true);
  if v_n <> 1 then
    raise exception 'ASSERTION FAILED (M-6): after reopen the panelist must be able to edit their sheet again';
  end if;

  -- ---- M-9: no silent regeneration under existing answers ----
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    update comp_assessments set selected_question_ids = '[]'::jsonb where id = v_a;
    raise exception 'ASSERTION FAILED (M-9): the selection changed under existing answers';
  exception when others then
    if sqlerrm not like 'responses_exist%' then raise; end if;
  end;
  begin
    perform comp_set_selected_questions(v_a, '{}'::uuid[], null, false, false);
    raise exception 'ASSERTION FAILED (M-9): regeneration without explicit discard was accepted';
  exception when others then
    if sqlerrm not like 'responses_exist%' then raise; end if;
  end;
  v_json := comp_set_selected_questions(v_a, '{}'::uuid[], null, false, true);
  perform set_config('role', 'postgres', true);
  if (v_json ->> 'discardedResponses')::boolean is distinct from true
     or exists (select 1 from comp_panelist_scores where assessment_id = v_a and answers ? v_q1::text)
     or (select answers ? v_q1::text from comp_assessments where id = v_a)
     or not exists (select 1 from comp_audit_log where entity_id = v_a and action = 'QUESTION_RESPONSES_DISCARDED'
                    and previous_value -> 'leadAnswers' ? v_q1::text) then
    raise exception 'ASSERTION FAILED (M-9): an explicit discard must archive and clear the old answers, got %', v_json;
  end if;

  raise notice 'competency_engine_smoke_test (section 53): ALL ASSERTIONS PASSED';

  delete from comp_audit_log where entity_id = v_a
    or entity_id in (select pa.id from personality_assessments pa where pa.assessment_id = v_a);
  delete from comp_assessments where id = v_a;
  delete from comp_competencies where key = '__smoke_s53_c__';
  delete from comp_job_role_config where job_role = v_role;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from comp_audit_log where entity_id in (select id from comp_assessments where candidate_name = '__smoke_test_s53__')
    or entity_id in (select pa.id from personality_assessments pa join comp_assessments a on a.id = pa.assessment_id
                     where a.candidate_name = '__smoke_test_s53__');
  delete from comp_assessments where candidate_name = '__smoke_test_s53__';
  delete from comp_competencies where key = '__smoke_s53_c__';
  delete from comp_job_role_config where job_role = '__smoke_s53_role__';
  raise;
end $$;

-- ============================================================================
-- Section 54 regressions (docs/demo-test-report.md N-6, L-6, …) — independent block with its own
-- throwaway assessment, cleaned up (audit rows included) on success AND failure:
--   N-6  removing a judge archives (JUDGE_REMOVED) and deletes their sheet, so it leaves the official
--        average; refused on a completed assessment.
--   L-6  the public results link rounds the panel average like the engine/client and falls back to
--        the lead's score when no submitted sheet scored a question.
--   N-10 a lead's reopen request is recorded; the admin's reopen clears it and the approval.
--   L-10 no reassessment from a non-completed assessment.   L-3 staff uploads carry uploaded_by.
--   N-15 only a module admin may flag demo data; a reassessment inherits the flag.
-- ============================================================================
do $$
declare
  v_admin uuid;
  v_j1 uuid;
  v_j2 uuid;
  v_q1 uuid;
  v_a uuid;
  v_share uuid;
  v_score numeric;
  v_out uuid;
  v_re uuid;
begin
  select id into v_admin from profiles where is_admin order by created_at limit 1;
  select p.id into v_out from profiles p
  where not coalesce(p.is_admin, false)
    and not exists (select 1 from comp_module_admins m where m.user_id = p.id)
    and not rasta_has_permission(p.id, 'competency', 'configure')
  order by p.created_at limit 1;
  select id into v_j1 from profiles where id <> v_admin order by created_at limit 1;
  select id into v_j2 from profiles where id not in (v_admin, v_j1) order by created_at limit 1;
  select id into v_q1 from comp_question_bank where active and approval_status = 'APPROVED' order by id limit 1;
  if v_admin is null or v_out is null or v_j1 is null or v_j2 is null or v_q1 is null then
    raise exception 'section 54 smoke precondition failed: need an admin, a plain profile, two more profiles and an approved bank question';
  end if;

  insert into comp_assessments (job_role, candidate_name, candidate_position, created_by, selected_question_ids, answers)
  values ('project_manager', '__smoke_test_s54__', 'test', v_admin, jsonb_build_array(v_q1), jsonb_build_object(v_q1::text, jsonb_build_object('score', 2)))
  returning id, results_share_token into v_a, v_share;
  insert into comp_panelists (assessment_id, user_id, is_lead, added_by) values (v_a, v_j1, false, v_admin), (v_a, v_j2, false, v_admin);
  insert into comp_panelist_scores (assessment_id, panelist_id, answers, submitted_at) values
    (v_a, v_j1, jsonb_build_object(v_q1::text, jsonb_build_object('score', 4)), now()),
    (v_a, v_j2, jsonb_build_object(v_q1::text, jsonb_build_object('score', 5)), now());

  -- ---- L-6 ----
  select (q ->> 'score')::numeric into v_score from comp_public_results_get(v_share) r, jsonb_array_elements(r.resolved_questions) q;
  if v_score is distinct from 5 then
    raise exception 'ASSERTION FAILED (L-6): public link must round the panel average (4, 5 → 5), got %', v_score;
  end if;

  -- ---- N-6 ----
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  delete from comp_panelists where assessment_id = v_a and user_id = v_j2;
  perform set_config('role', 'postgres', true);
  if exists (select 1 from comp_panelist_scores where assessment_id = v_a and panelist_id = v_j2)
     or not exists (select 1 from comp_audit_log where entity_id = v_a and action = 'JUDGE_REMOVED'
                    and previous_value -> 'sheet' ->> 'panelist_id' = v_j2::text) then
    raise exception 'ASSERTION FAILED (N-6): a removed judge''s sheet must be archived and deleted';
  end if;
  select (q ->> 'score')::numeric into v_score from comp_public_results_get(v_share) r, jsonb_array_elements(r.resolved_questions) q;
  if v_score is distinct from 4 then
    raise exception 'ASSERTION FAILED (N-6): the removed judge must leave the official average (→ 4), got %', v_score;
  end if;
  update comp_panelist_scores set answers = '{}'::jsonb where assessment_id = v_a and panelist_id = v_j1;
  select (q ->> 'score')::numeric into v_score from comp_public_results_get(v_share) r, jsonb_array_elements(r.resolved_questions) q;
  if v_score is distinct from 2 then
    raise exception 'ASSERTION FAILED (L-6): with no scored sheet the lead''s score applies (→ 2), got %', v_score;
  end if;
  update comp_assessments set status = 'completed' where id = v_a;
  perform set_config('role', 'authenticated', true);
  begin
    delete from comp_panelists where assessment_id = v_a and user_id = v_j1;
    raise exception 'ASSERTION FAILED (N-6): a judge with a sheet was removed from a completed assessment';
  exception when others then
    if sqlerrm not like 'assessment_locked%' then raise; end if;
  end;
  perform set_config('role', 'postgres', true);

  -- ---- N-10: reopen request, then reopen clears it and the approval ----
  update comp_assessments set is_approved = true where id = v_a;
  perform set_config('role', 'authenticated', true);
  perform comp_request_reopen(v_a, '__smoke reason__');
  perform set_config('role', 'postgres', true);
  if (select reopen_requested_by from comp_assessments where id = v_a) is distinct from v_admin
     or not exists (select 1 from comp_audit_log where entity_id = v_a and action = 'ASSESSMENT_REOPEN_REQUESTED') then
    raise exception 'ASSERTION FAILED (N-10): the reopen request must be recorded';
  end if;
  perform set_config('role', 'authenticated', true);
  perform comp_reopen_assessment(v_a);
  perform set_config('role', 'postgres', true);
  if exists (select 1 from comp_assessments where id = v_a
             and (status <> 'draft' or is_approved or reopened_at is null or reopen_requested_at is not null)) then
    raise exception 'ASSERTION FAILED (N-10): reopen must clear approval and request and stamp reopened_at';
  end if;

  -- ---- L-10: no reassessment from a non-completed assessment ----
  perform set_config('role', 'authenticated', true);
  begin
    perform comp_create_reassessment(v_a);
    raise exception 'ASSERTION FAILED (L-10): a reassessment was created from a draft';
  exception when others then
    if sqlerrm not like 'assessment_not_completed%' then raise; end if;
  end;

  -- ---- L-3: staff uploads are attributed to the caller ----
  insert into comp_attachments (assessment_id, kind, file_name, storage_path, uploaded_by)
  values (v_a, 'resume', '__smoke__.pdf', v_a::text || '/__smoke__.pdf', v_j1);
  perform set_config('role', 'postgres', true);
  if (select uploaded_by from comp_attachments where assessment_id = v_a and file_name = '__smoke__.pdf') is distinct from v_admin then
    raise exception 'ASSERTION FAILED (L-3): uploaded_by must be the uploading user';
  end if;

  -- ---- N-15: demo flag — only a module admin may set it; a reassessment inherits it ----
  perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into comp_assessments (job_role, candidate_name, candidate_position, created_by, is_demo)
    values ('project_manager', '__smoke_test_s54__', 'test', v_out, true);
    raise exception 'ASSERTION FAILED (N-15): a non-admin created a demo-flagged assessment';
  exception when others then
    if sqlerrm not like 'forbidden%' and sqlerrm not like '%row-level security%' then raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  update comp_assessments set is_demo = true, status = 'completed' where id = v_a;
  perform set_config('role', 'authenticated', true);
  v_re := comp_create_reassessment(v_a);
  perform set_config('role', 'postgres', true);
  if (select is_demo from comp_assessments where id = v_re) is distinct from true then
    raise exception 'ASSERTION FAILED (N-15): a reassessment of a demo assessment must be demo too';
  end if;

  raise notice 'competency_engine_smoke_test (section 54): ALL ASSERTIONS PASSED';

  delete from comp_audit_log where entity_id in (select id from comp_assessments where candidate_name = '__smoke_test_s54__');
  delete from comp_assessments where candidate_name = '__smoke_test_s54__' and previous_assessment_id is not null;
  delete from comp_assessments where candidate_name = '__smoke_test_s54__';

exception when others then
  perform set_config('role', 'postgres', true);
  delete from comp_audit_log where entity_id in (select id from comp_assessments where candidate_name = '__smoke_test_s54__');
  delete from comp_assessments where candidate_name = '__smoke_test_s54__' and previous_assessment_id is not null;
  delete from comp_assessments where candidate_name = '__smoke_test_s54__';
  raise;
end $$;

-- ================================================================================================
-- Section 56 — online technical MCQ test («آزمون تستی»): token isolation, scoring, design-aware
-- evidence, and the completed-assessment lock.
--
-- Same self-contained, re-runnable DO-block convention as the blocks above. Independent throwaway
-- job role/competencies/bank so it can never depend on (or clobber) the seeded MCQ content.
--
-- Setup: role __smoke_mcq_role__, 6 APPROVED+active questions (category TECHNICAL) split into two
-- topics — __smoke_topic_a__ (4 questions, difficulty 1/1/2/2) and __smoke_topic_b__ (2 questions,
-- difficulty 3/3) — plus one PENDING_REVIEW and one inactive question that must never be drawn.
-- Two competencies read TECHNICAL_MCQ: __smoke_mcq__ (source_ref TECHNICAL, weight 2, required
-- level 3, critical) and __smoke_mcq_empty__ (source_ref HSE — no HSE-category MCQ exists for this
-- role at all, so it must come back "not assessable" rather than a zero).
--
-- Candidate #1 (__smoke_test_mcq__, needs_online_mcq true, every other method off): a 6-question
-- test is generated (the whole pool, so drawing is deterministic regardless of randomv order),
-- answered via the token RPCs only (4/4 topic A correct, 1/2 topic B correct) and submitted:
--   score: 6 total / 6 answered / 5 correct / 83.3% overall; topic A 100%, topic B 50%.
--   evidence: exactly 2 comp_competency_evidence rows for __smoke_mcq__ (one per topic), normalized
--     100 / 50, effective weight split by question count (2×4/6=1.3333 / 2×2/6=0.6667, summing to
--     the configured weight 2) — never one row per raw item weighted 1 (M-8's old equal split).
--   roll-up (level_count 5, default proficiency scale): raw_score = weighted mean = 500/6 = 83.33 →
--     actual_level round(1+0.8333×4,1)=4.3 → gap 3−4.3=−1.3 → EXCEEDS (critical, but exceeded);
--     coverage 1 (its only source is fully covered), 2 evidence items / 1 source type → MEDIUM.
--   __smoke_mcq_empty__ stays INSUFFICIENT_EVIDENCE/NONE/coverage 0 with an HSE/NO_MCQ_QUESTIONS
--     marker in unassessable_sources — never miscounted as a gap.
--   turning needs_online_mcq OFF and recomputing removes every TECHNICAL_MCQ evidence row for this
--     candidate and the audit entry records TECHNICAL_MCQ under excludedByDesign (M-8's exclusion
--     rule, extended to the online test).
--
-- Exploit checks (all against the real RPCs/RLS, in this same rolled-back transaction):
--   • the candidate payload (comp_mcq_candidate_get/start) never carries correctOption/explanation/
--     standardRef or a per-option "correct" flag, before OR after answering;
--   • an unknown token resolves to null, never an error that would reveal a row exists;
--   • this candidate's token cannot answer a question that belongs to assessment #2's test
--     ("question is not part of this test");
--   • once SCORED, neither the token RPC nor a direct table write can change an answer;
--   • anon has no grant on comp_mcq_questions/tests/responses at all — a raw select is refused
--     before RLS even evaluates row visibility, so correct_option can never leak that way;
--   • an outsider (neither creator, panelist nor module admin) is refused by comp_mcq_generate_test
--     and comp_mcq_get_test_detail alike.
--
-- Candidate #2 (__smoke_test_mcq2__) exists only for the completed-assessment lock: its test is
-- started, the assessment is then marked completed, and comp_mcq_candidate_answer, _submit,
-- comp_mcq_generate_test and a direct UPDATE of comp_mcq_tests must all be refused
-- (assessment_locked), exactly like Section 53's lock for the in-person technical/personality data.

do $$
declare
  v_role constant text := '__smoke_mcq_role__';
  -- A second, disjoint job role/pool purely so candidate #2's test contains question ids that are
  -- genuinely foreign to candidate #1's — the "cross-test" exploit check needs a qid that truly
  -- belongs to a different test, which two same-role pools of exactly the same size cannot give it.
  v_role2 constant text := '__smoke_mcq_role2__';
  v_admin uuid;
  v_outsider uuid;
  v_c_mcq uuid;
  v_c_mcq_empty uuid;
  v_a uuid;
  v_a2 uuid;
  v_qa1 uuid;
  v_qa2 uuid;
  v_qa3 uuid;
  v_qa4 uuid;
  v_qb1 uuid;
  v_qb2 uuid;
  v_qc uuid;
  v_gen jsonb;
  v_test_id uuid;
  v_test_id2 uuid;
  v_token uuid;
  v_token2 uuid;
  v_detail jsonb;
  v_get jsonb;
  v_row comp_competency_scores%rowtype;
  v_ev_a numeric;
  v_ev_b numeric;
  v_n int;
  v_t comp_mcq_tests%rowtype;
begin
  select id into v_admin from profiles where is_admin order by created_at limit 1;
  if v_admin is null then
    raise exception 'smoke test precondition failed: no admin profile exists to impersonate';
  end if;

  select p.id into v_outsider
  from profiles p
  where not coalesce(p.is_admin, false)
    and not exists (select 1 from comp_module_admins m where m.user_id = p.id)
  order by p.created_at
  limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if auth.uid() is distinct from v_admin then
    raise exception 'smoke test setup failed: could not impersonate admin (auth.uid() = %)', auth.uid();
  end if;
  perform set_config('role', 'postgres', true);

  -- ---- Throwaway model: role, two competencies, six approved MCQs across two topics ----
  insert into comp_job_role_config (job_role, label_fa, active, sort_order) values (v_role, '__smoke__', false, 9999);
  insert into comp_job_role_config (job_role, label_fa, active, sort_order) values (v_role2, '__smoke__', false, 9999);

  insert into comp_competencies (key, label_fa, domain) values ('__smoke_mcq__', '__smoke_mcq__', 'TECHNICAL') returning id into v_c_mcq;
  insert into comp_competencies (key, label_fa, domain) values ('__smoke_mcq_empty__', '__smoke_mcq_empty__', 'TECHNICAL') returning id into v_c_mcq_empty;

  insert into comp_competency_evidence_sources (competency_id, source_type, source_ref, weight) values
    (v_c_mcq, 'TECHNICAL_MCQ', 'TECHNICAL', 2),
    (v_c_mcq_empty, 'TECHNICAL_MCQ', 'HSE', 1);

  insert into comp_job_competency_requirements (job_role, competency_id, required_level, is_critical, weight) values
    (v_role, v_c_mcq, 3, true, 1),
    (v_role, v_c_mcq_empty, 3, false, 1);

  insert into comp_mcq_questions (job_role, category, topic, difficulty, stem_fa, options, correct_option, explanation_fa, approval_status, active) values
    (v_role, 'TECHNICAL', '__smoke_topic_a__', 1, '__smoke_mcq_qa1__', '["a0","a1","a2","a3"]'::jsonb, 0, 'exp a1', 'APPROVED', true) returning id into v_qa1;
  insert into comp_mcq_questions (job_role, category, topic, difficulty, stem_fa, options, correct_option, explanation_fa, approval_status, active) values
    (v_role, 'TECHNICAL', '__smoke_topic_a__', 1, '__smoke_mcq_qa2__', '["a0","a1","a2","a3"]'::jsonb, 0, 'exp a2', 'APPROVED', true) returning id into v_qa2;
  insert into comp_mcq_questions (job_role, category, topic, difficulty, stem_fa, options, correct_option, explanation_fa, approval_status, active) values
    (v_role, 'TECHNICAL', '__smoke_topic_a__', 2, '__smoke_mcq_qa3__', '["a0","a1","a2","a3"]'::jsonb, 0, 'exp a3', 'APPROVED', true) returning id into v_qa3;
  insert into comp_mcq_questions (job_role, category, topic, difficulty, stem_fa, options, correct_option, explanation_fa, approval_status, active) values
    (v_role, 'TECHNICAL', '__smoke_topic_a__', 2, '__smoke_mcq_qa4__', '["a0","a1","a2","a3"]'::jsonb, 0, 'exp a4', 'APPROVED', true) returning id into v_qa4;
  insert into comp_mcq_questions (job_role, category, topic, difficulty, stem_fa, options, correct_option, explanation_fa, approval_status, active) values
    (v_role, 'TECHNICAL', '__smoke_topic_b__', 3, '__smoke_mcq_qb1__', '["b0","b1","b2","b3"]'::jsonb, 0, 'exp b1', 'APPROVED', true) returning id into v_qb1;
  insert into comp_mcq_questions (job_role, category, topic, difficulty, stem_fa, options, correct_option, explanation_fa, approval_status, active) values
    (v_role, 'TECHNICAL', '__smoke_topic_b__', 3, '__smoke_mcq_qb2__', '["b0","b1","b2","b3"]'::jsonb, 0, 'exp b2', 'APPROVED', true) returning id into v_qb2;

  -- A PENDING_REVIEW question and an inactive (approved) question must never be drawn.
  insert into comp_mcq_questions (job_role, category, topic, difficulty, stem_fa, options, correct_option, approval_status, active) values
    (v_role, 'TECHNICAL', '__smoke_topic_a__', 1, '__smoke_mcq_pending__', '["x0","x1","x2","x3"]'::jsonb, 0, 'PENDING_REVIEW', true);
  insert into comp_mcq_questions (job_role, category, topic, difficulty, stem_fa, options, correct_option, approval_status, active) values
    (v_role, 'TECHNICAL', '__smoke_topic_a__', 1, '__smoke_mcq_inactive__', '["x0","x1","x2","x3"]'::jsonb, 0, 'APPROVED', false);

  -- The second role's lone question — its pool is disjoint from v_role's, so candidate #2's test
  -- can never share a question id with candidate #1's.
  insert into comp_mcq_questions (job_role, category, topic, difficulty, stem_fa, options, correct_option, approval_status, active) values
    (v_role2, 'TECHNICAL', '__smoke_topic_c__', 1, '__smoke_mcq_qc__', '["c0","c1","c2","c3"]'::jsonb, 0, 'APPROVED', true) returning id into v_qc;

  -- ---- Candidate #1 (design-aware evidence + token isolation + scoring) ----
  insert into comp_assessments (
    job_role, candidate_name, candidate_position, candidate_national_id, candidate_phone, candidate_email, created_by,
    needs_technical_assessment, needs_personality_assessment, needs_structured_interview, includes_experience, needs_online_mcq
  ) values (
    v_role, '__smoke_test_mcq__', 'test', '0000000010', '09120000010', 'smoke-mcq@example.com', v_admin,
    false, false, false, false, true
  ) returning id into v_a;

  -- ---- Candidate #2, purely for the completed-assessment lock ----
  insert into comp_assessments (
    job_role, candidate_name, candidate_position, candidate_national_id, candidate_phone, candidate_email, created_by,
    needs_technical_assessment, needs_personality_assessment, needs_structured_interview, includes_experience, needs_online_mcq
  ) values (
    v_role2, '__smoke_test_mcq2__', 'test', '0000000011', '09120000011', 'smoke-mcq2@example.com', v_admin,
    false, false, false, false, true
  ) returning id into v_a2;

  perform set_config('role', 'authenticated', true);

  -- ---- Access guard: an outsider may not generate or read this candidate's MCQ test ----
  if v_outsider is null then
    raise notice 'competency_engine_smoke_test (mcq): no non-admin profile available — outsider access-guard checks skipped';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
    begin
      perform comp_mcq_generate_test(v_a, 6, 30, false);
      raise exception 'ASSERTION FAILED (mcq outsider/generate): a non-lead/non-designer generated the MCQ test';
    exception when others then
      if sqlerrm not like 'forbidden%' then raise; end if;
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  end if;

  -- ---- Generate a balanced 6-question test (the whole approved pool) ----
  v_gen := comp_mcq_generate_test(v_a, 6, 30, false);
  if (v_gen ->> 'count')::int <> 6 or (v_gen ->> 'poolSize')::int <> 6 then
    raise exception 'ASSERTION FAILED (mcq generate): expected count=6 poolSize=6 (PENDING/inactive excluded), got %', v_gen;
  end if;
  select id, question_ids into v_test_id, v_gen from comp_mcq_tests where assessment_id = v_a;
  if not (v_gen ? v_qa1::text and v_gen ? v_qa2::text and v_gen ? v_qa3::text and v_gen ? v_qa4::text and v_gen ? v_qb1::text and v_gen ? v_qb2::text) then
    raise exception 'ASSERTION FAILED (mcq generate): all 6 approved/active questions must be drawn when the pool equals the request';
  end if;

  -- ---- Staff detail before any answers: the token is returned to a lead, refused to an outsider ----
  v_detail := comp_mcq_get_test_detail(v_a);
  if v_detail ->> 'candidateToken' is null or v_detail ->> 'status' <> 'NOT_STARTED' or (v_detail ->> 'questionCount')::int <> 6 then
    raise exception 'ASSERTION FAILED (mcq detail/lead): expected a token and NOT_STARTED/6, got %', v_detail;
  end if;
  v_token := (v_detail ->> 'candidateToken')::uuid;

  if v_outsider is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
    begin
      perform comp_mcq_get_test_detail(v_a);
      raise exception 'ASSERTION FAILED (mcq outsider/detail): an outsider read another candidate''s MCQ test';
    exception when others then
      if sqlerrm not like 'forbidden%' then raise; end if;
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  end if;

  -- ---- Generate candidate #2's test up front (needed for the cross-test exploit check below) ----
  perform comp_mcq_generate_test(v_a2, 6, 30, false); -- role2's pool is only 1 question; drawn count clamps to it

  -- ---- Candidate flow via the token RPCs only (never a direct table read) ----
  v_get := comp_mcq_candidate_start(v_token);
  if v_get ->> 'status' <> 'IN_PROGRESS' or jsonb_array_length(v_get -> 'questions') <> 6 then
    raise exception 'ASSERTION FAILED (mcq start): expected IN_PROGRESS with 6 questions, got %', v_get;
  end if;

  -- Exploit check: the candidate-facing payload must NEVER carry the answer key or explanation.
  if exists (
    select 1 from jsonb_array_elements(v_get -> 'questions') qq
    where qq ? 'correctOption' or qq ? 'explanation' or qq ? 'standardRef'
       or exists (select 1 from jsonb_array_elements(qq -> 'options') oo where oo ? 'correct' or oo ? 'isCorrect')
  ) then
    raise exception 'ASSERTION FAILED (mcq leak): the candidate payload exposed the correct answer or explanation before submit';
  end if;

  -- Exploit check: a bogus token must resolve to nothing (never an error revealing a row exists).
  if comp_mcq_candidate_get(gen_random_uuid()) is not null then
    raise exception 'ASSERTION FAILED (mcq leak): an unknown token returned a test payload';
  end if;

  -- Exploit check: this candidate's token cannot answer a question belonging to assessment #2's test.
  select question_ids into v_gen from comp_mcq_tests where assessment_id = v_a2;
  begin
    perform comp_mcq_candidate_answer(v_token, (v_gen ->> 0)::uuid, 0, 100);
    raise exception 'ASSERTION FAILED (mcq cross-test): a token answered a DIFFERENT assessment''s MCQ question';
  exception when others then
    if sqlerrm not like 'question is not part of this test%' then raise; end if;
  end;

  -- Now answer for real: all of topic A correct, topic B one right / one wrong.
  perform comp_mcq_candidate_answer(v_token, v_qa1, 0, 500);
  perform comp_mcq_candidate_answer(v_token, v_qa2, 0, 300);
  perform comp_mcq_candidate_answer(v_token, v_qa3, 0, 300);
  perform comp_mcq_candidate_answer(v_token, v_qa4, 0, 300);
  perform comp_mcq_candidate_answer(v_token, v_qb1, 0, 300); -- correct
  perform comp_mcq_candidate_answer(v_token, v_qb2, 1, 300); -- wrong (correct_option is 0)

  -- ---- Submit + scoring ----
  v_get := comp_mcq_candidate_submit(v_token);
  if v_get ->> 'status' <> 'SCORED' then
    raise exception 'ASSERTION FAILED (mcq submit): expected SCORED, got %', v_get;
  end if;
  select * into v_t from comp_mcq_tests where id = v_test_id;
  if v_t.total_questions <> 6 or v_t.answered_count <> 6 or v_t.correct_count <> 5 or v_t.score_percent <> 83.3 then
    raise exception 'ASSERTION FAILED (mcq score): expected 6/6/5/83.3, got %/%/%/%', v_t.total_questions, v_t.answered_count, v_t.correct_count, v_t.score_percent;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_t.topic_scores) t where t ->> 'topic' = '__smoke_topic_a__' and (t ->> 'percent')::numeric = 100) then
    raise exception 'ASSERTION FAILED (mcq score): topic A should be 100%%, got %', v_t.topic_scores;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_t.topic_scores) t where t ->> 'topic' = '__smoke_topic_b__' and (t ->> 'percent')::numeric = 50) then
    raise exception 'ASSERTION FAILED (mcq score): topic B should be 50%%, got %', v_t.topic_scores;
  end if;

  -- Exploit check: nothing changes after submit — the RPC path and a direct write both refuse.
  begin
    perform comp_mcq_candidate_answer(v_token, v_qa1, 1, 100);
    raise exception 'ASSERTION FAILED (mcq post-submit/rpc): an answer was accepted after SCORED';
  exception when others then
    if sqlerrm not like 'mcq_not_in_progress%' then raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  begin
    update comp_mcq_responses set chosen_option = 2 where test_id = v_test_id and question_id = v_qa1;
    raise exception 'ASSERTION FAILED (mcq post-submit/direct): a response row was edited after SCORED';
  exception when others then
    if sqlerrm not like 'mcq_submitted%' then raise; end if;
  end;

  -- Exploit check: anon has no privilege on the bank/test tables at all (RLS + revoke all) — the
  -- candidate must reach everything through the token RPCs, never a direct select.
  perform set_config('role', 'anon', true);
  begin
    perform 1 from comp_mcq_questions where id = v_qa1;
    raise exception 'ASSERTION FAILED (mcq anon): anon read comp_mcq_questions directly (correct_option would leak)';
  exception when others then
    if sqlerrm not like '%permission denied%' then raise; end if;
  end;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ---- Design-aware evidence: TECHNICAL_MCQ produces one item per topic, weight split by question count ----
  perform comp_compute_competency_profile(v_a);

  select count(*) into v_n from comp_competency_evidence where assessment_id = v_a and competency_id = v_c_mcq;
  if v_n <> 2 then
    raise exception 'ASSERTION FAILED (mcq evidence): expected exactly 2 evidence items (one per topic), got %', v_n;
  end if;

  select effective_weight into v_ev_a from comp_competency_evidence
    where assessment_id = v_a and competency_id = v_c_mcq and raw_value ->> 'topic' = '__smoke_topic_a__';
  select effective_weight into v_ev_b from comp_competency_evidence
    where assessment_id = v_a and competency_id = v_c_mcq and raw_value ->> 'topic' = '__smoke_topic_b__';
  if v_ev_a is null or v_ev_b is null or abs(v_ev_a - 1.3333) > 0.001 or abs(v_ev_b - 0.6667) > 0.001 or abs((v_ev_a + v_ev_b) - 2) > 0.0001 then
    raise exception 'ASSERTION FAILED (mcq evidence weight): expected topic weights ~1.3333/0.6667 summing to 2, got %/%', v_ev_a, v_ev_b;
  end if;

  if not exists (select 1 from comp_competency_evidence where assessment_id = v_a and competency_id = v_c_mcq
                 and raw_value ->> 'topic' = '__smoke_topic_a__' and normalized_score = 100) then
    raise exception 'ASSERTION FAILED (mcq evidence score): topic A evidence should be normalized_score 100';
  end if;
  if not exists (select 1 from comp_competency_evidence where assessment_id = v_a and competency_id = v_c_mcq
                 and raw_value ->> 'topic' = '__smoke_topic_b__' and normalized_score = 50) then
    raise exception 'ASSERTION FAILED (mcq evidence score): topic B evidence should be normalized_score 50';
  end if;

  -- ---- Competency Engine roll-up (single source ⇒ weighted mean == overall test percentage) ----
  select * into v_row from comp_competency_scores where assessment_id = v_a and competency_id = v_c_mcq;
  if v_row.actual_score <> 83.33 or v_row.actual_level <> 4.3 or v_row.gap <> -1.3 or v_row.status <> 'EXCEEDS'
     or v_row.coverage <> 1 or v_row.evidence_count <> 2 or v_row.source_types_covered <> 1 or v_row.confidence <> 'MEDIUM' then
    raise exception 'ASSERTION FAILED (mcq rollup): expected 83.33 / 4.3 / gap -1.3 / EXCEEDS / cov 1 / 2 items / 1 type / MEDIUM, got % / % / % / % / % / % / % / %',
      v_row.actual_score, v_row.actual_level, v_row.gap, v_row.status, v_row.coverage, v_row.evidence_count, v_row.source_types_covered, v_row.confidence;
  end if;

  -- ---- "Not assessable" (M-8's rule, extended to the online test): no HSE-category MCQ exists for
  -- this role at all, so __smoke_mcq_empty__ must be INSUFFICIENT_EVIDENCE with a NO_MCQ_QUESTIONS
  -- marker — never a critical gap just because nobody wrote HSE questions for this role yet.
  select * into v_row from comp_competency_scores where assessment_id = v_a and competency_id = v_c_mcq_empty;
  if v_row.status <> 'INSUFFICIENT_EVIDENCE' or v_row.confidence <> 'NONE' or v_row.coverage <> 0
     or not exists (select 1 from jsonb_array_elements(v_row.unassessable_sources) u where u ->> 'sourceRef' = 'HSE' and u ->> 'reason' = 'NO_MCQ_QUESTIONS') then
    raise exception 'ASSERTION FAILED (mcq not-assessable): expected INSUFFICIENT_EVIDENCE/NONE/cov 0 with an HSE/NO_MCQ_QUESTIONS marker, got % / % / % / %',
      v_row.status, v_row.confidence, v_row.coverage, v_row.unassessable_sources;
  end if;

  -- ---- Design exclusion: turning the online MCQ test off drops all of its evidence ----
  update comp_assessments set needs_online_mcq = false where id = v_a;
  perform comp_compute_competency_profile(v_a);
  select count(*) into v_n from comp_competency_evidence where assessment_id = v_a and competency_id = v_c_mcq;
  if v_n <> 0 then
    raise exception 'ASSERTION FAILED (mcq exclude): TECHNICAL_MCQ evidence survived after needs_online_mcq was turned off, got % row(s)', v_n;
  end if;
  select * into v_row from comp_competency_scores where assessment_id = v_a and competency_id = v_c_mcq;
  if v_row.status <> 'INSUFFICIENT_EVIDENCE' or v_row.confidence <> 'NONE' or v_row.coverage <> 0 then
    raise exception 'ASSERTION FAILED (mcq exclude): expected INSUFFICIENT_EVIDENCE/NONE/cov 0 once excluded by design, got % / % / %',
      v_row.status, v_row.confidence, v_row.coverage;
  end if;
  if not exists (select 1 from comp_audit_log where action = 'COMPETENCY_PROFILE_COMPUTED' and entity_id = v_a
                 and new_value -> 'excludedByDesign' ? 'TECHNICAL_MCQ') then
    raise exception 'ASSERTION FAILED (mcq exclude): audit entry must record TECHNICAL_MCQ under excludedByDesign';
  end if;

  -- ---- Completed-assessment lock (candidate #2) ----
  v_detail := comp_mcq_get_test_detail(v_a2);
  v_test_id2 := (v_detail ->> 'id')::uuid;
  v_token2 := (v_detail ->> 'candidateToken')::uuid;
  perform comp_mcq_candidate_start(v_token2);

  perform set_config('role', 'postgres', true);
  update comp_assessments set status = 'completed' where id = v_a2;
  perform set_config('role', 'authenticated', true);

  begin
    perform comp_mcq_candidate_answer(v_token2, v_qc, 0, 100);
    raise exception 'ASSERTION FAILED (mcq lock/answer): an answer was accepted on a completed assessment''s MCQ test';
  exception when others then
    if sqlerrm not like 'assessment_locked%' then raise; end if;
  end;

  begin
    perform comp_mcq_candidate_submit(v_token2);
    raise exception 'ASSERTION FAILED (mcq lock/submit): a submit was accepted on a completed assessment''s MCQ test';
  exception when others then
    if sqlerrm not like 'assessment_locked%' then raise; end if;
  end;

  begin
    perform comp_mcq_generate_test(v_a2, 6, 30, true);
    raise exception 'ASSERTION FAILED (mcq lock/generate): the test was regenerated on a completed assessment';
  exception when others then
    if sqlerrm not like 'assessment_locked%' then raise; end if;
  end;

  perform set_config('role', 'postgres', true);
  begin
    update comp_mcq_tests set time_limit_minutes = 99 where id = v_test_id2;
    raise exception 'ASSERTION FAILED (mcq lock/direct): a direct write to comp_mcq_tests succeeded on a completed assessment';
  exception when others then
    if sqlerrm not like 'assessment_locked%' then raise; end if;
  end;

  raise notice 'competency_engine_smoke_test (section 56 — online MCQ test): ALL ASSERTIONS PASSED';

  perform set_config('comp.allow_locked_write', 'on', true);
  delete from comp_audit_log where entity_id in (select id from comp_assessments where candidate_name in ('__smoke_test_mcq__', '__smoke_test_mcq2__'));
  delete from comp_assessments where candidate_name in ('__smoke_test_mcq__', '__smoke_test_mcq2__');
  delete from comp_competency_evidence_sources where competency_id in (v_c_mcq, v_c_mcq_empty);
  delete from comp_job_competency_requirements where job_role = v_role;
  delete from comp_mcq_questions where job_role in (v_role, v_role2);
  delete from comp_competencies where id in (v_c_mcq, v_c_mcq_empty);
  delete from comp_job_role_config where job_role in (v_role, v_role2);
  perform set_config('comp.allow_locked_write', '', true);

exception when others then
  perform set_config('role', 'postgres', true);
  perform set_config('comp.allow_locked_write', 'on', true);
  delete from comp_audit_log where entity_id in (select id from comp_assessments where candidate_name in ('__smoke_test_mcq__', '__smoke_test_mcq2__'));
  delete from comp_assessments where candidate_name in ('__smoke_test_mcq__', '__smoke_test_mcq2__');
  delete from comp_competency_evidence_sources where competency_id in (v_c_mcq, v_c_mcq_empty);
  delete from comp_job_competency_requirements where job_role = v_role;
  delete from comp_mcq_questions where job_role in (v_role, v_role2);
  delete from comp_competencies where id in (v_c_mcq, v_c_mcq_empty);
  delete from comp_job_role_config where job_role in (v_role, v_role2);
  perform set_config('comp.allow_locked_write', '', true);
  raise;
end $$;
