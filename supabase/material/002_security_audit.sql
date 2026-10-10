-- Material control — part 2: permission matrix, write policies, audit, stage guard. Applied live in small statements.

alter table mtl_item_stages add column if not exists approved_qty numeric not null default 0;

create or replace function mtl_default_perms() returns jsonb language sql immutable as $f$
  select '{"contractor":["edit_items","edit_packages","submit_stage","post_txn","raise"],"consultant":["review_stage","decide_discrepancy","review_change","approve_txn","raise"],"employer":["review_stage","approve_stage","decide_discrepancy","approve_change","approve_baseline","approve_txn","raise"],"storekeeper":["post_txn"],"controller":["edit_items","edit_packages","post_txn","approve_txn","sync","raise"],"inspector":["inspect","review_stage"],"manager":["*"]}'::jsonb
$f$;

create or replace function mtl_allows(p_project uuid, p_action text) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (
    is_admin_user()
    or exists (
      select 1 from mtl_project_roles r
      where r.project_id = p_project and r.user_id = auth.uid() and r.active
        and (r.role = 'manager' or exists (
          select 1 from jsonb_array_elements_text(coalesce((select values_json -> 'rolePerms' -> r.role from mtl_settings_versions order by version desc limit 1), mtl_default_perms() -> r.role, '[]'::jsonb)) a(x)
          where a.x in ('*', p_action)))
    ));
$f$;

create or replace function mtl_can_configure() returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (is_admin_user() or rasta_has_permission(auth.uid(), 'material', 'configure') or exists (select 1 from mtl_project_roles where user_id = auth.uid() and role = 'manager' and active));
$f$;

create or replace function mtl_audit_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare o jsonb; n jsonb; v_proj uuid; v_id uuid; j jsonb;
begin
  o := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  j := coalesce(n, o);
  v_id := nullif(j->>'id', '')::uuid;
  v_proj := nullif(coalesce(j->>'master_project_id', j->>'project_id'), '')::uuid;
  if v_proj is null and j->>'package_id' is not null then select master_project_id into v_proj from mtl_packages where id = (j->>'package_id')::uuid; end if;
  if v_proj is null and j->>'item_id' is not null then select p.master_project_id into v_proj from mtl_package_items i join mtl_packages p on p.id = i.package_id where i.id = (j->>'item_id')::uuid; end if;
  if v_proj is null and j->>'material_id' is not null then select master_project_id into v_proj from mtl_materials where id = (j->>'material_id')::uuid; end if;
  if tg_op = 'UPDATE' and o = n then return new; end if;
  insert into mtl_audit (table_name, row_id, master_project_id, action, old_row, new_row) values (tg_table_name, v_id, v_proj, tg_op, o, n);
  return coalesce(new, old);
end $f$;

create or replace function mtl_stage_guard_trg() returns trigger language plpgsql as $f$
begin
  if coalesce(current_setting('mtl.rpc', true), '') <> '1' then
    if new.status is distinct from old.status or new.weight is distinct from old.weight or new.done_qty is distinct from old.done_qty or new.approved_qty is distinct from old.approved_qty
       or new.actual_date is distinct from old.actual_date or new.evidence_url is distinct from old.evidence_url or new.approved_by is distinct from old.approved_by
       or new.reviewed_by is distinct from old.reviewed_by or new.submitted_by is distinct from old.submitted_by then
      raise exception 'use_rpc' using errcode = '42501';
    end if;
    if old.status in ('approved','reviewed','submitted') and (new.applicable is distinct from old.applicable) then
      raise exception 'stage_locked' using errcode = '42501';
    end if;
  end if;
  return new;
end $f$;

-- audit triggers
do $$ declare t text; begin
  foreach t in array array['mtl_materials','mtl_mto_revisions','mtl_procurement_requests','mtl_purchase_orders','mtl_po_lines','mtl_manufacturing','mtl_shipments','mtl_warehouse_receipts','mtl_warehouse_lines','mtl_allocations','mtl_packages','mtl_package_items','mtl_item_stages','mtl_baselines','mtl_changes','mtl_txns','mtl_norms','mtl_discrepancies','mtl_links','mtl_project_roles','mtl_settings_versions','mtl_groups','mtl_units','mtl_patterns','mtl_pattern_weights','mtl_stage_defs'] loop
    execute format('drop trigger if exists trg_mtl_audit on %I', t);
    execute format('create trigger trg_mtl_audit after insert or update or delete on %I for each row execute function mtl_audit_trg()', t);
  end loop;
