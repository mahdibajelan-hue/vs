-- Public result links used to live forever. Each now expires (default 30 days), can be renewed or revoked by the assessment lead.
alter table comp_assessments add column if not exists results_share_expires_at timestamptz;
alter table personality_assessments add column if not exists results_share_expires_at timestamptz;
update comp_assessments set results_share_expires_at = now() + interval '30 days' where results_share_expires_at is null;
update personality_assessments set results_share_expires_at = now() + interval '30 days' where results_share_expires_at is null;
alter table comp_assessments alter column results_share_expires_at set default (now() + interval '30 days');
alter table personality_assessments alter column results_share_expires_at set default (now() + interval '30 days');

do $patch$
declare f text; v_src text; v_new text;
begin
  foreach f in array array['comp_public_competency_scores_get','comp_public_extra_scores_get','comp_public_results_get','personality_public_results_get'] loop
    select pg_get_functiondef(p.oid) into v_src from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f;
    if position('results_share_expires_at' in v_src) > 0 then continue; end if;
    v_new := replace(v_src, 'pa.results_share_token = p_token', '@@PA@@');
    v_new := replace(v_new, 'a.results_share_token = p_token', 'a.results_share_token = p_token and (a.results_share_expires_at is null or a.results_share_expires_at > now())');
    v_new := replace(v_new, '@@PA@@', 'pa.results_share_token = p_token and (pa.results_share_expires_at is null or pa.results_share_expires_at > now())');
    execute v_new;
  end loop;
end $patch$;

create or replace function public.comp_set_results_link(p_assessment uuid, p_days int default 30, p_regenerate boolean default false)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_until timestamptz;
begin
  if not (comp_is_lead(p_assessment) or comp_is_module_admin()) then raise exception 'forbidden'; end if;
  if p_days is null or p_days not between 0 and 365 then raise exception 'invalid_days (0-365; 0 closes the link now)'; end if;
  v_until := now() + make_interval(days => p_days);
  update comp_assessments set results_share_expires_at = v_until, results_share_token = case when p_regenerate then gen_random_uuid() else results_share_token end where id = p_assessment;
  update personality_assessments set results_share_expires_at = v_until, results_share_token = case when p_regenerate then gen_random_uuid() else results_share_token end where assessment_id = p_assessment;
  perform comp_log_audit('RESULTS_LINK_SET', 'comp_assessments', p_assessment, null, jsonb_build_object('days', p_days, 'regenerated', p_regenerate));
  return v_until;
end $$;
grant execute on function public.comp_set_results_link(uuid, int, boolean) to authenticated;
