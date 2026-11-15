-- weldqc 008 — corrective and preventive action (CAPA) with a root-cause meeting the team cannot skip
--
-- A case is opened by the system when a serious or recurring quality problem shows in the records (or by hand, or for an
-- NCR). It then moves only through the functions below, and each step has a gate:
--   open      → rca       : the immediate containment is written and the case has an owner
--   rca       → agreed    : the meeting is held, its minutes and the root cause are written, there is at least one
--                           corrective and one preventive action (owner + due date), the quorum is there and every
--                           attendee present has signed; any later change of the minutes, causes or actions withdraws
--                           the signatures
--   agreed    → verifying : every action is done (with a note of what was done)
--   verifying → closed    : someone other than the owner, holding the approve right, judges the actions effective;
--                           «ineffective» sends the case back to a new meeting (round + 1)
-- An NCR marked «RCA required» or of high severity cannot be closed before its CAPA case is closed.

create table if not exists wq_capa (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  seq int not null,
  code text not null,
  fingerprint text,
  rule text not null default 'manual',
  source text not null default 'manual' check (source in ('system', 'manual', 'ncr')),
  mandatory boolean not null default false,
  severity text not null default 'major' check (severity in ('minor', 'major', 'critical')),
  status text not null default 'open' check (status in ('open', 'rca', 'agreed', 'verifying', 'closed', 'void')),
  round int not null default 1,
  title text not null,
  problem text not null default '',
  evidence text not null default '',
  scope jsonb not null default '{}'::jsonb,
  baseline jsonb not null default '{}'::jsonb,
  containment text not null default '',
  ncr_id uuid references ex_ncr (id) on delete set null,
  owner_id uuid,
  owner_name text not null default '',
  meeting_due date not null,
  meeting_at timestamptz,
  meeting_place text not null default '',
  minutes text not null default '',
  whys jsonb not null default '[]'::jsonb,
  causes jsonb not null default '[]'::jsonb,
  root_cause text not null default '',
  agreed_at timestamptz,
  verify_due date,
  verify_result text check (verify_result in ('effective', 'ineffective')),
  verify_note text not null default '',
  verify_metric jsonb,
  verified_by uuid,
  verified_name text not null default '',
  verified_at timestamptz,
  closed_at timestamptz,
  void_reason text not null default '',
  opened_by uuid default auth.uid(),
  opened_name text not null default '',
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wq_capa_code on wq_capa (project_id, code);
-- one case per detected pattern and period; a voided case keeps its fingerprint so the same alarm is not raised again
create unique index if not exists wq_capa_fp on wq_capa (project_id, fingerprint) where fingerprint is not null;
create index if not exists wq_capa_ncr on wq_capa (ncr_id) where ncr_id is not null;

create table if not exists wq_capa_attendees (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references wq_capa (id) on delete cascade,
  project_id uuid not null,
  round int not null default 1,
  user_id uuid,
  name text not null,
  party text not null default 'other' check (party in ('contractor', 'qc', 'supervision', 'consultant', 'employer', 'other')),
  role text not null default '',
  present boolean not null default true,
  signed_at timestamptz,
  signed_by uuid,
  paper boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists wq_capa_att_case on wq_capa_attendees (case_id);

create table if not exists wq_capa_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references wq_capa (id) on delete cascade,
  project_id uuid not null,
  round int not null default 1,
  kind text not null check (kind in ('containment', 'corrective', 'preventive')),
  title text not null,
  owner_id uuid,
  owner_name text not null,
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'done')),
  done_at timestamptz,
  done_note text not null default '',
  done_by uuid,
  done_name text not null default '',
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists wq_capa_act_case on wq_capa_actions (case_id);

create table if not exists wq_capa_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references wq_capa (id) on delete cascade,
  project_id uuid not null,
  at timestamptz not null default now(),
  by uuid default auth.uid(),
  by_name text not null default '',
  kind text not null,
  note text not null default ''
);
create index if not exists wq_capa_ev_case on wq_capa_events (case_id);

