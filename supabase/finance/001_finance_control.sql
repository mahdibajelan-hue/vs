-- Finance & Contract Control — foundation (applied live). Idempotent where possible.
-- Single sources of truth: contracts/amendments/certificates/payments/guarantees/claims/retention = fin_*; budget lines = fin_budget_lines;
-- land payments = la_payments (read through fin_land_ledger, never copied); change effects = chg_change_requests (synced as amendments, once per request).
alter table fin_contracts add column if not exists contract_type text not null default '', add column if not exists supersedes_contract_id uuid references fin_contracts(id), add column if not exists budget_line_id uuid, add column if not exists status_note text not null default '';
alter table fin_contract_amendments add column if not exists days_delta integer not null default 0, add column if not exists cm_request_id uuid references chg_change_requests(id), add column if not exists voided_at timestamptz, add column if not exists void_reason text not null default '';
create unique index if not exists fin_amend_cm_unique on fin_contract_amendments(cm_request_id) where cm_request_id is not null;
alter table fin_contracts drop constraint if exists fin_contracts_status_check;
alter table fin_contracts add constraint fin_contracts_status_check check (status in ('draft','active','suspended','completed','terminated','replaced'));
alter table im_issues drop constraint if exists im_issues_source_check;
alter table im_issues add constraint im_issues_source_check check (source in ('manual','lifecycle_action','mission_debrief','land_acquisition','finance','risk','correspondence','meeting','report','import','api'));

create table if not exists fin_audit (id bigserial primary key, at timestamptz not null default now(), actor uuid default auth.uid(), table_name text not null, row_id uuid, master_project_id uuid, action text not null, old_row jsonb, new_row jsonb);
create index if not exists fin_audit_row on fin_audit(table_name, row_id, at desc);
create index if not exists fin_audit_proj on fin_audit(master_project_id, at desc);
create table if not exists fin_settings_versions (id uuid primary key default gen_random_uuid(), version int not null unique, valid_from date not null default current_date, note text not null default '', values_json jsonb not null default '{}'::jsonb, created_by uuid default auth.uid(), created_at timestamptz not null default now());
create table if not exists fin_config_items (id uuid primary key default gen_random_uuid(), kind text not null check (kind in ('contract_type','cost_category','currency')), key text not null, label text not null, sort int not null default 0, active boolean not null default true, created_at timestamptz not null default now(), unique (kind, key));
create table if not exists fin_budget_lines (id uuid primary key default gen_random_uuid(), master_project_id uuid not null, code text not null, title text not null, cost_category text not null default '', kind text not null default 'general' check (kind in ('general','land')), approved_amount numeric not null default 0 check (approved_amount >= 0), currency text not null default 'ریال', notes text not null default '', is_active boolean not null default true, created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (master_project_id, code));
create table if not exists fin_links (id uuid primary key default gen_random_uuid(), master_project_id uuid not null, source_type text not null check (source_type in ('contract','certificate','guarantee','claim','budget','land','project')), source_id uuid, target_type text not null check (target_type in ('risk','issue')), target_id uuid not null, label text not null default '', created_by uuid default auth.uid(), created_at timestamptz not null default now(), unique (source_type, source_id, target_type));
create table if not exists fin_sync_log (id bigserial primary key, at timestamptz not null default now(), source text not null, source_id uuid, master_project_id uuid, outcome text not null, detail text not null default '');
alter table fin_audit enable row level security; alter table fin_settings_versions enable row level security; alter table fin_config_items enable row level security; alter table fin_budget_lines enable row level security; alter table fin_links enable row level security; alter table fin_sync_log enable row level security;
create policy fin_audit_select on fin_audit for select to authenticated using (true);
create policy fin_settings_select on fin_settings_versions for select to authenticated using (true);
create policy fin_config_select on fin_config_items for select to authenticated using (true);
create policy fin_budget_lines_select on fin_budget_lines for select to authenticated using (true);
create policy fin_links_select on fin_links for select to authenticated using (true);
create policy fin_sync_log_select on fin_sync_log for select to authenticated using (true);
-- all writes go through the security-definer RPCs below (no direct write policy)

