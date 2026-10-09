-- ============================================================================
-- ERM v2 — alert rules + escalation, on the platform's shared notification engine (im_notif_* tables, prefs, outbox, im-notify dispatcher).
-- Rules are rows (editable by an admin without code changes): recipients, escalation recipients, channels, thresholds, de-duplication.
-- External channels are only delivered when a provider is configured on the edge function; otherwise rows end as `skipped` (never faked).
-- ============================================================================
alter table im_notif_rules add column if not exists scope text not null default 'issues';
alter table im_notif_outbox add column if not exists risk_id uuid;
alter table im_notif_outbox add column if not exists kri_id uuid;
create index if not exists idx_im_outbox_risk on im_notif_outbox (risk_id) where risk_id is not null;

insert into im_notif_rules (key, name, description, kind, recipients, escalate_to, channels, min_severity, threshold_hours, dedupe_hours, sort, scope) values
 ('rk_review_due',        'نزدیک‌شدن موعد بازنگری ریسک', 'موعد بازنگری ریسک تا ۷۲ ساعت دیگر است',                           'state', '{owner,monitor}',                 '{}',                       '{in_app,email}',       'low', 72, 72, 210, 'risk'),
 ('rk_review_overdue',    'گذشتن موعد بازنگری ریسک',      'بازنگری انجام نشده؛ با تأخیر بیشتر به مدیر پروژه و مرجع تأیید تشدید می‌شود', 'state', '{owner,monitor}',          '{project_manager,approver}', '{in_app,email,sms}', 'low', 0, 24, 220, 'risk'),
 ('rk_critical',          'ریسک بحرانی یا جهش امتیاز',    'امتیاز ریسک از آستانهٔ ارجاع گذشت یا ناگهان بالا رفت',               'event', '{owner,project_manager,approver}', '{management}',            '{in_app,email,sms,push}', 'low', 0, 0, 230, 'risk'),
 ('rk_kri_breach',        'عبور شاخص هشدار (KRI) از آستانه', 'یک شاخص هشدار زودهنگام وارد محدودهٔ هشدار یا بحرانی شد',         'event', '{owner,monitor}',                 '{project_manager}',        '{in_app,email,push}',  'low', 0, 0, 240, 'risk'),
 ('rk_action_overdue',    'تأخیر اقدام کاهشی',            'اقدام کاهشی از سررسید گذشته',                                       'state', '{action_owner,owner}',            '{project_manager,approver}', '{in_app,email}',     'low', 0, 24, 250, 'risk'),
 ('rk_control_expired',   'کنترل حیاتی منقضی/آزمون‌نشده', 'کنترل حیاتی منقضی شده یا آزمون دوره‌ای آن عقب افتاده است',         'state', '{owner}',                         '{project_manager}',        '{in_app,email}',       'low', 0, 168, 260, 'risk'),
 ('rk_no_owner',          'ریسک بدون مالک',               'ریسک فعال مالک ندارد',                                              'state', '{project_manager,risk_manager}',  '{}',                       '{in_app}',             'low', 0, 168, 270, 'risk'),
 ('rk_no_response_plan',  'ریسک مهم بدون برنامهٔ پاسخ',    'ریسک زیاد/بحرانی بدون اقدام کاهشی باز',                              'state', '{owner,project_manager}',         '{approver}',               '{in_app,email}',       'low', 0, 168, 280, 'risk'),
 ('rk_stale_assessment',  'ارزیابی قدیمی',                'ارزیابی ریسک از سقف مجاز سن گذشته است',                              'state', '{monitor,owner}',                 '{project_manager}',        '{in_app}',             'low', 0, 168, 290, 'risk'),
 ('rk_acceptance_pending','درخواست پذیرش ریسک باقیمانده',  'پذیرش رسمی ریسک باقیمانده منتظر تصمیم مرجع مجاز است',               'event', '{approver,project_manager}',      '{management}',             '{in_app,email}',       'low', 0, 0, 300, 'risk'),
 ('rk_action_ineffective','اقدام تکمیل‌شده بدون اثر',      'اقدام کاهشی تکمیل شد ولی اثر مورد انتظار حاصل نشد',                 'event', '{owner,project_manager}',         '{approver}',               '{in_app,email}',       'low', 0, 0, 310, 'risk'),
 ('rk_realized',          'تحقق ریسک و تبدیل به مسئله',    'ریسک محقق شد و مسئله ایجاد شد؛ بازنگری لازم است',                    'event', '{owner,project_manager}',         '{}',                       '{in_app,email}',       'low', 0, 0, 320, 'risk')
