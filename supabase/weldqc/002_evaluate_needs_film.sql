-- weldqc 002 — an evaluation needs at least one film of the round whose quality was accepted (also in RS rounds, so a
-- repaired weld is never accepted without new radiography). Replaces wq_evaluate only; nothing else changes.
-- Rollback: re-run the wq_evaluate definition of 001_weldqc.sql.
create or replace function wq_evaluate(p_weld uuid, p_overall text, p_summary text, p_verdicts jsonb, p_thk numeric, p_name text) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare j wq_joints; v jsonb; new_id uuid;
begin
  j := wq_ensure_joint(p_weld);
  if not wq_can(j.project_id, 'submit') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if j.is_closed then raise exception 'file_closed'; end if;
  if p_overall not in ('accept', 'repair', 'cut_out') then raise exception 'invalid_status'; end if;
  if not exists (select 1 from wq_films where weld_id = p_weld and round = j.current_round and quality_status = 'accepted') then
    raise exception 'no_accepted_film';
  end if;
  insert into wq_evaluations (project_id, weld_id, round, overall_status, summary, verdicts, thk_mm, evaluated_name)
  values (j.project_id, p_weld, j.current_round, p_overall, coalesce(p_summary, ''), coalesce(p_verdicts, '[]'::jsonb), p_thk, coalesce(p_name, ''))
  returning id into new_id;
  for v in select * from jsonb_array_elements(coalesce(p_verdicts, '[]'::jsonb)) loop
    update wq_defects set verdict = v->>'verdict', verdict_reason = coalesce(v->>'reason', ''), repair_advice = coalesce(v->>'advice', '')
    where id = (v->>'id')::uuid and weld_id = p_weld and round = j.current_round and removed_at is null;
  end loop;
  return new_id;
end $f$;
