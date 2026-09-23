-- Personality & Behavioral Assessment Engine — scoring/validity regression smoke test.
--
-- This codebase has no JS/TS test runner anywhere (grep the repo — there isn't one), so rather than
-- introducing a whole new test framework and its tooling dependency for one module, this follows the
-- same manual-verification convention already used to validate personality_score_assessment during
-- development: a self-contained SQL script that drives the real RPCs end-to-end and asserts on their
-- real output, safe to re-run any time (creates its own throwaway rows and always cleans them up,
-- even on failure) against a Supabase SQL editor or CI step that can run `psql`/the Supabase CLI.
--
-- Exercises: candidate creation -> generation -> answering a LIKERT+FORCED_CHOICE+SJT mix ->
-- finalize -> personality_score_assessment, then asserts real invariants: status transitions,
-- TRAIT/BEHAVIORAL_DIMENSION coverage, and both branches of the straight-lining validity check
-- (varied answers -> not flagged; uniform answers on >=8 items -> flagged). Raises an exception (and
-- still cleans up first) on the first failed assertion, so a CI runner sees a non-zero-risk failure
-- rather than a silent pass.

do $$
declare
  v_admin uuid;
  v_comp_id uuid;
  v_pa_varied uuid;
  v_pa_uniform uuid;
  v_token_varied uuid;
  v_token_uniform uuid;
  v_likert_ids uuid[];
  v_fc_id uuid;
  v_sjt_id uuid;
  v_status text;
  v_trait_count int;
  v_dim_count int;
  v_straight_lining boolean;
  v_missing int;
  q uuid;
begin
  select id into v_admin from profiles where is_admin limit 1;
  if v_admin is null then
    raise exception 'smoke test precondition failed: no admin profile exists to attribute test rows to';
  end if;

  select array_agg(id) into v_likert_ids from (
    select id from personality_questions where approval_status = 'APPROVED' and active and question_type = 'LIKERT' limit 8
  ) x;
  select id into v_fc_id from personality_questions where approval_status = 'APPROVED' and active and question_type = 'FORCED_CHOICE' limit 1;
  select id into v_sjt_id from personality_questions where approval_status = 'APPROVED' and active and question_type = 'SJT' limit 1;

  if v_likert_ids is null or array_length(v_likert_ids, 1) < 8 then
    raise exception 'smoke test precondition failed: need >= 8 approved LIKERT questions, found %', coalesce(array_length(v_likert_ids, 1), 0);
  end if;
  if v_fc_id is null or v_sjt_id is null then
    raise exception 'smoke test precondition failed: need at least one approved FORCED_CHOICE and one SJT question';
  end if;

  -- ---- Case 1: varied, complete answers -> should score cleanly and NOT be flagged for straight-lining ----

  insert into comp_assessments (job_role, candidate_name, candidate_position, candidate_national_id, candidate_phone, candidate_email, created_by)
  values ('project_manager', '__smoke_test_varied__', 'test', '0000000001', '09120000001', 'smoke1@example.com', v_admin)
  returning id into v_comp_id;

  insert into personality_assessments (assessment_id, job_role, created_by, selected_question_ids, status)
  values (v_comp_id, 'project_manager', v_admin, to_jsonb(v_likert_ids || array[v_fc_id, v_sjt_id]), 'GENERATED')
  returning id, candidate_token into v_pa_varied, v_token_varied;

  perform personality_candidate_start(v_token_varied);

  for i in 1..array_length(v_likert_ids, 1) loop
    -- Alternate 1/7 so the mode never covers >90% of items — exercises the "not flagged" branch.
    perform personality_candidate_submit_response(v_token_varied, v_likert_ids[i], jsonb_build_object('selected', case when i % 2 = 0 then 1 else 7 end), 1000);
  end loop;
  perform personality_candidate_submit_response(
    v_token_varied, v_fc_id,
    (select jsonb_build_object('selected_option', options->0->>'key') from personality_questions where id = v_fc_id), 1000
  );
  perform personality_candidate_submit_response(
    v_token_varied, v_sjt_id,
    (select jsonb_build_object('selected_option', options->0->>'key') from personality_questions where id = v_sjt_id), 1000
  );

  perform personality_candidate_finalize(v_token_varied);

  select status into v_status from personality_assessments where id = v_pa_varied;
  if v_status <> 'FINGERPRINT' then
    raise exception 'ASSERTION FAILED (case 1): expected status FINGERPRINT after finalize, got %', v_status;
  end if;

  select count(*) into v_trait_count from personality_dimension_scores where personality_assessment_id = v_pa_varied and score_kind = 'TRAIT';
  if v_trait_count = 0 then
    raise exception 'ASSERTION FAILED (case 1): expected at least one TRAIT score row from LIKERT answers, got 0';
  end if;

  select count(*) into v_dim_count from personality_dimension_scores where personality_assessment_id = v_pa_varied and score_kind = 'BEHAVIORAL_DIMENSION';
  if v_dim_count = 0 then
    raise exception 'ASSERTION FAILED (case 1): expected at least one BEHAVIORAL_DIMENSION score row from the FORCED_CHOICE/SJT answers, got 0';
  end if;

  select straight_lining_flag, missing_response_count into v_straight_lining, v_missing
  from personality_validity_results where personality_assessment_id = v_pa_varied;
  if v_straight_lining is distinct from false then
    raise exception 'ASSERTION FAILED (case 1): expected straight_lining_flag = false for varied 1/7 alternating answers, got %', v_straight_lining;
  end if;
  if v_missing <> 0 then
    raise exception 'ASSERTION FAILED (case 1): expected missing_response_count = 0 (every selected question was answered), got %', v_missing;
  end if;

  -- ---- Case 2: same LIKERT value on every item -> SHOULD be flagged for straight-lining ----

  insert into comp_assessments (job_role, candidate_name, candidate_position, candidate_national_id, candidate_phone, candidate_email, created_by)
  values ('project_manager', '__smoke_test_uniform__', 'test', '0000000002', '09120000002', 'smoke2@example.com', v_admin)
  returning id into v_comp_id;

  insert into personality_assessments (assessment_id, job_role, created_by, selected_question_ids, status)
  values (v_comp_id, 'project_manager', v_admin, to_jsonb(v_likert_ids), 'GENERATED')
  returning id, candidate_token into v_pa_uniform, v_token_uniform;

  perform personality_candidate_start(v_token_uniform);
  foreach q in array v_likert_ids loop
    perform personality_candidate_submit_response(v_token_uniform, q, jsonb_build_object('selected', 4), 800);
  end loop;
  perform personality_candidate_finalize(v_token_uniform);

  select straight_lining_flag into v_straight_lining from personality_validity_results where personality_assessment_id = v_pa_uniform;
  if v_straight_lining is distinct from true then
    raise exception 'ASSERTION FAILED (case 2): expected straight_lining_flag = true when every LIKERT answer is identical, got %', v_straight_lining;
  end if;

  raise notice 'personality_engine_smoke_test: ALL ASSERTIONS PASSED';

  -- ---- Cleanup (both cases) — always runs when every assertion above passed ----
  delete from personality_dimension_scores where personality_assessment_id in (v_pa_varied, v_pa_uniform);
  delete from personality_validity_results where personality_assessment_id in (v_pa_varied, v_pa_uniform);
  delete from personality_responses where personality_assessment_id in (v_pa_varied, v_pa_uniform);
  delete from personality_assessments where id in (v_pa_varied, v_pa_uniform);
  delete from comp_assessments where candidate_name in ('__smoke_test_varied__', '__smoke_test_uniform__');

exception when others then
  -- Clean up test rows even on assertion failure, then re-raise so the caller still sees the failure.
  delete from personality_dimension_scores where personality_assessment_id in (v_pa_varied, v_pa_uniform);
  delete from personality_validity_results where personality_assessment_id in (v_pa_varied, v_pa_uniform);
  delete from personality_responses where personality_assessment_id in (v_pa_varied, v_pa_uniform);
  delete from personality_assessments where id in (v_pa_varied, v_pa_uniform);
  delete from comp_assessments where candidate_name in ('__smoke_test_varied__', '__smoke_test_uniform__');
  raise;
end $$;