on conflict (key) do nothing;

-- Current state of every risk (latest assessment, level by policy, review due date). security_invoker → RLS of the caller applies.
create or replace view rm_risk_state with (security_invoker = true) as
select r.id as risk_id, r.project_id, r.status, r.initial_score,
       coalesce(a.current_score, r.initial_score) as current_score,
       coalesce(a.residual_score, r.initial_score) as residual_score,
       a.review_date as last_review_date,
       coalesce(a.n, 0) as assessment_count,
       lvl.level,
       coalesce(r.next_review_date, coalesce(a.review_date, r.identified_date) + coalesce(r.review_interval_days, (p.review_days ->> lvl.level)::int, 60)) as review_due
  from rm_risks r
  left join lateral (select x.current_score, x.residual_score, x.review_date, count(*) over () as n from rm_risk_assessments x where x.risk_id = r.id order by x.review_date desc, x.created_at desc limit 1) a on true
  cross join lateral rm_policy_for(r.project_id) p
  cross join lateral (select case when coalesce(a.current_score, r.initial_score) >= p.level_bounds[3] then 'critical'
                                  when coalesce(a.current_score, r.initial_score) >= p.level_bounds[2] then 'high'
                                  when coalesce(a.current_score, r.initial_score) >= p.level_bounds[1] then 'medium' else 'low' end as level) lvl;
grant select on rm_risk_state to authenticated;

create or replace function rm_resolve_recipients(p_risk rm_risks, p_roles text[]) returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct u from (
    select p_risk.owner_id u where 'owner' = any(p_roles)
    union all select p_risk.monitor_id where 'monitor' = any(p_roles)
    union all select p_risk.approver_id where 'approver' = any(p_roles)
    union all select p_risk.response_owner_id where 'response_owner' = any(p_roles)
    union all select m.user_id from rm_project_members m where m.project_id = p_risk.project_id and m.role = 'project_manager' and 'project_manager' = any(p_roles)
    union all select m.user_id from rm_project_members m where m.project_id = p_risk.project_id and m.role = 'risk_manager' and 'risk_manager' = any(p_roles)
    union all select m.user_id from rm_project_members m where m.project_id = p_risk.project_id and m.role = 'management' and 'management' = any(p_roles)
    union all select pr.id from profiles pr where pr.is_admin and pr.account_status = 'active' and 'admins' = any(p_roles)
  ) x where u is not null;
$$;

create or replace function rm_enqueue(p_rule text, p_risk rm_risks, p_kri uuid, p_user uuid, p_title text, p_body text, p_dedupe text, p_level smallint, p_sev text)
returns integer language plpgsql security definer set search_path = public as $$
declare r im_notif_rules; pr im_notif_prefs; v_haspr boolean; ch text; v_ok boolean; n int := 0; v_at timestamptz := now(); v_hour int; v_quiet boolean := false; v_crit boolean;
begin
  select * into r from im_notif_rules where key = p_rule and is_active;
  if not found then return 0; end if;
  select * into pr from im_notif_prefs where user_id = p_user;
  v_haspr := found;
  v_crit := p_sev = 'critical' or p_level >= 3;
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
    insert into im_notif_outbox (rule_key, risk_id, kri_id, recipient_id, channel, title, body, level, severity, dedupe_key, scheduled_at, payload)
    values (p_rule, p_risk.id, p_kri, p_user, ch, p_title, p_body, p_level, p_sev, p_dedupe, case when ch = 'in_app' then now() else v_at end, jsonb_build_object('code', p_risk.code, 'project_id', p_risk.project_id, 'module', 'risk'))
    on conflict (dedupe_key, channel) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function rm_generate_notifications() returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r rm_risks; s rm_risk_state; k rm_kris; a rm_risk_actions; c rm_controls; e record; u uuid; n int := 0; v_rule im_notif_rules; v_days int; v_lvl smallint; pol rm_policy;
  v_last bigint; v_max bigint; v_prev smallint; v_wk text := to_char(date_trunc('week', now()), 'YYYYMMDD');