alter table la_payments add column if not exists status text not null default 'posted' check (status in ('posted','voided')), add column if not exists void_reason text not null default '', add column if not exists voided_at timestamptz, add column if not exists budget_line_id uuid;

insert into fin_config_items (kind,key,label,sort) values
 ('contract_type','engineering','مهندسی (Engineering)',10),('contract_type','supervision','مشاوره و نظارت',20),('contract_type','epc','EPC',30),('contract_type','equipment_supply','تأمین تجهیزات',40),('contract_type','construction','اجرا',50),('contract_type','other','سایر',90),
 ('cost_category','engineering','مهندسی',10),('cost_category','procurement','تأمین',20),('cost_category','construction','اجرا',30),('cost_category','supervision','نظارت و مشاوره',40),('cost_category','land','تملک اراضی',50),('cost_category','owner','هزینه‌های کارفرما',60),('cost_category','contingency','ذخیره',70),
 ('currency','IRR','ریال',10),('currency','USD','دلار آمریکا',20),('currency','EUR','یورو',30) on conflict do nothing;
insert into fin_settings_versions (version, valid_from, note, values_json) values (1, '2000-01-01', 'مقادیر پیش‌فرض', '{"guaranteeExpiryDays":60,"overdueCertificateDays":30,"budgetWarnPct":85,"budgetCriticalPct":100,"stageSlaDays":{"submitted":7,"under_review":14,"certified":21},"claimStaleDays":14,"amendmentJumpPct":10,"landBudgetWarnPct":85}') on conflict do nothing;

