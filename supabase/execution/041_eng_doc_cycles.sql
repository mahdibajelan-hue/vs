-- Engineering documents: the issue/review cycle instead of comments. Rollback: rollback/041_eng_doc_cycles.sql.
--
-- Each submission of a document is one row: the contractor states the revision and the purpose of issue (IFI / IFR /
-- IFA / IFC) and the date; the consultant answers with one result code (Commented / Rejected / Approved as Noted /
-- Approved) and its date. No technical comment text is recorded. The document's status, purpose and actual dates
-- follow the cycle automatically (trigger; the register's revision stays the document's identity for the MDL import), so readiness, impact and the EPC figures keep working unchanged:
--   last submission waiting for review → issued (with the consultant)
--   Commented / Rejected               → in_preparation (back with the contractor)
--   Approved as Noted                  → restricted (the contractor issues the final revision)
--   Approved                           → approved
-- Progress credit of a document (the client computes it from the same rows, the default share is set per project in
-- ex_settings.values_json.engCredits): first accepted submission (usually Rev A) 60 %, a later one (Rev B, …) 70 %,
-- Approved as Noted 80 %, Approved 100 %; a Rejected answer withdraws the credit of that submission.

create table if not exists ex_eng_doc_cycles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  doc_id uuid not null references ex_eng_docs(id) on delete cascade,
  seq int not null,
  rev text not null default '',
  purpose text not null check (purpose in ('IFI', 'IFR', 'IFA', 'IFC')),
  submitted_on date not null,
  submitted_by uuid default auth.uid(),
  result text not null default 'pending' check (result in ('pending', 'commented', 'rejected', 'approved_as_noted', 'approved', 'withdrawn')),
  result_on date,
  result_by uuid,
  created_at timestamptz not null default now(),
  unique (doc_id, seq),
  check ((result = 'pending') = (result_on is null))
);
create index if not exists ex_eng_doc_cycles_doc on ex_eng_doc_cycles (doc_id, seq);
create index if not exists ex_eng_doc_cycles_project on ex_eng_doc_cycles (project_id);
alter table ex_eng_doc_cycles enable row level security;
create policy ex_eng_doc_cycles_sel on ex_eng_doc_cycles for select to authenticated using (ex_can_view(project_id));
grant select on ex_eng_doc_cycles to authenticated;

-- the document follows its cycle
create or replace function ex_eng_cycle_sync() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare v_doc uuid := coalesce(new.doc_id, old.doc_id); last ex_eng_doc_cycles; v_first date; v_appr date;
begin
  select * into last from ex_eng_doc_cycles where doc_id = v_doc and result <> 'withdrawn' order by seq desc limit 1;
  if last.id is null then
    -- every submission was withdrawn: the document is back in preparation
    update ex_eng_docs set status = 'in_preparation', actual_prepared = null, actual_approved = null where id = v_doc and status <> 'superseded';
    return null;
  end if;
  select min(submitted_on) into v_first from ex_eng_doc_cycles where doc_id = v_doc and result not in ('rejected', 'withdrawn');
  select max(result_on) into v_appr from ex_eng_doc_cycles where doc_id = v_doc and result in ('approved', 'approved_as_noted');
  update ex_eng_docs set
    status = case last.result when 'pending' then 'issued' when 'approved' then 'approved' when 'approved_as_noted' then 'restricted' else 'in_preparation' end,
    target_issue = last.purpose,
    actual_prepared = coalesce(v_first, last.submitted_on),
    actual_approved = case when last.result in ('approved', 'approved_as_noted') then v_appr else null end,
    restriction_note = case when last.result = 'approved_as_noted' then 'تأیید با ملاحظات (Approved as Noted)' else restriction_note end
  where id = v_doc;
  return null;
end $f$;
create trigger ex_eng_doc_cycles_sync after insert or update on ex_eng_doc_cycles for each row execute function ex_eng_cycle_sync();

