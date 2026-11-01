-- Inbox: stakeholder follow-ups and concerns assigned to me (by the email entered as the owner). Same columns as
-- inbox_my_items(). A follow-up shows from 3 days before its due date; a concern when it is critical or within 7 days of its due date.
create or replace function public.inbox_my_stakeholder_work()
returns table(key text, source text, kind text, project_id uuid, project_name text, title text, sub text, due date, since timestamptz, urgent boolean, ref_id uuid, extra jsonb)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  my_email text;
begin
  if u is null then return; end if;
  select lower(email) into my_email from auth.users where id = u;
  if coalesce(my_email, '') = '' then return; end if;

  return query
  select 'sh:follow:' || e.id, 'stakeholders', 'sh_followup', e.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
    'پیگیری ذینفع — ' || s.name || ': ' || e.next_action, 'از ' || e.subject, e.next_due, e.created_at,
    coalesce(e.next_due < current_date, false), e.id, jsonb_build_object('stakeholderId', s.id)
  from sh_engagements e join sh_stakeholders s on s.id = e.stakeholder_id left join master_projects mp on mp.id = e.master_project_id
  where lower(e.next_owner_email) = my_email and e.next_action <> '' and not e.next_done and s.is_active
    and (e.next_due is null or e.next_due <= current_date + 3) and sh_can_access(e.master_project_id);

  return query
  select 'sh:concern:' || c.id, 'stakeholders', 'sh_concern', c.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
    'نگرانی ذینفع — ' || s.name || ': ' || c.title,
    case c.priority when 'critical' then 'اولویت بحرانی' when 'high' then 'اولویت زیاد' when 'medium' then 'اولویت متوسط' else 'اولویت کم' end,
    c.due_date, c.created_at, (coalesce(c.due_date < current_date, false) or c.priority = 'critical'), c.id, jsonb_build_object('stakeholderId', s.id)
  from sh_concerns c join sh_stakeholders s on s.id = c.stakeholder_id left join master_projects mp on mp.id = c.master_project_id
  where lower(c.owner_email) = my_email and c.status in ('open', 'in_progress')
    and (c.priority = 'critical' or c.due_date is null or c.due_date <= current_date + 7) and sh_can_access(c.master_project_id);
end $function$;

grant execute on function public.inbox_my_stakeholder_work() to authenticated;
