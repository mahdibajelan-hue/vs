-- notification_projects(ids) — which master project each bell item belongs to, so Project Radar can count only the
-- chosen project's items on its menu. Read-only, SECURITY INVOKER: RLS of every table applies, an id the caller
-- cannot see simply has no row. Ids are '<prefix>-<record id>' (uuid or number) as built by the my_*_notifications() functions.
-- Rollback: drop function if exists notification_projects(text[]);
create or replace function notification_projects(p_ids text[])
returns table(id text, master_project_id uuid)
language sql stable security invoker set search_path = public as $$
  with x as (
    select y.id, y.m[1] as k, substr(y.id, length(y.m[1]) + 2) as rid
      from (select i as id, regexp_match(i, '^(cm|cme|cmr|cmb|fg|fc|fl|fr|la|laa|lap|lc|im|nq|rq|rm|en-pr|en-rv|en-ap|ex-rv|ex-my|ex-gp|ex-qc|mt-sd|mt-sf|mt-sl|mt-rq|mt-dc|mt-ch|mt-tx)-') as m from unnest(p_ids) i) y
     where y.m is not null
  ),
  map as (select source_module, source_project_id::text as src, master_project_id from rasta_project_mappings where status = 'confirmed')
  -- change management
  select x.id, c.master_project_id from x join cm_request_steps s on s.id::text = x.rid join chg_change_requests c on c.id = s.request_id where x.k in ('cm', 'cme')
  union all select x.id, c.master_project_id from x join chg_change_requests c on c.id::text = x.rid where x.k in ('cmr', 'cmb')
  -- finance (through the contract)
  union all select x.id, k.master_project_id from x join fin_guarantees g on g.id::text = x.rid join fin_contracts k on k.id = g.contract_id where x.k = 'fg'
  union all select x.id, k.master_project_id from x join fin_payment_certificates g on g.id::text = x.rid join fin_contracts k on k.id = g.contract_id where x.k = 'fc'
  union all select x.id, k.master_project_id from x join fin_claims g on g.id::text = x.rid join fin_contracts k on k.id = g.contract_id where x.k = 'fl'
  union all select x.id, k.master_project_id from x join fin_retention_releases g on g.id::text = x.rid join fin_contracts k on k.id = g.contract_id where x.k = 'fr'
  -- land
  union all select x.id, p.master_project_id from x join la_parcels p on p.id::text = x.rid where x.k in ('la', 'laa', 'lap')
  union all select x.id, c.master_project_id from x join la_crossings c on c.id::text = x.rid where x.k = 'lc'
  -- issues and risks live in their own project spaces: through the confirmed project mapping
  union all select x.id, m.master_project_id from x join im_issues i on i.id::text = x.rid join map m on m.source_module = 'issues' and m.src = i.project_id::text where x.k = 'im'
  union all select x.id, m.master_project_id from x join im_notif_outbox o on o.id::text = x.rid join im_issues i on i.id = o.issue_id join map m on m.source_module = 'issues' and m.src = i.project_id::text where x.k = 'nq'
  union all select x.id, m.master_project_id from x join im_notif_outbox o on o.id::text = x.rid join rm_risks r on r.id = o.risk_id join map m on m.source_module = 'risk' and m.src = r.project_id::text where x.k = 'rq'
  union all select x.id, m.master_project_id from x join rm_risks r on r.id::text = x.rid join map m on m.source_module = 'risk' and m.src = r.project_id::text where x.k = 'rm'
  -- engineering / execution (project_id is the master project)
  union all select x.id, d.project_id from x join ex_eng_docs d on d.id::text = x.rid where x.k in ('en-pr', 'en-rv', 'en-ap')
  union all select x.id, r.project_id from x join ex_reports r on r.id::text = x.rid where x.k in ('ex-rv', 'ex-my')
  union all select x.id, g.project_id from x join ex_gap_items g on g.id::text = x.rid where x.k = 'ex-gp'
  union all select x.id, q.project_id from x join ex_qc_findings q on q.id::text = x.rid where x.k = 'ex-qc'
  -- material
  union all select x.id, pk.master_project_id from x join mtl_item_stages s on s.id::text = x.rid join mtl_package_items i on i.id = s.item_id join mtl_packages pk on pk.id = i.package_id where x.k in ('mt-sd', 'mt-sf', 'mt-sl')
  union all select x.id, q.master_project_id from x join mtl_requisitions q on q.id::text = x.rid where x.k = 'mt-rq'
  union all select x.id, d.master_project_id from x join mtl_discrepancies d on d.id::text = x.rid where x.k = 'mt-dc'
  union all select x.id, c.master_project_id from x join mtl_changes c on c.id::text = x.rid where x.k = 'mt-ch'
  union all select x.id, t.master_project_id from x join mtl_txns t on t.id::text = x.rid where x.k = 'mt-tx'
$$;
grant execute on function notification_projects(text[]) to authenticated;
