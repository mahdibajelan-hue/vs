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
  delete from comp_audit_log where entity_id in (v_pa_varied, v_pa_uniform)
    or entity_id in (select id from comp_assessments where candidate_name in ('__smoke_test_varied__', '__smoke_test_uniform__'));
  delete from personality_dimension_scores where personality_assessment_id in (v_pa_varied, v_pa_uniform);
  delete from personality_validity_results where personality_assessment_id in (v_pa_varied, v_pa_uniform);
  delete from personality_responses where personality_assessment_id in (v_pa_varied, v_pa_uniform);
  delete from personality_assessments where id in (v_pa_varied, v_pa_uniform);
  delete from comp_assessments where candidate_name in ('__smoke_test_varied__', '__smoke_test_uniform__');

exception when others then
  -- Clean up test rows even on assertion failure, then re-raise so the caller still sees the failure.
  delete from comp_audit_log where entity_id in (v_pa_varied, v_pa_uniform)
    or entity_id in (select id from comp_assessments where candidate_name in ('__smoke_test_varied__', '__smoke_test_uniform__'));
  delete from personality_dimension_scores where personality_assessment_id in (v_pa_varied, v_pa_uniform);
  delete from personality_validity_results where personality_assessment_id in (v_pa_varied, v_pa_uniform);
  delete from personality_responses where personality_assessment_id in (v_pa_varied, v_pa_uniform);
  delete from personality_assessments where id in (v_pa_varied, v_pa_uniform);
  delete from comp_assessments where candidate_name in ('__smoke_test_varied__', '__smoke_test_uniform__');
  raise;
end $$;

-- ============================================================================
-- Section 53 regressions (docs/demo-test-report.md M-1, M-2, M-3, M-9) — a second, independent
-- block with its own throwaway rows, cleaned up on success AND failure:
--   M-1  personality_score_assessment / _core are not executable by anon; an outsider is refused;
--        staff may re-score a submitted test (status kept) but never a LOCKED or unsubmitted one.
--   M-2  finalize only from STARTED/IN_PROGRESS — refused before start, after scoring and on LOCKED.
--   M-3  a response to a question outside the test's own selection is refused, as is any response
--        once the test is submitted.
--   M-9  the selection cannot change under existing responses except through
--        personality_set_test_questions with explicit discard (archived in the audit log, then
--        cleared); always refused once the competency assessment is completed.
-- ============================================================================
do $$
declare
  v_admin uuid;
  v_out uuid;
  v_comp_id uuid;
  v_pa uuid;
  v_token uuid;
  v_ids uuid[];
  v_foreign uuid;
  v_status text;
  v_sub timestamptz;
  v_missing int;
  v_json jsonb;
