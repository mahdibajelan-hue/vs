-- comp_mcq_generate_test: the within-topic-rank tie-break now favours TECHNICAL items (-0.4) and non-SINGLE item types (-0.3),
-- so tests lean towards specialised, format-varied questions while still sampling every topic breadth-first (some misc. items remain).
create or replace function public.comp_mcq_generate_test(p_assessment_id uuid, p_question_count integer default 30, p_time_limit_minutes integer default 45, p_discard_existing boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_a comp_assessments%rowtype;
  v_old comp_mcq_tests%rowtype;
  v_token uuid;
  v_pool int;
  v_n int;
  v_quota int[];
  v_taken int[] := array[0, 0, 0];
  v_ids uuid[] := '{}';
  r record;
  v_order jsonb;
  v_perms jsonb;
  v_id uuid;
  v_archive jsonb;
  v_had_responses boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not (comp_is_lead(p_assessment_id) or comp_is_assessment_designer()) then
    raise exception 'forbidden';
  end if;
  select * into v_a from comp_assessments where id = p_assessment_id for update;
  if not found then
    raise exception 'assessment not found';
  end if;
  if v_a.status = 'completed' then
    raise exception 'assessment_locked: a completed assessment''s MCQ test cannot be regenerated';
  end if;
  if not v_a.needs_online_mcq then
    raise exception 'mcq_not_in_design: turn on «آزمون تستی آنلاین» in the exam design first';
  end if;
  if p_question_count is null or p_question_count not between 5 and 100 then
    raise exception 'invalid question count (5-100)';
  end if;
  if p_time_limit_minutes is null or p_time_limit_minutes not between 5 and 240 then
    raise exception 'invalid time limit (5-240 minutes)';
  end if;

  select count(*) into v_pool from comp_mcq_questions q
  where q.job_role = v_a.job_role and q.active and q.approval_status = 'APPROVED';
  if v_pool = 0 then
    raise exception 'mcq_no_questions: this job role has no approved MCQ questions yet';
  end if;
  v_n := least(p_question_count, v_pool);
  v_quota := array[round(v_n * 0.15)::int, 0, round(v_n * 0.45)::int];
  v_quota[2] := v_n - v_quota[1] - v_quota[3];

  select * into v_old from comp_mcq_tests where assessment_id = v_a.id for update;
  if found then
    v_had_responses := v_old.status <> 'NOT_STARTED' or exists (select 1 from comp_mcq_responses x where x.test_id = v_old.id);
    if v_had_responses and not coalesce(p_discard_existing, false) then
      raise exception 'responses_exist: the candidate has already started this test; confirm discarding it to regenerate';
    end if;
    if v_had_responses then
      select coalesce(jsonb_agg(jsonb_build_object('questionId', x.question_id, 'chosenOption', x.chosen_option,
        'responseTimeMs', x.response_time_ms, 'isCorrect', x.is_correct)), '[]'::jsonb)
      into v_archive from comp_mcq_responses x where x.test_id = v_old.id;
      perform comp_log_audit('MCQ_TEST_DISCARDED', 'comp_mcq_tests', v_old.id,
        jsonb_build_object('assessmentId', v_a.id, 'status', v_old.status, 'startedAt', v_old.started_at, 'scorePercent', v_old.score_percent,
          'questionIds', v_old.question_ids, 'responses', v_archive),
        jsonb_build_object('reason', 'regenerated'));
    else
      v_token := v_old.candidate_token;
    end if;
    delete from comp_mcq_tests where id = v_old.id;
  end if;

  -- Pass 1: breadth-first over topics, honoring the difficulty quotas; specialised / varied-format items win ties.
  for r in
    select x.id, x.difficulty
    from (
      select q.id, q.difficulty,
        row_number() over (partition by q.topic order by q.usage_count / 3, random()) as rn,
        random() - (case when q.category = 'TECHNICAL' then 0.4 else 0 end) - (case when q.item_type <> 'SINGLE' then 0.3 else 0 end) as tie
      from comp_mcq_questions q
      where q.job_role = v_a.job_role and q.active and q.approval_status = 'APPROVED'
    ) x
    order by x.rn, x.tie
  loop
    exit when coalesce(array_length(v_ids, 1), 0) >= v_n;
    if v_taken[r.difficulty] < v_quota[r.difficulty] then
      v_ids := v_ids || r.id;
      v_taken[r.difficulty] := v_taken[r.difficulty] + 1;
    end if;
  end loop;
  -- Pass 2: the pool could not meet a quota — fill up breadth-first, any difficulty.
  if coalesce(array_length(v_ids, 1), 0) < v_n then
    for r in
      select x.id, x.difficulty
      from (
        select q.id, q.difficulty, row_number() over (partition by q.topic order by random()) as rn,
          random() - (case when q.category = 'TECHNICAL' then 0.4 else 0 end) - (case when q.item_type <> 'SINGLE' then 0.3 else 0 end) as tie
        from comp_mcq_questions q
        where q.job_role = v_a.job_role and q.active and q.approval_status = 'APPROVED' and not (q.id = any(v_ids))
      ) x
      order by x.rn, x.tie
    loop
      exit when coalesce(array_length(v_ids, 1), 0) >= v_n;
      v_ids := v_ids || r.id;
      v_taken[r.difficulty] := v_taken[r.difficulty] + 1;
    end loop;
  end if;

  select jsonb_agg(u.id::text order by random()) into v_order from unnest(v_ids) u(id);
  select jsonb_object_agg(u.id::text, p.perm) into v_perms
  from unnest(v_ids) u(id)
  cross join lateral (select jsonb_agg(i order by random()) as perm from generate_series(0, 3) i where u.id is not null) p;

  insert into comp_mcq_tests (assessment_id, job_role, candidate_token, question_ids, option_orders, time_limit_minutes, generation)
  values (
    v_a.id, v_a.job_role, coalesce(v_token, gen_random_uuid()), v_order, v_perms, p_time_limit_minutes,
    jsonb_build_object(
      'requestedCount', p_question_count, 'drawnCount', v_n, 'poolSize', v_pool,
      'difficultyTarget', jsonb_build_object('1', v_quota[1], '2', v_quota[2], '3', v_quota[3]),
      'difficultyDrawn', jsonb_build_object('1', v_taken[1], '2', v_taken[2], '3', v_taken[3]),
      'topicsDrawn', (select jsonb_object_agg(t.topic, t.n) from (
        select q.topic, count(*) n from comp_mcq_questions q where q.id = any(v_ids) group by q.topic) t),
      'poolTopics', (select count(distinct q.topic) from comp_mcq_questions q
        where q.job_role = v_a.job_role and q.active and q.approval_status = 'APPROVED')
    )
  )
  returning id into v_id;

  update comp_mcq_questions set usage_count = usage_count + 1, last_used_at = now() where id = any(v_ids);

  perform comp_log_audit('MCQ_TEST_GENERATED', 'comp_mcq_tests', v_id, null, jsonb_build_object(
    'assessmentId', v_a.id, 'jobRole', v_a.job_role, 'count', v_n, 'timeLimitMinutes', p_time_limit_minutes,
    'discardedResponses', v_had_responses, 'keptLink', v_token is not null));
  return jsonb_build_object('testId', v_id, 'count', v_n, 'poolSize', v_pool, 'discardedResponses', v_had_responses, 'keptLink', v_token is not null);
end;
$function$;