-- read for everyone who sees the project; every write goes through the functions below
alter table wq_capa enable row level security;
alter table wq_capa_attendees enable row level security;
alter table wq_capa_actions enable row level security;
alter table wq_capa_events enable row level security;
create policy wq_capa_read on wq_capa for select to authenticated using (ex_can_view(project_id));
create policy wq_capa_att_read on wq_capa_attendees for select to authenticated using (ex_can_view(project_id));
create policy wq_capa_act_read on wq_capa_actions for select to authenticated using (ex_can_view(project_id));
create policy wq_capa_ev_read on wq_capa_events for select to authenticated using (ex_can_view(project_id));
revoke all on wq_capa, wq_capa_attendees, wq_capa_actions, wq_capa_events from anon;
revoke all on wq_capa, wq_capa_attendees, wq_capa_actions, wq_capa_events from authenticated;
grant select on wq_capa, wq_capa_attendees, wq_capa_actions, wq_capa_events to authenticated;

create or replace function wq_capa_can(p_project uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select wq_can(p_project, 'edit') or wq_can(p_project, 'submit') or wq_can(p_project, 'approve') or wq_can(p_project, 'configure');
$f$;

create or replace function wq_capa_me() returns text language sql stable security definer set search_path to 'public' as $f$
  select coalesce((select coalesce(nullif(full_name, ''), email) from profiles where id = auth.uid()), '');
$f$;

create or replace function wq_capa_log(p_case uuid, p_project uuid, p_kind text, p_note text) returns void language sql security definer set search_path to 'public' as $f$
  insert into wq_capa_events (case_id, project_id, by_name, kind, note) values (p_case, p_project, wq_capa_me(), p_kind, coalesce(p_note, ''));
$f$;

-- what still stops the minutes from being signed (null = ready)
create or replace function wq_capa_ready(c wq_capa) returns text language plpgsql stable security definer set search_path to 'public' as $f$
declare n int; np int;
begin
  if c.meeting_at is null or c.meeting_at > now() then return 'capa_no_meeting'; end if;
  if length(btrim(c.minutes)) < 30 then return 'capa_no_minutes'; end if;
  if length(btrim(c.root_cause)) < 10 then return 'capa_no_root'; end if;
  if not exists (select 1 from wq_capa_actions where case_id = c.id and round = c.round and removed_at is null and kind = 'corrective') then return 'capa_no_corrective'; end if;
  if not exists (select 1 from wq_capa_actions where case_id = c.id and round = c.round and removed_at is null and kind = 'preventive') then return 'capa_no_preventive'; end if;
  select count(*) into n from wq_capa_attendees where case_id = c.id and round = c.round and present;
  if n < (case when c.mandatory then 3 else 2 end) then return 'capa_quorum'; end if;
  if c.mandatory then
    select count(distinct case when party in ('supervision', 'consultant', 'employer') then 'sup' when party in ('contractor', 'qc') then 'con' end) into np
      from wq_capa_attendees where case_id = c.id and round = c.round and present and party <> 'other';
    if np < 2 then return 'capa_parties'; end if;
  end if;
  return null;
end $f$;

create or replace function wq_capa_unsign(p_case uuid, p_round int) returns void language sql security definer set search_path to 'public' as $f$
  update wq_capa_attendees set signed_at = null, signed_by = null, paper = false where case_id = p_case and round = p_round and signed_at is not null;
$f$;

-- opens a case; with a fingerprint it returns the case already opened for the same pattern
create or replace function wq_capa_open(p_project uuid, p jsonb) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare fp text := nullif(p ->> 'fingerprint', ''); x uuid; s int; sev text := coalesce(nullif(p ->> 'severity', ''), 'major'); days int; ncr uuid := nullif(p ->> 'ncr_id', '')::uuid;
begin
  if not wq_capa_can(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if sev not in ('minor', 'major', 'critical') then raise exception 'invalid_severity'; end if;
  if length(btrim(coalesce(p ->> 'title', ''))) < 3 then raise exception 'capa_no_title'; end if;
  perform pg_advisory_xact_lock(hashtext('wq_capa:' || p_project::text));
  if fp is not null then
    select id into x from wq_capa where project_id = p_project and fingerprint = fp;
    if found then return x; end if;
  end if;
  if ncr is not null and not exists (select 1 from ex_ncr where id = ncr and project_id = p_project) then raise exception 'ncr_not_found'; end if;
  select coalesce(max(seq), 0) + 1 into s from wq_capa where project_id = p_project;
  days := least(30, greatest(1, coalesce(nullif(p ->> 'meeting_days', '')::int, case sev when 'critical' then 2 when 'major' then 5 else 10 end)));
  insert into wq_capa (project_id, seq, code, fingerprint, rule, source, mandatory, severity, title, problem, evidence, scope, baseline, ncr_id, owner_id, owner_name, meeting_due, opened_name)
  values (p_project, s, 'CAPA-' || lpad(s::text, 3, '0'), fp, coalesce(nullif(p ->> 'rule', ''), 'manual'),
    case when p ->> 'source' in ('system', 'ncr') then p ->> 'source' else 'manual' end, coalesce((p ->> 'mandatory')::boolean, false), sev,
    btrim(p ->> 'title'), coalesce(p ->> 'problem', ''), coalesce(p ->> 'evidence', ''), coalesce(p -> 'scope', '{}'::jsonb), coalesce(p -> 'baseline', '{}'::jsonb),
    ncr, nullif(p ->> 'owner_id', '')::uuid, coalesce(p ->> 'owner_name', ''), current_date + days,
    case when p ->> 'source' = 'system' then 'سامانه (تشخیص خودکار)' else wq_capa_me() end)
  returning id into x;
  perform wq_capa_log(x, p_project, 'opened', coalesce(p ->> 'title', ''));
  return x;
end $f$;

-- the editable text of a case while it is being analysed
create or replace function wq_capa_save(p_id uuid, p jsonb) returns void language plpgsql security definer set search_path to 'public' as $f$
declare c wq_capa; n wq_capa;
begin
  select * into c from wq_capa where id = p_id for update;
  if not found then raise exception 'capa_not_found'; end if;
  if not wq_capa_can(c.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if c.status not in ('open', 'rca') then raise exception 'capa_locked'; end if;
  if p ? 'severity' and p ->> 'severity' not in ('minor', 'major', 'critical') then raise exception 'invalid_severity'; end if;
  if p ? 'ncr_id' and nullif(p ->> 'ncr_id', '') is not null and not exists (select 1 from ex_ncr where id = (p ->> 'ncr_id')::uuid and project_id = c.project_id) then raise exception 'ncr_not_found'; end if;
  update wq_capa set
    title = case when p ? 'title' and length(btrim(p ->> 'title')) >= 3 then btrim(p ->> 'title') else title end,
    problem = case when p ? 'problem' then coalesce(p ->> 'problem', '') else problem end,
    severity = case when p ? 'severity' then p ->> 'severity' else severity end,
    containment = case when p ? 'containment' then coalesce(p ->> 'containment', '') else containment end,
    owner_id = case when p ? 'owner_id' then nullif(p ->> 'owner_id', '')::uuid else owner_id end,
    owner_name = case when p ? 'owner_name' then coalesce(p ->> 'owner_name', '') else owner_name end,
    ncr_id = case when p ? 'ncr_id' then nullif(p ->> 'ncr_id', '')::uuid else ncr_id end,
    meeting_at = case when p ? 'meeting_at' then nullif(p ->> 'meeting_at', '')::timestamptz else meeting_at end,
    meeting_place = case when p ? 'meeting_place' then coalesce(p ->> 'meeting_place', '') else meeting_place end,
    minutes = case when p ? 'minutes' then coalesce(p ->> 'minutes', '') else minutes end,
    whys = case when p ? 'whys' then coalesce(p -> 'whys', '[]'::jsonb) else whys end,
    causes = case when p ? 'causes' then coalesce(p -> 'causes', '[]'::jsonb) else causes end,
    root_cause = case when p ? 'root_cause' then coalesce(p ->> 'root_cause', '') else root_cause end,
    meeting_due = case when p ? 'meeting_due' and wq_can(c.project_id, 'configure') then (p ->> 'meeting_due')::date else meeting_due end,
    updated_at = now()
  where id = p_id returning * into n;
  -- a signature is agreement with what was written: changing it withdraws the signatures
  if (n.minutes, n.whys, n.causes, n.root_cause, n.meeting_at) is distinct from (c.minutes, c.whys, c.causes, c.root_cause, c.meeting_at) then perform wq_capa_unsign(p_id, c.round); end if;
  if n.meeting_due is distinct from c.meeting_due then perform wq_capa_log(p_id, c.project_id, 'deadline', n.meeting_due::text); end if;
end $f$;

-- attendees of the meeting: add, remove, present / absent
create or replace function wq_capa_attendee(p_case uuid, p_op text, p jsonb) returns void language plpgsql security definer set search_path to 'public' as $f$
declare c wq_capa;
begin
  select * into c from wq_capa where id = p_case for update;
  if not found then raise exception 'capa_not_found'; end if;
  if not wq_capa_can(c.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if c.status not in ('open', 'rca') then raise exception 'capa_locked'; end if;
  if p_op = 'add' then
    if length(btrim(coalesce(p ->> 'name', ''))) < 2 then raise exception 'capa_no_name'; end if;
    if coalesce(p ->> 'party', 'other') not in ('contractor', 'qc', 'supervision', 'consultant', 'employer', 'other') then raise exception 'invalid_party'; end if;
    if nullif(p ->> 'user_id', '') is not null and exists (select 1 from wq_capa_attendees where case_id = p_case and round = c.round and user_id = (p ->> 'user_id')::uuid) then raise exception 'capa_dup_attendee'; end if;
    insert into wq_capa_attendees (case_id, project_id, round, user_id, name, party, role)
    values (p_case, c.project_id, c.round, nullif(p ->> 'user_id', '')::uuid, btrim(p ->> 'name'), coalesce(p ->> 'party', 'other'), coalesce(p ->> 'role', ''));
  elsif p_op = 'remove' then
    update wq_capa_attendees set present = false, signed_at = null, signed_by = null where id = (p ->> 'id')::uuid and case_id = p_case and round = c.round;
  elsif p_op = 'present' then
    update wq_capa_attendees set present = true where id = (p ->> 'id')::uuid and case_id = p_case and round = c.round;
  else raise exception 'invalid_op';
  end if;
  update wq_capa set updated_at = now() where id = p_case;
end $f$;

-- an attendee signs the minutes: a registered person signs only for themself; someone without an account is marked
-- «signed on paper» by a member of the QC team
create or replace function wq_capa_sign(p_attendee uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare a wq_capa_attendees; c wq_capa; why text;
begin
  select * into a from wq_capa_attendees where id = p_attendee for update;
  if not found then raise exception 'capa_not_found'; end if;
  select * into c from wq_capa where id = a.case_id;
  if not ex_can_view(c.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if c.status <> 'rca' or a.round <> c.round or not a.present then raise exception 'capa_locked'; end if;
  why := wq_capa_ready(c);
  if why is not null then raise exception '%', why; end if;
  if a.user_id is not null then
    if a.user_id is distinct from auth.uid() then raise exception 'capa_sign_self'; end if;
    update wq_capa_attendees set signed_at = now(), signed_by = auth.uid(), paper = false where id = p_attendee;
  else
    if not wq_capa_can(c.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    update wq_capa_attendees set signed_at = now(), signed_by = auth.uid(), paper = true where id = p_attendee;
  end if;
  perform wq_capa_log(c.id, c.project_id, 'signed', a.name);
end $f$;

-- actions: add / remove while the case is analysed, done / undo while it is carried out
create or replace function wq_capa_action(p_case uuid, p_op text, p jsonb) returns void language plpgsql security definer set search_path to 'public' as $f$
declare c wq_capa; a wq_capa_actions;
begin
  select * into c from wq_capa where id = p_case for update;
  if not found then raise exception 'capa_not_found'; end if;
  if not ex_can_view(c.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_op = 'add' then
    if not wq_capa_can(c.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    if c.status not in ('open', 'rca') then raise exception 'capa_locked'; end if;
    if p ->> 'kind' not in ('containment', 'corrective', 'preventive') then raise exception 'invalid_kind'; end if;
    if length(btrim(coalesce(p ->> 'title', ''))) < 5 or length(btrim(coalesce(p ->> 'owner_name', ''))) < 2 or nullif(p ->> 'due_date', '') is null then raise exception 'capa_action_incomplete'; end if;
    insert into wq_capa_actions (case_id, project_id, round, kind, title, owner_id, owner_name, due_date)
    values (p_case, c.project_id, c.round, p ->> 'kind', btrim(p ->> 'title'), nullif(p ->> 'owner_id', '')::uuid, btrim(p ->> 'owner_name'), (p ->> 'due_date')::date);
    if p ->> 'kind' <> 'containment' then perform wq_capa_unsign(p_case, c.round); end if;
  elsif p_op = 'remove' then
    if not wq_capa_can(c.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
    if c.status not in ('open', 'rca') then raise exception 'capa_locked'; end if;
    update wq_capa_actions set removed_at = now() where id = (p ->> 'id')::uuid and case_id = p_case and round = c.round and status = 'open';
    perform wq_capa_unsign(p_case, c.round);
  elsif p_op in ('done', 'undo') then
    select * into a from wq_capa_actions where id = (p ->> 'id')::uuid and case_id = p_case and removed_at is null;
    if not found then raise exception 'capa_not_found'; end if;
    if c.status not in ('open', 'rca', 'agreed') or (a.kind <> 'containment' and c.status <> 'agreed') then raise exception 'capa_locked'; end if;
    if not (wq_capa_can(c.project_id) or a.owner_id = auth.uid()) then raise exception 'not_allowed' using errcode = '42501'; end if;
    if p_op = 'done' then
      if length(btrim(coalesce(p ->> 'note', ''))) < 5 then raise exception 'note_required'; end if;
      update wq_capa_actions set status = 'done', done_at = now(), done_note = btrim(p ->> 'note'), done_by = auth.uid(), done_name = wq_capa_me() where id = a.id;
      perform wq_capa_log(p_case, c.project_id, 'action_done', a.title);
    else
      update wq_capa_actions set status = 'open', done_at = null, done_note = '', done_by = null, done_name = '' where id = a.id;
    end if;
  else raise exception 'invalid_op';
  end if;
  update wq_capa set updated_at = now() where id = p_case;
end $f$;

-- the steps of a case
create or replace function wq_capa_advance(p_id uuid, p_to text, p_note text default '', p_verify_days int default 30) returns void language plpgsql security definer set search_path to 'public' as $f$
declare c wq_capa; why text;
begin
  select * into c from wq_capa where id = p_id for update;
  if not found then raise exception 'capa_not_found'; end if;
  if not wq_capa_can(c.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_to = 'void' then
    if c.status in ('closed', 'void') then raise exception 'capa_locked'; end if;
    if not wq_can(c.project_id, 'configure') then raise exception 'not_allowed' using errcode = '42501'; end if;
    if length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'note_required'; end if;
    update wq_capa set status = 'void', void_reason = btrim(p_note), closed_at = now(), updated_at = now() where id = p_id;
  elsif c.status = 'open' and p_to = 'rca' then
    if length(btrim(c.containment)) < 10 then raise exception 'capa_no_containment'; end if;
    if length(btrim(c.owner_name)) < 2 then raise exception 'capa_no_owner'; end if;
    update wq_capa set status = 'rca', updated_at = now() where id = p_id;
  elsif c.status = 'rca' and p_to = 'agreed' then
    why := wq_capa_ready(c);
    if why is not null then raise exception '%', why; end if;
    if exists (select 1 from wq_capa_attendees where case_id = p_id and round = c.round and present and signed_at is null) then raise exception 'capa_unsigned'; end if;
    update wq_capa set status = 'agreed', agreed_at = now(), updated_at = now(),
      verify_due = greatest(current_date, (select max(due_date) from wq_capa_actions where case_id = p_id and round = c.round and removed_at is null)) + least(180, greatest(7, coalesce(p_verify_days, 30)))
    where id = p_id;
  elsif c.status = 'agreed' and p_to = 'verifying' then
    if exists (select 1 from wq_capa_actions where case_id = p_id and removed_at is null and status <> 'done') then raise exception 'capa_actions_open'; end if;
    update wq_capa set status = 'verifying', updated_at = now() where id = p_id;
  else raise exception 'capa_bad_step';
  end if;
  perform wq_capa_log(p_id, c.project_id, 'status:' || p_to, coalesce(p_note, ''));
end $f$;

-- the effectiveness check: by someone other than the owner; «ineffective» reopens the analysis
create or replace function wq_capa_verify(p_id uuid, p_result text, p_note text, p_metric jsonb default null) returns void language plpgsql security definer set search_path to 'public' as $f$
declare c wq_capa;
begin
  select * into c from wq_capa where id = p_id for update;
  if not found then raise exception 'capa_not_found'; end if;
  if not (wq_can(c.project_id, 'approve') or wq_can(c.project_id, 'configure')) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if c.status <> 'verifying' then raise exception 'capa_bad_step'; end if;
  if p_result not in ('effective', 'ineffective') then raise exception 'invalid_result'; end if;
  if c.owner_id is not null and c.owner_id = auth.uid() then raise exception 'capa_same_person'; end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'note_required'; end if;
  if p_result = 'effective' then
    update wq_capa set status = 'closed', closed_at = now(), verify_result = 'effective', verify_note = btrim(p_note), verify_metric = p_metric, verified_by = auth.uid(), verified_name = wq_capa_me(), verified_at = now(), updated_at = now() where id = p_id;
  else
    update wq_capa set status = 'rca', round = round + 1, verify_result = 'ineffective', verify_note = btrim(p_note), verify_metric = p_metric, verified_by = auth.uid(), verified_name = wq_capa_me(), verified_at = now(),
      meeting_at = null, meeting_due = current_date + 5, agreed_at = null, verify_due = null, updated_at = now() where id = p_id;
    -- the people of the earlier meeting are invited again, unsigned
    insert into wq_capa_attendees (case_id, project_id, round, user_id, name, party, role)
      select case_id, project_id, c.round + 1, user_id, name, party, role from wq_capa_attendees where case_id = p_id and round = c.round and present;
  end if;
  perform wq_capa_log(p_id, c.project_id, 'verified:' || p_result, p_note);
end $f$;

-- an NCR that needs a root-cause analysis (flagged, or of high severity) closes only after its CAPA case is closed
create or replace function wq_ncr_capa_gate() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' and (new.rca_required or new.severity = 'high')
     and not exists (select 1 from wq_capa where ncr_id = new.id and status = 'closed') then
    raise exception 'capa_required';
  end if;
  return new;
end $f$;
create or replace trigger wq_ncr_capa_gate before update of status on ex_ncr for each row execute function wq_ncr_capa_gate();

revoke all on function wq_capa_can(uuid) from public, anon;
revoke all on function wq_capa_me() from public, anon;
revoke all on function wq_capa_log(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function wq_capa_ready(wq_capa) from public, anon, authenticated;
revoke all on function wq_capa_unsign(uuid, int) from public, anon, authenticated;
revoke all on function wq_capa_open(uuid, jsonb) from public, anon;
revoke all on function wq_capa_save(uuid, jsonb) from public, anon;
revoke all on function wq_capa_attendee(uuid, text, jsonb) from public, anon;
revoke all on function wq_capa_sign(uuid) from public, anon;
revoke all on function wq_capa_action(uuid, text, jsonb) from public, anon;
revoke all on function wq_capa_advance(uuid, text, text, int) from public, anon;
revoke all on function wq_capa_verify(uuid, text, text, jsonb) from public, anon;
revoke all on function wq_ncr_capa_gate() from public, anon, authenticated;
grant execute on function wq_capa_can(uuid) to authenticated;
grant execute on function wq_capa_me() to authenticated;
grant execute on function wq_capa_open(uuid, jsonb) to authenticated;
grant execute on function wq_capa_save(uuid, jsonb) to authenticated;
grant execute on function wq_capa_attendee(uuid, text, jsonb) to authenticated;
grant execute on function wq_capa_sign(uuid) to authenticated;
grant execute on function wq_capa_action(uuid, text, jsonb) to authenticated;
grant execute on function wq_capa_advance(uuid, text, text, int) to authenticated;
grant execute on function wq_capa_verify(uuid, text, text, jsonb) to authenticated;
