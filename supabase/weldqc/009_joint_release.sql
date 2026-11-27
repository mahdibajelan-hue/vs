begin;

-- NDT closes the evaluation. The supervision signature separately releases the joint.
create or replace function public.wq_guard_joint_release() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  release jsonb; ndt wq_evaluations; section ht_sections; chainage numeric; candidates integer;
begin
  release := new.signs -> 'supervision_head';
  if release is null then return new; end if;
  if tg_op = 'UPDATE' and release is not distinct from old.signs -> 'supervision_head' then return new; end if;
  if auth.uid() is null or not coalesce(wq_can(new.project_id, 'approve'), false) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into ndt from wq_evaluations e
  where e.weld_id = new.weld_id and e.project_id = new.project_id and e.round = new.current_round
  order by e.evaluated_at desc, e.id desc limit 1;
  if ndt.signed_at is null or ndt.signed_by is null or ndt.overall_status is distinct from 'accept'
     or not new.is_closed or new.final_status is distinct from 'accept' then
    raise exception 'release_requires_ndt';
  end if;

  -- Resolve chainage through the actual approved weld lines, never the project-wide test result.
  select min(km), count(distinct km) into chainage, candidates
  from (
    select case when translate(trim(l.detail ->> 'km'), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩٫', '01234567890123456789.') ~ '^[0-9]+([.][0-9]+)?$'
                then translate(trim(l.detail ->> 'km'), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩٫', '01234567890123456789.')::numeric else l.km_from end as km
    from ex_line_welds x join ex_report_lines l on l.id = x.line_id
    join ex_reports r on r.id = l.report_id
    where x.weld_id = new.weld_id and x.project_id = new.project_id and r.project_id = new.project_id
      and r.form_key in ('tie_in', 'welding') and r.status in ('approved', 'partially_approved') and l.status = 'approved'
  ) evidence;
  if candidates <> 1 then raise exception 'release_requires_chainage'; end if;
  select count(*) into candidates from ht_sections s
  where s.master_project_id = new.project_id and chainage between s.km_from and s.km_to;
  if candidates <> 1 then raise exception 'release_requires_hydrotest'; end if;
  select * into section from ht_sections s
  where s.master_project_id = new.project_id and chainage between s.km_from and s.km_to
  for share;
  if not found or section.stage <> 'accepted' or section.failed then
    raise exception 'release_requires_hydrotest';
  end if;

  new.signs := jsonb_set(new.signs, '{supervision_head}', release || jsonb_build_object(
    'at', now(), 'user', auth.uid(), 'ndt_evaluation_id', ndt.id, 'hydro_section_id', section.id
  ));
  return new;
end $$;
revoke all on function public.wq_guard_joint_release() from public, anon, authenticated;
drop trigger if exists trg_wq_guard_joint_release on public.wq_joints;
create trigger trg_wq_guard_joint_release before insert or update of signs on public.wq_joints
for each row execute function public.wq_guard_joint_release();

-- Accepted test evidence is an approval. Project readers and editors must
-- not be able to change its status, coverage, or result.
create or replace function public.ht_guard_section_acceptance() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  if tg_op = 'UPDATE' and (new.stage, new.failed, new.km_from, new.km_to, new.master_project_id)
      is not distinct from (old.stage, old.failed, old.km_from, old.km_to, old.master_project_id) then
    return new;
  end if;
  if tg_op = 'INSERT' and new.stage <> 'accepted' then return new; end if;
  if tg_op = 'DELETE' and old.stage <> 'accepted' then return old; end if;
  if tg_op = 'UPDATE' and new.stage <> 'accepted' and old.stage <> 'accepted' then return new; end if;
  if tg_op = 'UPDATE' and old.master_project_id is distinct from new.master_project_id then
    raise exception 'hydro_project_immutable';
  end if;
  pid := case when tg_op = 'DELETE' then old.master_project_id else new.master_project_id end;
  if auth.uid() is not null and not (
    is_admin_user() or ex_can_configure(pid)
    or (pid in (select my_projects()) and rasta_has_permission(auth.uid(), 'testing', 'approve'))
  ) then
    raise exception 'hydro_acceptance_requires_approver' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.ht_guard_section_acceptance() from public, anon, authenticated;
drop trigger if exists trg_ht_guard_section_acceptance on public.ht_sections;
create trigger trg_ht_guard_section_acceptance before insert or update or delete on public.ht_sections
for each row execute function public.ht_guard_section_acceptance();

commit;
