-- 069 — inbox: «نوبت امضای شما» for the person whose signature a sent execution report waits for (the next required
--   slot of its signature chain). After a supervision correction (068) takes every signature off, the contractor's
--   signers see the report here with «گردش امضا از ابتدا». Supervision signers who can review already get «review».
-- Rollback: rollback/069_rollback.sql (run by hand).
CREATE OR REPLACE FUNCTION public.inbox_my_items()
 RETURNS TABLE(key text, source text, kind text, project_id uuid, project_name text, title text, sub text, due date, since timestamp with time zone, urgent boolean, ref_id uuid, extra jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then return; end if;
  return query select * from inbox_my_items_base();
  return query
  select 'sch:review:' || v.id, 'scheduling', 'sch_review', v.project_id, coalesce(mp.short_name, mp.official_name, ''), 'بررسی به‌روزرسانی برنامه — ' || v.label,
    'ارسال‌شده برای بررسی مشاور', null::date, coalesce((select max(r.at) from sch_version_reviews r where r.version_id = v.id and r.step = 'submit'), v.created_at),
    coalesce((select max(r.at) from sch_version_reviews r where r.version_id = v.id and r.step = 'submit'), v.created_at) < now() - interval '2 days', v.id, jsonb_build_object('label', v.label)
  from sch_versions v left join master_projects mp on mp.id = v.project_id
  where v.status = 'draft' and v.review_status = 'submitted' and sch_can_review(v.project_id);
  return query
  select 'sch:approve:' || v.id, 'scheduling', 'sch_approve', v.project_id, coalesce(mp.short_name, mp.official_name, ''), 'تأیید نسخهٔ برنامه — ' || v.label,
    case v.review_status when 'endorsed' then 'تأییدشده توسط مشاور' else 'بدون الزام بررسی مشاور' end, null::date, v.created_at, v.created_at < now() - interval '3 days', v.id, jsonb_build_object('label', v.label)
  from sch_versions v left join master_projects mp on mp.id = v.project_id
  where v.status = 'draft' and sch_can_approve(v.project_id)
    and (v.review_status = 'endorsed' or (v.review_status = 'submitted' and not coalesce((select c.require_review from sch_contract c where c.project_id = v.project_id), false)));
  return query
  select 'sch:fix:' || v.id, 'scheduling', 'sch_fix', v.project_id, coalesce(mp.short_name, mp.official_name, ''), 'اصلاح و ارسال دوبارهٔ برنامه — ' || v.label,
    coalesce((select r.note from sch_version_reviews r where r.version_id = v.id and r.step = 'return' order by r.at desc limit 1), 'برگشت‌خورده'), null::date, v.created_at, true, v.id, jsonb_build_object('label', v.label)
  from sch_versions v left join master_projects mp on mp.id = v.project_id
  where v.status = 'draft' and v.review_status = 'returned' and sch_can_edit(v.project_id);
  return query
  select 'sch:eot:' || e.id, 'scheduling', 'sch_eot', e.project_id, coalesce(mp.short_name, mp.official_name, ''), 'تصمیم دربارهٔ تمدید زمان — ' || e.title,
    e.claimed_days::text || ' روز ادعا', null::date, e.created_at, e.created_at < now() - interval '7 days', e.id, jsonb_build_object('days', e.claimed_days)
  from sch_delay_events e left join master_projects mp on mp.id = e.project_id
  where e.status = 'assessed' and sch_can_approve(e.project_id);
  -- 069: the report waits for the signed-in person's signature — the next required slot of its chain is theirs.
  --   After a supervision correction (068) every signature is gone and the chain starts again at the contractor:
  --   this is how the contractor learns it. A supervision signer who can review already has the «review» item.
  return query
  select 'ex:sign:' || r.id, 'execution', 'ex_sign', r.project_id, coalesce(mp.short_name, mp.official_name, ''),
    r.report_no || ' — نوبت امضای شما (' || nx.label || ')',
    case when rs.at is not null then 'نسخهٔ اصلاح‌شده توسط نظارت؛ گردش امضا از ابتدا' else 'گزارش منتظر امضای شماست' end
      || ' · ' || coalesce(nullif(r.front, ''), 'بدون جبهه') || ' · ' || r.report_date::text,
    null::date, coalesce(rs.at, ls.at, r.submitted_at, r.created_at), coalesce(rs.at, ls.at, r.submitted_at, r.created_at) < now() - interval '1 day', r.id,
    jsonb_build_object('formKey', r.form_key, 'date', r.report_date, 'front', r.front, 'slot', nx.slot_key, 'slotLabel', nx.label, 'party', nx.party, 'restarted', rs.at is not null, 'clearedNote', rs.note)
  from ex_reports r
  join lateral (select x.slot_key, x.label, x.party, x.user_id from ex_sign_slots x
                where x.project_id = r.project_id and x.form_key = r.form_key and x.active and x.required
                  and not exists (select 1 from ex_report_signatures g where g.report_id = r.id and g.slot_key = x.slot_key)
                order by x.sort limit 1) nx on nx.user_id = auth.uid()
  left join lateral (select h.at, h.note from ex_report_history h where h.report_id = r.id and h.action = 'signatures_cleared'
                       and h.at >= coalesce(r.submitted_at, r.created_at) order by h.at desc limit 1) rs on true
  left join lateral (select max(g.signed_at) at from ex_report_signatures g where g.report_id = r.id) ls on true
  left join master_projects mp on mp.id = r.project_id
  where r.status in ('submitted', 'partially_approved') and (nx.party = 'contractor' or not ex_allows(r.project_id, 'review'));
end $function$
;
