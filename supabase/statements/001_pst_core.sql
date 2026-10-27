-- تولید صورت‌وضعیت (payment statement generator) — monthly E / P / C statements of a contract, generated from the
-- engineering document register (ex_eng_docs), the material chain (PO → shipment → warehouse receipt → entry inspection)
-- and the supervision-approved executed quantities (ex_activities / execution reports). An approved statement is posted
-- to the finance register as a payment certificate (fin_payment_certificates), so the money side is typed once.
-- Rollback: rollback/001_pst_core.sql

insert into rasta_modules (key, label_fa) values ('statements', 'تولید صورت‌وضعیت') on conflict (key) do nothing;

-- ── per-contract settings: part ceilings, deduction rates, engineering stage split ─────────────────────────────
create table if not exists pst_contract_cfg (
  contract_id uuid primary key references fin_contracts(id) on delete cascade,
  master_project_id uuid not null,
  cap_e numeric, cap_p numeric, cap_c numeric,                       -- part ceilings (null = only the contract ceiling)
  adv_recovery_pct numeric not null default 10, ret_pct numeric not null default 5,
  tax_pct numeric not null default 2.5, ins_pct numeric not null default 5,
  eng_split jsonb not null default '[{"key":"prepared","label":"ارسال اولیه (IFR)","pct":60},{"key":"approved","label":"تأیید نهایی (AFC)","pct":40}]',
  e_doc_contract text,                                               -- which register docs belong to this contract (default: contract number)
  p_packages uuid[],                                                 -- material packages of this contract (null = all project materials)
  c_books uuid[],                                                    -- price books of this contract (null = all activities)
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now()
);