begin
  select id into v_admin from profiles where is_admin order by created_at limit 1;
  select p.id into v_out from profiles p
  where not coalesce(p.is_admin, false)
    and not exists (select 1 from comp_module_admins m where m.user_id = p.id)
    and not exists (select 1 from personality_module_admins m where m.user_id = p.id)
    and not rasta_has_permission(p.id, 'competency', 'configure')
    and not rasta_has_permission(p.id, 'personality', 'configure')
  order by p.created_at limit 1;
  select array_agg(id) into v_ids from (
    select id from personality_questions where approval_status = 'APPROVED' and active and question_type = 'LIKERT' and job_role is null order by id limit 8
  ) x;
  select id into v_foreign from personality_questions where approval_status = 'APPROVED' and active and question_type = 'LIKERT' and id <> all(v_ids) order by id limit 1;
  if v_admin is null or v_out is null or coalesce(array_length(v_ids, 1), 0) < 8 or v_foreign is null then
    raise exception 'section 53 smoke precondition failed: need an admin, a plain profile and >= 9 approved generic LIKERT questions';
  end if;

  insert into comp_assessments (job_role, candidate_name, candidate_position, candidate_national_id, candidate_phone, candidate_email, created_by)
  values ('project_manager', '__smoke_test_p53__', 'test', '0000000054', '09120000054', 'smoke-p53@example.com', v_admin)
  returning id into v_comp_id;
  insert into personality_assessments (assessment_id, job_role, created_by, selected_question_ids, status)
  values (v_comp_id, 'project_manager', v_admin, to_jsonb(v_ids), 'GENERATED')
  returning id, candidate_token into v_pa, v_token;

  -- ---- anon: candidate link ----
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  begin
    perform personality_score_assessment(v_pa);
    raise exception 'ASSERTION FAILED (M-1): anon could run personality_score_assessment';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform personality_score_assessment_core(v_pa);
    raise exception 'ASSERTION FAILED (M-1): anon could run personality_score_assessment_core';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform personality_candidate_finalize(v_token);
    raise exception 'ASSERTION FAILED (M-2): a test that was never started could be finalized';
  exception when others then
    if sqlerrm not like 'personality_not_in_progress%' then raise; end if;
  end;
  perform personality_candidate_start(v_token);
  begin
    perform personality_candidate_submit_response(v_token, v_foreign, jsonb_build_object('selected', 7), 500);
    raise exception 'ASSERTION FAILED (M-3): a question outside the selection was accepted';
  exception when others then
    if sqlerrm <> 'question is not part of this assessment' then raise; end if;
  end;
  for i in 1..4 loop
    perform personality_candidate_submit_response(v_token, v_ids[i], jsonb_build_object('selected', case when i % 2 = 0 then 2 else 6 end), 900);
  end loop;
  perform personality_candidate_finalize(v_token);
  perform set_config('role', 'postgres', true);
  select status, submitted_at into v_status, v_sub from personality_assessments where id = v_pa;
  select missing_response_count into v_missing from personality_validity_results where personality_assessment_id = v_pa;
  if v_status <> 'FINGERPRINT' or v_sub is null or v_missing <> 4 then
    raise exception 'ASSERTION FAILED (M-2): a partial but legitimately finalized test must score (FINGERPRINT, submitted, 4 missing), got % / % / %', v_status, v_sub, v_missing;
  end if;
  perform set_config('role', 'anon', true);
  begin
    perform personality_candidate_finalize(v_token);
    raise exception 'ASSERTION FAILED (M-2): an already-scored test could be finalized again';
  exception when others then
    if sqlerrm not like 'personality_not_in_progress%' then raise; end if;
  end;
  begin
    perform personality_candidate_submit_response(v_token, v_ids[5], jsonb_build_object('selected', 7), 500);
    raise exception 'ASSERTION FAILED (M-3): a response was accepted after submission';
  exception when others then
    if sqlerrm <> 'assessment already submitted' then raise; end if;
  end;
  perform set_config('role', 'postgres', true);

  -- ---- staff re-scoring ----
  perform set_config('request.jwt.claims', json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform personality_score_assessment(v_pa);
    raise exception 'ASSERTION FAILED (M-1): an outsider could re-score';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform personality_score_assessment(v_pa);
  perform set_config('role', 'postgres', true);
  if (select status from personality_assessments where id = v_pa) <> 'FINGERPRINT' then
    raise exception 'ASSERTION FAILED (M-1): a staff re-score must keep the status';
  end if;
  update personality_assessments set status = 'LOCKED' where id = v_pa;
  perform set_config('role', 'authenticated', true);
  begin
    perform personality_score_assessment(v_pa);
    raise exception 'ASSERTION FAILED (M-1): a LOCKED test was re-scored';
  exception when others then
    if sqlerrm not like 'personality_locked%' then raise; end if;
  end;
  perform set_config('role', 'anon', true);
  begin
    perform personality_candidate_finalize(v_token);
    raise exception 'ASSERTION FAILED (M-2): a LOCKED test could be finalized via the candidate link';
  exception when others then
    if sqlerrm not like 'personality_not_in_progress%' then raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  if (select status from personality_assessments where id = v_pa) <> 'LOCKED' then
    raise exception 'ASSERTION FAILED (M-2): the LOCKED status must survive';
  end if;
  update personality_assessments set status = 'FINGERPRINT' where id = v_pa;

  -- ---- M-9: regeneration ----
  perform set_config('role', 'authenticated', true);
  begin
    update personality_assessments set selected_question_ids = to_jsonb(v_ids[1:4]) where id = v_pa;
    raise exception 'ASSERTION FAILED (M-9): the selection changed under existing responses';
  exception when others then
    if sqlerrm not like 'responses_exist%' then raise; end if;
  end;
  begin
    perform personality_set_test_questions(v_pa, v_ids, false);
    raise exception 'ASSERTION FAILED (M-9): regeneration without explicit discard was accepted';
  exception when others then
    if sqlerrm not like 'responses_exist%' then raise; end if;
  end;
  v_json := personality_set_test_questions(v_pa, v_ids, true);
  perform set_config('role', 'postgres', true);
  if (v_json ->> 'discardedResponses')::boolean is distinct from true
     or (select status from personality_assessments where id = v_pa) <> 'GENERATED'
     or exists (select 1 from personality_responses where personality_assessment_id = v_pa)
     or exists (select 1 from personality_dimension_scores where personality_assessment_id = v_pa)
     or not exists (select 1 from comp_audit_log where entity_id = v_pa and action = 'PERSONALITY_RESPONSES_DISCARDED'
                    and jsonb_array_length(previous_value -> 'responses') = 4) then
    raise exception 'ASSERTION FAILED (M-9): an explicit discard must archive and clear responses and scores, got %', v_json;
  end if;
  update comp_assessments set status = 'completed' where id = v_comp_id;
  perform set_config('role', 'authenticated', true);
  begin
    perform personality_set_test_questions(v_pa, v_ids, true);
    raise exception 'ASSERTION FAILED (M-9): regeneration was accepted on a completed competency assessment';
  exception when others then
    if sqlerrm not like 'assessment_locked%' then raise; end if;
  end;
  perform set_config('role', 'postgres', true);

  raise notice 'personality_engine_smoke_test (section 53): ALL ASSERTIONS PASSED';

  delete from comp_audit_log where entity_id in (v_pa, v_comp_id);
  delete from personality_dimension_scores where personality_assessment_id = v_pa;
  delete from personality_validity_results where personality_assessment_id = v_pa;
  delete from personality_responses where personality_assessment_id = v_pa;
  delete from personality_assessments where id = v_pa;
  delete from comp_assessments where id = v_comp_id;

exception when others then
  perform set_config('role', 'postgres', true);
  delete from comp_audit_log where entity_id in (
    select pa.id from personality_assessments pa join comp_assessments a on a.id = pa.assessment_id where a.candidate_name = '__smoke_test_p53__'
  ) or entity_id in (select id from comp_assessments where candidate_name = '__smoke_test_p53__');
  delete from personality_assessments where assessment_id in (select id from comp_assessments where candidate_name = '__smoke_test_p53__');
  delete from comp_assessments where candidate_name = '__smoke_test_p53__';
  raise;
end $$;
