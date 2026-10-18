-- Scheduling v3: contract terms, contractual milestones with delay damages, delay-event register (allowable / non-allowable analysis).
create table if not exists sch_contract (
  project_id uuid primary key,
  contract_start date,
  contract_finish date,
  contract_value numeric not null default 0 check (contract_value >= 0),
  ld_per_day numeric not null default 0 check (ld_per_day >= 0),           -- delay damages per calendar day (rial)
  ld_cap_pct numeric not null default 10 check (ld_cap_pct between 0 and 100), -- cap as % of contract value
  notice_days int not null default 14 check (notice_days >= 0),             -- written notice period after a delay event
  doc_review_days int not null default 14 check (doc_review_days >= 0),    -- contractual review time of a document
  tolerance_days int not null default 0 check (tolerance_days >= 0),        -- grace before delay damages start
  concurrent_compensable boolean not null default false,                    -- concurrent delay: cost compensable?
  force_majeure_notice boolean not null default true,
  note text not null default '',
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create table if not exists sch_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  title text not null,
  activity_uid uuid,
  contract_date date not null,
  ld_per_day numeric not null default 0 check (ld_per_day >= 0),
  sort int not null default 0,
  created_by uuid default auth.uid()
);
create table if not exists sch_delay_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  title text not null,
  cause text not null default 'other',
  party text not null check (party in ('employer','contractor','third_party','force_majeure','shared')),
  clause text not null default '',
  event_start date not null,
  event_end date,
  notice_date date,
  activity_uids uuid[] not null default '{}',
  claimed_days numeric not null default 0 check (claimed_days >= 0),
  critical boolean,                                                           -- null = decide from the network
  status text not null default 'draft' check (status in ('draft','assessed','approved','rejected')),
  approved_days numeric check (approved_days is null or approved_days >= 0),
  approved_cost numeric check (approved_cost is null or approved_cost >= 0),
  source_type text not null default 'manual',
  source_ref text not null default '',
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists sch_delay_events_project on sch_delay_events (project_id);
do $$
declare t text;
begin
  foreach t in array array['sch_contract','sch_milestones','sch_delay_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (ex_can_view(project_id))', t || '_sel', t);
    execute format('create policy %I on %I for insert to authenticated with check (sch_can_edit(project_id))', t || '_ins', t);
    execute format('create policy %I on %I for update to authenticated using (sch_can_edit(project_id)) with check (sch_can_edit(project_id))', t || '_upd', t);
  end loop;
  foreach t in array array['sch_milestones','sch_delay_events'] loop
    execute format('create policy %I on %I for delete to authenticated using (sch_can_edit(project_id))', t || '_del', t);
  end loop;
end $$;
-- approving / rejecting an extension of time is the approver's decision, not the planner's
create or replace function sch_delay_guard() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if (tg_op = 'INSERT' and new.status in ('approved','rejected')) or (tg_op = 'UPDATE' and (new.status is distinct from old.status or new.approved_days is distinct from old.approved_days or new.approved_cost is distinct from old.approved_cost) and (new.status in ('approved','rejected') or old.status in ('approved','rejected'))) then
    if not sch_can_approve(new.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  end if;
  return new;
end $f$;
create or replace trigger trg_sch_delay_guard before insert or update on sch_delay_events for each row execute function sch_delay_guard();