end $$;
drop trigger if exists trg_mtl_stage_guard on mtl_item_stages;
create trigger trg_mtl_stage_guard before update on mtl_item_stages for each row execute function mtl_stage_guard_trg();

-- row level security: everyone signed in reads; writes need a project role (or admin); sensitive transitions go through the RPCs
do $$ declare r record; t text; begin
  for t in select unnest(array['mtl_project_roles','mtl_settings_versions','mtl_audit','mtl_units','mtl_patterns','mtl_stage_defs','mtl_pattern_weights','mtl_groups','mtl_packages','mtl_package_items','mtl_item_stages','mtl_baselines','mtl_changes','mtl_txns','mtl_norms','mtl_discrepancies','mtl_links']) loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_sel', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_sel', t);
  end loop;
  -- configuration tables: configurators write directly
  for t in select unnest(array['mtl_units','mtl_patterns','mtl_stage_defs','mtl_pattern_weights','mtl_groups']) loop
    execute format('drop policy if exists %I on %I', t || '_cfg', t);
    execute format('create policy %I on %I for all to authenticated using (mtl_can_configure()) with check (mtl_can_configure())', t || '_cfg', t);
  end loop;
  -- project data written by roles
  for r in select * from (values
    ('mtl_mto_revisions','edit_items','master_project_id'),
    ('mtl_materials','edit_items','master_project_id'),
    ('mtl_norms','edit_items','master_project_id'),
    ('mtl_procurement_requests','edit_packages','master_project_id'),
    ('mtl_purchase_orders','edit_packages','master_project_id'),
    ('mtl_shipments','edit_packages','master_project_id'),
    ('mtl_release_notes','edit_packages','master_project_id'),
    ('mtl_packages','edit_packages','master_project_id'),
    ('mtl_warehouse_receipts','post_txn','master_project_id'),
    ('mtl_allocations','post_txn','master_project_id'),
    ('mtl_procurement_lines','edit_packages','(select master_project_id from mtl_procurement_requests where id = request_id)'),
    ('mtl_po_lines','edit_packages','(select master_project_id from mtl_purchase_orders where id = po_id)'),
    ('mtl_manufacturing','edit_packages','(select p.master_project_id from mtl_po_lines l join mtl_purchase_orders p on p.id = l.po_id where l.id = po_line_id)'),
    ('mtl_release_lines','edit_packages','(select master_project_id from mtl_release_notes where id = release_id)'),
    ('mtl_shipment_lines','edit_packages','(select master_project_id from mtl_shipments where id = shipment_id)'),
    ('mtl_package_items','edit_packages','(select master_project_id from mtl_packages where id = package_id)'),
    ('mtl_item_stages','edit_packages','(select p.master_project_id from mtl_package_items i join mtl_packages p on p.id = i.package_id where i.id = item_id)')
  ) as v(tbl, act, expr) loop
    execute format('drop policy if exists %I on %I', r.tbl || '_role_w', r.tbl);
    execute format('create policy %I on %I for all to authenticated using (mtl_allows(%s, %L)) with check (mtl_allows(%s, %L))', r.tbl || '_role_w', r.tbl, r.expr, r.act, r.expr, r.act);
  end loop;
  -- receiving: storekeepers post, inspectors record the entry inspection
  execute 'drop policy if exists mtl_warehouse_lines_role_w on mtl_warehouse_lines';
  execute 'create policy mtl_warehouse_lines_role_w on mtl_warehouse_lines for all to authenticated using (mtl_allows((select master_project_id from mtl_warehouse_receipts where id = receipt_id), ''post_txn'') or mtl_allows((select master_project_id from mtl_warehouse_receipts where id = receipt_id), ''inspect'')) with check (mtl_allows((select master_project_id from mtl_warehouse_receipts where id = receipt_id), ''post_txn'') or mtl_allows((select master_project_id from mtl_warehouse_receipts where id = receipt_id), ''inspect''))';
end $$;