create or replace function fin_can_write(p_project uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (is_admin_user() or (rasta_user_can_access_master_project(p_project) and (rasta_has_permission(auth.uid(),'finance','edit') or rasta_has_permission(auth.uid(),'finance','create'))));
$f$;
create or replace function fin_can_configure() returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (is_admin_user() or rasta_has_permission(auth.uid(),'finance','configure'));
$f$;
create or replace function fin_audit_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare o jsonb; n jsonb; v_proj uuid; v_id uuid;
begin
  o := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_id := nullif(coalesce(n->>'id', o->>'id'), '')::uuid;
  v_proj := nullif(coalesce(n->>'master_project_id', o->>'master_project_id'), '')::uuid;
  if v_proj is null and coalesce(n->>'contract_id', o->>'contract_id') is not null then
    select master_project_id into v_proj from fin_contracts where id = nullif(coalesce(n->>'contract_id', o->>'contract_id'), '')::uuid;
  end if;
  if tg_op = 'UPDATE' and o = n then return new; end if;
  insert into fin_audit (table_name, row_id, master_project_id, action, old_row, new_row) values (tg_table_name, v_id, v_proj, tg_op, o, n);
  return coalesce(new, old);
end $f$;
create trigger trg_fin_audit after insert or update or delete on fin_contracts for each row execute function fin_audit_trg();
create trigger trg_fin_audit after insert or update or delete on fin_contract_amendments for each row execute function fin_audit_trg();
create trigger trg_fin_audit after insert or update or delete on fin_payment_certificates for each row execute function fin_audit_trg();
create trigger trg_fin_audit after insert or update or delete on fin_payments for each row execute function fin_audit_trg();
create trigger trg_fin_audit after insert or update or delete on fin_guarantees for each row execute function fin_audit_trg();
create trigger trg_fin_audit after insert or update or delete on fin_claims for each row execute function fin_audit_trg();
create trigger trg_fin_audit after insert or update or delete on fin_retention_releases for each row execute function fin_audit_trg();
create trigger trg_fin_audit after insert or update or delete on fin_budgets for each row execute function fin_audit_trg();
create trigger trg_fin_audit after insert or update or delete on fin_budget_changes for each row execute function fin_audit_trg();
create trigger trg_fin_audit after insert or update or delete on fin_budget_lines for each row execute function fin_audit_trg();
create trigger trg_fin_audit after insert or update or delete on la_payments for each row execute function fin_audit_trg();


create or replace function fin_save_settings(p_values jsonb, p_valid_from date default current_date, p_note text default '') returns int language plpgsql security definer set search_path to 'public' as $f$
declare v int;
begin
  if not fin_can_configure() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_valid_from < current_date then raise exception 'valid_from_in_past'; end if;
  select coalesce(max(version),0)+1 into v from fin_settings_versions;
  insert into fin_settings_versions (version, valid_from, note, values_json) values (v, p_valid_from, coalesce(p_note,''), coalesce(p_values,'{}'::jsonb));
  return v;
end $f$;
create or replace function fin_save_config_item(p_kind text, p_key text, p_label text, p_active boolean default true) returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if not fin_can_configure() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if btrim(coalesce(p_key,'')) = '' or btrim(coalesce(p_label,'')) = '' then raise exception 'key_and_label_required'; end if;
  insert into fin_config_items (kind, key, label, active, sort) values (p_kind, btrim(p_key), btrim(p_label), p_active, (select coalesce(max(sort),0)+10 from fin_config_items where kind = p_kind))
  on conflict (kind, key) do update set label = excluded.label, active = excluded.active;
end $f$;
create or replace function fin_save_budget_line(p_id uuid, p_project uuid, p_code text, p_title text, p_category text, p_kind text, p_amount numeric, p_currency text, p_notes text default '', p_active boolean default true) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare v uuid;
begin
  if not fin_can_write(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if btrim(coalesce(p_code,'')) = '' or btrim(coalesce(p_title,'')) = '' then raise exception 'code_and_title_required'; end if;
  if p_id is null then
    insert into fin_budget_lines (master_project_id, code, title, cost_category, kind, approved_amount, currency, notes, is_active)
    values (p_project, btrim(p_code), btrim(p_title), coalesce(p_category,''), coalesce(p_kind,'general'), greatest(0,coalesce(p_amount,0)), coalesce(p_currency,'ریال'), coalesce(p_notes,''), p_active) returning id into v;
  else
    update fin_budget_lines set code = btrim(p_code), title = btrim(p_title), cost_category = coalesce(p_category,''), kind = coalesce(p_kind,'general'), approved_amount = greatest(0,coalesce(p_amount,0)), currency = coalesce(p_currency,'ریال'), notes = coalesce(p_notes,''), is_active = p_active, updated_at = now()
    where id = p_id and master_project_id = p_project returning id into v;
    if v is null then raise exception 'not_found'; end if;
  end if;
  return v;
end $f$;
-- Voiding keeps the row (history + audit); every sum in both modules counts status='posted' only.
create or replace function fin_void_land_payment(p_id uuid, p_reason text) returns void language plpgsql security definer set search_path to 'public' as $f$
declare v_proj uuid;
begin
  select master_project_id into v_proj from la_payments where id = p_id and status = 'posted' for update;
  if v_proj is null then raise exception 'not_found_or_already_voided'; end if;
  if not la_can_edit(v_proj) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason_required'; end if;
  update la_payments set status = 'voided', void_reason = btrim(p_reason), voided_at = now() where id = p_id;
  insert into fin_sync_log (source, source_id, master_project_id, outcome, detail) values ('landacq.payment', p_id, v_proj, 'voided', btrim(p_reason));
end $f$;
create or replace view fin_land_ledger as
  select p.id, p.master_project_id, p.parcel_id, p.category, p.payee, p.amount, p.paid_date, p.ref, p.note, p.status, p.void_reason, 'landacq'::text as source_module,
         coalesce(p.budget_line_id, (select l.id from fin_budget_lines l where l.master_project_id = p.master_project_id and l.kind = 'land' and l.is_active order by l.created_at limit 1)) as budget_line_id
  from la_payments p;
alter view fin_land_ledger set (security_invoker = true);
-- Approved land budget: finance line(s) of kind 'land' when present, else the legacy value in the land route settings (approved_source says which).
-- paid = posted payments; committed_unpaid = estimated cost of each parcel minus owner payments already made (never below 0) -> no double counting.
create or replace function fin_land_summary(p_project uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare v_line numeric; v_legacy numeric; v_paid numeric; v_voided numeric; v_commit numeric; v_src text; v_appr numeric;
begin
  if not la_can_view(p_project) and not rasta_user_can_access_master_project(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select sum(approved_amount) into v_line from fin_budget_lines where master_project_id = p_project and kind = 'land' and is_active;
  select nullif(settings ->> 'budgetAmount','')::numeric into v_legacy from la_routes where master_project_id = p_project limit 1;
  v_appr := coalesce(v_line, v_legacy, 0);
  v_src := case when v_line is not null then 'finance' when v_legacy is not null then 'landacq' else 'none' end;
  select coalesce(sum(amount) filter (where status = 'posted'),0), coalesce(sum(amount) filter (where status = 'voided'),0) into v_paid, v_voided from la_payments where master_project_id = p_project;
  select coalesce(sum(greatest(0, coalesce(pc.est_cost,0) - coalesce((select sum(pay.amount) from la_payments pay where pay.parcel_id = pc.id and pay.status = 'posted' and pay.category = 'owner'),0))),0) into v_commit from la_parcels pc where pc.master_project_id = p_project;
  return jsonb_build_object('approved', v_appr, 'approved_source', v_src, 'paid', v_paid, 'voided', v_voided, 'committed_unpaid', v_commit, 'exposure', v_paid + v_commit, 'remaining', v_appr - v_paid - v_commit);
end $f$;
-- Change management -> contract: an approved change with a contract becomes exactly one amendment (unique cm_request_id); edits update it, cancellation voids it; mismatches are logged, not applied.
create or replace function fin_sync_change(p_request uuid) returns text language plpgsql security definer set search_path to 'public' as $f$
declare r chg_change_requests%rowtype; c fin_contracts%rowtype; a fin_contract_amendments%rowtype; v_amt numeric; v_days int; v_out text;
begin
  select * into r from chg_change_requests where id = p_request;
  if not found or r.contract_id is null then return 'skipped'; end if;
  select * into c from fin_contracts where id = r.contract_id;
  if not found then
    insert into fin_sync_log (source, source_id, master_project_id, outcome, detail) values ('change', r.id, r.master_project_id, 'contract_missing', r.cr_number);
    return 'contract_missing';
  end if;
  select * into a from fin_contract_amendments where cm_request_id = r.id;
  if r.status in ('approved','implementing','implemented','closed') then
    v_amt := coalesce(r.approved_change_amount, 0); v_days := coalesce(r.approved_schedule_impact_days, 0);
    if v_amt = 0 and v_days = 0 then return 'no_effect'; end if;
    if coalesce(r.currency,'') <> '' and coalesce(c.currency,'') <> '' and r.currency <> c.currency then
      insert into fin_sync_log (source, source_id, master_project_id, outcome, detail) values ('change', r.id, c.master_project_id, 'currency_mismatch', r.cr_number || ': ' || r.currency || ' ≠ ' || c.currency);
      return 'currency_mismatch';
    end if;
    if a.id is null then
      insert into fin_contract_amendments (contract_id, amendment_number, amendment_date, amount, reason, days_delta, cm_request_id)
      values (c.id, 'CR-' || r.cr_number, coalesce(r.approved_at::date, current_date), v_amt, coalesce(r.title,''), v_days, r.id);
      v_out := 'created';
    elsif a.voided_at is not null or a.amount <> v_amt or a.days_delta <> v_days then
      update fin_contract_amendments set amount = v_amt, days_delta = v_days, voided_at = null, void_reason = '', reason = coalesce(r.title,'') where id = a.id;
      v_out := 'updated';
    else
      return 'unchanged';
    end if;
  elsif a.id is not null and a.voided_at is null then
    update fin_contract_amendments set voided_at = now(), void_reason = 'وضعیت درخواست تغییر: ' || r.status where id = a.id;
    v_out := 'voided';
  else
    return 'unchanged';
  end if;
  insert into fin_sync_log (source, source_id, master_project_id, outcome, detail) values ('change', r.id, c.master_project_id, v_out, r.cr_number);
  return v_out;
end $f$;
create or replace function fin_change_sync_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.contract_id is not null and (tg_op = 'INSERT' or new.status is distinct from old.status or new.approved_change_amount is distinct from old.approved_change_amount or new.approved_schedule_impact_days is distinct from old.approved_schedule_impact_days or new.contract_id is distinct from old.contract_id) then
    begin
      perform fin_sync_change(new.id);
    exception when others then
      insert into fin_sync_log (source, source_id, master_project_id, outcome, detail) values ('change', new.id, new.master_project_id, 'error', sqlerrm);
    end;
  end if;
  return new;
end $f$;
create trigger trg_fin_change_sync after insert or update on chg_change_requests for each row execute function fin_change_sync_trg();
create or replace function fin_raise(p_source_type text, p_source_id uuid, p_project uuid, p_target text, p_title text, p_description text, p_severity text default 'high') returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_map uuid; v_new uuid; v_sev text; v_prob smallint; v_ex uuid; v_desc text;
begin
  if not fin_can_write(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select target_id into v_ex from fin_links where source_type = p_source_type and source_id is not distinct from p_source_id and target_type = p_target;
  if v_ex is not null then return jsonb_build_object('target', p_target, 'id', v_ex, 'existing', true); end if;
  v_sev := case p_severity when 'critical' then 'critical' when 'low' then 'low' when 'medium' then 'medium' else 'high' end;
  v_desc := coalesce(nullif(p_description,''), p_title) || E'\n\n— منبع: ماژول کنترل قراردادها و مالی';
  if p_target = 'issue' then
    select source_project_id into v_map from rasta_project_mappings where master_project_id = p_project and source_module = 'issues' and status = 'confirmed' limit 1;
    if v_map is null then raise exception 'no_issue_mapping'; end if;
    insert into im_issues (project_id, title, description, priority, deadline_days, status, created_by, source, category)
    values (v_map, p_title, v_desc, v_sev, case v_sev when 'critical' then 3 when 'high' then 7 else 14 end, 'open', auth.uid(), 'finance', 'finance') returning id into v_new;
  elsif p_target = 'risk' then
    select source_project_id into v_map from rasta_project_mappings where master_project_id = p_project and source_module = 'risk' and status = 'confirmed' limit 1;
    if v_map is null then raise exception 'no_risk_mapping'; end if;
    v_prob := case v_sev when 'critical' then 5 when 'high' then 4 when 'medium' then 3 else 2 end;
    insert into rm_risks (project_id, code, title, description, category, risk_type, initial_probability, initial_impact, created_by)
    values (v_map, '', p_title, v_desc, 'cost', 'threat', v_prob, v_prob, auth.uid()) returning id into v_new;
  else
    raise exception 'invalid_target';
  end if;
  insert into fin_links (master_project_id, source_type, source_id, target_type, target_id, label) values (p_project, p_source_type, p_source_id, p_target, v_new, p_title);
  insert into fin_sync_log (source, source_id, master_project_id, outcome, detail) values ('raise.' || p_target, p_source_id, p_project, 'created', p_title);
  return jsonb_build_object('target', p_target, 'id', v_new, 'existing', false);
end $f$;