begin
  -- 1) KRI threshold crossings
  select coalesce((select value from im_notif_state where key = 'rk_last_kri_event'), 0) into v_last; v_max := v_last;
  for e in select * from rm_kri_events where id > v_last and to_state in ('warn', 'critical') order by id limit 500 loop
    v_max := greatest(v_max, e.id);
    select * into k from rm_kris where id = e.kri_id;
    if k.risk_id is null then continue; end if;
    select * into r from rm_risks where id = k.risk_id;
    if not found or r.status = 'closed' then continue; end if;
    select * into v_rule from im_notif_rules where key = 'rk_kri_breach' and is_active;
    if not found then continue; end if;
    for u in select * from rm_resolve_recipients(r, v_rule.recipients || array[]::text[] || case when e.to_state = 'critical' then v_rule.escalate_to else '{}'::text[] end) union select k.owner_id where k.owner_id is not null loop
      n := n + rm_enqueue('rk_kri_breach', r, k.id, u, 'شاخص هشدار: ' || k.name || ' (' || r.code || ')', case e.to_state when 'critical' then 'بحرانی' else 'هشدار' end || ' · مقدار ' || coalesce(e.value::text, '') || ' ' || k.unit, 'kri:' || e.id || ':' || u, (case when e.to_state = 'critical' then 2 else 1 end)::smallint, case when e.to_state = 'critical' then 'critical' else 'high' end);
    end loop;
  end loop;
  insert into im_notif_state (key, value) values ('rk_last_kri_event', v_max) on conflict (key) do update set value = excluded.value;

  -- 2) new assessments: crossing the escalation threshold or a sudden jump
  select coalesce((select value from im_notif_state where key = 'rk_last_assess'), 0) into v_last; v_max := v_last;
  for e in select x.*, (floor(extract(epoch from x.created_at) * 1000))::bigint as ts from rm_risk_assessments x where floor(extract(epoch from x.created_at) * 1000) > v_last order by x.created_at limit 500 loop
    v_max := greatest(v_max, e.ts);
    select * into r from rm_risks where id = e.risk_id;
    if not found or r.status = 'closed' then continue; end if;
    pol := rm_policy_for(r.project_id);
    select current_score into v_prev from rm_risk_assessments where risk_id = e.risk_id and (review_date, created_at) < (e.review_date, e.created_at) order by review_date desc, created_at desc limit 1;
    if v_prev is null then v_prev := r.initial_score; end if;
    if (e.current_score >= pol.escalation_min and v_prev < pol.escalation_min) or e.current_score - v_prev >= 6 then
      select * into v_rule from im_notif_rules where key = 'rk_critical' and is_active;
      if found then
        for u in select * from rm_resolve_recipients(r, v_rule.recipients || case when e.current_score >= pol.escalation_min then v_rule.escalate_to else '{}'::text[] end) loop
          n := n + rm_enqueue('rk_critical', r, null, u, 'ریسک ' || case when e.current_score >= pol.escalation_min then 'بحرانی' else 'با جهش امتیاز' end || ': ' || r.code, r.title || ' — امتیاز ' || v_prev || ' → ' || e.current_score, 'crit:' || e.id || ':' || u, (case when e.current_score >= pol.escalation_min then 2 else 1 end)::smallint, case when e.current_score >= pol.escalation_min then 'critical' else 'high' end);
        end loop;
      end if;
    end if;
  end loop;
  insert into im_notif_state (key, value) values ('rk_last_assess', v_max) on conflict (key) do update set value = excluded.value;

  -- 3) history events: realized / ineffective action / acceptance requested
  select coalesce((select value from im_notif_state where key = 'rk_last_hist'), 0) into v_last; v_max := v_last;
  for e in select h.*, (floor(extract(epoch from h.created_at) * 1000))::bigint as ts from rm_risk_history h where floor(extract(epoch from h.created_at) * 1000) > v_last and (h.activity in ('realized_to_issue', 'acceptance_requested') or (h.activity = 'action:effect_status' and h.new_value = '"ineffective"'::jsonb)) order by h.created_at limit 500 loop
    v_max := greatest(v_max, e.ts);
    select * into r from rm_risks where id = e.risk_id;
    if not found then continue; end if;
    select * into v_rule from im_notif_rules where key = case e.activity when 'realized_to_issue' then 'rk_realized' when 'acceptance_requested' then 'rk_acceptance_pending' else 'rk_action_ineffective' end and is_active;
    if not found then continue; end if;
    for u in select * from rm_resolve_recipients(r, v_rule.recipients) loop
      n := n + rm_enqueue(v_rule.key, r, null, u, v_rule.name || ': ' || r.code, r.title, v_rule.key || ':' || e.id || ':' || u, 1::smallint, 'high');
    end loop;
  end loop;
  insert into im_notif_state (key, value) values ('rk_last_hist', v_max) on conflict (key) do update set value = excluded.value;
  -- the history scan above also needs the timestamp of the last scan in *ms*; ids are bigint-safe

  -- 4) state rules over active risks
  for r in select * from rm_risks where status <> 'closed' loop
    select * into s from rm_risk_state where risk_id = r.id;
    pol := rm_policy_for(r.project_id);
    v_days := current_date - s.review_due;
    if v_days between -3 and 0 then
      select * into v_rule from im_notif_rules where key = 'rk_review_due' and is_active;
      if found then for u in select * from rm_resolve_recipients(r, v_rule.recipients) loop n := n + rm_enqueue('rk_review_due', r, null, u, 'نزدیک موعد بازنگری: ' || r.code, r.title, 'rdue:' || r.id || ':' || s.review_due || ':' || u, 0::smallint, s.level); end loop; end if;
    elsif v_days > 0 then
      v_lvl := case when v_days <= 7 then 1 when v_days <= 21 then 2 else 3 end;
      select * into v_rule from im_notif_rules where key = 'rk_review_overdue' and is_active;
      if found then for u in select * from rm_resolve_recipients(r, v_rule.recipients || case when v_lvl >= 2 then v_rule.escalate_to else '{}'::text[] end) loop n := n + rm_enqueue('rk_review_overdue', r, null, u, 'بازنگری عقب‌افتاده ' || v_days || ' روزه: ' || r.code, r.title, 'rover:' || r.id || ':L' || v_lvl || ':' || u, v_lvl, s.level); end loop; end if;
    end if;
    if r.owner_id is null then
      select * into v_rule from im_notif_rules where key = 'rk_no_owner' and is_active;
      if found then for u in select * from rm_resolve_recipients(r, v_rule.recipients) loop n := n + rm_enqueue('rk_no_owner', r, null, u, 'ریسک بدون مالک: ' || r.code, r.title, 'noown:' || r.id || ':' || v_wk || ':' || u, 0::smallint, s.level); end loop; end if;
    end if;
    if s.level in ('high', 'critical') and r.response_strategy <> 'accept' and not exists (select 1 from rm_risk_actions x where x.risk_id = r.id and x.status not in ('completed', 'cancelled')) then
      select * into v_rule from im_notif_rules where key = 'rk_no_response_plan' and is_active;
      if found then for u in select * from rm_resolve_recipients(r, v_rule.recipients) loop n := n + rm_enqueue('rk_no_response_plan', r, null, u, 'ریسک مهم بدون اقدام کاهشی: ' || r.code, r.title, 'noplan:' || r.id || ':' || v_wk || ':' || u, 1::smallint, s.level); end loop; end if;
    end if;
    if coalesce(s.last_review_date, r.identified_date) < current_date - pol.stale_assessment_days then
      select * into v_rule from im_notif_rules where key = 'rk_stale_assessment' and is_active;
      if found then for u in select * from rm_resolve_recipients(r, v_rule.recipients) loop n := n + rm_enqueue('rk_stale_assessment', r, null, u, 'ارزیابی قدیمی: ' || r.code, r.title, 'stale:' || r.id || ':' || v_wk || ':' || u, 0::smallint, s.level); end loop; end if;
    end if;
    for a in select * from rm_risk_actions x where x.risk_id = r.id and x.status not in ('completed', 'cancelled') and x.due_date < current_date loop
      v_days := current_date - a.due_date;
      v_lvl := case when v_days <= 3 then 1 when v_days <= 10 then 2 else 3 end;
      select * into v_rule from im_notif_rules where key = 'rk_action_overdue' and is_active;
      if found then
        for u in select a.owner_id where a.owner_id is not null union select * from rm_resolve_recipients(r, array_remove(v_rule.recipients, 'action_owner') || case when v_lvl >= 2 then v_rule.escalate_to else '{}'::text[] end) loop
          n := n + rm_enqueue('rk_action_overdue', r, null, u, 'اقدام کاهشی معوق ' || v_days || ' روزه: ' || r.code, left(a.description, 140), 'aover:' || a.id || ':L' || v_lvl || ':' || u, v_lvl, s.level);
        end loop;
      end if;
    end loop;
    for c in select * from rm_controls x where x.risk_id = r.id and x.is_critical and x.status in ('active', 'expired') and (x.expires_on < current_date or (x.test_interval_days is not null and coalesce(x.last_tested_at, r.identified_date) + x.test_interval_days < current_date)) loop
      select * into v_rule from im_notif_rules where key = 'rk_control_expired' and is_active;
      if found then for u in select c.owner_id where c.owner_id is not null union select * from rm_resolve_recipients(r, v_rule.recipients) loop n := n + rm_enqueue('rk_control_expired', r, null, u, 'کنترل حیاتی نیازمند آزمون/تمدید: ' || c.name, r.code || ' · ' || r.title, 'ctl:' || c.id || ':' || v_wk || ':' || u, 1::smallint, s.level); end loop; end if;
    end loop;
  end loop;
  return jsonb_build_object('queued', n);
