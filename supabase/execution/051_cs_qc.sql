-- 051 — compressor-station quality control (ASME B31.8 + IGS), phase 3 of the project-profile work.
--   cs_qc_settings  one row per project: the project's QC rules (NDT extent by location class, progressive examination,
--                   welder reject limit, hydrotest factor, ITP acceptance values). Written by supervision / QC only.
--   cs_inspections  ITP records (civil, painting, electrical, instrument, mechanical, piping): measured values and a
--                   result. The contractor may record values; only supervision / QC sets accept / reject.
--   cs_welds        + ndt_selected / ndt_reason: which welds of a line with partial NDT extent are picked for examination
--                   (random, progressive after a reject, or by the client). Picking is a QC decision.
-- Server rules added to cs_guard:
--   * ndt_selected / ndt_reason and an inspection's result change only by a reviewer;
--   * a test pack becomes «tested» only when its test pressure is at least the project's factor (default 1.5) × the
--     highest design pressure of its lines (ASME B31.8 §841.3 / §843 for station piping; the factor is a project rule).
-- Additive only. Rollback: rollback/051_rollback.sql (run by hand).

create table if not exists public.cs_qc_settings (
  project_id uuid primary key references public.master_projects(id),
  rules jsonb not null default '{}'::jsonb,
  updated_by uuid, updated_at timestamptz not null default now()
);

alter table public.cs_welds add column if not exists ndt_selected boolean not null default false;
alter table public.cs_welds add column if not exists ndt_reason text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cs_welds_ndt_reason_chk') then
    alter table public.cs_welds add constraint cs_welds_ndt_reason_chk check (ndt_reason in ('', 'random', 'progressive', 'client', 'extent'));
  end if;
end $$;

create table if not exists public.cs_inspections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.master_projects(id),
  discipline text not null check (discipline in ('civil', 'painting', 'electrical', 'instrument', 'mechanical', 'piping')),
  itp_key text not null,
  subject_type text not null default 'other' check (subject_type in ('area', 'line', 'spool', 'equipment', 'weld', 'pack', 'other')),
  subject_id uuid,
  subject_label text not null default '',
  insp_date date not null,
  hold_point text not null default '' check (hold_point in ('', 'H', 'W', 'R', 'S')),
  values jsonb not null default '{}'::jsonb,
  result text not null default 'pending' check (result in ('pending', 'accept', 'reject')),
  report_no text not null default '',
  inspector text not null default '',
  note text not null default '',
  archived boolean not null default false,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz not null default now()
);
create index if not exists cs_inspections_project_idx on public.cs_inspections (project_id, insp_date desc);
create index if not exists cs_inspections_subject_idx on public.cs_inspections (subject_id);

