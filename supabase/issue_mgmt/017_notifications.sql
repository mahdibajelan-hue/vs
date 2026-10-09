-- ============================================================================
-- Issue Management v2 — notification & escalation engine.
-- Rules → generator (state scan + audit-event scan) → outbox → dispatcher (edge function im-notify).
-- In-app rows are served through my_notifications(); external channels (email/SMS/push/messenger) are only
-- «sent» when a provider is configured on the edge function — otherwise rows end as `skipped` (never faked).
-- ============================================================================
create table if not exists im_notif_prefs (
  user_id uuid primary key references profiles (id) on delete cascade,
  in_app boolean not null default true,
  email boolean not null default true,
  sms boolean not null default false,
  push boolean not null default false,
  messenger boolean not null default false,
  quiet_start smallint check (quiet_start between 0 and 23),
  quiet_end smallint check (quiet_end between 0 and 23),
  digest boolean not null default false,
  muted_projects uuid[] not null default '{}',
  contact jsonb not null default '{}'::jsonb,           -- {phone, messenger_id} filled by the user; never read by other users
  updated_at timestamptz not null default now()
);

create table if not exists im_notif_rules (
  key text primary key,
  name text not null,
  description text not null default '',
  kind text not null check (kind in ('state', 'event')),
  recipients text[] not null default '{}',               -- owner | follow_up | pursuer | approver | admins
  escalate_to text[] not null default '{}',              -- recipients added at the next escalation level
  channels text[] not null default '{in_app,email}',
  min_severity text not null default 'low' check (min_severity in ('low', 'medium', 'high', 'critical')),
  threshold_hours integer not null default 0,
  dedupe_hours integer not null default 24,
  is_active boolean not null default true,
  sort smallint not null default 0
);
insert into im_notif_rules (key, name, description, kind, recipients, escalate_to, channels, min_severity, threshold_hours, dedupe_hours, sort) values
 ('assigned',            'ارجاع مسئله به من',            'وقتی مسئله‌ای به شما ارجاع شد',                                 'event', '{}',                        '{}',                '{in_app,email,push}', 'low',    0,   0,   10),
 ('approval_requested',  'درخواست تأیید رفع',            'مسئله برای تأیید نهایی آماده است',                               'event', '{approver}',                '{}',                '{in_app,email,push}', 'low',    0,   0,   20),
 ('extension_requested', 'درخواست تمدید',                'تمدید سررسید منتظر تصمیم مسئول تأیید است',                       'event', '{approver,admins}',         '{}',                '{in_app,email}',      'low',    0,   0,   30),
 ('reopened',            'بازگشایی مسئله',               'مسئلهٔ بسته‌شده دوباره باز شد',                                  'event', '{owner,follow_up,pursuer}', '{}',                '{in_app,email}',      'low',    0,   0,   40),
 ('due_soon',            'نزدیک سررسید',                 'سررسید تا ۴۸ ساعت دیگر',                                         'state', '{pursuer,follow_up}',       '{}',                '{in_app,email}',      'low',    48,  48,  50),
 ('overdue',             'گذشتن از سررسید',              'مسئله از سررسید مؤثر گذشته؛ با طولانی‌شدن تأخیر تشدید می‌شود',    'state', '{pursuer,follow_up}',       '{approver,owner}',  '{in_app,email,sms}',  'low',    0,   24,  60),
 ('overdue_critical',    'تأخیر مسئلهٔ بحرانی/بالا',     'تأخیر مسائل با شدت بالا سریع‌تر به مدیر می‌رسد',                 'state', '{pursuer,follow_up,owner}', '{approver,admins}', '{in_app,email,sms,push}', 'high', 0,   12,  65),
 ('blocked_long',        'انسداد طولانی',                'اقدامی بیش از ۴۸ ساعت مسدود مانده است',                          'state', '{follow_up,owner}',         '{admins}',          '{in_app,email}',      'low',    48,  48,  70),
 ('stale',               'مسئلهٔ بی‌حرکت',               'بیش از ۷ روز بدون هیچ رویدادی',                                  'state', '{follow_up,owner}',         '{approver}',        '{in_app}',            'low',    168, 168, 80),
 ('response_sla',        'نقض SLA پاسخ اولیه',           'مسئله پس از مهلت SLA همچنان در مرحلهٔ «ثبت‌شده» است',            'state', '{follow_up,owner}',         '{admins}',          '{in_app,email,sms}',  'low',    0,   24,  90),
 ('verify_waiting',      'اقدام منتظر تأیید',            'اقدام انجام‌شده بیش از ۲۴ ساعت منتظر تأیید مستقل است',           'state', '{approver}',                '{admins}',          '{in_app,email}',      'low',    24,  48,  100)
