-- perf 001 — notification_projects joined every source table on `id::text = text`, which cannot use the primary-key
-- index: each call scanned ~20 tables (with their row-level security) and averaged ~1 s. The ids are now cast to the
-- key's own type (try_uuid / a bigint check), so each lookup is an index probe. Same rows, same answer.
create or replace function try_uuid(p text) returns uuid language sql immutable parallel safe set search_path to 'public' as $f$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$f$;
grant execute on function try_uuid(text) to authenticated;

create or replace function public.notification_projects(p_ids text[])
 returns table(id text, master_project_id uuid) language sql stable set search_path to 'public' as $function$
  with x as (
    select y.id, y.m[1] as k, substr(y.id, length(y.m[1]) + 2) as rid, try_uuid(substr(y.id, length(y.m[1]) + 2)) as u
      from (select i as id, regexp_match(i, '^(cm|cme|cmr|cmb|fg|fc|fl|fr|la|laa|lap|lc|im|nq|rq|rm|en-pr|en-rv|en-ap|ex-rv|ex-my|ex-gp|ex-qc|mt-sd|mt-sf|mt-sl|mt-rq|mt-dc|mt-ch|mt-tx)-') as m from unnest(p_ids) i) y
     where y.m is not null
  ),
  map as (select source_module, source_project_id as src, master_project_id from rasta_project_mappings where status = 'confirmed')
  select x.id, c.master_project_id from x join cm_request_steps s on s.id = x.u join chg_change_requests c on c.id = s.request_id where x.k in ('cm', 'cme')
  union all select x.id, c.master_project_id from x join chg_change_requests c on c.id = x.u where x.k in ('cmr', 'cmb')
  union all select x.id, k.master_project_id from x join fin_guarantees g on g.id = x.u join fin_contracts k on k.id = g.contract_id where x.k = 'fg'
  union all select x.id, k.master_project_id from x join fin_payment_certificates g on g.id = x.u join fin_contracts k on k.id = g.contract_id where x.k = 'fc'
  union all select x.id, k.master_project_id from x join fin_claims g on g.id = x.u join fin_contracts k on k.id = g.contract_id where x.k = 'fl'
  union all select x.id, k.master_project_id from x join fin_retention_releases g on g.id = x.u join fin_contracts k on k.id = g.contract_id where x.k = 'fr'
  union all select x.id, p.master_project_id from x join la_parcels p on p.id = x.u where x.k in ('la', 'laa', 'lap')
  union all select x.id, c.master_project_id from x join la_crossings c on c.id = x.u where x.k = 'lc'
  union all select x.id, m.master_project_id from x join im_issues i on i.id = x.u join map m on m.source_module = 'issues' and m.src = i.project_id where x.k = 'im'
  union all select x.id, m.master_project_id from x join im_notif_outbox o on o.id = (case when x.rid ~ '^[0-9]{1,18}$' then x.rid::bigint end) join im_issues i on i.id = o.issue_id join map m on m.source_module = 'issues' and m.src = i.project_id where x.k = 'nq'
  union all select x.id, m.master_project_id from x join im_notif_outbox o on o.id = (case when x.rid ~ '^[0-9]{1,18}$' then x.rid::bigint end) join rm_risks r on r.id = o.risk_id join map m on m.source_module = 'risk' and m.src = r.project_id where x.k = 'rq'
  union all select x.id, m.master_project_id from x join rm_risks r on r.id = x.u join map m on m.source_module = 'risk' and m.src = r.project_id where x.k = 'rm'
  union all select x.id, d.project_id from x join ex_eng_docs d on d.id = x.u where x.k in ('en-pr', 'en-rv', 'en-ap')
  union all select x.id, r.project_id from x join ex_reports r on r.id = x.u where x.k in ('ex-rv', 'ex-my')
  union all select x.id, g.project_id from x join ex_gap_items g on g.id = x.u where x.k = 'ex-gp'
  union all select x.id, q.project_id from x join ex_qc_findings q on q.id = x.u where x.k = 'ex-qc'
  union all select x.id, pk.master_project_id from x join mtl_item_stages s on s.id = x.u join mtl_package_items i on i.id = s.item_id join mtl_packages pk on pk.id = i.package_id where x.k in ('mt-sd', 'mt-sf', 'mt-sl')
  union all select x.id, q.master_project_id from x join mtl_requisitions q on q.id = x.u where x.k = 'mt-rq'
  union all select x.id, d.master_project_id from x join mtl_discrepancies d on d.id = x.u where x.k = 'mt-dc'
  union all select x.id, c.master_project_id from x join mtl_changes c on c.id = x.u where x.k = 'mt-ch'
  union all select x.id, t.master_project_id from x join mtl_txns t on t.id = x.u where x.k = 'mt-tx'
$function$;
