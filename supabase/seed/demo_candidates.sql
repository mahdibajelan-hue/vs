-- ============================================================================
-- DEMO (TEST) CANDIDATES for the Competency Assessment module — «داوطلبان آزمایشی»
--
-- Purpose: give the module owner realistic, end-to-end test data covering every stage of the
-- candidate flow (profile/self-service → panel → exam design → personality → technical questions →
-- structured interview → results/gap analysis → IDP → reassessment), so every feature can be
-- exercised in the UI. See docs/demo-test-report.md for the scenario matrix and a click-by-click
-- test guide.
--
-- SAFETY (this runs against the LIVE production database):
--   * Every candidate name is prefixed «[آزمایشی] », every email is demo.*@example.com and every
--     national id starts with 000000.
--   * Every created top-level row id is recorded in public.comp_demo_seed_registry (RLS on, no
--     policies, no grants to anon/authenticated → admin-only via SQL). Children (panel, scores,
--     ratings, evidence, personality responses/scores, IDPs, audit rows …) hang off those ids.
--   * The only EXISTING rows this script touches are the usage counters that the real flow bumps
--     (comp_question_bank.usage_count via comp_increment_question_usage, personality_questions
--     .usage_count/last_used_at via personality_increment_question_usage). Every increment is
--     recorded in the registry (entity comp_question_usage / personality_question_usage) so
--     demo_candidates_cleanup.sql can subtract exactly what was added.
--   * No auth.* rows are created and nobody's roles/permissions are changed.
--
-- HOW IT EXERCISES THE REAL LOGIC: every step runs AS THE ACTING USER, exactly like the UI would —
-- `set role authenticated` + request.jwt.claims {sub: <user>} for staff, `set role anon` for the
-- candidate's token links — so RLS policies and the SECURITY DEFINER RPCs' own permission checks
-- apply for real. The acting users are:
--   A  = 244bc5e5-d9f2-4931-b417-d7eea2ffd444 (mahdi.bajelan@gmail.com — system admin; creator/lead,
--        assessment designer, interview rater, IDP owner)
--   P1 = 404db5d6-5e3b-4b15-a436-0b12998746b9 (مهدی برومند — competency module admin) — panelist
--   P2 = 6f754038-59dc-4d0a-a635-124c6c36e63c (حامد رشیدی خالدی — competency module admin) — panelist
--   P3 = fd3fccad-adc8-4956-b606-638bd4ae58ac (مسعود علیخانی — competency module admin) — panelist
--   (P1–P3 only ever appear on demo candidates.)
-- AI analysis is deliberately NOT generated (the edge function needs a real user JWT and AI output
-- must never be fabricated) — generate it from the UI («تولید تحلیل»).
--
-- RE-RUNNING: the script SKIPS (notice + no-op) when demo candidates already exist. To refresh,
-- run supabase/seed/demo_candidates_cleanup.sql first, then this file again.
-- Run as the `postgres` role (Supabase SQL editor / MCP execute_sql), as ONE batch.
-- ============================================================================

create table if not exists public.comp_demo_seed_registry (
  entity text not null,
  id uuid not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (entity, id)
);
comment on table public.comp_demo_seed_registry is
  'Demo/test data registry (supabase/seed/demo_candidates.sql). Admin-only via SQL: RLS enabled, no policies, no grants.';
alter table public.comp_demo_seed_registry enable row level security;
revoke all on public.comp_demo_seed_registry from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Session-local helpers (pg_temp — vanish when the session ends, never visible to PostgREST).
-- ---------------------------------------------------------------------------------------------

-- Act as an authenticated staff user (null = back to postgres).
create or replace function pg_temp.demo_as(p_uid uuid) returns void language plpgsql as $f$
begin
  perform set_config('role', 'postgres', true);
  if p_uid is null then
    perform set_config('request.jwt.claims', '{}', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $f$;

-- Act as the anonymous candidate holding a token link.
create or replace function pg_temp.demo_as_anon() returns void language plpgsql as $f$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;

create or replace function pg_temp.demo_reg(p_entity text, p_id uuid, p_meta jsonb default '{}'::jsonb) returns void language sql as $f$
  insert into public.comp_demo_seed_registry (entity, id, meta) values (p_entity, p_id, coalesce(p_meta, '{}'::jsonb))
  on conflict (entity, id) do update set meta = public.comp_demo_seed_registry.meta || excluded.meta;
$f$;

-- Records one usage increment per id (called as postgres, right after the real RPC bumped it).
create or replace function pg_temp.demo_reg_usage(p_entity text, p_ids uuid[]) returns void language plpgsql as $f$
declare
  v uuid;
  v_prev timestamptz;
begin
  foreach v in array p_ids loop
    v_prev := null;
    if p_entity = 'personality_question_usage' then
      -- last_used_at was just overwritten by the RPC; the pre-seed value is only knowable on the
      -- first registration, from the snapshot taken in demo_snapshot_personality_last_used below.
      select (meta ->> 'prev_last_used_at')::timestamptz into v_prev from pg_temp.demo_pq_snapshot where id = v;
    end if;
    insert into public.comp_demo_seed_registry (entity, id, meta)
    values (p_entity, v, jsonb_build_object('inc', 1) || case when p_entity = 'personality_question_usage'
      then jsonb_build_object('prev_last_used_at', v_prev) else '{}'::jsonb end)
    on conflict (entity, id) do update
      set meta = public.comp_demo_seed_registry.meta || jsonb_build_object('inc', coalesce((public.comp_demo_seed_registry.meta ->> 'inc')::int, 0) + 1);
  end loop;
end $f$;

-- Pre-seed snapshot of personality_questions.last_used_at (restored by the cleanup script).
create temp table if not exists demo_pq_snapshot as
  select id, jsonb_build_object('prev_last_used_at', last_used_at) as meta from public.personality_questions;

-- The UI's default technical mix (AssessmentDesignerModal DEFAULT_COUNTS_PER_TYPE L1 2 / L2 3 /
-- L3 2 / L4 1 for every allowed question type of the role), after «محدود کردن به موجودی بانک»
-- (clampToAvailable) — i.e. exactly what a designer who accepts the defaults ends up generating.
create or replace function pg_temp.demo_default_mix(p_role text) returns jsonb language sql stable as $f$
  select coalesce(jsonb_agg(jsonb_build_object('category', t.cat, 'difficulty', d.diff, 'count', least(d.cnt, av.n)) order by t.ord, d.diff), '[]'::jsonb)
  from jsonb_array_elements_text(coalesce(
         (select allowed_question_types from public.comp_job_role_config where job_role = p_role),
         '["GENERAL","TECHNICAL","SCENARIO","PROBLEM_SOLVING","EXPERIENCE_BASED","CASE_STUDY","IMAGE_BASED","BEHAVIORAL","HSE","JUDGMENT"]'::jsonb
       )) with ordinality t(cat, ord)
  cross join (values ('L1', 2), ('L2', 3), ('L3', 2), ('L4', 1)) d(diff, cnt)
  cross join lateral (
    select count(*)::int n from public.comp_question_bank q
    where q.job_role = p_role and q.category = t.cat and q.difficulty = d.diff and q.active and q.approval_status = 'APPROVED'
  ) av
  where least(d.cnt, av.n) > 0;
$f$;

-- assignQuestionsFromMix/pickDiverseQuestions, server-side: per {category,difficulty,count} cell
-- the least-used active+approved rows first, spread round-robin over sub_category (topic).
create or replace function pg_temp.demo_pick_technical(p_role text, p_mix jsonb) returns jsonb language sql as $f$
  select coalesce(jsonb_agg(x.id::text order by x.cell_ord, x.pick_ord), '[]'::jsonb)
  from (
    select q.id, c.ord as cell_ord,
      row_number() over (partition by c.ord order by q.topic_rn, q.usage_count, md5(q.id::text || clock_timestamp()::text)) as pick_ord,
      (c.cell ->> 'count')::int as want
    from jsonb_array_elements(p_mix) with ordinality c(cell, ord)
    join lateral (
      select b.id, b.usage_count,
        row_number() over (partition by b.sub_category order by b.usage_count, md5(b.id::text || clock_timestamp()::text)) as topic_rn
      from public.comp_question_bank b
      where b.job_role = p_role and b.category = c.cell ->> 'category' and b.difficulty = c.cell ->> 'difficulty'
        and b.active and b.approval_status = 'APPROVED'
    ) q on true
  ) x
  where x.pick_ord <= x.want;
$f$;

-- generateFromMix (usePersonalityStore), server-side: random pick per {question_type,complexity,count}.
create or replace function pg_temp.demo_pick_personality(p_mix jsonb) returns jsonb language sql as $f$
  select coalesce(jsonb_agg(x.id::text order by x.cell_ord, x.pick_ord), '[]'::jsonb)
  from (
    select q.id, c.ord as cell_ord,
      row_number() over (partition by c.ord order by md5(q.id::text || clock_timestamp()::text)) as pick_ord,
      (c.cell ->> 'count')::int as want
    from jsonb_array_elements(p_mix) with ordinality c(cell, ord)
    join public.personality_questions q
      on q.question_type = c.cell ->> 'questionType' and q.complexity = c.cell ->> 'complexity'
     and q.active and q.approval_status = 'APPROVED'
  ) x
  where x.pick_ord <= x.want;
$f$;