on conflict (key) do nothing;

create table if not exists im_notif_outbox (
  id bigint generated always as identity primary key,
  rule_key text not null references im_notif_rules (key),
  issue_id uuid,
  task_id uuid,
  recipient_id uuid not null references profiles (id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'sms', 'push', 'messenger')),
  title text not null,
  body text not null default '',
  level smallint not null default 0,
  severity text not null default 'medium',
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped', 'read')),
  attempts smallint not null default 0,
  last_error text not null default '',
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (dedupe_key, channel)
);
create index if not exists idx_im_outbox_due on im_notif_outbox (status, scheduled_at);
create index if not exists idx_im_outbox_user on im_notif_outbox (recipient_id, channel, status);

create table if not exists im_notif_state (key text primary key, value bigint not null default 0);

alter table im_notif_prefs enable row level security;
alter table im_notif_rules enable row level security;
alter table im_notif_outbox enable row level security;
alter table im_notif_state enable row level security;
drop policy if exists im_prefs_own on im_notif_prefs;
create policy im_prefs_own on im_notif_prefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists im_rules_read on im_notif_rules;
create policy im_rules_read on im_notif_rules for select using (auth.uid() is not null);
drop policy if exists im_rules_admin on im_notif_rules;
create policy im_rules_admin on im_notif_rules for all using (is_admin_user()) with check (is_admin_user());
drop policy if exists im_outbox_own on im_notif_outbox;
create policy im_outbox_own on im_notif_outbox for select using (recipient_id = auth.uid() or is_admin_user());
-- im_notif_state: no policies (service role / definer functions only)

