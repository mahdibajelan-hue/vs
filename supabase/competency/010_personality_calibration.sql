-- Personality scoring calibration (applies in place, safe to run again).
-- Problems found on live data: 21 % of all behavioural-dimension scores were exactly 100 and 49 % rested on a
-- single item; a forced-choice answer gave the chosen dimension 1.0 and the rejected one nothing; response
-- validity was reported but never touched the scores; extreme responding was never flagged.
-- Changes (patched into personality_score_assessment_core):
--   1. forced choice is ipsative: chosen option → 1, rejected option → 0
--   2. social-desirability flag from 70 (was 80), new EXTREME_RESPONDING flag from 65 % of answers at the scale ends
--   3. scores are calibrated: 50 + (raw − 50) × reliability × validity.  raw_score keeps the uncorrected 0–1 mean.
--      reliability by item count: 1 → .55, 2 → .75, 3 → .90, 4 → .95, ≥5 → 1
--      validity factor: 1 − (.2 if desirability ≥ 80, .1 if ≥ 65) − (.1 if extreme ≥ 65 %) − (.15 if ≥ 2 contradictions), floor .6
do $patch$
declare
  v_src text := pg_get_functiondef('public.personality_score_assessment_core(uuid)'::regprocedure);
  v_vf text := 'greatest(0.6, 1 - case when coalesce(v_sd,0) >= 80 then 0.2 when coalesce(v_sd,0) >= 65 then 0.1 else 0 end - case when coalesce(v_extreme,0) >= 0.65 then 0.1 else 0 end - case when coalesce(v_contradictions,0) >= 2 then 0.15 else 0 end)';
  v_new text;
begin
  if position('calibrated' in v_src) > 0 then raise notice 'already calibrated'; return; end if;
  v_new := replace(v_src, 'case when q.question_type = ''FORCED_CHOICE'' then 1.0 else (opt->>''score'')::numeric / 5.0 end as v',
                          'case when q.question_type = ''FORCED_CHOICE'' then (case when (r.response_value->>''selected_option'') = (opt->>''key'') then 1.0 else 0.0 end) else (opt->>''score'')::numeric / 5.0 end as v');
  v_new := replace(v_new, 'and (r.response_value->>''selected_option'') = (opt->>''key'')',
                          'and (r.response_value ? ''selected_option'') and (q.question_type = ''FORCED_CHOICE'' or (r.response_value->>''selected_option'') = (opt->>''key''))');
  v_new := replace(v_new, 'v_sd >= 80 then ''SOCIAL_DESIRABILITY'' end', 'v_sd >= 70 then ''SOCIAL_DESIRABILITY'' end, case when v_extreme is not null and v_extreme >= 0.65 then ''EXTREME_RESPONDING'' end');
  v_new := replace(v_new, '''reviewReasons'', to_jsonb(v_review)', '''reviewReasons'', to_jsonb(v_review), ''validityFactor'', ' || v_vf || ', ''calibrated'', true');
  v_new := replace(v_new, 'update personality_assessments pa2',
    'update personality_dimension_scores s set normalized_score = round(50 + (s.raw_score * 100 - 50) * (case when s.coverage_count >= 5 then 1.0 when s.coverage_count = 4 then 0.95 when s.coverage_count = 3 then 0.9 when s.coverage_count = 2 then 0.75 else 0.55 end) * ' || v_vf || ', 2), weighted_score = round(50 + (s.raw_score * 100 - 50) * (case when s.coverage_count >= 5 then 1.0 when s.coverage_count = 4 then 0.95 when s.coverage_count = 3 then 0.9 when s.coverage_count = 2 then 0.75 else 0.55 end) * ' || v_vf || ', 2) where s.personality_assessment_id = p_id and s.raw_score is not null;' || chr(10) || '  update personality_assessments pa2');
  if v_new = v_src then raise exception 'patch did not change the function'; end if;
  execute v_new;
end
$patch$;
