-- MCQ scoring v2: item types SINGLE (unchanged), MULTI (partial credit), NUMERIC (tolerance), ORDER (sequence).
-- SINGLE items score exactly as before, so existing tests/results are unaffected. Candidate RPCs still never return keys.
alter table comp_mcq_questions add column if not exists item_type text not null default 'SINGLE'
  check (item_type in ('SINGLE','MULTI','NUMERIC','ORDER'));
alter table comp_mcq_questions add column if not exists answer_key jsonb;
alter table comp_mcq_responses add column if not exists answer jsonb;
alter table comp_mcq_responses add column if not exists credit numeric;
alter table comp_mcq_tests add column if not exists scoring_version integer not null default 1;

create or replace function comp_mcq_item_credit(p_type text, p_key jsonb, p_correct smallint, p_chosen smallint, p_answer jsonb)
returns numeric language plpgsql immutable as $$
declare hits int; wrong int; nkey int; v numeric; tol numeric; a numeric; conc int := 0; i int; j int; pos jsonb;
begin
  if p_type = 'SINGLE' then
    return case when p_chosen is not null and p_chosen = p_correct then 1 else 0 end;
  elsif p_type = 'MULTI' then
    if p_answer is null or jsonb_typeof(p_answer) <> 'array' or p_key is null then return 0; end if;
    nkey := jsonb_array_length(p_key);
    select count(*) filter (where p_key @> to_jsonb(x::int)), count(*) filter (where not (p_key @> to_jsonb(x::int))) into hits, wrong
    from (select distinct jsonb_array_elements_text(p_answer) x) s;
    return greatest(0, (hits - wrong)::numeric / nullif(nkey,0));
  elsif p_type = 'NUMERIC' then
    if p_answer is null or p_key is null or (p_answer->>'value') is null then return 0; end if;
    begin a := (p_answer->>'value')::numeric; v := (p_key->>'value')::numeric; exception when others then return 0; end;
    tol := coalesce((p_key->>'tolPct')::numeric, 1);
    return case when abs(a - v) <= greatest(abs(v) * tol / 100.0, coalesce((p_key->>'tolAbs')::numeric, 0)) then 1 else 0 end;
  elsif p_type = 'ORDER' then
    if p_answer is null or jsonb_typeof(p_answer) <> 'array' or jsonb_array_length(p_answer) <> 4 or p_key is null then return 0; end if;
    if p_answer = p_key then return 1; end if;
    -- concordant pairs of the candidate order against the key order
    for i in 0..3 loop for j in i+1..3 loop
      if (select ord from jsonb_array_elements_text(p_key) with ordinality t(e, ord) where e = p_answer->>i)
       < (select ord from jsonb_array_elements_text(p_key) with ordinality t(e, ord) where e = p_answer->>j) then conc := conc + 1; end if;
    end loop; end loop;
    return greatest(0, (conc - 3)::numeric / 3) * 0.5;
  end if;
  return 0;
end $$;