-- the guard of migration 050, extended (same behaviour plus the rules above)
create or replace function public.cs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ch jsonb := '{}'::jsonb; k text; o jsonb; n jsonb; bad int; factor numeric; need numeric;
begin
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id then raise exception 'project_locked' using errcode = 'P0001'; end if;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();

  -- nested ifs: a record field may only be read on the table that has it
  if tg_table_name = 'cs_welds' and auth.uid() is not null then
    if tg_op = 'INSERT' then
      if (new.ndt_result <> 'pending' or new.ndt_selected or new.ndt_reason <> '') and not cs_can_review(new.project_id) then raise exception 'ndt_reviewer_only' using errcode = 'P0001'; end if;
    else
      if (new.ndt_selected is distinct from old.ndt_selected or new.ndt_reason is distinct from old.ndt_reason) and not cs_can_review(new.project_id) then
        raise exception 'ndt_reviewer_only' using errcode = 'P0001';
      end if;
      if new.ndt_result is distinct from old.ndt_result and not cs_can_review(new.project_id) then
        -- the contractor may only send a rejected weld back for re-test while recording its repair
        if not (old.ndt_result = 'reject' and new.ndt_result = 'pending' and new.repair_count = old.repair_count + 1) then
          raise exception 'ndt_reviewer_only' using errcode = 'P0001';
        end if;
      end if;
    end if;
  end if;

  if tg_table_name = 'cs_inspections' and auth.uid() is not null then
    if tg_op = 'INSERT' then
      if new.result <> 'pending' and not cs_can_review(new.project_id) then raise exception 'itp_reviewer_only' using errcode = 'P0001'; end if;
    else
      if new.result is distinct from old.result and not cs_can_review(new.project_id) then raise exception 'itp_reviewer_only' using errcode = 'P0001'; end if;
      -- a decided record is closed: its values change only together with a reviewer re-opening it
      if old.result <> 'pending' and new.result = old.result and new.values is distinct from old.values and not cs_can_review(new.project_id) then
        raise exception 'itp_decided' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if tg_table_name = 'cs_test_packs' and tg_op = 'UPDATE' then
  if new.status is distinct from old.status and new.status in ('tested', 'reinstated') then
    if auth.uid() is not null and not cs_can_review(new.project_id) then raise exception 'pack_reviewer_only' using errcode = 'P0001'; end if;
    if new.status = 'tested' then
      if new.punch_a > 0 then raise exception 'pack_punch_open' using errcode = 'P0001'; end if;
      select count(*) into bad from cs_welds w join cs_lines l on l.id = w.line_id
       where l.test_pack_id = new.id and not w.archived and not l.archived
         and (w.weld_date is null or w.ndt_result = 'reject' or (l.ndt_pct >= 100 and w.ndt_result <> 'accept'));
      if bad > 0 then raise exception 'pack_not_ready' using errcode = 'P0001', detail = bad::text; end if;
      select coalesce(nullif(rules ->> 'testFactor', '')::numeric, 1.5) into factor from cs_qc_settings where project_id = new.project_id;
      factor := coalesce(factor, 1.5);
      select max(l.design_press_bar) * factor into need from cs_lines l where l.test_pack_id = new.id and not l.archived;
      if need is not null and (new.test_press_bar is null or new.test_press_bar < need) then
        raise exception 'pack_pressure_low' using errcode = 'P0001', detail = round(need, 2)::text;
      end if;
    end if;
  end if;
  end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if k in ('updated_at', 'updated_by') then continue; end if;
      o := to_jsonb(old) -> k; n := to_jsonb(new) -> k;
      if o is distinct from n then ch := ch || jsonb_build_object(k, jsonb_build_array(o, n)); end if;
    end loop;
    if ch <> '{}'::jsonb then insert into cs_history (project_id, entity, row_id, action, changes) values (new.project_id, tg_table_name, new.id, 'update', ch); end if;
  else
    insert into cs_history (project_id, entity, row_id, action, changes) values (new.project_id, tg_table_name, new.id, 'insert', '{}'::jsonb);
  end if;
  return new;
end $$;
revoke all on function public.cs_guard() from public, anon, authenticated;
create or replace trigger trg_cs_guard before insert or update on public.cs_inspections for each row execute function public.cs_guard();

-- settings: a row per project; stamped, and every change kept in the history
create or replace function public.cs_settings_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now(); new.updated_by := auth.uid();
  insert into cs_history (project_id, entity, row_id, action, changes)
  values (new.project_id, 'cs_qc_settings', new.project_id, lower(tg_op), case when tg_op = 'UPDATE' then jsonb_build_object('rules', jsonb_build_array(old.rules, new.rules)) else '{}'::jsonb end);
  return new;
end $$;
revoke all on function public.cs_settings_stamp() from public, anon, authenticated;
create or replace trigger trg_cs_settings_stamp before insert or update on public.cs_qc_settings for each row execute function public.cs_settings_stamp();

alter table public.cs_qc_settings enable row level security;
alter table public.cs_inspections enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'cs_qc_settings' and policyname = 'cs_qc_settings_sel') then
    create policy cs_qc_settings_sel on public.cs_qc_settings for select to authenticated using (ex_can_view(project_id));
    create policy cs_qc_settings_ins on public.cs_qc_settings for insert to authenticated with check (cs_can_review(project_id));
    create policy cs_qc_settings_upd on public.cs_qc_settings for update to authenticated using (cs_can_review(project_id)) with check (cs_can_review(project_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'cs_inspections' and policyname = 'cs_inspections_sel') then
    create policy cs_inspections_sel on public.cs_inspections for select to authenticated using (ex_can_view(project_id));
    create policy cs_inspections_ins on public.cs_inspections for insert to authenticated with check (cs_can_write(project_id));
    create policy cs_inspections_upd on public.cs_inspections for update to authenticated using (cs_can_write(project_id)) with check (cs_can_write(project_id));
  end if;
end $$;
revoke all on public.cs_qc_settings, public.cs_inspections from anon;
grant select, insert, update on public.cs_qc_settings, public.cs_inspections to authenticated;
