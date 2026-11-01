-- Inbox: the waiting work of the statement generator, PSSR and testing modules, so «کارتابل من» and the module
-- badges count them too. Same columns as inbox_my_items(); every row is re-checked by the owning module on action.
create or replace function public.inbox_my_project_work()
returns table(key text, source text, kind text, project_id uuid, project_name text, title text, sub text, due date, since timestamptz, urgent boolean, ref_id uuid, extra jsonb)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  my_email text;
  can_pssr boolean;
  can_test boolean;
begin
  if u is null then return; end if;
  select lower(email) into my_email from auth.users where id = u;
  -- a module not (yet) in rasta_modules is open to everyone unless access was explicitly denied, as for the rest of the system
  can_pssr := not exists (select 1 from rasta_user_module_access a where a.user_id = u and a.module_key = 'pssr' and a.has_access = false);
  can_test := not exists (select 1 from rasta_user_module_access a where a.user_id = u and a.module_key = 'testing' and a.has_access = false);

  -- statement generator: approve a sent statement, post an approved one to finance, fix a rejected one
  return query
  select 'pst:approve:' || s.id, 'statements', 'pst_approve', s.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
    'تأیید صورت‌وضعیت ' || s.part || '-' || lpad(s.no::text, 2, '0') || ' — دورهٔ ' || s.period_key,
    'مبلغ این دوره ' || round(s.this_amount)::text, null::date, coalesce(s.submitted_at, s.created_at),
    coalesce(s.submitted_at, s.created_at) < now() - interval '5 days', s.id, jsonb_build_object('part', s.part, 'period', s.period_key, 'amount', s.this_amount)
  from pst_statements s left join master_projects mp on mp.id = s.master_project_id
  where s.status = 'submitted' and s.voided_at is null and pst_can_approve(s.master_project_id);

  return query
  select 'pst:post:' || s.id, 'statements', 'pst_post', s.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
    'ثبت صورت‌وضعیت ' || s.part || '-' || lpad(s.no::text, 2, '0') || ' در مالی — دورهٔ ' || s.period_key,
    'تأییدشده، هنوز به ماژول مالی ارسال نشده', null::date, coalesce(s.approved_at, s.created_at),
    coalesce(s.approved_at, s.created_at) < now() - interval '3 days', s.id, jsonb_build_object('part', s.part, 'period', s.period_key, 'amount', s.this_amount)
  from pst_statements s left join master_projects mp on mp.id = s.master_project_id
  where s.status = 'approved' and s.voided_at is null and pst_can_approve(s.master_project_id);

  return query
  select 'pst:fix:' || s.id, 'statements', 'pst_fix', s.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
    'اصلاح صورت‌وضعیت ردشده ' || s.part || '-' || lpad(s.no::text, 2, '0') || ' — دورهٔ ' || s.period_key,
    coalesce(nullif(s.reject_reason, ''), 'ردشده'), null::date, s.created_at, true, s.id, jsonb_build_object('part', s.part, 'period', s.period_key)
  from pst_statements s left join master_projects mp on mp.id = s.master_project_id
  where s.status = 'rejected' and s.voided_at is null and pst_can_write(s.master_project_id);

  -- PSSR: my turn to sign (named signer, or an unnamed step), punches to verify or overdue, gas-in permits to approve
  if can_pssr then
    return query
    with steps as (
      select sy.id sys_id, sy.master_project_id pid, sy.code, sy.name, sg.seq, sg.role_label, lower(coalesce(sg.signer_email, '')) email, sg.step_rule, sg.is_manual,
        (select count(*) from pssr_signers x where x.master_project_id = sy.master_project_id and x.seq = sg.seq) need,
        (select count(*) from pssr_signoffs o where o.system_id = sy.id and o.seq = sg.seq and o.decision = 'sign') got
      from pssr_systems sy join pssr_signers sg on sg.master_project_id = sy.master_project_id
      where rasta_user_can_access_master_project(sy.master_project_id)
        and not exists (select 1 from pssr_checks c where c.system_id = sy.id and c.mandatory and c.status in ('pending', 'fail'))
        and not exists (select 1 from pssr_punches p where p.system_id = sy.id and p.category = 'A' and p.status = 'open')
    ), open_steps as (
      select * from steps where (step_rule = 'all' and got < need) or (step_rule <> 'all' and got = 0)
    ), next_step as (
      select sys_id, min(seq) seq from open_steps group by sys_id
    )
    select distinct on (st.sys_id) 'pssr:sign:' || st.sys_id, 'pssr', 'pssr_sign', st.pid, coalesce(mp.short_name, mp.official_name, ''),
      'امضای PSSR — ' || st.code || ' ' || st.name, 'نوبت امضای ' || st.role_label, null::date, now(), false, st.sys_id,
      jsonb_build_object('seq', st.seq, 'role', st.role_label)
    from open_steps st join next_step n on n.sys_id = st.sys_id and n.seq = st.seq left join master_projects mp on mp.id = st.pid
    where not st.is_manual and (st.email = my_email or (st.email = '' and coalesce(is_admin_user(), false)))
      and not exists (select 1 from pssr_signoffs o where o.system_id = st.sys_id and o.seq = st.seq and lower(coalesce(o.signed_by, '')) in (my_email, u::text));

    return query
    select 'pssr:verify:' || p.id, 'pssr', 'pssr_verify', sy.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
      'تأیید رفع پانچ ' || p.category || ' — ' || p.title, sy.code || ' · ' || coalesce(nullif(p.close_note, ''), 'اعلام رفع شده'), p.due_date,
      coalesce(p.closed_at, p.raised_at), coalesce(p.closed_at, p.raised_at) < now() - interval '3 days', p.id, jsonb_build_object('systemId', sy.id, 'category', p.category)
    from pssr_punches p join pssr_systems sy on sy.id = p.system_id left join master_projects mp on mp.id = sy.master_project_id
    where p.status = 'closed' and rasta_user_can_access_master_project(sy.master_project_id) and lower(coalesce(p.closed_by, '')) not in (my_email, u::text);

    return query
    select 'pssr:punch:' || p.id, 'pssr', 'pssr_punch', sy.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
      'پانچ ' || p.category || ' — ' || p.title, sy.code || coalesce(' · مسئول: ' || nullif(p.owner, ''), ''), p.due_date,
      p.raised_at, p.due_date < current_date or p.category = 'A', p.id, jsonb_build_object('systemId', sy.id, 'category', p.category)
    from pssr_punches p join pssr_systems sy on sy.id = p.system_id left join master_projects mp on mp.id = sy.master_project_id
    where p.status = 'open' and rasta_user_can_access_master_project(sy.master_project_id)
      and (p.category = 'A' or (p.due_date is not null and p.due_date <= current_date + 3));

    return query
    select 'pssr:gasin:' || g.id, 'pssr', 'pssr_gasin', sy.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
      'تأیید مجوز گازدهی — ' || sy.code || coalesce(' · PTW ' || nullif(g.ptw_no, ''), ''), coalesce('زمان برنامه‌ریزی‌شده: ' || g.planned_at::date::text, 'پیش‌نویس'),
      g.planned_at::date, g.created_at, g.planned_at is not null and g.planned_at < now() + interval '2 days', g.id, jsonb_build_object('systemId', sy.id)
    from pssr_gasin_permits g join pssr_systems sy on sy.id = g.system_id left join master_projects mp on mp.id = sy.master_project_id
    where g.status = 'draft' and coalesce(is_admin_user(), false) and rasta_user_can_access_master_project(sy.master_project_id);
  end if;

  -- testing: failed tests, sections and packs waiting for acceptance, tests past their planned start
  if can_test then
    return query
    select 'ht:' || t.kind || ':' || t.id, 'testing', t.inbox_kind, t.pid, coalesce(mp.short_name, mp.official_name, ''), t.title, t.sub, t.planned_date, t.updated_at, t.urgent, t.id,
      jsonb_build_object('target', t.kind, 'stage', t.stage)
    from (
      select s.id, 'section' kind, s.master_project_id pid, s.stage, s.planned_date, s.updated_at,
        case when s.failed then 'ht_failed' when s.stage = 'dewatering' then 'ht_accept' else 'ht_late' end inbox_kind,
        case when s.failed then 'آزمون ناموفق — مقطع ' || s.code when s.stage = 'dewatering' then 'پذیرش آزمون — مقطع ' || s.code else 'شروع آزمون عقب افتاده — مقطع ' || s.code end title,
        case when s.failed then coalesce(nullif(s.failed_note, ''), 'نیازمند تعمیر و آزمون مجدد') else 'کیلومتر ' || s.km_from::text || ' تا ' || s.km_to::text end sub,
        (s.failed or s.planned_date < current_date - 7) urgent
      from ht_sections s
      where s.failed or s.stage = 'dewatering' or (s.stage = 'planned' and s.planned_date < current_date)
      union all
      select p.id, 'pack', p.master_project_id, p.stage, p.planned_date, p.updated_at,
        case when p.failed then 'ht_failed' when p.stage = 'dewatering' then 'ht_accept' else 'ht_late' end,
        case when p.failed then 'آزمون ناموفق — پکیج ' || p.code when p.stage = 'dewatering' then 'پذیرش آزمون — پکیج ' || p.code else 'شروع آزمون عقب افتاده — پکیج ' || p.code end,
        case when p.failed then coalesce(nullif(p.failed_note, ''), 'نیازمند تعمیر و آزمون مجدد') else coalesce(nullif(p.station, ''), p.title) end,
        (p.failed or p.planned_date < current_date - 7)
      from ht_packs p
      where p.failed or p.stage = 'dewatering' or (p.stage = 'planned' and p.planned_date < current_date)
    ) t left join master_projects mp on mp.id = t.pid
    where rasta_user_can_access_master_project(t.pid);
  end if;
end $function$;

grant execute on function public.inbox_my_project_work() to authenticated;
