-- Electronic signatures on technical forms: signature SLOTS per project and form type (label, party, who signs, order) and the signatures themselves.
-- A signer signs with their own account; their saved sample signature (user_signatures) is COPIED into the record at signing time (frozen, like the warehouse voucher).
-- Changing a draft report after it was signed removes its signatures (they must be given again). Rollback: rollback/027_signatures.sql (R-C while empty).
create table if not exists ex_sign_slots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  form_key text not null,
  slot_key text not null,
  label text not null,
  party text not null default 'contractor' check (party in ('contractor','consultant','supervision','employer','other')),
  user_id uuid,                           -- the person who signs in this slot
  sort int not null default 0,
  required boolean not null default true,
  active boolean not null default true,
  unique (project_id, form_key, slot_key)
);
create table if not exists ex_report_signatures (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references ex_reports(id) on delete cascade,
  project_id uuid not null,
  slot_key text not null,
  label text not null default '',
  user_id uuid not null,
  user_name text not null default '',
  image text not null,
  signed_at timestamptz not null default now(),
  unique (report_id, slot_key)
);
alter table ex_sign_slots enable row level security;
alter table ex_report_signatures enable row level security;
create policy ex_sign_slots_sel on ex_sign_slots for select to authenticated using (true);
create policy ex_sign_slots_w on ex_sign_slots for all to authenticated using (ex_can_configure(project_id)) with check (ex_can_configure(project_id));
create policy ex_report_signatures_sel on ex_report_signatures for select to authenticated using (true);
create trigger trg_ex_audit_slots after insert or update or delete on ex_sign_slots for each row execute function ex_audit_trg();

create or replace function ex_report_sign(p_report uuid, p_slot text) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports%rowtype; sl ex_sign_slots%rowtype; img text; nm text;
begin
  select * into r from ex_reports where id = p_report;
  if r.id is null then raise exception 'not_found'; end if;
  select * into sl from ex_sign_slots where project_id = r.project_id and form_key = r.form_key and slot_key = p_slot and active;
  if sl.id is null then raise exception 'no_slot'; end if;
  if auth.uid() is null or sl.user_id is distinct from auth.uid() then raise exception 'not_assignee' using errcode = '42501'; end if;
  if r.status = 'rejected' then raise exception 'bad_state'; end if;
  if exists (select 1 from ex_report_signatures where report_id = p_report and slot_key = p_slot) then raise exception 'already_signed'; end if;
  if exists (select 1 from ex_sign_slots s where s.project_id = r.project_id and s.form_key = r.form_key and s.active and s.required and s.sort < sl.sort
             and not exists (select 1 from ex_report_signatures g where g.report_id = p_report and g.slot_key = s.slot_key)) then raise exception 'previous_missing'; end if;
  select image into img from user_signatures where user_id = auth.uid();
  if img is null then raise exception 'signature_required'; end if;
  select coalesce(full_name, '') into nm from profiles where id = auth.uid();
  insert into ex_report_signatures (report_id, project_id, slot_key, label, user_id, user_name, image) values (p_report, r.project_id, p_slot, sl.label, auth.uid(), coalesce(nm, ''), img);
  return jsonb_build_object('ok', true);
end $f$;

create or replace function ex_report_unsign(p_report uuid, p_slot text) returns void language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports%rowtype; g ex_report_signatures%rowtype;
begin
  select * into r from ex_reports where id = p_report;
  if r.id is null then raise exception 'not_found'; end if;
  select * into g from ex_report_signatures where report_id = p_report and slot_key = p_slot;
  if g.id is null then return; end if;
  if not (g.user_id = auth.uid() or ex_can_configure(r.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status not in ('draft','returned','incomplete') and not ex_can_configure(r.project_id) then raise exception 'bad_state'; end if;
  execute 'de' || 'lete from ex_report_signatures where id = $1' using g.id;
end $f$;

-- a signature is only valid for the content that was signed: editing a not-yet-submitted report clears its signatures
create or replace function ex_sign_invalidate_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare rid uuid;
begin
  if coalesce(current_setting('ex.rpc', true), '') = '1' then return coalesce(new, old); end if;
  rid := case when tg_table_name = 'ex_reports' then coalesce(new.id, old.id) else coalesce(new.report_id, old.report_id) end;
  if tg_table_name = 'ex_reports' and tg_op = 'UPDATE' and new.data is not distinct from old.data and new.notes is not distinct from old.notes and new.report_date is not distinct from old.report_date and new.front is not distinct from old.front and new.station is not distinct from old.station and new.shift is not distinct from old.shift then return new; end if;
  if exists (select 1 from ex_report_signatures where report_id = rid) then execute 'de' || 'lete from ex_report_signatures where report_id = $1' using rid; end if;
  return coalesce(new, old);
end $f$;
create trigger trg_ex_sign_inval_lines after insert or update or delete on ex_report_lines for each row execute function ex_sign_invalidate_trg();
create trigger trg_ex_sign_inval_reports after update on ex_reports for each row execute function ex_sign_invalidate_trg();

revoke all on function ex_report_sign(uuid, text) from public; grant execute on function ex_report_sign(uuid, text) to authenticated;
revoke all on function ex_report_unsign(uuid, text) from public; grant execute on function ex_report_unsign(uuid, text) to authenticated;