-- ── staged payment of goods: an ordered list of material stages with the share of the item value paid at each ─────────
create table if not exists pst_pay_sequences (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null,
  contract_id uuid not null references fin_contracts(id) on delete cascade,
  title text not null default '',
  group_id uuid,            -- applies to a material group …
  material_id uuid,         -- … or to one item; both null = the contract's default sequence
  steps jsonb not null,     -- [{"stage":"po_issue","pct":10}, …] — shares add up to 100
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create unique index if not exists pst_pay_seq_scope on pst_pay_sequences (contract_id, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(material_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ── statements and their lines ────────────────────────────────────────────────────────────────────────────────
create table if not exists pst_statements (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null,
  contract_id uuid not null references fin_contracts(id) on delete cascade,
  part text not null check (part in ('E','P','C')),
  no int not null,
  period_key text not null,              -- Jalali month «1405-07»
  period_from date not null, period_to date not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','posted')),
  cum_sys numeric not null default 0,    -- what the source modules show up to the period end
  cum_amount numeric not null default 0, -- cumulative accepted (after the reviewer's edits)
  prev_amount numeric not null default 0,
  this_amount numeric not null default 0,
  cap numeric,
  deductions jsonb not null default '{}',
  payable numeric not null default 0,
  note text not null default '',
  reject_reason text not null default '',
  fin_certificate_id uuid references fin_payment_certificates(id) on delete set null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  submitted_by uuid, submitted_at timestamptz, approved_by uuid, approved_at timestamptz, posted_by uuid, posted_at timestamptz,
  unique (contract_id, part, period_key), unique (contract_id, part, no)
);
create table if not exists pst_lines (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references pst_statements(id) on delete cascade,
  source_kind text not null check (source_kind in ('doc','material','activity')),
  source_id uuid not null,
  code text not null default '', title text not null default '', unit text not null default '', group_label text not null default '',
  unit_price numeric not null default 0, base_qty numeric not null default 0, base_amount numeric not null default 0,
  sys_cum_qty numeric not null default 0, sys_cum_amount numeric not null default 0,
  cum_amount numeric not null default 0, prev_amount numeric not null default 0,
  edited boolean not null default false, note text not null default '',
  detail jsonb not null default '{}',
  unique (statement_id, source_kind, source_id)
);
create index if not exists pst_lines_stmt on pst_lines (statement_id);
create index if not exists pst_statements_contract on pst_statements (contract_id, part, period_to);

-- ── access: view = project access; write = finance writers or «statements:edit»; approve = finance config or «statements:approve» ──
insert into rasta_permissions (module_key, action) select 'statements', a from (values ('view'),('edit'),('approve')) v(a) on conflict (module_key, action) do nothing;
insert into rasta_role_permissions (role_id, permission_id) select r.id, p.id from rasta_roles r cross join rasta_permissions p where r.name = 'دسترسی کامل' and p.module_key = 'statements' on conflict do nothing;

create or replace function pst_can_view(p uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and rasta_user_can_access_master_project(p)
$f$;
create or replace function pst_can_write(p uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (is_admin_user() or (rasta_user_can_access_master_project(p) and (fin_can_write(p) or rasta_has_permission(auth.uid(), 'statements', 'edit'))))
$f$;
create or replace function pst_can_approve(p uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (is_admin_user() or (rasta_user_can_access_master_project(p) and (fin_can_configure() or rasta_has_permission(auth.uid(), 'statements', 'approve'))))
$f$;

alter table pst_contract_cfg enable row level security;
alter table pst_pay_sequences enable row level security;
alter table pst_statements enable row level security;
alter table pst_lines enable row level security;
create policy pst_cfg_sel on pst_contract_cfg for select to authenticated using (pst_can_view(master_project_id));
create policy pst_cfg_wr on pst_contract_cfg for all to authenticated using (pst_can_approve(master_project_id)) with check (pst_can_approve(master_project_id));
create policy pst_seq_sel on pst_pay_sequences for select to authenticated using (pst_can_view(master_project_id));
create policy pst_seq_wr on pst_pay_sequences for all to authenticated using (pst_can_approve(master_project_id)) with check (pst_can_approve(master_project_id));
create policy pst_st_sel on pst_statements for select to authenticated using (pst_can_view(master_project_id));
-- statements are created / changed only through the RPCs below (status, totals and the finance link must stay consistent)
create policy pst_ln_sel on pst_lines for select to authenticated using (exists (select 1 from pst_statements s where s.id = statement_id and pst_can_view(s.master_project_id)));

-- ── save a generated statement (create, or regenerate a draft / returned one) with its lines and totals ─────────────
create or replace function pst_save(p jsonb, p_lines jsonb) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare sid uuid := nullif(p->>'id', '')::uuid; s pst_statements%rowtype; c fin_contracts%rowtype; n int;
begin
  select * into c from fin_contracts where id = (p->>'contract_id')::uuid;
  if c.id is null then raise exception 'contract_not_found'; end if;
  if not pst_can_write(c.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if sid is null then
    if exists (select 1 from pst_statements where contract_id = c.id and part = p->>'part' and period_key = p->>'period_key') then raise exception 'exists'; end if;
    if exists (select 1 from pst_statements where contract_id = c.id and part = p->>'part' and status in ('draft','submitted','rejected')) then raise exception 'open_exists'; end if;
    if exists (select 1 from pst_statements where contract_id = c.id and part = p->>'part' and period_to >= (p->>'period_from')::date) then raise exception 'not_after_last'; end if;
    select coalesce(max(no), 0) + 1 into n from pst_statements where contract_id = c.id and part = p->>'part';
    insert into pst_statements (master_project_id, contract_id, part, no, period_key, period_from, period_to)
      values (c.master_project_id, c.id, p->>'part', n, p->>'period_key', (p->>'period_from')::date, (p->>'period_to')::date) returning id into sid;
  else
    select * into s from pst_statements where id = sid;
    if s.id is null then raise exception 'not_found'; end if;
    if s.status not in ('draft','rejected') then raise exception 'locked'; end if;
    delete from pst_lines where statement_id = sid;
  end if;
  insert into pst_lines (statement_id, source_kind, source_id, code, title, unit, group_label, unit_price, base_qty, base_amount, sys_cum_qty, sys_cum_amount, cum_amount, prev_amount, edited, note, detail)
  select sid, e->>'source_kind', (e->>'source_id')::uuid, coalesce(e->>'code',''), coalesce(e->>'title',''), coalesce(e->>'unit',''), coalesce(e->>'group_label',''),
         coalesce((e->>'unit_price')::numeric,0), coalesce((e->>'base_qty')::numeric,0), coalesce((e->>'base_amount')::numeric,0),
         coalesce((e->>'sys_cum_qty')::numeric,0), coalesce((e->>'sys_cum_amount')::numeric,0), coalesce((e->>'cum_amount')::numeric,0), coalesce((e->>'prev_amount')::numeric,0),
         coalesce((e->>'edited')::boolean,false), coalesce(e->>'note',''), coalesce(e->'detail','{}'::jsonb)
    from jsonb_array_elements(p_lines) e;
  update pst_statements set status = 'draft', reject_reason = '', note = coalesce(p->>'note', note),
    cum_sys = coalesce((p->>'cum_sys')::numeric,0), cum_amount = coalesce((p->>'cum_amount')::numeric,0), prev_amount = coalesce((p->>'prev_amount')::numeric,0),
    this_amount = coalesce((p->>'this_amount')::numeric,0), cap = nullif(p->>'cap','')::numeric, deductions = coalesce(p->'deductions','{}'::jsonb), payable = coalesce((p->>'payable')::numeric,0)
  where id = sid;
  return sid;
end $f$;

-- ── the reviewer's change of one line's accepted cumulative amount (draft or under review), with the new totals ─────────
create or replace function pst_set_line(p_line uuid, p_cum numeric, p_note text, p_totals jsonb) returns void language plpgsql security definer set search_path to 'public' as $f$
declare l pst_lines%rowtype; s pst_statements%rowtype;
begin
  select * into l from pst_lines where id = p_line;
  if l.id is null then raise exception 'not_found'; end if;
  select * into s from pst_statements where id = l.statement_id;
  if s.status = 'draft' then if not pst_can_write(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  elsif s.status = 'submitted' then if not pst_can_approve(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  else raise exception 'locked'; end if;
  if p_cum < 0 then raise exception 'negative'; end if;
  if p_cum < l.prev_amount - 0.5 then raise exception 'below_previous'; end if;
  update pst_lines set cum_amount = p_cum, edited = abs(p_cum - l.sys_cum_amount) > 0.5, note = coalesce(p_note, note) where id = p_line;
  update pst_statements set cum_amount = coalesce((p_totals->>'cum_amount')::numeric, cum_amount), this_amount = coalesce((p_totals->>'this_amount')::numeric, this_amount),
    deductions = coalesce(p_totals->'deductions', deductions), payable = coalesce((p_totals->>'payable')::numeric, payable) where id = s.id;
end $f$;

-- ── workflow: draft → submitted → approved | rejected → (rejected → draft by regenerating) ; approved → posted (pst_post) ──
create or replace function pst_set_status(p_stmt uuid, p_status text, p_reason text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare s pst_statements%rowtype;
begin
  select * into s from pst_statements where id = p_stmt;
  if s.id is null then raise exception 'not_found'; end if;
  if p_status = 'submitted' and s.status = 'draft' then
    if not pst_can_write(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    update pst_statements set status = 'submitted', submitted_by = auth.uid(), submitted_at = now() where id = p_stmt;
  elsif p_status in ('approved','rejected') and s.status = 'submitted' then
    if not pst_can_approve(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    if p_status = 'rejected' and coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
    update pst_statements set status = p_status, reject_reason = case when p_status = 'rejected' then p_reason else '' end,
      approved_by = case when p_status = 'approved' then auth.uid() end, approved_at = case when p_status = 'approved' then now() end where id = p_stmt;
  elsif p_status = 'draft' and s.status in ('submitted','rejected') then
    if not pst_can_write(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    update pst_statements set status = 'draft', submitted_by = null, submitted_at = null where id = p_stmt;
  else raise exception 'bad_transition';
  end if;
end $f$;

-- delete only an unposted statement that is the last one of its contract part
create or replace function pst_delete(p_stmt uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare s pst_statements%rowtype;
begin
  select * into s from pst_statements where id = p_stmt;
  if s.id is null then return; end if;
  if not pst_can_write(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if s.status in ('approved','posted') then raise exception 'locked'; end if;
  if exists (select 1 from pst_statements where contract_id = s.contract_id and part = s.part and no > s.no) then raise exception 'not_last'; end if;
  delete from pst_statements where id = p_stmt;
end $f$;

-- ── post an approved statement to the finance register as a payment certificate (submitted, for finance to certify/pay) ──
create or replace function pst_post(p_stmt uuid) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare s pst_statements%rowtype; c fin_contracts%rowtype; cid uuid; d jsonb; tax numeric; ins numeric;
begin
  select * into s from pst_statements where id = p_stmt;
  if s.id is null then raise exception 'not_found'; end if;
  if not pst_can_approve(s.master_project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if s.status <> 'approved' then raise exception 'not_approved'; end if;
  select * into c from fin_contracts where id = s.contract_id;
  d := s.deductions; tax := coalesce((d->>'tax')::numeric, 0); ins := coalesce((d->>'insurance')::numeric, 0);
  insert into fin_payment_certificates (contract_id, certificate_number, certificate_date, gross_amount, retention_amount, advance_recovery_amount,
      tax_deduction, insurance_deduction, deductions, certified_amount, payable_amount, status, submitted_date, certificate_type, notes, created_by)
    values (s.contract_id, s.part || '-' || lpad(s.no::text, 2, '0') || ' (' || s.period_key || ')', s.period_to, round(s.this_amount),
      round(coalesce((d->>'retention')::numeric, 0)), round(coalesce((d->>'advance')::numeric, 0)), round(tax), round(ins), round(tax + ins),
      0, round(s.payable), 'submitted', current_date, 'work',
      'تولیدشده از ماژول «تولید صورت‌وضعیت» — بخش ' || case s.part when 'E' then 'مهندسی (E)' when 'P' then 'تأمین کالا (P)' else 'اجرا (C)' end || '، دورهٔ ' || s.period_key, auth.uid())
    returning id into cid;
  update pst_statements set status = 'posted', fin_certificate_id = cid, posted_by = auth.uid(), posted_at = now() where id = p_stmt;
  return cid;
end $f$;

grant execute on function pst_save(jsonb, jsonb), pst_set_line(uuid, numeric, text, jsonb), pst_set_status(uuid, text, text), pst_delete(uuid), pst_post(uuid) to authenticated;