-- One evaluator's technical score sheet for the assessment's frozen selection. p_base is the
-- candidate's "true" level on the 0–5 scale; harder questions and a deterministic per-rater noise
-- spread it realistically. p_fraction < 1 leaves the tail unanswered (a half-finished sheet).
create or replace function pg_temp.demo_build_answers(p_assessment uuid, p_base numeric, p_seed text, p_fraction numeric default 1, p_with_answer boolean default false)
returns jsonb language sql stable as $f$
  with sel as (
    select s.qid, s.ord, count(*) over () as total
    from public.comp_assessments a
    cross join lateral jsonb_array_elements_text(a.selected_question_ids) with ordinality s(qid, ord)
    where a.id = p_assessment
  ),
  scored as (
    select sel.qid, sel.ord,
      greatest(0, least(5, round(
        p_base
        - case q.difficulty when 'L1' then 0 when 'L2' then 0.2 when 'L3' then 0.45 else 0.7 end
        + ((abs(hashtext(sel.qid || p_seed)) % 5) - 2) * 0.3
      )))::int as score
    from sel join public.comp_question_bank q on q.id::text = sel.qid
    where sel.ord <= greatest(1, ceil(sel.total * p_fraction))
  )
  select coalesce(jsonb_object_agg(qid,
    jsonb_build_object(
      'score', score,
      'note', case score
        when 5 then 'پاسخ کامل و مستند به استاندارد؛ مثال اجرایی دقیق از پروژه قبلی ارائه شد.'
        when 4 then 'پاسخ صحیح با جزئیات کافی؛ یکی از نکات کلیدی ناقص بیان شد.'
        when 3 then 'پاسخ کلی درست است اما ارجاع دقیق به استاندارد/رویه ندارد.'
        when 2 then 'درک ناقص از موضوع؛ چند نکته کلیدی از قلم افتاد.'
        when 1 then 'پاسخ نادرست یا بسیار کلی؛ نیازمند آموزش پایه.'
        else 'پاسخ قابل‌قبولی ارائه نشد.' end
    ) || case when p_with_answer then jsonb_build_object('candidateAnswer', case
        when score >= 4 then 'متقاضی مراحل را به‌ترتیب و با ارجاع به بند استاندارد توضیح داد و یک نمونه واقعی از کارگاه ذکر کرد. (داده آزمایشی)'
        when score = 3 then 'متقاضی کلیات را درست گفت ولی به معیار پذیرش و مستندسازی اشاره نکرد. (داده آزمایشی)'
        else 'متقاضی پاسخ کلی و نامطمئن داد و روش کنترل را اشتباه بیان کرد. (داده آزمایشی)' end)
      else '{}'::jsonb end
  ), '{}'::jsonb)
  from scored;
$f$;

-- Candidate responses for a generated personality assessment. p_target = overall 0–1 tendency;
-- p_overrides = {DIMENSION_KEY|trait_key: 0–1} per-construct tendencies; p_mode 'straight' answers
-- every LIKERT/FREQUENCY item with the same value (straight-lining); p_skip leaves the last N items
-- unanswered. Returns [{qid, resp, ms}] in the assessment's frozen order.
create or replace function pg_temp.demo_build_responses(p_pa uuid, p_target numeric, p_overrides jsonb, p_mode text, p_seed text, p_skip int default 0, p_limit int default null)
returns jsonb language sql stable as $f$
  with sel as (
    select s.qid::uuid as qid, s.ord, count(*) over () as total
    from public.personality_assessments pa
    cross join lateral jsonb_array_elements_text(pa.selected_question_ids) with ordinality s(qid, ord)
    where pa.id = p_pa
  ),
  q as (
    select sel.qid, sel.ord, pq.question_type, pq.reverse_scored, pq.options, sc.min_value, sc.max_value, d.key as dim_key,
      greatest(0.0, least(1.0,
        coalesce((p_overrides ->> d.key)::numeric, (p_overrides ->> t.key)::numeric, p_target)
        + ((abs(hashtext(sel.qid::text || p_seed)) % 5) - 2) * 0.06
      )) as tv
    from sel
    join public.personality_questions pq on pq.id = sel.qid
    left join public.personality_response_scales sc on sc.id = pq.scale_id
    left join public.personality_behavioral_dimensions d on d.id = pq.dimension_id
    left join public.personality_traits t on t.id = pq.trait_id
    where sel.ord <= sel.total - p_skip and (p_limit is null or sel.ord <= p_limit)
  ),
  r as (
    select q.qid, q.ord,
      case
        when q.question_type in ('LIKERT', 'FREQUENCY') then jsonb_build_object('selected',
          case when p_mode = 'straight' then 4
               when q.reverse_scored then q.max_value + q.min_value - (q.min_value + round(q.tv * (q.max_value - q.min_value)))::int
               else (q.min_value + round(q.tv * (q.max_value - q.min_value)))::int end)
        when q.question_type = 'FORCED_CHOICE' then jsonb_build_object('selected_option', (
          select o ->> 'key' from jsonb_array_elements(q.options) o
          order by case when (o ->> 'dimension_key' = q.dim_key) = (q.tv >= 0.5) then 0 else 1 end, o ->> 'key' limit 1))
        else jsonb_build_object('selected_option', (
          select o ->> 'key' from jsonb_array_elements(q.options) o
          order by abs(coalesce((o ->> 'score')::numeric, 0) - q.tv * 5), abs(hashtext((o ->> 'key') || p_seed)) limit 1))
      end as resp
    from q
  )
  select coalesce(jsonb_agg(jsonb_build_object('qid', r.qid, 'resp', r.resp, 'ms', 3500 + abs(hashtext(r.qid::text || p_seed)) % 21000) order by r.ord), '[]'::jsonb)
  from r;
$f$;

-- ---------------------------------------------------------------------------------------------
-- Flow steps — each one switches to the acting user, does exactly what the UI does, switches back.
-- ---------------------------------------------------------------------------------------------

-- createAssessment (+ ASSESSMENT_CREATED audit). The default-blueprint trigger fires here.
create or replace function pg_temp.demo_create(p_lead uuid, p_role text, p_profile jsonb, p_interview_date date) returns uuid language plpgsql as $f$
declare
  v_id uuid := gen_random_uuid();
begin
  perform pg_temp.demo_as(p_lead);
  insert into public.comp_assessments (
    id, job_role, candidate_name, candidate_position, candidate_national_id, candidate_phone, candidate_email,
    candidate_birth_date, candidate_age, has_disability, disability_note, years_experience_total, years_experience_pipeline,
    current_employer, education, employment_history, certifications, notable_projects, interview_date, status, answers
  ) values (
    v_id, p_role, p_profile ->> 'name', coalesce(p_profile ->> 'position', ''), coalesce(p_profile ->> 'nid', ''),
    coalesce(p_profile ->> 'phone', ''), coalesce(p_profile ->> 'email', ''),
    (p_profile ->> 'birth')::date, (p_profile ->> 'age')::int, false, '',
    (p_profile ->> 'years_total')::numeric, (p_profile ->> 'years_pipeline')::numeric,
    coalesce(p_profile ->> 'employer', ''), coalesce(p_profile -> 'education', '[]'::jsonb),
    coalesce(p_profile -> 'employment', '[]'::jsonb), coalesce(p_profile -> 'certs', '[]'::jsonb),
    coalesce(p_profile ->> 'projects', ''), p_interview_date, 'draft', '{}'::jsonb
  );
  perform public.comp_log_audit('ASSESSMENT_CREATED', 'comp_assessments', v_id, null,
    jsonb_build_object('candidateName', p_profile ->> 'name', 'jobRole', p_role));
  perform pg_temp.demo_as(null);
  perform pg_temp.demo_reg('comp_assessments', v_id, jsonb_build_object('scenario', p_profile ->> 'scenario'));
  return v_id;
end $f$;

-- Self-service link: markSelfServiceSent → candidate (anon) opens + submits the full profile →
-- (optionally) staff markReviewed. p_until: 'pending' | 'submitted' | 'reviewed'.
create or replace function pg_temp.demo_self_service(p_lead uuid, p_id uuid, p_profile jsonb, p_until text, p_attachments jsonb default '[]'::jsonb) returns void language plpgsql as $f$
declare
  v_token uuid;
  v_found int;
  a jsonb;
begin
  perform pg_temp.demo_as(p_lead);
  update public.comp_assessments set self_service_status = 'pending' where id = p_id;
  select self_service_token into v_token from public.comp_assessments where id = p_id;
  if p_until = 'pending' then
    perform pg_temp.demo_as(null);
    return;
  end if;

  perform pg_temp.demo_as_anon();
  select count(*) into v_found from public.comp_self_service_get(v_token);
  if v_found <> 1 then
    raise exception 'self-service link did not resolve for %', p_id;
  end if;
  perform public.comp_self_service_submit(
    v_token, p_profile ->> 'name', p_profile ->> 'nid', p_profile ->> 'phone', p_profile ->> 'email',
    (p_profile ->> 'birth')::date, (p_profile ->> 'age')::int, false, '',
    (p_profile ->> 'years_total')::numeric, (p_profile ->> 'years_pipeline')::numeric, p_profile ->> 'employer',
    p_profile -> 'education', p_profile -> 'employment', p_profile -> 'certs', p_profile ->> 'projects'
  );
  -- Document METADATA only (no binary is uploaded — the file itself does not exist in storage).
  for a in select * from jsonb_array_elements(p_attachments) loop
    perform public.comp_self_service_add_attachment(v_token, a ->> 'kind', a ->> 'file', p_id::text || '/' || v_token::text || '/' || (a ->> 'path'));
  end loop;

  if p_until = 'reviewed' then
    perform pg_temp.demo_as(p_lead);
    update public.comp_assessments set self_service_status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  end if;
  perform pg_temp.demo_as(null);
end $f$;

-- Panel: setPanelSize + addPanelist (+ JUDGE_ASSIGNED audit per judge).
create or replace function pg_temp.demo_panel(p_lead uuid, p_id uuid, p_members uuid[], p_size int) returns void language plpgsql as $f$
declare
  m uuid;
begin
  perform pg_temp.demo_as(p_lead);
  update public.comp_assessments set panel_size = p_size where id = p_id;
  foreach m in array p_members loop
    insert into public.comp_panelists (id, assessment_id, user_id, is_lead) values (gen_random_uuid(), p_id, m, false);
    perform public.comp_log_audit('JUDGE_ASSIGNED', 'comp_panelists', p_id, null, jsonb_build_object('userId', m, 'isLead', false));
  end loop;
  perform pg_temp.demo_as(null);
