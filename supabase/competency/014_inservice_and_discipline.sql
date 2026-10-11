-- Quarterly in-service evaluation (people working on projects) and disciplinary decisions.

create table if not exists comp_inservice_cycles (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references comp_assessments(id),
  period_label text not null,
  period_start date not null,
  period_end date not null,
  project_name text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  weights jsonb not null default '{"employer":35,"supervisor":0,"peers":15,"subordinates":10,"technical":20,"results":20}'::jsonb,
  technical_score numeric check (technical_score between 0 and 100),
  technical_note text not null default '',
  results_items jsonb not null default '[]'::jsonb,  -- [{label, score 0-100, weight}]
  summary_note text not null default '',
  final_score numeric,
  due_date date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  closed_by uuid,
  closed_at timestamptz,
  unique (assessment_id, period_label)
);

create table if not exists comp_inservice_raters (
  cycle_id uuid not null references comp_inservice_cycles(id),
  user_id uuid not null,
  kind text not null check (kind in ('employer', 'supervisor', 'peer', 'subordinate')),
  submitted_at timestamptz,
  primary key (cycle_id, user_id)
);

create table if not exists comp_inservice_ratings (
  cycle_id uuid not null references comp_inservice_cycles(id),
  rater_id uuid not null,
  competency_id uuid not null references comp_competencies(id),
  rating smallint not null check (rating between 1 and 5),
  notes text not null default '',
  rated_at timestamptz not null default now(),
  primary key (cycle_id, rater_id, competency_id)
);

create table if not exists comp_disciplinary_decisions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references comp_assessments(id),
  kind text not null check (kind in ('score_deduction', 'suspension', 'work_ban')),
  points int check (points between 1 and 100),
  start_date date not null default current_date,
  end_date date,
  reason text not null check (length(btrim(reason)) > 0),
  evidence_note text not null default '',
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'revoked')),
  proposed_by uuid default auth.uid(),
  proposed_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text not null default '',
  revoked_by uuid,
  revoked_at timestamptz,
  revoke_reason text not null default '',
  check (kind <> 'score_deduction' or points is not null),
  check (kind <> 'suspension' or end_date is not null)
);

alter table comp_inservice_cycles enable row level security;
alter table comp_inservice_raters enable row level security;
alter table comp_inservice_ratings enable row level security;
alter table comp_disciplinary_decisions enable row level security;

create or replace function comp_inservice_manager() returns boolean language sql stable security definer set search_path = public as
$$ select comp_is_module_admin() or comp_is_assessment_designer() $$;
create or replace function comp_inservice_is_rater(p_cycle uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from comp_inservice_raters r where r.cycle_id = p_cycle and r.user_id = auth.uid()) $$;

create policy comp_inservice_cycles_select on comp_inservice_cycles for select using (comp_inservice_manager() or comp_inservice_is_rater(id));
create policy comp_inservice_cycles_write on comp_inservice_cycles for all using (comp_inservice_manager()) with check (comp_inservice_manager());
create policy comp_inservice_raters_select on comp_inservice_raters for select using (comp_inservice_manager() or user_id = auth.uid());
create policy comp_inservice_raters_write on comp_inservice_raters for all using (comp_inservice_manager()) with check (comp_inservice_manager());
-- a rater sees and writes only their own ratings, and only while the cycle is open and they are assigned; managers read all
create policy comp_inservice_ratings_select on comp_inservice_ratings for select using (comp_inservice_manager() or rater_id = auth.uid());
create policy comp_inservice_ratings_write on comp_inservice_ratings for all
  using (rater_id = auth.uid() and comp_inservice_is_rater(cycle_id) and exists (select 1 from comp_inservice_cycles c where c.id = cycle_id and c.status = 'open'))
  with check (rater_id = auth.uid() and comp_inservice_is_rater(cycle_id) and exists (select 1 from comp_inservice_cycles c where c.id = cycle_id and c.status = 'open'));

create policy comp_discipline_select on comp_disciplinary_decisions for select using (comp_inservice_manager());
create policy comp_discipline_propose on comp_disciplinary_decisions for insert with check (comp_inservice_manager() and status = 'proposed' and proposed_by = auth.uid());

-- Decisions move only through this function: the person who proposed cannot decide, only a module admin decides, every step is audited.
create or replace function public.comp_discipline_decide(p_id uuid, p_decision text, p_note text default '')
returns text language plpgsql security definer set search_path = public as $$
declare d comp_disciplinary_decisions;
begin
  select * into d from comp_disciplinary_decisions where id = p_id;
  if d.id is null then raise exception 'not_found'; end if;
  if not comp_is_module_admin() then raise exception 'forbidden'; end if;
  if p_decision in ('approve', 'reject') then
    if d.status <> 'proposed' then raise exception 'not_proposed'; end if;
    if d.proposed_by = auth.uid() then raise exception 'separation_of_duties'; end if;
    if p_decision = 'reject' and coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
    update comp_disciplinary_decisions set status = case p_decision when 'approve' then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(p_note, '') where id = p_id;
  elsif p_decision = 'revoke' then
    if d.status <> 'approved' then raise exception 'not_approved'; end if;
    if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
    update comp_disciplinary_decisions set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(), revoke_reason = p_note where id = p_id;
  else raise exception 'invalid_decision'; end if;
  perform comp_log_audit('DISCIPLINE_' || upper(p_decision), 'comp_disciplinary_decisions', p_id, jsonb_build_object('status', d.status), jsonb_build_object('kind', d.kind, 'assessment', d.assessment_id));
  return p_decision;
end $$;
grant execute on function public.comp_discipline_decide(uuid, text, text) to authenticated;
grant select, insert, update on comp_inservice_cycles, comp_inservice_raters, comp_inservice_ratings to authenticated;
grant select, insert on comp_disciplinary_decisions to authenticated;
