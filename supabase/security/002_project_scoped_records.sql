begin;

-- Attachments keep their existing paths. Non-admin access follows the visible
-- parent contract and the attachment record, including existing documents.
alter policy finance_docs_read_authenticated on storage.objects using (
  bucket_id = 'finance-docs' and (select auth.uid()) is not null and (
    (select public.is_admin_user()) or exists (
      select 1 from public.fin_contracts c
      where c.master_project_id in (select public.my_projects())
        and (select public.my_module_any(array['finance','statements','executive']))
        and (
          exists (select 1 from public.fin_payment_certificates p where p.contract_id = c.id and p.attachment_url = storage.objects.name)
          or exists (select 1 from public.fin_guarantees g where g.contract_id = c.id and g.attachment_url = storage.objects.name)
          or exists (select 1 from public.fin_claims cl where cl.contract_id = c.id and cl.attachment_url = storage.objects.name)
        )
    )
  )
);

-- Require project membership and a write permission in a module that owns the record.
do $$
declare r record; rule text;
begin
  for r in select * from (values
    ('ht_forms', 'testing', 'weldqc'),
    ('ct_tests', 'testing', 'weldqc'),
    ('sp_welds', 'stationpiping', 'execution')
  ) as t(table_name, module_a, module_b)
  loop
    rule := format(
      'auth.uid() is not null and master_project_id in (select public.my_projects()) and
       (public.is_admin_user() or exists (
         select 1 from unnest(array[%L,%L]) as m(module_key)
         cross join unnest(array[''create'',''edit'',''configure'',''review'',''approve'']) as a(action)
         where public.rasta_has_permission(auth.uid(), m.module_key, a.action)
       ))', r.module_a, r.module_b);
    execute format('alter policy %I on public.%I to authenticated with check (%s)', r.table_name || '_ins', r.table_name, rule);
    execute format('alter policy %I on public.%I to authenticated using (%s) with check (%s)', r.table_name || '_upd', r.table_name, rule, rule);
  end loop;
end $$;

-- Decisions, baseline revisions and audit records are append-only for app roles.
revoke update, delete on public.sg_lifecycle_gate_decisions, public.sg_lifecycle_schedule_baselines,
  public.sg_lifecycle_schedule_baseline_items, public.sg_lifecycle_audit_log from public, anon, authenticated;

drop policy if exists sg_gate_decisions_role on public.sg_lifecycle_gate_decisions;
create policy sg_gate_decisions_role on public.sg_lifecycle_gate_decisions as restrictive for insert to authenticated
with check (
  (select public.is_admin_user()) or (
    exists (select 1 from public.sg_projects s where s.name = sg_lifecycle_gate_decisions.project_name and s.master_project_id in (select public.my_projects()))
    and ((select public.rasta_has_permission(auth.uid(), 'stagegate', 'approve'))
      or (select public.rasta_has_permission(auth.uid(), 'stagegate', 'configure')))
  )
);

commit;