end $f$;

-- Exam design (comp_set_exam_design — the RPC behind both the four toggles and «اعمال الگو»).
create or replace function pg_temp.demo_design(p_designer uuid, p_id uuid, p_pers boolean, p_tech boolean, p_interview boolean, p_exp boolean, p_blueprint uuid default null) returns void language plpgsql as $f$
begin
  perform pg_temp.demo_as(p_designer);
  perform public.comp_set_exam_design(p_id, p_pers, p_tech, p_interview, p_exp, p_blueprint);
  perform pg_temp.demo_as(null);
end $f$;

-- «طراحی ترکیب آزمون فنی» → generate: frozen selection + usage_count bump + QUESTION_GENERATED audit.
create or replace function pg_temp.demo_generate_technical(p_designer uuid, p_id uuid, p_mix jsonb, p_duration int default null) returns int language plpgsql as $f$
declare
  v_role text;
  v_sel jsonb;
  v_ids uuid[];
begin
  perform pg_temp.demo_as(p_designer);
  select job_role into v_role from public.comp_assessments where id = p_id;
  v_sel := pg_temp.demo_pick_technical(v_role, p_mix);
  update public.comp_assessments
    set selected_question_ids = v_sel, duration_minutes = p_duration, auto_finish_on_timeout = false
    where id = p_id;
  select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(v_sel) x;
  if v_ids is not null then
    perform public.comp_increment_question_usage(v_ids);
  end if;
  perform public.comp_log_audit('QUESTION_GENERATED', 'comp_assessments', p_id, null, jsonb_build_object('jobRole', v_role, 'count', jsonb_array_length(v_sel)));
  perform pg_temp.demo_as(null);
  if v_ids is not null then
    perform pg_temp.demo_reg_usage('comp_question_usage', v_ids);
  end if;
  return jsonb_array_length(v_sel);
end $f$;

-- A panelist's own score sheet (upsertMyPanelistScore) and, optionally, «ثبت نهایی امتیاز من».
create or replace function pg_temp.demo_panel_score(p_judge uuid, p_id uuid, p_base numeric, p_submit boolean, p_strengths text, p_dev text, p_fraction numeric default 1) returns void language plpgsql as $f$
declare
  v_answers jsonb;
begin
  v_answers := pg_temp.demo_build_answers(p_id, p_base, p_judge::text, p_fraction, true);
  perform pg_temp.demo_as(p_judge);
  insert into public.comp_panelist_scores (id, assessment_id, panelist_id, answers, strengths, development_areas, submitted_at)
  values (gen_random_uuid(), p_id, p_judge, v_answers, p_strengths, p_dev, case when p_submit then now() end)
  on conflict (assessment_id, panelist_id) do update
    set answers = excluded.answers, strengths = excluded.strengths, development_areas = excluded.development_areas,
        submitted_at = excluded.submitted_at;
  if p_submit then
    perform public.comp_log_audit('SCORE_SUBMITTED', 'comp_panelist_scores', p_id, null, jsonb_build_object('submittedAt', now()));
  end if;
  perform pg_temp.demo_as(null);
end $f$;

-- The lead scoring solo (no panel): setAnswer on comp_assessments.answers.
create or replace function pg_temp.demo_lead_answers(p_lead uuid, p_id uuid, p_base numeric) returns void language plpgsql as $f$
declare
  v_answers jsonb;
begin
  v_answers := pg_temp.demo_build_answers(p_id, p_base, 'lead', 1, true);
  perform pg_temp.demo_as(p_lead);
  update public.comp_assessments set answers = v_answers where id = p_id;
  perform pg_temp.demo_as(null);
end $f$;

-- Personality: createAssessment + generateFromMix (+ usage bump) as the designer, then the candidate
-- (anon, ?p_candidate=<token>) starts, answers and — optionally — finalizes (which scores it).
create or replace function pg_temp.demo_personality(
  p_designer uuid, p_id uuid, p_mix jsonb, p_target numeric, p_overrides jsonb, p_mode text,
  p_skip int default 0, p_finalize boolean default true, p_limit int default null
) returns uuid language plpgsql as $f$
declare
  v_pa uuid;
  v_token uuid;
  v_role text;
  v_sel jsonb;
  v_ids uuid[];
  v_resps jsonb;
  r jsonb;
  v_n int;
begin
  perform pg_temp.demo_as(p_designer);
  select job_role into v_role from public.comp_assessments where id = p_id;
  v_pa := gen_random_uuid();
  insert into public.personality_assessments (id, assessment_id, job_role, framework_id, job_profile_id, status)
  values (
    v_pa, p_id, v_role,
    (select id from public.personality_frameworks where active order by created_at limit 1),
    (select id from public.personality_job_behavioral_profiles where job_role = v_role and active order by created_at desc limit 1),
    'DRAFT'
  );
  v_sel := pg_temp.demo_pick_personality(p_mix);
  update public.personality_assessments set selected_question_ids = v_sel, status = 'GENERATED' where id = v_pa;
  select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(v_sel) x;
  if v_ids is not null then
    perform public.personality_increment_question_usage(v_ids);
  end if;
  select candidate_token into v_token from public.personality_assessments where id = v_pa;
  perform pg_temp.demo_as(null);
  perform pg_temp.demo_reg('personality_assessments', v_pa, jsonb_build_object('assessmentId', p_id));
  if v_ids is not null then
    perform pg_temp.demo_reg_usage('personality_question_usage', v_ids);
  end if;

  v_resps := pg_temp.demo_build_responses(v_pa, p_target, coalesce(p_overrides, '{}'::jsonb), p_mode, p_id::text, p_skip, p_limit);

  perform pg_temp.demo_as_anon();
  select count(*) into v_n from public.personality_candidate_get(v_token);
  if v_n <> 1 then
    raise exception 'personality candidate link did not resolve for %', p_id;
  end if;
  perform public.personality_candidate_start(v_token);
  for r in select * from jsonb_array_elements(v_resps) loop
    perform public.personality_candidate_submit_response(v_token, (r ->> 'qid')::uuid, r -> 'resp', (r ->> 'ms')::int);
  end loop;
  if p_finalize then
    perform public.personality_candidate_finalize(v_token);
  end if;
  perform pg_temp.demo_as(null);
  return v_pa;
end $f$;

-- Structured interview: one rater rates every required competency that has a STRUCTURED_INTERVIEW
-- source (exactly the list StructuredInterviewStage shows). p_adj = {competency_key: ±delta}.
create or replace function pg_temp.demo_interview(p_rater uuid, p_id uuid, p_base numeric, p_adj jsonb default '{}'::jsonb) returns int language plpgsql as $f$
declare
  c record;
  v_rating int;
  v_n int := 0;
begin
  perform pg_temp.demo_as(p_rater);
  for c in
    select comp.id, comp.key
    from public.comp_assessments a
    join public.comp_job_competency_requirements r on r.job_role = a.job_role
    join public.comp_competencies comp on comp.id = r.competency_id and comp.active
    where a.id = p_id
      and exists (select 1 from public.comp_competency_evidence_sources s where s.competency_id = comp.id and s.source_type = 'STRUCTURED_INTERVIEW')
  loop
    v_rating := greatest(1, least(5, round(p_base + coalesce((p_adj ->> c.key)::numeric, 0)
      + ((abs(hashtext(c.key || p_rater::text)) % 3) - 1) * 0.4)))::int;
    insert into public.comp_interview_ratings (id, assessment_id, competency_id, rater_id, rating, notes)
    values (gen_random_uuid(), p_id, c.id, p_rater, v_rating, case v_rating
      when 5 then 'شواهد رفتاری قوی و مشخص (STAR کامل)؛ نمونه‌های متعدد از پروژه‌های قبلی با نتیجه قابل‌سنجش ارائه کرد.'
      when 4 then 'مثال مشخص و مرتبط ارائه داد؛ در بخش نتیجه/درس‌آموخته کمی کلی‌گویی داشت.'
      when 3 then 'پاسخ قابل‌قبول ولی بیشتر توصیفی بود تا مبتنی بر تجربه شخصی؛ پیگیری بیشتر لازم است.'
      when 2 then 'شواهد رفتاری کم؛ مثال‌ها کلی و بدون نقش شخصی روشن بود.'
      else 'نتوانست مثال واقعی ارائه کند؛ پاسخ‌ها با الزامات شغل فاصله جدی داشت.' end)
    on conflict (assessment_id, competency_id, rater_id) do update set rating = excluded.rating, notes = excluded.notes;
    v_n := v_n + 1;
  end loop;
  perform pg_temp.demo_as(null);
  return v_n;
end $f$;

-- ResultsStage: lead's narrative + «ثبت نهایی ارزیابی» (+ ASSESSMENT_FINALIZED audit) + approval.
create or replace function pg_temp.demo_finalize(p_lead uuid, p_id uuid, p_approved boolean, p_strengths text, p_dev text) returns void language plpgsql as $f$
begin
  perform pg_temp.demo_as(p_lead);
  update public.comp_assessments set strengths = p_strengths, development_areas = p_dev where id = p_id;
  update public.comp_assessments set status = 'completed' where id = p_id;
  perform public.comp_log_audit('ASSESSMENT_FINALIZED', 'comp_assessments', p_id, jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'completed'));
  if p_approved then
    update public.comp_assessments set is_approved = true where id = p_id;
  end if;
  perform pg_temp.demo_as(null);
end $f$;

create or replace function pg_temp.demo_compute(p_user uuid, p_id uuid) returns void language plpgsql as $f$
begin
  perform pg_temp.demo_as(p_user);
  perform public.comp_compute_competency_profile(p_id);
  perform pg_temp.demo_as(null);
end $f$;

