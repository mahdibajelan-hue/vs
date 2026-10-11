-- Part E: land acquisition parcels + payments (feeds the finance land ledger) and risk/issue links raised from finance. Run after A–D.
do $seed$
declare
  p constant uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
  u constant uuid := '244bc5e5-d9f2-4931-b417-d7eea2ffd444';
  bl uuid; pid uuid; i int; kmS numeric; est numeric; paid numeric; rp uuid; ip uuid; nid uuid; src uuid;
begin
  if not exists (select 1 from la_parcels where master_project_id = p) then
    select id into bl from fin_budget_lines where master_project_id = p and code = 'KS-LAND';
    insert into la_routes (master_project_id, name, total_km, start_km, is_demo, created_by) values (p, 'کوهدشت–سرخس (۴۸ اینچ)', 412, 0, true, u) on conflict (master_project_id) do nothing;
    for i in 1 .. 9 loop
      kmS := (i - 1) * 44 + 3;
      est := (18 + (i * 7) % 23)::numeric * 1000000000;
      insert into la_parcels (master_project_id, code, title, km_start, km_end, land_type, ownership_class, owner_count_est, owner_known, acquisition_route, area_m2, est_cost, approval_status, kind, is_demo, created_by)
      values (p, 'KS-P' || lpad(i::text, 2, '0'), 'قطعهٔ ' || i || ' (کیلومتر ' || kmS || ' تا ' || (kmS + 6) || ')', kmS, kmS + 6, (array['agricultural','garden','rangeland','agricultural','desert','agricultural','garden','rangeland','agricultural'])[i], case when i in (3, 6) then 'natural_resources' else 'private' end, 3 + i % 4, true, case when i = 5 then 'dispute' when i = 8 then 'art9' else 'normal' end, 52000 + i * 9000, est, case when i <= 6 then 'approved' else 'submitted' end, 'route', true, u)
      returning id into pid;
      if i <= 7 then
        paid := round(est * (case when i <= 4 then 0.95 when i = 5 then 0.3 else 0.6 end) / 1000000) * 1000000;
        insert into la_payments (master_project_id, parcel_id, category, payee, amount, paid_date, ref, note, is_demo, status, budget_line_id, created_by)
        values (p, pid, 'owner', 'مالکین قطعهٔ ' || i, paid, date '2026-02-10' + i * 17, 'LP-' || i || '-1', 'پرداخت بر اساس رأی کارشناسی رسمی', true, 'posted', bl, u);
        insert into la_payments (master_project_id, parcel_id, category, payee, amount, paid_date, ref, note, is_demo, status, budget_line_id, created_by)
        values (p, pid, 'expert', 'هیئت کارشناسان رسمی', round(est * 0.01 / 1000000) * 1000000, date '2026-01-20' + i * 17, 'LP-' || i || '-E', 'دستمزد کارشناس', true, 'posted', bl, u);
      end if;
    end loop;
    insert into la_payments (master_project_id, category, payee, amount, paid_date, ref, note, is_demo, status, void_reason, voided_at, budget_line_id, created_by)
    values (p, 'legal', 'دفتر حقوقی', 3500000000, date '2026-06-02', 'LP-L-9', 'هزینهٔ دادرسی (ثبت اشتباهی)', true, 'voided', 'ثبت تکراری', now(), bl, u);
  end if;
  if exists (select 1 from fin_links where master_project_id = p) then return; end if;
  select source_project_id into rp from rasta_project_mappings where master_project_id = p and source_module = 'risk' and status = 'confirmed' limit 1;
  select source_project_id into ip from rasta_project_mappings where master_project_id = p and source_module = 'issues' and status = 'confirmed' limit 1;
  select id into src from fin_contracts where master_project_id = p and contract_number = 'KS-SUP-PIPE';
  insert into rm_risks (project_id, code, title, description, category, risk_type, initial_probability, initial_impact, created_by)
  values (rp, '', 'ریسک نوسان نرخ یورو در قرارداد تأمین لوله', 'ما‌به‌التفاوت نرخ ارز میان تاریخ صورت‌وضعیت و پرداخت (نرخ پرداخت ۲۵ هزار ریال بالاتر) — پوشش ارزی تعریف نشده است.' || E'\n\n— منبع: ماژول کنترل قراردادها و مالی', 'cost', 'threat', 4, 4, u) returning id into nid;
  insert into fin_links (master_project_id, source_type, source_id, target_type, target_id, label) values (p, 'contract', src, 'risk', nid, 'ریسک نوسان نرخ یورو در قرارداد تأمین لوله');
  select id into src from fin_contracts where master_project_id = p and contract_number = 'KS-EPC-02';
  insert into rm_risks (project_id, code, title, description, category, risk_type, initial_probability, initial_impact, created_by)
  values (rp, '', 'ریسک عبور تعهدات قطعهٔ ۲ از ردیف بودجه', 'مجموع قرارداد و الحاقیه‌ها از ردیف بودجهٔ KS-CON2 فراتر رفته است.' || E'\n\n— منبع: ماژول کنترل قراردادها و مالی', 'cost', 'threat', 4, 5, u) returning id into nid;
  insert into fin_links (master_project_id, source_type, source_id, target_type, target_id, label) values (p, 'contract', src, 'risk', nid, 'ریسک عبور تعهدات قطعهٔ ۲ از ردیف بودجه');
  select id into src from fin_guarantees where number = 'BG-1404-2210';
  insert into im_issues (project_id, title, description, priority, deadline_days, status, created_by, source, category)
  values (ip, 'ضمانت‌نامهٔ حسن انجام قطعهٔ ۲ منقضی شده ولی هنوز فعال است', 'ضمانت‌نامهٔ BG-1404-2210 در ۲۹ شهریور ۱۴۰۵ سررسید شد. تمدید یا تعویض لازم است.' || E'\n\n— منبع: ماژول کنترل قراردادها و مالی', 'critical', 3, 'open', u, 'finance', 'finance') returning id into nid;
  insert into fin_links (master_project_id, source_type, source_id, target_type, target_id, label) values (p, 'guarantee', src, 'issue', nid, 'ضمانت‌نامهٔ حسن انجام قطعهٔ ۲ منقضی شده');
  select c.id into src from fin_payment_certificates c join fin_contracts k on k.id = c.contract_id where k.contract_number = 'KS-EPC-01' and c.certificate_number = 'PC-10' and k.master_project_id = p;
  insert into im_issues (project_id, title, description, priority, deadline_days, status, created_by, source, category)
  values (ip, 'صورت‌وضعیت PC-10 قطعهٔ ۱ تأییدشده ولی پرداخت‌نشده', 'بیش از ۴۰ روز از تأیید گذشته و پرداخت انجام نشده؛ احتمال شکایت پیمانکار و جریمهٔ دیرکرد.' || E'\n\n— منبع: ماژول کنترل قراردادها و مالی', 'high', 7, 'open', u, 'finance', 'finance') returning id into nid;
  insert into fin_links (master_project_id, source_type, source_id, target_type, target_id, label) values (p, 'certificate', src, 'issue', nid, 'صورت‌وضعیت PC-10 تأییدشده ولی پرداخت‌نشده');
end
$seed$;