create or replace function comp_mcq_candidate_answer_v2(p_token uuid, p_question_id uuid, p_answer jsonb, p_response_time_ms integer default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_t comp_mcq_tests%rowtype; v_a_status text; v_type text; v_opt smallint; v_ans jsonb;
begin
  select * into v_t from comp_mcq_tests where candidate_token = p_token;
  if not found then raise exception 'invalid token'; end if;
  select status into v_a_status from comp_assessments where id = v_t.assessment_id;
  if v_a_status = 'completed' then raise exception 'assessment_locked: this assessment is closed'; end if;
  if v_t.status <> 'IN_PROGRESS' then raise exception 'mcq_not_in_progress: this test is not open for answers (status %)', v_t.status; end if;
  if comp_mcq_finalize_if_expired(v_t.id) then return jsonb_build_object('saved', false, 'reason', 'TIME_OVER'); end if;
  if p_question_id is null or not (v_t.question_ids ? p_question_id::text) then raise exception 'question is not part of this test'; end if;
  select item_type into v_type from comp_mcq_questions where id = p_question_id;
  if v_type = 'SINGLE' then
    v_opt := (p_answer->>'option')::smallint;
    if v_opt is null or v_opt not between 0 and 3 then raise exception 'invalid option'; end if;
    v_ans := null;
  elsif v_type = 'MULTI' then
    if jsonb_typeof(p_answer->'picked') <> 'array' or jsonb_array_length(p_answer->'picked') > 4 then raise exception 'invalid answer'; end if;
    v_ans := p_answer->'picked';
  elsif v_type = 'NUMERIC' then
    if (p_answer->>'value') is null or (p_answer->>'value') !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception 'invalid number'; end if;
    v_ans := jsonb_build_object('value', (p_answer->>'value')::numeric);
  else
    if jsonb_typeof(p_answer->'order') <> 'array' or jsonb_array_length(p_answer->'order') <> 4 then raise exception 'invalid answer'; end if;
    v_ans := p_answer->'order';
  end if;
  insert into comp_mcq_responses (test_id, question_id, chosen_option, answer, response_time_ms, answered_at)
  values (v_t.id, p_question_id, v_opt, v_ans, least(greatest(coalesce(p_response_time_ms, 0), 0), 86400000), now())
  on conflict (test_id, question_id)
  do update set chosen_option = excluded.chosen_option, answer = excluded.answer, response_time_ms = excluded.response_time_ms, answered_at = now();
  return jsonb_build_object('saved', true);
end $$;
grant execute on function comp_mcq_candidate_answer_v2(uuid,uuid,jsonb,integer) to anon, authenticated;

-- Scoring core: per-item credit through comp_mcq_item_credit; "correct" = full credit; score = mean credit.
create or replace function comp_mcq_score_test_core(p_test_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_t comp_mcq_tests%rowtype; v_submitted timestamptz; v_total int; v_answered int; v_correct int; v_credit numeric;
  v_topics jsonb; v_categories jsonb; v_difficulties jsonb;
begin
  select * into v_t from comp_mcq_tests where id = p_test_id for update;
  if not found then raise exception 'test not found'; end if;
  if v_t.status = 'SCORED' then return; end if;
  if v_t.status = 'NOT_STARTED' then raise exception 'mcq_not_started: the candidate has not started this test'; end if;
  v_submitted := coalesce(v_t.submitted_at,
    case when p_reason = 'TIMEOUT' then least(now(), v_t.started_at + make_interval(mins => v_t.time_limit_minutes)) else now() end);

  perform set_config('comp.mcq_scoring', 'on', true);
  update comp_mcq_tests set status = 'SUBMITTED', submitted_at = v_submitted, submit_reason = coalesce(submit_reason, p_reason) where id = v_t.id;
  insert into comp_mcq_responses (test_id, question_id)
  select v_t.id, q.id from jsonb_array_elements_text(v_t.question_ids) sel(qid)
  join comp_mcq_questions q on q.id::text = sel.qid on conflict (test_id, question_id) do nothing;
  update comp_mcq_responses r
  set correct_option = q.correct_option,
      credit = comp_mcq_item_credit(q.item_type, q.answer_key, q.correct_option, r.chosen_option, r.answer),
      is_correct = comp_mcq_item_credit(q.item_type, q.answer_key, q.correct_option, r.chosen_option, r.answer) >= 1
  from comp_mcq_questions q where r.test_id = v_t.id and q.id = r.question_id;
  perform set_config('comp.mcq_scoring', '', true);

  with base as (
    select q.category, q.topic, q.difficulty, coalesce(r.is_correct, false) as ok, coalesce(r.credit, 0) as cr,
           (r.chosen_option is not null or r.answer is not null) as answered
    from comp_mcq_responses r join comp_mcq_questions q on q.id = r.question_id
    where r.test_id = v_t.id and v_t.question_ids ? r.question_id::text
  )
  select count(*)::int, count(*) filter (where answered)::int, count(*) filter (where ok)::int, coalesce(sum(cr), 0),
    (select coalesce(jsonb_agg(jsonb_build_object('topic', x.topic, 'category', x.category, 'total', x.total, 'answered', x.answered,
       'correct', x.correct, 'percent', round(x.cr * 100.0 / x.total, 1)) order by x.category, x.topic), '[]'::jsonb)
     from (select b.category, b.topic, count(*)::int total, count(*) filter (where b.answered)::int answered, count(*) filter (where b.ok)::int correct, sum(b.cr) cr from base b group by b.category, b.topic) x),
    (select coalesce(jsonb_agg(jsonb_build_object('category', x.category, 'total', x.total, 'answered', x.answered,
       'correct', x.correct, 'percent', round(x.cr * 100.0 / x.total, 1)) order by x.category), '[]'::jsonb)
     from (select b.category, count(*)::int total, count(*) filter (where b.answered)::int answered, count(*) filter (where b.ok)::int correct, sum(b.cr) cr from base b group by b.category) x),
    (select coalesce(jsonb_agg(jsonb_build_object('difficulty', x.difficulty, 'total', x.total, 'answered', x.answered,
       'correct', x.correct, 'percent', round(x.cr * 100.0 / x.total, 1)) order by x.difficulty), '[]'::jsonb)
     from (select b.difficulty, count(*)::int total, count(*) filter (where b.answered)::int answered, count(*) filter (where b.ok)::int correct, sum(b.cr) cr from base b group by b.difficulty) x)
  into v_total, v_answered, v_correct, v_credit, v_topics, v_categories, v_difficulties from base;

  update comp_mcq_tests
  set status = 'SCORED', scored_at = now(), total_questions = v_total, answered_count = v_answered, correct_count = v_correct,
      score_percent = case when v_total > 0 then round(v_credit * 100.0 / v_total, 1) else 0 end, scoring_version = 2,
      time_spent_seconds = greatest(0, extract(epoch from (v_submitted - v_t.started_at))::int),
      topic_scores = v_topics, category_scores = v_categories, difficulty_scores = v_difficulties
  where id = v_t.id;

  perform comp_log_audit('MCQ_TEST_SCORED', 'comp_mcq_tests', v_t.id, null, jsonb_build_object(
    'assessmentId', v_t.assessment_id, 'reason', p_reason, 'total', v_total, 'answered', v_answered, 'correct', v_correct,
    'scorePercent', case when v_total > 0 then round(v_credit * 100.0 / v_total, 1) else 0 end, 'scoringVersion', 2));
end $$;

-- Candidate read model: item type + unit; options hidden for NUMERIC; answers carry the payload (never keys).
create or replace function comp_mcq_candidate_get(p_token uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_t comp_mcq_tests%rowtype; v_a comp_assessments%rowtype; v_label text; v_questions jsonb := '[]'::jsonb; v_answers jsonb := '{}'::jsonb;
begin
  select * into v_t from comp_mcq_tests where candidate_token = p_token;
  if not found then return null; end if;
  if comp_mcq_finalize_if_expired(v_t.id) then select * into v_t from comp_mcq_tests where id = v_t.id; end if;
  select * into v_a from comp_assessments where id = v_t.assessment_id;
  select coalesce(nullif(label_fa, ''), job_role) into v_label from comp_job_role_config where job_role = v_t.job_role;
  if v_t.status = 'IN_PROGRESS' and v_a.status <> 'completed' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'type', q.item_type, 'stem', q.stem_fa, 'unit', case when q.item_type = 'NUMERIC' then q.answer_key->>'unit' end,
      'options', case when q.item_type = 'NUMERIC' then '[]'::jsonb else (
        select jsonb_agg(jsonb_build_object('key', p.idx::int, 'text', q.options ->> p.idx::int) order by p.ord)
        from jsonb_array_elements_text(coalesce(v_t.option_orders -> q.id::text, '[0,1,2,3]'::jsonb)) with ordinality p(idx, ord)) end
    ) order by sel.ord), '[]'::jsonb)
    into v_questions
    from jsonb_array_elements_text(v_t.question_ids) with ordinality sel(qid, ord)
    join comp_mcq_questions q on q.id::text = sel.qid;
    select coalesce(jsonb_object_agg(r.question_id::text, jsonb_build_object('option', r.chosen_option, 'payload', r.answer, 'timeMs', r.response_time_ms)), '{}'::jsonb)
    into v_answers from comp_mcq_responses r where r.test_id = v_t.id and (r.chosen_option is not null or r.answer is not null);
  end if;
  return jsonb_build_object('status', v_t.status, 'locked', v_a.status = 'completed', 'candidateName', v_a.candidate_name,
    'jobRoleLabel', coalesce(v_label, v_t.job_role), 'questionCount', jsonb_array_length(v_t.question_ids),
    'timeLimitMinutes', v_t.time_limit_minutes, 'startedAt', v_t.started_at,
    'deadlineAt', case when v_t.started_at is not null then v_t.started_at + make_interval(mins => v_t.time_limit_minutes) end,
    'submittedAt', v_t.submitted_at, 'serverNow', now(), 'questions', v_questions, 'answers', v_answers);