-- contractor: submit a document for a purpose (only when nothing is waiting for review)
create or replace function ex_doc_submit(p_doc uuid, p_rev text, p_purpose text, p_date date default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare d ex_eng_docs; v_seq int; v_date date := coalesce(p_date, (now() at time zone 'Asia/Tehran')::date); v_id uuid;
begin
  select * into d from ex_eng_docs where id = p_doc;
  if d.id is null then raise exception 'not_found'; end if;
  if not (ex_allows(d.project_id, 'edit_activities') or ex_can_configure(d.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_purpose not in ('IFI', 'IFR', 'IFA', 'IFC') then raise exception 'invalid_purpose'; end if;
  if d.status = 'superseded' then raise exception 'superseded'; end if;
  if exists (select 1 from ex_eng_doc_cycles where doc_id = p_doc and result = 'pending') then raise exception 'pending_review'; end if;
  if exists (select 1 from ex_eng_doc_cycles where doc_id = p_doc and result = 'approved') then raise exception 'already_approved'; end if;
  if v_date > (now() at time zone 'Asia/Tehran')::date then raise exception 'future_date'; end if;
  select coalesce(max(seq), 0) + 1 into v_seq from ex_eng_doc_cycles where doc_id = p_doc;
  insert into ex_eng_doc_cycles (project_id, doc_id, seq, rev, purpose, submitted_on) values (d.project_id, p_doc, v_seq, left(btrim(coalesce(p_rev, '')), 10), p_purpose, v_date) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'seq', v_seq);
end $f$;

-- consultant: the result of the review of the submission waiting for it
create or replace function ex_doc_review(p_doc uuid, p_result text, p_date date default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare d ex_eng_docs; c ex_eng_doc_cycles; v_date date := coalesce(p_date, (now() at time zone 'Asia/Tehran')::date);
begin
  select * into d from ex_eng_docs where id = p_doc;
  if d.id is null then raise exception 'not_found'; end if;
  if not (ex_has_role(d.project_id, array['supervision', 'consultant']) or ex_can_configure(d.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_result not in ('commented', 'rejected', 'approved_as_noted', 'approved') then raise exception 'invalid_result'; end if;
  select * into c from ex_eng_doc_cycles where doc_id = p_doc and result = 'pending' order by seq desc limit 1;
  if c.id is null then raise exception 'nothing_pending'; end if;
  if v_date < c.submitted_on then raise exception 'before_submission'; end if;
  if v_date > (now() at time zone 'Asia/Tehran')::date then raise exception 'future_date'; end if;
  update ex_eng_doc_cycles set result = p_result, result_on = v_date, result_by = auth.uid() where id = c.id;
  return jsonb_build_object('ok', true, 'result', p_result);
end $f$;

-- the last step can be taken back by the same side (a wrong click), as long as nothing came after it
create or replace function ex_doc_undo(p_doc uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare d ex_eng_docs; c ex_eng_doc_cycles;
begin
  select * into d from ex_eng_docs where id = p_doc;
  if d.id is null then raise exception 'not_found'; end if;
  select * into c from ex_eng_doc_cycles where doc_id = p_doc and result <> 'withdrawn' order by seq desc limit 1;
  if c.id is null then raise exception 'nothing_to_undo'; end if;
  if c.result <> 'pending' then
    if not (ex_has_role(d.project_id, array['supervision', 'consultant']) or ex_can_configure(d.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
    update ex_eng_doc_cycles set result = 'pending', result_on = null, result_by = null where id = c.id;
  else
    if not (ex_allows(d.project_id, 'edit_activities') or ex_can_configure(d.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
    -- a submission still waiting for review is withdrawn (kept in the history, no longer counted)
    update ex_eng_doc_cycles set result = 'withdrawn', result_on = submitted_on, result_by = auth.uid() where id = c.id;
  end if;
  return jsonb_build_object('ok', true);
end $f$;
revoke all on function ex_doc_submit(uuid, text, text, date), ex_doc_review(uuid, text, date), ex_doc_undo(uuid) from public;
grant execute on function ex_doc_submit(uuid, text, text, date), ex_doc_review(uuid, text, date), ex_doc_undo(uuid) to authenticated;

-- the existing register becomes the first step of each document's cycle (dates and status as recorded)
insert into ex_eng_doc_cycles (project_id, doc_id, seq, rev, purpose, submitted_on, result, result_on)
select d.project_id, d.id, 1, coalesce(nullif(d.rev, ''), 'A'),
       case when upper(d.target_issue) in ('IFI', 'IFR', 'IFA', 'IFC') then upper(d.target_issue) else 'IFA' end,
       coalesce(d.actual_prepared, d.actual_approved, (d.updated_at at time zone 'Asia/Tehran')::date),
       case d.status when 'approved' then 'approved' when 'restricted' then 'approved_as_noted' else 'pending' end,
       case when d.status in ('approved', 'restricted') then greatest(coalesce(d.actual_approved, d.actual_prepared, (d.updated_at at time zone 'Asia/Tehran')::date), coalesce(d.actual_prepared, d.actual_approved, (d.updated_at at time zone 'Asia/Tehran')::date)) end
  from ex_eng_docs d
 where d.status in ('issued', 'pending_approval', 'approved', 'restricted')
   and not exists (select 1 from ex_eng_doc_cycles c where c.doc_id = d.id);

-- notifications: the contractor acts on documents not started, returned (Commented / Rejected) or Approved as Noted; the consultant on submissions waiting for review
create or replace function my_engineering_notifications() returns jsonb language plpgsql stable set search_path to 'public' as $f$
declare v jsonb := '[]'::jsonb; r record; u uuid := auth.uid();
begin
  if u is null then return v; end if;
  for r in select d.id, d.doc_no, d.title, d.status, d.planned_prepared, d.critical from ex_eng_docs d
    where d.status in ('required', 'in_preparation', 'restricted') and d.weight > 0
      and (d.status <> 'required' or (d.planned_prepared is not null and d.planned_prepared <= current_date + 7))
      and (ex_allows(d.project_id, 'edit_activities') or ex_can_configure(d.project_id)) order by d.planned_prepared nulls last limit 25 loop
    v := v || jsonb_build_object('id', 'en-pr-' || r.id, 'source', 'engineering', 'module', 'engineering',
      'severity', case when r.status <> 'required' or r.planned_prepared < current_date then 'warn' else 'action' end,
      'title', r.doc_no || ' — ' || r.title,
      'body', case when r.status = 'restricted' then 'تأیید با ملاحظات؛ ویرایش نهایی را برای تأیید ارسال کنید'
                   when r.status = 'in_preparation' then 'برگشت از مشاور یا در حال تهیه؛ ارسال برای مشاور'
                   when r.planned_prepared < current_date then (current_date - r.planned_prepared) || ' روز از موعد ارسال گذشته'
                   else 'موعد ارسال تا ' || (r.planned_prepared - current_date) || ' روز دیگر' end || case when r.critical then ' (بحرانی)' else '' end,
      'at', now());
  end loop;
  for r in select d.id, d.doc_no, d.title, d.planned_approved, c.submitted_on, c.purpose from ex_eng_docs d join ex_eng_doc_cycles c on c.doc_id = d.id and c.result = 'pending'
    where ex_has_role(d.project_id, array['supervision', 'consultant']) order by c.submitted_on limit 25 loop
    v := v || jsonb_build_object('id', 'en-rv-' || r.id, 'source', 'engineering', 'module', 'engineering',
      'severity', case when r.submitted_on < current_date - 7 or (r.planned_approved is not null and r.planned_approved < current_date) then 'warn' else 'action' end,
      'title', r.doc_no || ' — ' || r.title, 'body', 'ارسال‌شده برای ' || r.purpose || '؛ منتظر نتیجهٔ بررسی مشاور', 'at', r.submitted_on);
  end loop;
  return v;
end $f$;
grant execute on function my_engineering_notifications() to authenticated;
