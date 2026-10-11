-- Item analysis for the online MCQ bank: per question, how many scored sittings answered it and how many got it right.
-- A question nearly everybody answers correctly adds nothing; once it has enough sittings it can be retired.
create or replace function public.comp_mcq_item_stats(p_min_n int default 5)
returns table (question_id uuid, job_role text, topic text, difficulty smallint, n int, correct_rate numeric, flag text, active boolean)
language sql stable security definer set search_path = public as $$
  select q.id, q.job_role, q.topic, q.difficulty, coalesce(s.n, 0)::int, round(coalesce(s.p, 0), 3),
    case when coalesce(s.n, 0) < p_min_n then 'NOT_ENOUGH_DATA' when s.p >= 0.9 then 'TOO_EASY' when s.p <= 0.2 then 'TOO_HARD' else 'OK' end, q.active
  from comp_mcq_questions q
  left join (
    select r.question_id, count(*) n, avg(case when r.is_correct then 1.0 else 0.0 end) p
    from comp_mcq_responses r join comp_mcq_tests t on t.id = r.test_id and t.status = 'SCORED'
    group by r.question_id
  ) s on s.question_id = q.id
  where (comp_is_module_admin() or comp_is_question_designer('MCQ'));
$$;

create or replace function public.comp_mcq_retire_easy(p_threshold numeric default 0.9, p_min_n int default 5)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not (comp_is_module_admin() or comp_is_question_designer('MCQ')) then raise exception 'forbidden'; end if;
  with easy as (select question_id from comp_mcq_item_stats(p_min_n) where flag <> 'NOT_ENOUGH_DATA' and correct_rate >= p_threshold and active)
  update comp_mcq_questions q set active = false, updated_at = now() from easy where q.id = easy.question_id;
  get diagnostics v_n = row_count;
  perform comp_log_audit('MCQ_EASY_ITEMS_RETIRED', 'comp_mcq_questions', null, null, jsonb_build_object('count', v_n, 'threshold', p_threshold, 'minSittings', p_min_n));
  return v_n;
end $$;
grant execute on function public.comp_mcq_item_stats(int), public.comp_mcq_retire_easy(numeric, int) to authenticated;
