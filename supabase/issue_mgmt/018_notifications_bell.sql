-- Issue Management v2 — bell integration + scheduler.
-- my_notifications() (live function used by the NotificationBell) additionally returns the engine's unread in-app rows
-- (ids prefixed `nq-`). Full definition lives in supabase/schema.sql history; this block is the patched copy
-- (additions: the «escalations / reminders» loop between the issues and risks loops).
--   for r in select o.id, o.title, o.body, o.level, o.issue_id, o.created_at from im_notif_outbox o
--     where o.recipient_id = auth.uid() and o.channel = 'in_app' and o.status in ('queued','sent') and o.issue_id is not null
--       and o.created_at > now() - interval '14 days' order by o.level desc, o.created_at desc limit 40 loop
--     v := v || jsonb_build_object('id','nq-'||r.id,'source','issues','module','issues','severity',case when r.level >= 2 then 'warn' else 'action' end,
--                                  'title',r.title,'body',r.body,'recordId',r.issue_id,'at',r.created_at);
--   end loop;

create or replace function im_notif_mark_issue_read(p_issue uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update im_notif_outbox set status = 'read', read_at = now()
   where recipient_id = auth.uid() and channel = 'in_app' and issue_id = p_issue and status in ('queued', 'sent');
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function im_notif_mark_issue_read(uuid) to authenticated;
revoke execute on function im_notif_mark_issue_read(uuid) from public, anon;

-- Scheduler (pg_cron): state/event scan every 15 minutes. External delivery needs the im-notify edge function to be
-- invoked as well (admin button in Settings, or any external cron with header x-cron-secret = IM_CRON_SECRET).
-- select cron.schedule('im-generate-notifications', '*/15 * * * *', $$select public.im_generate_notifications()$$);