-- Recipient resolver: role keyword → user ids for one issue.
create or replace function im_resolve_recipients(p_issue im_issues, p_roles text[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct u from (
    select p_issue.owner_id u where 'owner' = any(p_roles)
    union all select p_issue.follow_up_id where 'follow_up' = any(p_roles)
    union all select p_issue.pursuer_id where 'pursuer' = any(p_roles)
    union all select p_issue.approver_id where 'approver' = any(p_roles)
    union all select m.user_id from im_project_members m where m.project_id = p_issue.project_id and m.role = 'admin' and 'admins' = any(p_roles)
  ) x where u is not null;
$$;

-- Enqueue one notification per allowed channel, honouring prefs, muted projects, quiet hours and de-duplication.
create or replace function im_enqueue(p_rule text, p_issue im_issues, p_task uuid, p_user uuid, p_title text, p_body text, p_dedupe text, p_level smallint default 0)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r im_notif_rules; pr im_notif_prefs; v_haspr boolean; ch text; v_ok boolean; n int := 0; v_at timestamptz := now(); v_hour int; v_quiet boolean := false; v_crit boolean;
begin
  select * into r from im_notif_rules where key = p_rule and is_active;
  if not found then return 0; end if;
  select * into pr from im_notif_prefs where user_id = p_user;
  v_haspr := found;
  if v_haspr and p_issue.project_id = any(pr.muted_projects) and p_level < 3 then return 0; end if;
  v_crit := coalesce(p_issue.severity, p_issue.priority) = 'critical' or p_level >= 3;
  v_hour := extract(hour from (now() at time zone 'Asia/Tehran'))::int;
  if v_haspr and pr.quiet_start is not null and pr.quiet_end is not null and not v_crit then
    v_quiet := case when pr.quiet_start <= pr.quiet_end then v_hour >= pr.quiet_start and v_hour < pr.quiet_end else v_hour >= pr.quiet_start or v_hour < pr.quiet_end end;
    if v_quiet then v_at := date_trunc('hour', now()) + make_interval(hours => ((pr.quiet_end - v_hour + 24) % 24)); end if;
  end if;
  foreach ch in array r.channels loop
    if ch = 'in_app' then v_ok := true;
    elsif v_haspr then v_ok := (ch = 'email' and pr.email) or (ch = 'sms' and pr.sms) or (ch = 'push' and pr.push) or (ch = 'messenger' and pr.messenger);
    else v_ok := (ch = 'email');
    end if;
    if not v_ok then continue; end if;
    insert into im_notif_outbox (rule_key, issue_id, task_id, recipient_id, channel, title, body, level, severity, dedupe_key, scheduled_at, payload)
    values (p_rule, p_issue.id, p_task, p_user, ch, p_title, p_body, p_level, coalesce(p_issue.severity, p_issue.priority), p_dedupe, case when ch = 'in_app' then now() else v_at end,
            jsonb_build_object('code', p_issue.code, 'project_id', p_issue.project_id))
    on conflict (dedupe_key, channel) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------- generator
-- Scans state conditions and audit events since the last run. Safe to run as often as every few minutes: dedupe keys make it idempotent.
create or replace function im_generate_notifications()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i im_issues; t im_issue_tasks; e record; u uuid; n int := 0; v_last bigint; v_max bigint; v_days int; v_lvl smallint; v_rule im_notif_rules; v_hours numeric;
begin
  -- 1) event-driven rules (assigned / approval_requested / extension_requested / reopened)
  select coalesce((select value from im_notif_state where key = 'last_event'), 0) into v_last;
  v_max := v_last;
  for e in select * from im_issue_events where id > v_last order by id limit 500 loop
    v_max := greatest(v_max, e.id);
    select * into i from im_issues where id = e.issue_id;
    if not found then continue; end if;
    if e.kind = 'assignment_change' and e.new_value is not null and e.field in ('owner_id', 'follow_up_id', 'pursuer_id', 'approver_id') then
      n := n + im_enqueue('assigned', i, null, e.new_value::uuid, 'ارجاع جدید: ' || i.code, i.title, 'assigned:' || e.id, 0);
    elsif e.kind = 'stage_change' and e.new_value = 'resolution_review' then
      for u in select * from im_resolve_recipients(i, '{approver}') loop n := n + im_enqueue('approval_requested', i, null, u, 'درخواست تأیید رفع: ' || i.code, i.title, 'approval:' || e.id, 0); end loop;
    elsif e.kind = 'extension_requested' then
      for u in select * from im_resolve_recipients(i, '{approver,admins}') loop n := n + im_enqueue('extension_requested', i, null, u, 'درخواست تمدید: ' || i.code, i.title || ' — ' || coalesce(e.reason, ''), 'ext:' || e.id, 0); end loop;
    elsif e.kind = 'stage_change' and e.new_value = 'reopened' then
      for u in select * from im_resolve_recipients(i, '{owner,follow_up,pursuer}') loop n := n + im_enqueue('reopened', i, null, u, 'بازگشایی: ' || i.code, i.title, 'reopen:' || e.id, 0); end loop;
    end if;
  end loop;
  insert into im_notif_state (key, value) values ('last_event', v_max) on conflict (key) do update set value = excluded.value;

  -- 2) state rules over active issues
  for i in select * from im_issues where stage not in ('closed', 'cancelled', 'duplicate') loop
    v_days := (current_date - coalesce(i.resolve_due_date, i.deadline_date));
    -- due soon
    select * into v_rule from im_notif_rules where key = 'due_soon' and is_active;
    if found and v_days between -2 and 0 then
      for u in select * from im_resolve_recipients(i, v_rule.recipients) loop n := n + im_enqueue('due_soon', i, null, u, 'نزدیک سررسید: ' || i.code, i.title, 'due_soon:' || i.id || ':' || coalesce(i.resolve_due_date, i.deadline_date)::text || ':' || u, 0); end loop;
    end if;
    -- overdue ladder (critical/high escalate faster)
    if v_days > 0 then
      v_lvl := case when v_days <= case when coalesce(i.severity, i.priority) in ('high', 'critical') then 0 else 2 end then 1
                    when v_days <= case when coalesce(i.severity, i.priority) in ('high', 'critical') then 3 else 7 end then 2 else 3 end;
      select * into v_rule from im_notif_rules where key = case when coalesce(i.severity, i.priority) in ('high', 'critical') then 'overdue_critical' else 'overdue' end and is_active;
      if found then
        for u in select * from im_resolve_recipients(i, v_rule.recipients || case when v_lvl >= 2 then v_rule.escalate_to else '{}'::text[] end) loop
          n := n + im_enqueue(v_rule.key, i, null, u, 'تأخیر ' || v_days || ' روزه: ' || i.code, i.title, v_rule.key || ':' || i.id || ':L' || v_lvl || ':' || u, v_lvl);
        end loop;
      end if;
    end if;
    -- blocked
    select * into v_rule from im_notif_rules where key = 'blocked_long' and is_active;
    if found and i.blocked_since is not null and i.blocked_since < now() - make_interval(hours => v_rule.threshold_hours) then
      for u in select * from im_resolve_recipients(i, v_rule.recipients) loop n := n + im_enqueue('blocked_long', i, null, u, 'انسداد طولانی: ' || i.code, i.title, 'blocked:' || i.id || ':' || to_char(i.blocked_since, 'YYYYMMDDHH24') || ':' || u, 1); end loop;
    end if;
    -- stale
    select * into v_rule from im_notif_rules where key = 'stale' and is_active;
    if found and i.updated_at < now() - make_interval(hours => v_rule.threshold_hours) then
      for u in select * from im_resolve_recipients(i, v_rule.recipients) loop n := n + im_enqueue('stale', i, null, u, 'بی‌حرکت: ' || i.code, i.title, 'stale:' || i.id || ':' || to_char(date_trunc('week', now()), 'YYYYMMDD') || ':' || u, 0); end loop;
    end if;
    -- response SLA
    select * into v_rule from im_notif_rules where key = 'response_sla' and is_active;
    if found and i.stage = 'registered' then
      select respond_hours into v_hours from im_sla_policies where severity = coalesce(i.severity, i.priority);
      if v_hours is not null and i.created_at < now() - make_interval(hours => v_hours::int) then
        for u in select * from im_resolve_recipients(i, v_rule.recipients || v_rule.escalate_to) loop n := n + im_enqueue('response_sla', i, null, u, 'نقض SLA پاسخ: ' || i.code, i.title, 'sla:' || i.id || ':' || u, 2); end loop;
      end if;
    end if;
  end loop;

  -- 3) tasks waiting for independent verification
  select * into v_rule from im_notif_rules where key = 'verify_waiting' and is_active;
  if found then
    for t in select * from im_issue_tasks where status = 'pending_verification' and completion_claimed_at < now() - make_interval(hours => v_rule.threshold_hours) loop
      select * into i from im_issues where id = t.issue_id;
      if found then
        u := coalesce(t.approver_id, i.approver_id);
        if u is not null then n := n + im_enqueue('verify_waiting', i, t.id, u, 'اقدام منتظر تأیید: ' || i.code, t.title, 'verify:' || t.id || ':' || to_char(t.completion_claimed_at, 'YYYYMMDDHH24'), 1); end if;
      end if;
    end loop;
  end if;
  return jsonb_build_object('enqueued', n, 'last_event', v_max);
end;
$$;

-- In-app read receipts and dispatcher result reporting
create or replace function im_notif_mark_read(p_ids bigint[] default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update im_notif_outbox set status = 'read', read_at = now()
   where recipient_id = auth.uid() and channel = 'in_app' and status in ('queued', 'sent') and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function im_notif_mark_read(bigint[]) to authenticated;
revoke execute on function im_generate_notifications() from public, anon, authenticated;
revoke execute on function im_enqueue(text, im_issues, uuid, uuid, text, text, text, smallint) from public, anon, authenticated;
revoke execute on function im_resolve_recipients(im_issues, text[]) from public, anon, authenticated;

-- Admin-callable wrapper (for the «اجرای اسکن اکنون» button); the scheduler calls im_generate_notifications() directly.
create or replace function im_generate_notifications_now()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_user() then raise exception 'admin_only'; end if;
  return im_generate_notifications();
end;
$$;
grant execute on function im_generate_notifications_now() to authenticated;
