-- ============================================================================
-- CLEANUP for supabase/seed/demo_candidates.sql — removes EVERY demo (test) row and nothing else.
--
-- What is removed (only ids recorded in public.comp_demo_seed_registry, plus anything that hangs
-- off them):
--   * the demo comp_assessments (+ any reassessment later created FROM a demo candidate in the UI,
--     i.e. the previous_assessment_id chain, as long as it still carries the «[آزمایشی] » prefix).
--     ON DELETE CASCADE then removes their panel, panel score sheets, attachments rows, interview
--     ratings, evidence rows, competency scores, AI analyses (comp_ai_analysis /
--     comp_candidate_ai_analysis), development plans + actions and personality assessments
--     (responses, dimension scores, validity results, personality AI analyses);
--   * comp_audit_log rows whose entity_id is one of those assessments / personality assessments;
--   * the demo blueprint and the demo technical / personality templates (title «[آزمایشی] …»);
--   * the usage counters the seed's real RPC calls added: comp_question_bank.usage_count and
--     personality_questions.usage_count are decremented by exactly what was added, and
--     personality_questions.last_used_at is restored to its pre-seed value unless a NON-demo
--     personality assessment has drawn that question since;
--   * finally the registry table itself.
--
-- Safety stops: aborts (changes nothing) if any registered assessment does not carry the demo
-- prefix. Real candidates, users, roles and question content are never touched.
--
-- NOT removable from SQL (reported as notices): files a tester uploaded to the private
-- `comp-docs` storage bucket under a demo candidate's folder — delete those folders from the
-- Supabase Storage UI (the notice lists the paths). The seed itself uploads no files.
-- Residual trace: comp_question_bank.updated_at and personality_questions.updated_at/updated_by of
-- the drawn questions were bumped by their updated_at triggers when the usage counters changed
-- (the same thing every real question draw does); they cannot be restored.
--
-- Run as `postgres` (Supabase SQL editor / MCP execute_sql). Idempotent: a second run is a no-op.
-- To preview, wrap it in `begin; … rollback;`.
-- ============================================================================
do $cleanup$
declare
  v_ids uuid[];
  v_pids uuid[];
  v_bad int;
  v_n int;
  v_paths text;
begin
  if to_regclass('public.comp_demo_seed_registry') is null then
    raise notice 'demo cleanup: no registry table — nothing to clean.';
    return;
  end if;

  -- Registered demo assessments + reassessments created from them later (same prefix, linked chain).
  with recursive chain as (
    select a.id from public.comp_assessments a
    join public.comp_demo_seed_registry r on r.entity = 'comp_assessments' and r.id = a.id
    union
    select a.id from public.comp_assessments a join chain c on a.previous_assessment_id = c.id
    where a.candidate_name like '[آزمایشی] %'
  )
  select array_agg(id) into v_ids from chain;
  v_ids := coalesce(v_ids, '{}');

  select count(*) into v_bad from public.comp_assessments where id = any(v_ids) and candidate_name not like '[آزمایشی] %';
  if v_bad > 0 then
    raise exception 'demo cleanup safety stop: % registered assessment(s) do not carry the «[آزمایشی] » prefix — nothing was changed', v_bad;
  end if;

  select array_agg(id) into v_pids from (
    select id from public.personality_assessments where assessment_id = any(v_ids)
    union
    select id from public.comp_demo_seed_registry where entity = 'personality_assessments'
  ) x;
  v_pids := coalesce(v_pids, '{}');

  begin
    select string_agg(name, ', ') into v_paths
    from storage.objects where bucket_id = 'comp-docs' and (storage.foldername(name))[1] = any(select unnest(v_ids)::text);
    if v_paths is not null then
      raise notice 'demo cleanup: storage objects under demo folders must be deleted from the Storage UI: %', v_paths;
    end if;
  exception when others then
    raise notice 'demo cleanup: could not list storage objects (%); check the comp-docs bucket for demo folders manually', sqlerrm;
  end;

  delete from public.comp_audit_log where entity_id = any(v_ids) or entity_id = any(v_pids);
  get diagnostics v_n = row_count;
  raise notice 'demo cleanup: % audit rows', v_n;

  delete from public.personality_assessments where id = any(v_pids);
  delete from public.comp_assessments where id = any(v_ids);
  get diagnostics v_n = row_count;
  raise notice 'demo cleanup: % assessments (children removed by cascade)', v_n;

  delete from public.comp_assessment_blueprints b
  using public.comp_demo_seed_registry r
  where r.entity = 'comp_assessment_blueprints' and r.id = b.id and b.title like '[آزمایشی] %';
  delete from public.comp_assessment_templates t
  using public.comp_demo_seed_registry r
  where r.entity = 'comp_assessment_templates' and r.id = t.id and t.title like '[آزمایشی] %';
  delete from public.personality_assessment_templates t
  using public.comp_demo_seed_registry r
  where r.entity = 'personality_assessment_templates' and r.id = t.id and t.title like '[آزمایشی] %';

  update public.comp_question_bank q
  set usage_count = greatest(0, q.usage_count - (r.meta ->> 'inc')::int)
  from public.comp_demo_seed_registry r
  where r.entity = 'comp_question_usage' and r.id = q.id;
  get diagnostics v_n = row_count;
  raise notice 'demo cleanup: usage_count restored on % technical questions', v_n;

  update public.personality_questions q
  set usage_count = greatest(0, q.usage_count - (r.meta ->> 'inc')::int),
      last_used_at = case
        when exists (
          select 1 from public.personality_assessments pa
          where pa.selected_question_ids ? q.id::text and pa.created_at > r.created_at
        ) then q.last_used_at
        else (r.meta ->> 'prev_last_used_at')::timestamptz
      end
  from public.comp_demo_seed_registry r
  where r.entity = 'personality_question_usage' and r.id = q.id;
  get diagnostics v_n = row_count;
  raise notice 'demo cleanup: usage_count/last_used_at restored on % personality questions', v_n;

  drop table public.comp_demo_seed_registry;
  raise notice 'demo cleanup: done — registry dropped.';
end $cleanup$;
