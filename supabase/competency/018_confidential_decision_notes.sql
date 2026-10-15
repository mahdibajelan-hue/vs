-- Confidential interview-summary notes attached to a decision (approve / not approved / revoke approval /
-- open-to-work / on-project / no assignment). The assessment lead or a site admin may WRITE one (through the RPC),
-- but only a SITE admin (is_admin_user()) can READ them: RLS select is admin-only and no other RPC returns the text.
create table if not exists comp_decision_notes (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references comp_assessments(id) on delete cascade,
  decision text not null check (decision in ('APPROVED','APPROVAL_REVOKED','NOT_APPROVED','OPEN_TO_WORK','ON_PROJECT','NOT_ASSIGNED')),
  project_name text not null default '',
  note text not null check (char_length(btrim(note)) >= 1),
  author_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists comp_decision_notes_assessment_idx on comp_decision_notes(assessment_id, created_at desc);
alter table comp_decision_notes enable row level security;
drop policy if exists comp_decision_notes_admin_read on comp_decision_notes;
create policy comp_decision_notes_admin_read on comp_decision_notes for select to authenticated using (is_admin_user());
-- no insert/update/delete policies: writes go through the SECURITY DEFINER RPC below.

create or replace function comp_add_decision_note(p_assessment_id uuid, p_decision text, p_note text, p_project_name text default '')
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not (comp_is_lead(p_assessment_id) or is_admin_user()) then raise exception 'forbidden'; end if;
  if p_decision in ('APPROVAL_REVOKED','NOT_APPROVED','OPEN_TO_WORK','NOT_ASSIGNED') and char_length(btrim(coalesce(p_note,''))) < 10 then
    raise exception 'note_required: a reason of at least 10 characters is required for this decision';
  end if;
  if char_length(btrim(coalesce(p_note,''))) = 0 then return; end if;
  insert into comp_decision_notes(assessment_id, decision, project_name, note)
  values (p_assessment_id, p_decision, coalesce(p_project_name,''), btrim(p_note));
end $$;
grant execute on function comp_add_decision_note(uuid,text,text,text) to authenticated;

-- Lets the lead's UI know a note exists without revealing it.
create or replace function comp_decision_note_count(p_assessment_id uuid)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not (comp_is_lead(p_assessment_id) or is_admin_user()) then raise exception 'forbidden'; end if;
  return (select count(*) from comp_decision_notes where assessment_id = p_assessment_id);
end $$;
grant execute on function comp_decision_note_count(uuid) to authenticated;
