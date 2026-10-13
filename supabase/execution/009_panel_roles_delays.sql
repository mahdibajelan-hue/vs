-- Expert-panel round: more roles (site head, planner, claims analyst, payment-statement reviewer) and a delay / claim register on stoppages.
alter table ex_project_roles drop constraint if exists ex_project_roles_role_check;
alter table ex_project_roles add constraint ex_project_roles_role_check check (role = any (array['contractor','supervision','consultant','employer','manager','site_head','planner','claims','payment']));

create or replace function ex_default_perms() returns jsonb language sql immutable as $$
  select '{"contractor":["record","submit","edit_activities","edit_baseline","manage_gaps","raise","notice"],
           "site_head":["record","submit","manage_gaps","raise","notice"],
           "supervision":["review","reopen","manage_gaps","raise","assess_delay"],
           "consultant":["review","manage_gaps","approve_activity","raise","assess_delay"],
           "employer":["review","approve_activity","approve_baseline","manage_gaps","raise","assess_delay"],
           "planner":["edit_activities","edit_baseline","manage_gaps","raise"],
           "claims":["assess_delay","notice","manage_gaps","raise"],
           "payment":["raise"],
           "manager":["*"]}'::jsonb
$$;

alter table ex_report_stoppages
  add column if not exists responsibility text not null default '' check (responsibility in ('', 'contractor', 'employer', 'force_majeure', 'third_party', 'shared')),
  add column if not exists critical boolean not null default false,
  add column if not exists notice_date date,
  add column if not exists notice_ref text not null default '',
  add column if not exists assess_note text not null default '',
  add column if not exists assessed_by uuid,
  add column if not exists assessed_at timestamptz;

-- who caused the delay and whether it is on the critical path: set by supervision / consultant / employer / claims analyst, also after the report is approved
create or replace function ex_stoppage_assess(p_id uuid, p_resp text, p_critical boolean, p_note text default '') returns void language plpgsql security definer set search_path = public as $$
declare s ex_report_stoppages; r ex_reports;
begin
  select * into s from ex_report_stoppages where id = p_id;
  if s.id is null then raise exception 'not_found'; end if;
  select * into r from ex_reports where id = s.report_id;
  if not ex_allows(r.project_id, 'assess_delay') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_resp not in ('contractor', 'employer', 'force_majeure', 'third_party', 'shared') then raise exception 'bad_decision'; end if;
  perform set_config('ex.rpc', '1', true);
  update ex_report_stoppages set responsibility = p_resp, critical = coalesce(p_critical, false), assess_note = coalesce(p_note, ''), assessed_by = auth.uid(), assessed_at = now() where id = p_id;
  perform ex_hist(r.id, 'delay_assess', p_resp || coalesce(' — ' || nullif(p_note, ''), ''));
end $$;

-- the contractor's written notice of the delay (contract clause): date and letter number, also after approval
create or replace function ex_stoppage_notice(p_id uuid, p_date date, p_ref text) returns void language plpgsql security definer set search_path = public as $$
declare s ex_report_stoppages; r ex_reports;
begin
  select * into s from ex_report_stoppages where id = p_id;
  if s.id is null then raise exception 'not_found'; end if;
  select * into r from ex_reports where id = s.report_id;
  if not ex_allows(r.project_id, 'notice') then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform set_config('ex.rpc', '1', true);
  update ex_report_stoppages set notice_date = p_date, notice_ref = coalesce(p_ref, '') where id = p_id;
  perform ex_hist(r.id, 'delay_notice', coalesce(p_ref, ''));
end $$;
revoke all on function ex_stoppage_assess(uuid, text, boolean, text), ex_stoppage_notice(uuid, date, text) from public, anon;
grant execute on function ex_stoppage_assess(uuid, text, boolean, text), ex_stoppage_notice(uuid, date, text) to authenticated;