-- ---------------------------------------------------------------------------------------------
-- The scenarios.
-- ---------------------------------------------------------------------------------------------
do $seed$
declare
  A constant uuid := '244bc5e5-d9f2-4931-b417-d7eea2ffd444';
  P1 constant uuid := '404db5d6-5e3b-4b15-a436-0b12998746b9';
  P2 constant uuid := '6f754038-59dc-4d0a-a635-124c6c36e63c';
  P3 constant uuid := 'fd3fccad-adc8-4956-b606-638bd4ae58ac';
  PX constant text := '[آزمایشی] ';
  -- UI default personality mix (PersonalityDesignerModal DEFAULT_COUNTS).
  PMIX constant jsonb := '[{"questionType":"LIKERT","complexity":"L1","count":20},{"questionType":"FREQUENCY","complexity":"L1","count":8},{"questionType":"FORCED_CHOICE","complexity":"L1","count":6},{"questionType":"SJT","complexity":"L2","count":4},{"questionType":"SJT","complexity":"L3","count":2}]';
  c01 uuid; c02 uuid; c03 uuid; c04 uuid; c05 uuid; c06 uuid; c07 uuid; c08 uuid; c09 uuid; c10 uuid; c11 uuid; c12 uuid;
  r02 uuid; r03 uuid;
  v_prof jsonb;
  v_tpl uuid;
  v_ptpl uuid;
  v_bp uuid;
  v_plan uuid;
  v_act record;
  v_i int;
  v_welding_tpl jsonb;
  v_seed jsonb;
