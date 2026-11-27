-- Rollback of 069: inbox_my_items without the «نوبت امضای شما» items of execution reports.
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
end $function$
;
