-- weldqc 006
-- 1) wq_ai_samples — the learning record of the image assistant: every candidate the interpreter accepted, corrected or
--    dismissed, and every indication the assistant missed, with the candidate's measured features. Append-only: it is
--    the training set (ranking of candidates now, a trained detector later) and the proof of how the assistant performs.
-- 2) Segregation of duties: the NDT inspector who signs a round is not the person who evaluated it (the project's QC
--    manager / configurer may, and it is recorded).
-- 3) An evaluation waits until every film of the round has a quality decision (no «pending» film).
create table if not exists wq_ai_samples (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  weld_id uuid not null,
  film_id uuid not null,
  detector text not null default '',
  bbox jsonb,
  feats jsonb,
  ai_code text,
  confidence numeric,
  action text not null check (action in ('accepted', 'modified', 'dismissed', 'missed')),
  final_code text,
  defect_id uuid,
  by_user uuid default auth.uid(),
  by_name text not null default '',
  at timestamptz not null default now()
);
create index if not exists wq_ai_samples_project on wq_ai_samples (project_id, at desc);
create index if not exists wq_ai_samples_film on wq_ai_samples (film_id);
alter table wq_ai_samples enable row level security;
create policy wq_ai_samples_read on wq_ai_samples for select to authenticated using (ex_can_view(project_id));
create policy wq_ai_samples_add on wq_ai_samples for insert to authenticated with check (wq_can(project_id, 'submit') or wq_can(project_id, 'edit'));
revoke all on wq_ai_samples from anon;

alter table wq_evaluations add column if not exists evaluated_by uuid;
alter table wq_evaluations add column if not exists same_person boolean not null default false;

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
  if exists (select 1 from wq_films where weld_id = p_weld and round = j.current_round and quality_status = 'pending') then
    raise exception 'film_quality_pending';
  end if;
  insert into wq_evaluations (project_id, weld_id, round, overall_status, summary, verdicts, thk_mm, evaluated_name, evaluated_by)
  values (j.project_id, p_weld, j.current_round, p_overall, coalesce(p_summary, ''), coalesce(p_verdicts, '[]'::jsonb), p_thk, coalesce(p_name, ''), auth.uid())
  returning id into new_id;
  for v in select * from jsonb_array_elements(coalesce(p_verdicts, '[]'::jsonb)) loop
    update wq_defects set verdict = v->>'verdict', verdict_reason = coalesce(v->>'reason', ''), repair_advice = coalesce(v->>'advice', '')
    where id = (v->>'id')::uuid and weld_id = p_weld and round = j.current_round and removed_at is null;
  end loop;
  return new_id;
end $f$;

create or replace function wq_sign(p_weld uuid, p_force_cutout boolean, p_name text) returns text language plpgsql security definer set search_path to 'public' as $f$
declare j wq_joints; e wq_evaluations; st text; same boolean;
begin
  select * into j from wq_joints where weld_id = p_weld;
  if j.weld_id is null then raise exception 'no_evaluation'; end if;
  if not wq_can(j.project_id, 'approve') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if j.is_closed then raise exception 'file_closed'; end if;
  select * into e from wq_evaluations where weld_id = p_weld and round = j.current_round order by evaluated_at desc limit 1;
  if e.id is null then raise exception 'no_evaluation'; end if;
  same := e.evaluated_by is not null and e.evaluated_by = auth.uid();
  if same and not (is_admin_user() or ex_can_configure(j.project_id) or rasta_has_permission(auth.uid(), 'weldqc', 'configure')) then
    raise exception 'same_person';
  end if;
  st := e.overall_status;
  if coalesce(p_force_cutout, false) then
    if st <> 'repair' or j.current_round < 2 then raise exception 'cutout_not_allowed'; end if;
    st := 'cut_out';
  end if;
  update wq_evaluations set signed_by = auth.uid(), signed_name = coalesce(p_name, ''), signed_at = now(), same_person = same,
    overall_status = st, forced_cutout = coalesce(p_force_cutout, false),
    summary = case when coalesce(p_force_cutout, false) then summary || ' [به دلیل تکمیل سقف مجاز تعمیر، توسط بازرس به «برش» تغییر یافت]' else summary end
  where id = e.id;
  if st in ('accept', 'cut_out') then
    update wq_joints set is_closed = true, final_status = st, closed_at = now(), updated_at = now() where weld_id = p_weld;
  end if;
  return st;
end $f$;