begin
  perform pg_temp.demo_as(null);
  if exists (select 1 from public.comp_demo_seed_registry where entity = 'comp_assessments') then
    raise notice 'demo candidates already exist — run supabase/seed/demo_candidates_cleanup.sql first to refresh. Nothing done.';
    return;
  end if;
  if not exists (select 1 from public.profiles where id = A and is_admin) then
    raise exception 'precondition: acting admin % not found / not admin', A;
  end if;
  if (select count(*) from public.profiles where id in (P1, P2, P3)) <> 3 then
    raise exception 'precondition: one of the panelist profiles is missing';
  end if;

  -- =============================================================================================
  -- C01 — welding_inspector — «ستاره»: every method, high scores, 3 panelists all submitted,
  -- self-service submitted + reviewed, documents metadata, technical mix from the role's EXISTING
  -- saved template (template selection), completed + approved.
  -- =============================================================================================
  v_prof := jsonb_build_object(
    'scenario', 'C01-star', 'name', PX || 'آرش کیانی', 'position', 'بازرس ارشد جوش', 'nid', '0000000101',
    'phone', '09120000101', 'email', 'demo.arash.kiani@example.com', 'birth', '1987-04-12', 'age', 39,
    'years_total', 14, 'years_pipeline', 11, 'employer', 'شرکت بازرسی فنی آریا کیفیت (نمونه)',
    'education', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'degree', 'کارشناسی ارشد', 'field', 'مهندسی مواد — جوشکاری', 'institution', 'دانشگاه صنعتی اصفهان', 'year', '1391'),
      jsonb_build_object('id', gen_random_uuid(), 'degree', 'کارشناسی', 'field', 'مهندسی متالورژی', 'institution', 'دانشگاه تبریز', 'year', '1388')),
    'employment', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'شرکت بازرسی فنی آریا کیفیت (نمونه)', 'position', 'سرپرست بازرسی جوش خط لوله ۵۶ اینچ', 'startDate', '2019-03-21', 'endDate', '', 'insuranceMonths', 90, 'isPipelineRole', true, 'note', 'بازرسی جوش و کنترل WPS/PQR — داده آزمایشی'),
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'پیمانکار خطوط لوله نمونه', 'position', 'بازرس جوش', 'startDate', '2012-09-01', 'endDate', '2019-03-10', 'insuranceMonths', 78, 'isPipelineRole', true, 'note', '')),
    'certs', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'title', 'CSWIP 3.1 Welding Inspector', 'issuer', 'TWI', 'date', '2016-05-10', 'isPmp', false),
      jsonb_build_object('id', gen_random_uuid(), 'title', 'AWS CWI', 'issuer', 'AWS', 'date', '2018-11-02', 'isPmp', false),
      jsonb_build_object('id', gen_random_uuid(), 'title', 'ASNT NDT Level II — RT/UT', 'issuer', 'ASNT', 'date', '2015-02-20', 'isPmp', false),
      jsonb_build_object('id', gen_random_uuid(), 'title', 'ISO 9712 VT Level 2', 'issuer', 'BINDT', 'date', '2020-07-15', 'isPmp', false)),
    'projects', 'خط لوله انتقال گاز ۵۶ اینچ (نمونه)، ایستگاه تقویت فشار گاز (نمونه) — داده آزمایشی'
  );
  -- Staff create only the basic record; the candidate fills everything else via the self-service link.
  c01 := pg_temp.demo_create(A, 'welding_inspector',
    jsonb_build_object('scenario', 'C01-star', 'name', v_prof ->> 'name', 'position', v_prof ->> 'position', 'phone', v_prof ->> 'phone', 'email', v_prof ->> 'email'),
    current_date - 21);
  perform pg_temp.demo_self_service(A, c01, v_prof, 'reviewed', jsonb_build_array(
    jsonb_build_object('kind', 'resume', 'file', 'رزومه — نمونه آزمایشی (فایل ندارد).pdf', 'path', 'demo-resume.pdf'),
    jsonb_build_object('kind', 'certification', 'file', 'گواهی CSWIP — نمونه آزمایشی (فایل ندارد).pdf', 'path', 'demo-cswip.pdf')));
  perform pg_temp.demo_panel(A, c01, array[P1, P2, P3], 3);
  -- Default blueprint was auto-applied at insert (trigger). Template selection: the role's existing
  -- saved template «آزمون استاندارد — مهندس ناظر جوش» is used READ-ONLY (see the report: the UI would
  -- also re-save it in place on generate).
  select question_mix into v_welding_tpl from public.comp_assessment_templates where job_role = 'welding_inspector' order by created_at limit 1;
  perform pg_temp.demo_generate_technical(A, c01, coalesce(v_welding_tpl, pg_temp.demo_default_mix('welding_inspector')), 60);
  perform pg_temp.demo_personality(A, c01, PMIX, 0.85, '{"DETAIL_ORIENTATION":0.95,"RULE_ORIENTATION":0.9,"SAFETY_ORIENTATION":0.95,"INTEGRITY_ORIENTATION":0.95}', 'normal');
  perform pg_temp.demo_panel_score(P1, c01, 4.8, true, 'تسلط کامل بر WPS/PQR و معیارهای پذیرش API 1104؛ تجربه میدانی عمیق.', 'مستندسازی گزارش‌های روزانه می‌تواند خلاصه‌تر شود.');
  perform pg_temp.demo_panel_score(P2, c01, 4.6, true, 'تحلیل ریشه‌ای عیوب جوش بسیار دقیق؛ ارتباط خوب با پیمانکار.', 'آشنایی با بازرسی PAUT را تقویت کند.');
  perform pg_temp.demo_panel_score(P3, c01, 4.9, true, 'قاطعیت در رد جوش غیرمنطبق و رعایت کامل ITP.', 'انتقال دانش به بازرسان جوان را ساختارمند کند.');
  perform pg_temp.demo_interview(A, c01, 4.7);
  perform pg_temp.demo_interview(P1, c01, 4.5);
  perform pg_temp.demo_interview(P2, c01, 4.6);
  perform pg_temp.demo_finalize(A, c01, true, 'دانش فنی و تجربه عملی در سطح متخصص؛ پایبندی کامل به کیفیت و ایمنی.', 'رهبری تیم بازرسی و آموزش همکاران جوان.');
  perform pg_temp.demo_compute(A, c01);

  -- =============================================================================================
  -- C02 — pipeline_inspector — «متوسط با چند شکاف»: every method, 2 panelists, completed, IDP
  -- ACTIVE (mixed action statuses). Reassessment R02 below (improved, with one regression).
  -- =============================================================================================
  v_prof := jsonb_build_object(
    'scenario', 'C02-average', 'name', PX || 'بهنام رضایی', 'position', 'بازرس خط لوله', 'nid', '0000000102',
    'phone', '09120000102', 'email', 'demo.behnam.rezaei@example.com', 'birth', '1990-09-03', 'age', 36,
    'years_total', 8, 'years_pipeline', 5, 'employer', 'شرکت ساختمانی خط‌گستر (نمونه)',
    'education', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'degree', 'کارشناسی', 'field', 'مهندسی مکانیک', 'institution', 'دانشگاه شهید چمران اهواز', 'year', '1392')),
    'employment', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'شرکت ساختمانی خط‌گستر (نمونه)', 'position', 'بازرس خط لوله (Lowering/Backfill)', 'startDate', '2021-04-01', 'endDate', '', 'insuranceMonths', 64, 'isPipelineRole', true, 'note', ''),
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'کارخانه تجهیزات صنعتی نمونه', 'position', 'کارشناس کنترل کیفیت', 'startDate', '2018-02-01', 'endDate', '2021-03-15', 'insuranceMonths', 37, 'isPipelineRole', false, 'note', '')),
    'certs', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'title', 'دوره بازرسی خطوط لوله (API 1104 / ASME B31.8)', 'issuer', 'مرکز آموزش نمونه', 'date', '2021-10-01', 'isPmp', false),
      jsonb_build_object('id', gen_random_uuid(), 'title', 'HSE-MS پایه', 'issuer', 'مرکز آموزش نمونه', 'date', '2020-01-12', 'isPmp', false)),
    'projects', 'خط لوله ۴۲ اینچ (نمونه) — لوله‌گذاری و خاکریزی — داده آزمایشی');
  c02 := pg_temp.demo_create(A, 'pipeline_inspector', v_prof, current_date - 70);
  perform pg_temp.demo_self_service(A, c02, v_prof, 'submitted');
  perform pg_temp.demo_panel(A, c02, array[P1, P2], 2);
  perform pg_temp.demo_generate_technical(A, c02, pg_temp.demo_default_mix('pipeline_inspector'));
  perform pg_temp.demo_personality(A, c02, PMIX, 0.62, '{"COMMUNICATION":0.55,"DETAIL_ORIENTATION":0.5}', 'normal');
  perform pg_temp.demo_panel_score(P1, c02, 3.4, true, 'درک خوب از مراحل اجرایی لوله‌گذاری.', 'تسلط به معیارهای پذیرش و مستندسازی ITP ضعیف است.');
  perform pg_temp.demo_panel_score(P2, c02, 3.1, true, 'روحیه کار تیمی و پیگیری مناسب.', 'نیاز به تقویت دانش استانداردهای بازرسی.');
  perform pg_temp.demo_interview(A, c02, 3.1, '{"quality_compliance":-0.6,"technical_knowledge":-0.3}');
  perform pg_temp.demo_interview(P1, c02, 3.3, '{"quality_compliance":-0.5}');
  perform pg_temp.demo_finalize(A, c02, false, 'تجربه اجرایی مناسب و تعهد کاری.', 'دانش استانداردها و کنترل کیفیت (ITP، معیارهای پذیرش) نیازمند آموزش است.');
  perform pg_temp.demo_compute(A, c02);

  -- =============================================================================================
  -- C03 — hse_specialist — «ضعیف با شکاف حیاتی»: CRITICAL_GAP on the critical hse_awareness, IDP
  -- ACTIVE with owner/review date and mixed action statuses. Reassessment R03 below (strong
  -- improvement, gaps closed, DONE actions).
  -- =============================================================================================
  v_prof := jsonb_build_object(
    'scenario', 'C03-weak', 'name', PX || 'کاوه محمدی', 'position', 'کارشناس HSE', 'nid', '0000000103',
    'phone', '09120000103', 'email', 'demo.kaveh.mohammadi@example.com', 'birth', '1995-12-20', 'age', 30,
    'years_total', 3, 'years_pipeline', 1, 'employer', 'شرکت خدمات ایمنی نمونه',
    'education', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'degree', 'کارشناسی', 'field', 'مهندسی بهداشت حرفه‌ای', 'institution', 'دانشگاه علوم پزشکی نمونه', 'year', '1397')),
    'employment', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'شرکت خدمات ایمنی نمونه', 'position', 'کارشناس HSE کارگاه', 'startDate', '2023-06-01', 'endDate', '', 'insuranceMonths', 38, 'isPipelineRole', true, 'note', '')),
    'certs', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'title', 'دوره مقدماتی ایمنی کار در ارتفاع', 'issuer', 'مرکز آموزش نمونه', 'date', '2023-08-10', 'isPmp', false)),
    'projects', 'ایمنی کارگاه ایستگاه تقلیل فشار (نمونه) — داده آزمایشی');
  c03 := pg_temp.demo_create(A, 'hse_specialist', v_prof, current_date - 95);
  perform pg_temp.demo_panel(A, c03, array[P2, P3], 2);
  perform pg_temp.demo_generate_technical(A, c03, pg_temp.demo_default_mix('hse_specialist'));
  perform pg_temp.demo_personality(A, c03, PMIX, 0.35, '{"SAFETY_ORIENTATION":0.15,"RISK_AWARENESS":0.2,"ESCALATION_JUDGMENT":0.25,"ACCOUNTABILITY":0.3}', 'normal');
  perform pg_temp.demo_panel_score(P2, c03, 1.8, true, 'انگیزه یادگیری بالا.', 'شناخت ناکافی از شناسایی خطر (HAZID/JSA) و مقررات کار گرم.');
  perform pg_temp.demo_panel_score(P3, c03, 1.6, true, 'رفتار محترمانه با تیم.', 'ضعف جدی در ارزیابی ریسک و تصمیم‌گیری توقف کار.');
  perform pg_temp.demo_interview(A, c03, 1.6, '{"hse_awareness":-0.4,"professional_judgment":-0.2}');
  perform pg_temp.demo_interview(P2, c03, 1.9);
  perform pg_temp.demo_finalize(A, c03, false, 'انگیزه و روحیه یادگیری.', 'آگاهی HSE، ارزیابی ریسک و قضاوت در توقف کار — نیازمند برنامه توسعه فوری.');
  perform pg_temp.demo_compute(A, c03);
  -- IDP: seeded from the gaps, then run like a real plan (ACTIVE, owner, review date, progress).
  perform pg_temp.demo_as(A);
  perform public.comp_seed_development_plan(c03);
  select id into v_plan from public.comp_development_plans where assessment_id = c03 and status <> 'CANCELLED';
  update public.comp_development_plans
    set status = 'ACTIVE', owner_id = A, target_review_date = current_date + 30,
        summary = 'تمرکز بر آگاهی HSE و ارزیابی ریسک پیش از ارزیابی مجدد؛ هم‌ترازی با سرپرست HSE پروژه. (داده آزمایشی)'
    where id = v_plan;
  v_i := 0;
  for v_act in
    select a.id, c.key from public.comp_development_actions a left join public.comp_competencies c on c.id = a.competency_id
    where a.plan_id = v_plan order by a.sort_order
  loop
    v_i := v_i + 1;
    if v_act.key in ('hse_awareness', 'professional_judgment') then
      update public.comp_development_actions set status = 'DONE', owner_id = A,
        progress_note = 'دوره NEBOSH IGC گذرانده شد و ۳ ارزیابی ریسک کارگاهی زیر نظر مربی انجام شد. (داده آزمایشی)' where id = v_act.id;
    elsif v_i % 3 = 1 then
      update public.comp_development_actions set status = 'IN_PROGRESS', owner_id = A,
        progress_note = 'جلسات منتورینگ هفتگی آغاز شده؛ ۲ از ۶ جلسه برگزار شد. (داده آزمایشی)' where id = v_act.id;
    end if;
  end loop;
  insert into public.comp_development_actions (id, plan_id, competency_id, action_type, title, description, priority, due_date, status, owner_id, progress_note, source, sort_order)
  values (gen_random_uuid(), v_plan, (select id from public.comp_competencies where key = 'hse_awareness'), 'ON_THE_JOB',
    'همراهی با سرپرست HSE در بازدیدهای روزانه کارگاه (۴ هفته)', 'اقدام دستی — یادگیری در محل کار. (داده آزمایشی)',
    'HIGH', current_date + 21, 'NOT_STARTED', A, '', 'MANUAL', 100);
  perform pg_temp.demo_as(null);

  -- =============================================================================================
  -- C04 — coating_cp_inspector — «شواهد ناکافی»: personality AND structured interview switched OFF
  -- in the design (after the default blueprint was auto-applied → «طرح پس از اعمال الگو دستی
  -- تغییر کرده»), no panel (the lead scores solo), competencies fed only by personality/interview
  -- → INSUFFICIENT_EVIDENCE; IDP (DRAFT) with «ارزیابی تکمیلی» actions.
  -- =============================================================================================
  v_prof := jsonb_build_object(
    'scenario', 'C04-insufficient-evidence', 'name', PX || 'سارا احمدی', 'position', 'بازرس پوشش و حفاظت کاتدی', 'nid', '0000000104',
    'phone', '09120000104', 'email', 'demo.sara.ahmadi@example.com', 'birth', '1992-02-14', 'age', 34,
    'years_total', 9, 'years_pipeline', 7, 'employer', 'شرکت پوشش‌های صنعتی نمونه',
    'education', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'degree', 'کارشناسی ارشد', 'field', 'مهندسی خوردگی و حفاظت مواد', 'institution', 'دانشگاه صنعتی شریف', 'year', '1395')),
    'employment', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'شرکت پوشش‌های صنعتی نمونه', 'position', 'بازرس پوشش سرجوش و CP', 'startDate', '2017-05-01', 'endDate', '', 'insuranceMonths', 112, 'isPipelineRole', true, 'note', '')),
    'certs', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'title', 'AMPP (NACE) CIP Level 2', 'issuer', 'AMPP', 'date', '2019-03-01', 'isPmp', false),
      jsonb_build_object('id', gen_random_uuid(), 'title', 'AMPP CP2 — Cathodic Protection Technician', 'issuer', 'AMPP', 'date', '2021-09-01', 'isPmp', false)),
    'projects', 'پوشش سه‌لایه پلی‌اتیلن و CP خط لوله (نمونه) — داده آزمایشی');
  c04 := pg_temp.demo_create(A, 'coating_cp_inspector', v_prof, current_date - 30);
  perform pg_temp.demo_design(A, c04, false, true, false, true);
  perform pg_temp.demo_generate_technical(A, c04, pg_temp.demo_default_mix('coating_cp_inspector'));
  perform pg_temp.demo_lead_answers(A, c04, 3.9);
  perform pg_temp.demo_finalize(A, c04, false, 'دانش فنی پوشش و CP در سطح خوب.', 'به‌دلیل حذف مصاحبه و آزمون شخصیت از طرح، شایستگی‌های رفتاری ارزیابی نشده‌اند.');
  perform pg_temp.demo_compute(A, c04);
  perform pg_temp.demo_as(A);
  perform public.comp_seed_development_plan(c04);
  perform pg_temp.demo_as(null);

  -- =============================================================================================
  -- C05 — project_control_specialist — «فقط فنی»: personality OFF, a single panelist
  -- (panel_size 1), structured interview by the lead only, completed.
  -- =============================================================================================
  v_prof := jsonb_build_object(
    'scenario', 'C05-technical-only', 'name', PX || 'مریم حسینی', 'position', 'کارشناس کنترل پروژه', 'nid', '0000000105',
    'phone', '09120000105', 'email', 'demo.maryam.hosseini@example.com', 'birth', '1991-06-30', 'age', 35,
    'years_total', 10, 'years_pipeline', 6, 'employer', 'شرکت مدیریت طرح نمونه',
    'education', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'degree', 'کارشناسی ارشد', 'field', 'مهندسی صنایع — مدیریت پروژه', 'institution', 'دانشگاه علم و صنعت', 'year', '1394'),
      jsonb_build_object('id', gen_random_uuid(), 'degree', 'کارشناسی', 'field', 'مهندسی عمران', 'institution', 'دانشگاه گیلان', 'year', '1391')),
    'employment', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'شرکت مدیریت طرح نمونه', 'position', 'کارشناس برنامه‌ریزی و کنترل پروژه EPC', 'startDate', '2018-01-10', 'endDate', '', 'insuranceMonths', 100, 'isPipelineRole', true, 'note', '')),
    'certs', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'title', 'PMP', 'issuer', 'PMI', 'date', '2020-04-18', 'isPmp', true),
      jsonb_build_object('id', gen_random_uuid(), 'title', 'Primavera P6 Advanced', 'issuer', 'Oracle (نمونه)', 'date', '2017-11-01', 'isPmp', false),
      jsonb_build_object('id', gen_random_uuid(), 'title', 'Earned Value Management (EVM)', 'issuer', 'مرکز آموزش نمونه', 'date', '2019-06-01', 'isPmp', false)),
    'projects', 'کنترل پروژه طرح انتقال گاز (نمونه) — داده آزمایشی');
  c05 := pg_temp.demo_create(A, 'project_control_specialist', v_prof, current_date - 18);
  perform pg_temp.demo_design(A, c05, false, true, true, true);
  perform pg_temp.demo_panel(A, c05, array[P1], 1);
  perform pg_temp.demo_generate_technical(A, c05, pg_temp.demo_default_mix('project_control_specialist'), 90);
  perform pg_temp.demo_panel_score(P1, c05, 4.0, true, 'تسلط بر EVM و تحلیل مسیر بحرانی.', 'گزارش‌دهی مدیریتی خلاصه‌تر و تصویری‌تر شود.');
  perform pg_temp.demo_interview(A, c05, 3.9, '{"communication":-0.4}');
  perform pg_temp.demo_finalize(A, c05, true, 'دانش برنامه‌ریزی و کنترل پروژه قوی.', 'ارتباطات و ارائه گزارش به مدیریت.');
  perform pg_temp.demo_compute(A, c05);

  -- =============================================================================================
  -- C06 — contracts_specialist — «شخصیت‌محور + الگوی سفارشی»: a NEW non-default blueprint (with a
  -- small technical template → technical low weight, and a heavy personality template) applied
  -- via «اعمال الگو» (comp_set_exam_design p_blueprint_id).
  -- =============================================================================================
  perform pg_temp.demo_as(A);
  v_tpl := gen_random_uuid();
  insert into public.comp_assessment_templates (id, job_role, title, duration_minutes, panel_size_default, question_mix, auto_finish_on_timeout)
  values (v_tpl, 'contracts_specialist', '[آزمایشی] آزمون فنی کوتاه — کارشناس قراردادها', 30, 1,
    '[{"category":"GENERAL","difficulty":"L2","count":1},{"category":"TECHNICAL","difficulty":"L2","count":1},{"category":"SCENARIO","difficulty":"L3","count":1}]', false);
  v_ptpl := gen_random_uuid();
  insert into public.personality_assessment_templates (id, job_role, title, framework_id, question_mix, duration_minutes)
  values (v_ptpl, 'contracts_specialist', '[آزمایشی] آزمون شخصیت جامع — کارشناس قراردادها',
    (select id from public.personality_frameworks where active order by created_at limit 1),
    '[{"questionType":"LIKERT","complexity":"L1","count":30},{"questionType":"FREQUENCY","complexity":"L1","count":10},{"questionType":"FORCED_CHOICE","complexity":"L1","count":6},{"questionType":"SJT","complexity":"L2","count":5},{"questionType":"SJT","complexity":"L3","count":3},{"questionType":"EXPERIENCE_ANCHORED","complexity":"L3","count":4}]', 45);
  v_bp := gen_random_uuid();
  insert into public.comp_assessment_blueprints (id, job_role, title, description, is_default, active,
    includes_technical, includes_personality, includes_structured_interview, includes_experience, technical_template_id, personality_template_id)
  values (v_bp, 'contracts_specialist', '[آزمایشی] الگوی شخصیت‌محور — کارشناس قراردادها',
    'الگوی آزمایشی: آزمون فنی کوتاه (۳ سؤال) + آزمون شخصیت جامع (۵۸ گویه) + مصاحبه ساختاریافته + سوابق.', false, true,
    true, true, true, true, v_tpl, v_ptpl);
  perform pg_temp.demo_as(null);
  perform pg_temp.demo_reg('comp_assessment_templates', v_tpl);
  perform pg_temp.demo_reg('personality_assessment_templates', v_ptpl);
  perform pg_temp.demo_reg('comp_assessment_blueprints', v_bp);

  v_prof := jsonb_build_object(
    'scenario', 'C06-personality-heavy-custom-blueprint', 'name', PX || 'نیلوفر کریمی', 'position', 'کارشناس قراردادها', 'nid', '0000000106',
    'phone', '09120000106', 'email', 'demo.niloofar.karimi@example.com', 'birth', '1989-10-08', 'age', 36,
    'years_total', 11, 'years_pipeline', 4, 'employer', 'شرکت پیمانکاری عمومی نمونه',
    'education', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'degree', 'کارشناسی ارشد', 'field', 'حقوق تجارت بین‌الملل', 'institution', 'دانشگاه تهران', 'year', '1393'),
      jsonb_build_object('id', gen_random_uuid(), 'degree', 'کارشناسی', 'field', 'مهندسی عمران', 'institution', 'دانشگاه بوعلی سینا', 'year', '1389')),
    'employment', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'شرکت پیمانکاری عمومی نمونه', 'position', 'کارشناس قراردادها و ادعاها', 'startDate', '2016-09-01', 'endDate', '', 'insuranceMonths', 120, 'isPipelineRole', false, 'note', 'قراردادهای FIDIC و الحاقیه‌ها')),
    'certs', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'title', 'FIDIC Contracts (Red/Yellow/Silver)', 'issuer', 'مرکز آموزش نمونه', 'date', '2018-02-01', 'isPmp', false)),
    'projects', 'مدیریت ادعای تأخیر پروژه ایستگاه تقویت فشار (نمونه) — داده آزمایشی');
  c06 := pg_temp.demo_create(A, 'contracts_specialist', v_prof, current_date - 12);
  perform pg_temp.demo_design(A, c06, true, true, true, true, v_bp);
  perform pg_temp.demo_panel(A, c06, array[P3], 1);
  perform pg_temp.demo_generate_technical(A, c06, (select question_mix from public.comp_assessment_templates where id = v_tpl), 30);
  perform pg_temp.demo_personality(A, c06, (select question_mix from public.personality_assessment_templates where id = v_ptpl), 0.72,
    '{"COMMERCIAL_AWARENESS":0.9,"COMMUNICATION":0.85,"STAKEHOLDER_ORIENTATION":0.8,"DETAIL_ORIENTATION":0.8}', 'normal');
  perform pg_temp.demo_panel_score(P3, c06, 3.8, true, 'تحلیل حقوقی دقیق بندهای قرارداد.', 'آشنایی فنی با فرآیند اجرای خط لوله محدود است.');
  perform pg_temp.demo_interview(A, c06, 4.0, '{"commercial_contract_awareness":0.6}');
  perform pg_temp.demo_interview(P3, c06, 3.8);
  perform pg_temp.demo_finalize(A, c06, true, 'آگاهی قراردادی و ارتباطات قوی.', 'دانش فنی اجرایی.');
  perform pg_temp.demo_compute(A, c06);

  -- =============================================================================================
  -- C07 — mechanical_piping_inspector — «پنل چندنفره، در انتظار»: 3 panelists, 2 submitted, 1 with a
  -- half-finished UNSUBMITTED sheet (not counted in the official average), interview timer
  -- used (start/pause), not finalized.
  -- =============================================================================================
  v_prof := jsonb_build_object(
    'scenario', 'C07-multi-panel-pending', 'name', PX || 'رضا جعفری', 'position', 'بازرس مکانیک و پایپینگ', 'nid', '0000000107',
    'phone', '09120000107', 'email', 'demo.reza.jafari@example.com', 'birth', '1988-01-25', 'age', 38,
    'years_total', 12, 'years_pipeline', 6, 'employer', 'شرکت نصب تأسیسات نمونه',
    'education', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'degree', 'کارشناسی', 'field', 'مهندسی مکانیک — حرارت و سیالات', 'institution', 'دانشگاه صنعتی خواجه نصیر', 'year', '1389')),
    'employment', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'شرکت نصب تأسیسات نمونه', 'position', 'بازرس پایپینگ ایستگاه‌های گاز', 'startDate', '2014-04-01', 'endDate', '', 'insuranceMonths', 140, 'isPipelineRole', true, 'note', '')),
    'certs', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'title', 'API 570 Piping Inspector', 'issuer', 'API', 'date', '2019-09-01', 'isPmp', false),
      jsonb_build_object('id', gen_random_uuid(), 'title', 'ASME B31.3 Process Piping', 'issuer', 'مرکز آموزش نمونه', 'date', '2016-01-20', 'isPmp', false)),
    'projects', 'پایپینگ ایستگاه تقویت فشار (نمونه) — داده آزمایشی');
  c07 := pg_temp.demo_create(A, 'mechanical_piping_inspector', v_prof, current_date - 2);
  perform pg_temp.demo_panel(A, c07, array[P1, P2, P3], 3);
  perform pg_temp.demo_generate_technical(A, c07, pg_temp.demo_default_mix('mechanical_piping_inspector'), 75);
  perform pg_temp.demo_personality(A, c07, PMIX, 0.66, '{}', 'normal');
  perform pg_temp.demo_as(P1);
  perform public.comp_set_interview_timer(c07, 'start');
  perform public.comp_set_interview_timer(c07, 'pause');
  perform pg_temp.demo_as(null);
  perform pg_temp.demo_panel_score(P1, c07, 4.2, true, 'دانش خوب از تست هیدرواستاتیک و Punch List.', 'آشنایی با ASME B31.8 کامل نیست.');
  perform pg_temp.demo_panel_score(P2, c07, 3.2, true, 'سابقه اجرایی مناسب.', 'پاسخ‌های سناریو کلی بود.');
  perform pg_temp.demo_panel_score(P3, c07, 2.2, false, '', '', 0.6);
  perform pg_temp.demo_interview(P1, c07, 3.8);
  perform pg_temp.demo_compute(A, c07);

  -- =============================================================================================
  -- C08 — inspection_body_supervisor — «ثبت نهایی → بازگشایی»: completed, then reopened by the admin
  -- (comp_reopen_assessment → ASSESSMENT_REOPENED audit, every submitted_at cleared); P1 then changes
  -- a score and re-submits, P2 has not re-submitted yet.
  -- =============================================================================================
  v_prof := jsonb_build_object(
    'scenario', 'C08-finalized-then-reopened', 'name', PX || 'حمید نوری', 'position', 'سرپرست نهاد بازرسی', 'nid', '0000000108',
    'phone', '09120000108', 'email', 'demo.hamid.nouri@example.com', 'birth', '1982-07-11', 'age', 44,
    'years_total', 19, 'years_pipeline', 13, 'employer', 'شرکت بازرسی شخص ثالث نمونه',
    'education', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'degree', 'کارشناسی ارشد', 'field', 'مهندسی مکانیک', 'institution', 'دانشگاه شیراز', 'year', '1386')),
    'employment', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'شرکت بازرسی شخص ثالث نمونه', 'position', 'سرپرست تیم بازرسی TPI', 'startDate', '2012-01-01', 'endDate', '', 'insuranceMonths', 170, 'isPipelineRole', true, 'note', ''),
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'پیمانکار EPC نمونه', 'position', 'بازرس QC', 'startDate', '2007-06-01', 'endDate', '2011-12-20', 'insuranceMonths', 54, 'isPipelineRole', true, 'note', '')),
    'certs', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'title', 'ISO/IEC 17020 Lead Assessor', 'issuer', 'مرکز آموزش نمونه', 'date', '2017-03-01', 'isPmp', false),
      jsonb_build_object('id', gen_random_uuid(), 'title', 'CSWIP 3.2 Senior Welding Inspector', 'issuer', 'TWI', 'date', '2014-10-01', 'isPmp', false),
      jsonb_build_object('id', gen_random_uuid(), 'title', 'API 1169 Pipeline Construction Inspector', 'issuer', 'API', 'date', '2019-05-01', 'isPmp', false)),
    'projects', 'نظارت شخص ثالث بر ۳ طرح خط لوله سراسری (نمونه) — داده آزمایشی');
  c08 := pg_temp.demo_create(A, 'inspection_body_supervisor', v_prof, current_date - 40);
  perform pg_temp.demo_panel(A, c08, array[P1, P2], 2);
  perform pg_temp.demo_generate_technical(A, c08, pg_temp.demo_default_mix('inspection_body_supervisor'));
  perform pg_temp.demo_personality(A, c08, PMIX, 0.7, '{"LEADERSHIP":0.8}', 'normal');
  perform pg_temp.demo_panel_score(P1, c08, 3.9, true, 'تجربه طولانی نظارت شخص ثالث.', 'به‌روزرسانی دانش استاندارد ISO/IEC 17020:2012.');
  perform pg_temp.demo_panel_score(P2, c08, 3.7, true, 'مدیریت تیم بازرسی.', 'مستندسازی عدم‌انطباق‌ها.');
  perform pg_temp.demo_interview(A, c08, 3.9);
  perform pg_temp.demo_finalize(A, c08, true, 'تجربه و رهبری تیم بازرسی.', 'به‌روزرسانی دانش استانداردها.');
  perform pg_temp.demo_compute(A, c08);
  perform pg_temp.demo_as(A);
  perform public.comp_reopen_assessment(c08);
  update public.comp_assessments set is_approved = false where id = c08;
  perform pg_temp.demo_as(null);
  perform pg_temp.demo_panel_score(P1, c08, 3.4, true, 'تجربه طولانی نظارت شخص ثالث.', 'پس از بازگشایی: امتیاز سؤالات سناریو اصلاح شد. به‌روزرسانی دانش استاندارد ISO/IEC 17020:2012.');
  perform pg_temp.demo_compute(A, c08);

  -- =============================================================================================
  -- C09 — radiography_interpreter — «مصاحبه چندارزیاب»: 4 raters with clearly differing ratings and
  -- notes; personality finalized with 3 unanswered items (validity REVIEW_REQUIRED).
  -- =============================================================================================
  v_prof := jsonb_build_object(
    'scenario', 'C09-multi-rater-interview', 'name', PX || 'الهام صادقی', 'position', 'مفسر رادیوگرافی', 'nid', '0000000109',
    'phone', '09120000109', 'email', 'demo.elham.sadeghi@example.com', 'birth', '1993-03-17', 'age', 33,
    'years_total', 7, 'years_pipeline', 6, 'employer', 'شرکت آزمایش‌های غیرمخرب نمونه',
    'education', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'degree', 'کارشناسی', 'field', 'فیزیک کاربردی', 'institution', 'دانشگاه اصفهان', 'year', '1394')),
    'employment', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'شرکت آزمایش‌های غیرمخرب نمونه', 'position', 'مفسر فیلم رادیوگرافی خط لوله', 'startDate', '2019-02-01', 'endDate', '', 'insuranceMonths', 90, 'isPipelineRole', true, 'note', '')),
    'certs', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'title', 'ISO 9712 RT Level 2', 'issuer', 'مرکز صدور گواهی نمونه', 'date', '2019-10-01', 'isPmp', false),
      jsonb_build_object('id', gen_random_uuid(), 'title', 'حفاظت در برابر اشعه (مجوز کار با اشعه)', 'issuer', 'مرکز نظام ایمنی هسته‌ای (نمونه)', 'date', '2018-12-01', 'isPmp', false)),
    'projects', 'تفسیر بیش از ۲۰ هزار فیلم جوش خط لوله (نمونه) — داده آزمایشی');
  c09 := pg_temp.demo_create(A, 'radiography_interpreter', v_prof, current_date - 9);
  perform pg_temp.demo_panel(A, c09, array[P1, P2, P3], 3);
  perform pg_temp.demo_generate_technical(A, c09, pg_temp.demo_default_mix('radiography_interpreter'));
  perform pg_temp.demo_personality(A, c09, PMIX, 0.64, '{"DETAIL_ORIENTATION":0.85}', 'normal', 3);
  perform pg_temp.demo_panel_score(P1, c09, 3.9, true, 'تشخیص دقیق عیوب ریشه و تخلخل.', 'آشنایی با رادیوگرافی دیجیتال.');
  perform pg_temp.demo_panel_score(P2, c09, 3.4, true, 'رعایت اصول حفاظت اشعه.', 'تفسیر عیوب مرزی (Borderline) محافظه‌کارانه نیست.');
  perform pg_temp.demo_panel_score(P3, c09, 4.2, true, 'سرعت و دقت تفسیر.', 'ثبت گزارش در قالب استاندارد پروژه.');
  perform pg_temp.demo_interview(A, c09, 4.3, '{"professional_judgment":0.4}');
  perform pg_temp.demo_interview(P1, c09, 3.4, '{"communication":-0.6}');
  perform pg_temp.demo_interview(P2, c09, 2.3, '{"professional_judgment":-0.6}');
  perform pg_temp.demo_interview(P3, c09, 3.8);
  perform pg_temp.demo_finalize(A, c09, false, 'دانش تفسیر فیلم و دقت بالا.', 'قضاوت حرفه‌ای در عیوب مرزی — نظر داوران متفاوت است؛ بررسی تکمیلی توصیه می‌شود.');
  perform pg_temp.demo_compute(A, c09);

  -- =============================================================================================
  -- C10 — civil_engineer — default blueprint via the auto-apply trigger; personality answered with
  -- straight-lining (validity flag); panel + interview done, NOT finalized (owner can press
  -- «ثبت نهایی ارزیابی»).
  -- =============================================================================================
  v_prof := jsonb_build_object(
    'scenario', 'C10-default-blueprint-straightlining', 'name', PX || 'امیر قاسمی', 'position', 'مهندس عمران کارگاه', 'nid', '0000000110',
    'phone', '09120000110', 'email', 'demo.amir.ghasemi@example.com', 'birth', '1994-05-05', 'age', 32,
    'years_total', 6, 'years_pipeline', 3, 'employer', 'شرکت عمرانی نمونه',
    'education', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'degree', 'کارشناسی', 'field', 'مهندسی عمران', 'institution', 'دانشگاه صنعتی سهند', 'year', '1396')),
    'employment', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'شرکت عمرانی نمونه', 'position', 'مهندس اجرا — فونداسیون و ابنیه ایستگاه', 'startDate', '2020-07-01', 'endDate', '', 'insuranceMonths', 74, 'isPipelineRole', true, 'note', '')),
    'certs', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'title', 'پروانه نظام مهندسی — پایه ۳ اجرا', 'issuer', 'سازمان نظام مهندسی (نمونه)', 'date', '2021-01-01', 'isPmp', false)),
    'projects', 'فونداسیون تجهیزات ایستگاه تقلیل فشار (نمونه) — داده آزمایشی');
  c10 := pg_temp.demo_create(A, 'civil_engineer', v_prof, current_date - 4);
  perform pg_temp.demo_panel(A, c10, array[P2], 1);
  perform pg_temp.demo_generate_technical(A, c10, pg_temp.demo_default_mix('civil_engineer'));
  perform pg_temp.demo_personality(A, c10, PMIX, 0.5, '{}', 'straight');
  perform pg_temp.demo_panel_score(P2, c10, 3.5, true, 'دانش اجرایی فونداسیون خوب.', 'آشنایی با الزامات HSE کارگاه.');
  perform pg_temp.demo_interview(A, c10, 3.4);
  perform pg_temp.demo_compute(A, c10);

  -- =============================================================================================
  -- C11 — site_supervisor — «متوقف در میانه مسیر»: only the profile and the exam design (interview
  -- switched off by hand) — no panel, no questions, no personality assessment.
  -- =============================================================================================
  v_prof := jsonb_build_object(
    'scenario', 'C11-stuck-profile-design-only', 'name', PX || 'مجید اکبری', 'position', 'سرپرست کارگاه', 'nid', '0000000111',
    'phone', '09120000111', 'email', 'demo.majid.akbari@example.com', 'birth', '1985-11-29', 'age', 40,
    'years_total', 16, 'years_pipeline', 10, 'employer', 'پیمانکار خطوط لوله نمونه',
    'education', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'degree', 'کاردانی', 'field', 'عمران — کارهای عمومی ساختمان', 'institution', 'دانشگاه فنی و حرفه‌ای', 'year', '1384')),
    'employment', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'employer', 'پیمانکار خطوط لوله نمونه', 'position', 'سرپرست کارگاه اسپرد', 'startDate', '2016-03-01', 'endDate', '', 'insuranceMonths', 125, 'isPipelineRole', true, 'note', '')),
    'certs', '[]'::jsonb,
    'projects', 'سرپرستی اسپرد لوله‌گذاری (نمونه) — داده آزمایشی');
  c11 := pg_temp.demo_create(A, 'site_supervisor', v_prof, current_date + 3);
  perform pg_temp.demo_design(A, c11, true, true, false, true);

  -- =============================================================================================
  -- C12 — project_manager — «لینک‌های صادرشده، تکمیل‌نشده»: self-service link sent (pending, never
  -- submitted), personality link generated and started (5 answers, not finalized), 1 panelist
  -- assigned with no scores, no technical selection (legacy PM rubric).
  -- =============================================================================================
  v_prof := jsonb_build_object(
    'scenario', 'C12-links-issued-incomplete', 'name', PX || 'فرهاد عزیزی', 'position', 'مدیر پروژه', 'nid', '0000000112',
    'phone', '09120000112', 'email', 'demo.farhad.azizi@example.com');
  c12 := pg_temp.demo_create(A, 'project_manager', v_prof, current_date + 7);
  perform pg_temp.demo_self_service(A, c12, v_prof, 'pending');
  perform pg_temp.demo_panel(A, c12, array[P1], 3);
  perform pg_temp.demo_personality(A, c12, PMIX, 0.6, '{}', 'normal', 0, false, 5);

  -- =============================================================================================
  -- Reassessments (comp_create_reassessment → linked chain; the predecessor's design is copied).
  -- =============================================================================================

  -- C02 → R02: pipeline_inspector, general improvement, communication REGRESSED (interview + personality).
  perform pg_temp.demo_as(A);
  perform public.comp_seed_development_plan(c02);
  select id into v_plan from public.comp_development_plans where assessment_id = c02 and status <> 'CANCELLED';
  update public.comp_development_plans
    set status = 'ACTIVE', owner_id = A, target_review_date = current_date - 5,
        summary = 'تقویت دانش استانداردهای بازرسی خط لوله و کنترل کیفیت. (داده آزمایشی)'
    where id = v_plan;
  v_i := 0;
  for v_act in select a.id from public.comp_development_actions a where a.plan_id = v_plan order by a.sort_order loop
    v_i := v_i + 1;
    update public.comp_development_actions
      set status = case when v_i = 1 then 'DONE' when v_i = 2 then 'IN_PROGRESS' else 'NOT_STARTED' end,
          owner_id = A,
          progress_note = case when v_i = 1 then 'دوره API 1169 گذرانده شد. (داده آزمایشی)'
                               when v_i = 2 then 'در حال گذراندن دوره ITP و معیارهای پذیرش. (داده آزمایشی)' else '' end
      where id = v_act.id;
  end loop;
  r02 := public.comp_create_reassessment(c02);
  perform pg_temp.demo_as(null);
  perform pg_temp.demo_reg('comp_assessments', r02, jsonb_build_object('scenario', 'R02-reassessment-of-C02'));
  perform pg_temp.demo_as(A);
  update public.comp_assessments set interview_date = current_date - 3, years_experience_total = 9, years_experience_pipeline = 6 where id = r02;
  perform pg_temp.demo_as(null);
  perform pg_temp.demo_panel(A, r02, array[P1, P2], 2);
  perform pg_temp.demo_generate_technical(A, r02, pg_temp.demo_default_mix('pipeline_inspector'));
  perform pg_temp.demo_personality(A, r02, PMIX, 0.7, '{"COMMUNICATION":0.3,"STAKEHOLDER_ORIENTATION":0.35,"DETAIL_ORIENTATION":0.75}', 'normal');
  perform pg_temp.demo_panel_score(P1, r02, 4.1, true, 'پیشرفت محسوس در معیارهای پذیرش.', 'ارتباط با پیمانکار و گزارش‌دهی ضعیف‌تر شده است.');
  perform pg_temp.demo_panel_score(P2, r02, 3.9, true, 'دانش ITP بهتر شده.', 'ارتباطات.');
  perform pg_temp.demo_interview(A, r02, 3.9, '{"communication":-2.2}');
  perform pg_temp.demo_interview(P1, r02, 4.0, '{"communication":-2.0}');
  perform pg_temp.demo_finalize(A, r02, true, 'پیشرفت در دانش فنی و کیفیت پس از اجرای IDP.', 'ارتباطات و گزارش‌دهی افت کرده است.');
  perform pg_temp.demo_compute(A, r02);

  -- C03 → R03: hse_specialist, strong improvement — the critical gap closes.
  perform pg_temp.demo_as(A);
  r03 := public.comp_create_reassessment(c03);
  perform pg_temp.demo_as(null);
  perform pg_temp.demo_reg('comp_assessments', r03, jsonb_build_object('scenario', 'R03-reassessment-of-C03'));
  perform pg_temp.demo_as(A);
  update public.comp_assessments
    set interview_date = current_date - 1, years_experience_total = 4,
        certifications = certifications || jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'title', 'NEBOSH IGC', 'issuer', 'NEBOSH', 'date', to_char(current_date - 40, 'YYYY-MM-DD'), 'isPmp', false))
    where id = r03;
  perform pg_temp.demo_as(null);
  perform pg_temp.demo_panel(A, r03, array[P2, P3], 2);
  perform pg_temp.demo_generate_technical(A, r03, pg_temp.demo_default_mix('hse_specialist'));
  perform pg_temp.demo_personality(A, r03, PMIX, 0.72, '{"SAFETY_ORIENTATION":0.9,"RISK_AWARENESS":0.88,"ESCALATION_JUDGMENT":0.8,"ACCOUNTABILITY":0.85}', 'normal');
  perform pg_temp.demo_panel_score(P2, r03, 3.9, true, 'تسلط بر JSA و مجوز کار.', 'تجربه مدیریت شرایط اضطراری محدود است.');
  perform pg_temp.demo_panel_score(P3, r03, 4.1, true, 'قضاوت درست در توقف کار ناایمن.', 'تجربه میدانی بیشتر.');
  perform pg_temp.demo_interview(A, r03, 4.3, '{"hse_awareness":0.5}');
  perform pg_temp.demo_interview(P2, r03, 4.1);
  perform pg_temp.demo_finalize(A, r03, true, 'بهبود چشمگیر آگاهی HSE پس از اجرای برنامه توسعه.', 'تجربه میدانی در شرایط اضطراری.');
  perform pg_temp.demo_compute(A, r03);

  perform pg_temp.demo_as(null);
  raise notice 'demo candidates seeded: %', (select count(*) from public.comp_demo_seed_registry where entity = 'comp_assessments');