end $$;

-- Staff read model: item type, key, answer and credit per item.
create or replace function comp_mcq_get_test_detail(p_assessment_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_t comp_mcq_tests%rowtype; v_items jsonb;
begin
  if auth.uid() is null or not comp_can_access_assessment(p_assessment_id) then raise exception 'forbidden'; end if;
  select * into v_t from comp_mcq_tests where assessment_id = p_assessment_id;
  if not found then return null; end if;
  if comp_mcq_finalize_if_expired(v_t.id) then select * into v_t from comp_mcq_tests where id = v_t.id; end if;
  if comp_is_module_admin() then
    select coalesce(jsonb_agg(jsonb_build_object(
      'order', sel.ord, 'questionId', q.id, 'version', q.version, 'category', q.category, 'topic', q.topic, 'difficulty', q.difficulty,
      'stem', q.stem_fa, 'options', q.options, 'itemType', q.item_type, 'answerKey', q.answer_key,
      'correctOption', coalesce(r.correct_option, q.correct_option), 'chosenOption', r.chosen_option, 'answer', r.answer, 'credit', r.credit,
      'isCorrect', case when v_t.status = 'SCORED' then coalesce(r.is_correct, false) end,
      'responseTimeMs', r.response_time_ms, 'answeredAt', r.answered_at, 'explanation', q.explanation_fa, 'standardRef', q.standard_ref
    ) order by sel.ord), '[]'::jsonb)
    into v_items
    from jsonb_array_elements_text(v_t.question_ids) with ordinality sel(qid, ord)
    join comp_mcq_questions q on q.id::text = sel.qid
    left join comp_mcq_responses r on r.test_id = v_t.id and r.question_id = q.id;
  else v_items := '[]'::jsonb; end if;
  return jsonb_build_object('id', v_t.id, 'assessmentId', v_t.assessment_id, 'status', v_t.status,
    'candidateToken', case when comp_is_lead(p_assessment_id) or comp_is_assessment_designer() then v_t.candidate_token end,
    'questionCount', jsonb_array_length(v_t.question_ids), 'timeLimitMinutes', v_t.time_limit_minutes, 'generation', v_t.generation,
    'startedAt', v_t.started_at, 'submittedAt', v_t.submitted_at, 'submitReason', v_t.submit_reason, 'scoredAt', v_t.scored_at,
    'totalQuestions', v_t.total_questions,
    'answeredCount', coalesce(v_t.answered_count, (select count(*) from comp_mcq_responses x where x.test_id = v_t.id and (x.chosen_option is not null or x.answer is not null))),
    'correctCount', v_t.correct_count, 'scorePercent', v_t.score_percent, 'timeSpentSeconds', v_t.time_spent_seconds,
    'topicScores', v_t.topic_scores, 'categoryScores', v_t.category_scores, 'difficultyScores', v_t.difficulty_scores,
    'scoringVersion', v_t.scoring_version, 'createdAt', v_t.created_at, 'items', v_items);
end $$;


create or replace function comp_mcq_questions_guard() returns trigger language plpgsql set search_path to 'public' as $$
declare
  v_trusted boolean := current_user in ('postgres', 'supabase_admin', 'service_role') or comp_is_module_admin();
  v_content_changed boolean;
begin
  if new.item_type <> 'NUMERIC' and (select count(distinct btrim(o)) from jsonb_array_elements_text(new.options) o where btrim(o) <> '') <> 4 then
    raise exception 'invalid options: an MCQ needs four distinct, non-empty options';
  end if;
  if new.item_type = 'NUMERIC' and (new.answer_key is null or (new.answer_key->>'value') is null) then
    raise exception 'invalid answer key: a numeric item needs a value';
  end if;
  if new.item_type in ('MULTI','ORDER') and (new.answer_key is null or jsonb_typeof(new.answer_key) <> 'array' or jsonb_array_length(new.answer_key) = 0) then
    raise exception 'invalid answer key: this item type needs an index array';
  end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.version := 1; new.usage_count := 0;
    if not v_trusted then new.approval_status := 'PENDING_REVIEW'; end if;
    return new;
  end if;
  v_content_changed := (new.job_role, new.category, new.topic, new.difficulty, new.stem_fa, new.options, new.correct_option, new.explanation_fa, new.standard_ref, new.item_type, new.answer_key)
    is distinct from (old.job_role, old.category, old.topic, old.difficulty, old.stem_fa, old.options, old.correct_option, old.explanation_fa, old.standard_ref, old.item_type, old.answer_key);
  if not v_trusted then
    if new.approval_status = 'APPROVED' and old.approval_status <> 'APPROVED' then raise exception 'forbidden: only a module admin can approve an MCQ'; end if;
    if new.usage_count is distinct from old.usage_count or new.last_used_at is distinct from old.last_used_at then raise exception 'forbidden: usage counters are maintained by test generation'; end if;
    if v_content_changed then new.approval_status := 'PENDING_REVIEW'; end if;
  end if;
  new.created_by := old.created_by; new.created_at := old.created_at;
  if v_content_changed then new.version := old.version + 1; else new.version := old.version; end if;
  if (to_jsonb(new) - array['usage_count', 'last_used_at', 'updated_at', 'updated_by']) = (to_jsonb(old) - array['usage_count', 'last_used_at', 'updated_at', 'updated_by']) then
    new.updated_at := old.updated_at; new.updated_by := old.updated_by;
  else new.updated_at := now(); new.updated_by := auth.uid(); end if;
  return new;
end $$;