end $$;
revoke execute on function rm_generate_notifications() from public, anon, authenticated;
-- start the event cursors at "now" so history before this migration does not flood users
insert into im_notif_state (key, value) values
 ('rk_last_kri_event', 0),
 ('rk_last_assess', coalesce((select floor(extract(epoch from max(created_at)) * 1000)::bigint from rm_risk_assessments), 0)),
 ('rk_last_hist', coalesce((select floor(extract(epoch from max(created_at)) * 1000)::bigint from rm_risk_history), 0))
on conflict (key) do nothing;

create or replace function rm_notif_mark_risk_read(p_risk uuid) returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update im_notif_outbox set status = 'read', read_at = now() where recipient_id = auth.uid() and channel = 'in_app' and risk_id = p_risk and status in ('queued', 'sent');
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function rm_notif_mark_risk_read(uuid) to authenticated;
revoke execute on function rm_notif_mark_risk_read(uuid) from public, anon;

-- my_notifications() (bell) additionally returns the engine's unread in-app risk rows (ids prefixed `rq-`):
--   for r in select o.id, o.title, o.body, o.level, o.risk_id, o.created_at from im_notif_outbox o
--     where o.recipient_id = auth.uid() and o.channel = 'in_app' and o.status in ('queued','sent') and o.risk_id is not null and o.created_at > now() - interval '14 days'
--     order by o.level desc, o.created_at desc limit 40 loop
--     v := v || jsonb_build_object('id','rq-'||r.id,'source','risk','module','risk','severity',case when r.level >= 2 then 'warn' else 'action' end,'title',r.title,'body',r.body,'recordId',r.risk_id,'at',r.created_at);
--   end loop;
-- Scheduling: select cron.schedule('rm-generate-notifications', '*/15 * * * *', $$select public.rm_generate_notifications()$$);   (the im-notify edge function also calls it)