end $seed$;

-- ---------------------------------------------------------------------------------------------
-- Summary (what the owner should see in the UI).
-- ---------------------------------------------------------------------------------------------
select a.candidate_name, a.job_role, a.status, a.is_approved, a.self_service_status,
  a.needs_technical_assessment as tech, a.needs_personality_assessment as pers, a.needs_structured_interview as intv, a.includes_experience as exp,
  jsonb_array_length(a.selected_question_ids) as questions,
  (select count(*) from public.comp_panelists p where p.assessment_id = a.id) as panel,
  (select count(*) from public.comp_panelist_scores s where s.assessment_id = a.id and s.submitted_at is not null) as submitted,
  (select pa.status from public.personality_assessments pa where pa.assessment_id = a.id) as personality,
  (select vr.overall_status from public.personality_validity_results vr join public.personality_assessments pa on pa.id = vr.personality_assessment_id where pa.assessment_id = a.id) as validity,
  (select string_agg(s.status || ':' || c.key || '(' || coalesce(s.actual_level::text, '—') || '/' || s.required_level || ',' || s.confidence || ')', ' | ' order by s.is_critical desc, c.key)
     from public.comp_competency_scores s join public.comp_competencies c on c.id = s.competency_id where s.assessment_id = a.id) as competencies,
  (select p.status || ' / ' || (select count(*) from public.comp_development_actions x where x.plan_id = p.id) from public.comp_development_plans p where p.assessment_id = a.id and p.status <> 'CANCELLED') as idp
from public.comp_assessments a
join public.comp_demo_seed_registry r on r.entity = 'comp_assessments' and r.id = a.id
order by a.candidate_name, a.created_at;
