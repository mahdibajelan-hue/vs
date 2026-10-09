# یکپارچگی‌ها و قراردادهای API

| منبع | مسیر | رفتار |
|---|---|---|
| یافتهٔ بازدید/مأموریت | `ms_transfer_finding(finding, 'issue', params)` | Issue با دسته/شدت/رشته، `source_ref_type='finding'`، snapshot و پیوند `derived_from` به مأموریت؛ تکرار با `already_transferred` رد می‌شود |
| ریسک محقق‌شده | `im_convert_risk_to_issue(risk, cause, pursuer, deadline_days)` | idempotent (یک Issue به‌ازای هر ریسک)؛ **ریسک دست‌نخورده می‌ماند** (تست شده)؛ snapshot ارزیابی (احتمال، اثر، امتیاز، راهبرد پاسخ) + پیوند `derived_from`؛ دکمهٔ «ریسک محقق شد → مسئله» در جزئیات ریسک |
| تملک اراضی / مکاتبات / جلسه / گزارش / سامانهٔ بیرونی | `im_ingest_issue(source, external_system, external_id, master_project, payload)` | upsert امن بر پایهٔ `(external_system, external_id)`؛ کاربر باید به پروژه دسترسی داشته باشد و نگاشت `issues` تأییدشده باشد؛ `sync_status`/`synced_at` و `source_snapshot` ثبت می‌شود |
| فایل CSV | `im_bulk_create(project, rows)` | تکراری‌ها (source + source_ref_id) رد؛ پیش‌نمایش و خطای هر ردیف در UI |
| متن آزاد (صورت‌جلسه) | استخراج (`im-ai` یا قاعده‌محور) → تأیید کاربر → `im_bulk_create` | هیچ ثبت خودکاری بدون تأیید |

### نمونهٔ Ingest (از یک سرویس/ETL با JWT یک کاربر مجاز)
```sql
select im_ingest_issue('correspondence', 'EDMS', 'LTR-1001', '<master_project_id>',
  '{"title":"نامهٔ کارفرما دربارهٔ تأخیر","description":"…","priority":"high","category":"contract_commercial","snapshot":{"letter":"LTR-1001"}}');
-- → {"id":"…","created":true}; فراخوانی دوباره همان external_id: {"created":false} و فقط فیلدهای همگام‌شده به‌روز می‌شوند
```
منابع مجاز: `mission_debrief, land_acquisition, risk, correspondence, meeting, report, api, lifecycle_action`. پیام‌های خطا: `invalid_source`, `external_reference_required`, `not_authorized_for_project`, `no_issue_mapping`.

### اعلان‌ها (`im-notify`)
متغیرهای Secret توابع Supabase: `IM_EMAIL_WEBHOOK_URL`, `IM_SMS_WEBHOOK_URL`, `IM_PUSH_WEBHOOK_URL`, `IM_MESSENGER_WEBHOOK_URL` (فقط https) + `IM_<CH>_WEBHOOK_TOKEN` اختیاری، و `IM_CRON_SECRET` برای فراخوانی زمان‌بندی‌شده. بدنهٔ POST به درگاه: `{channel,to,title,body,issue_id,code,level,severity}`. بدون پیکربندی: ردیف‌ها `skipped` با `provider_not_configured:<channel>`.

### هوش مصنوعی (`im-ai`)
Secretها: `GEMINI_API_KEY` یا (`IM_AI_BASE_URL` + `IM_AI_API_KEY` برای سرویس سازگار با OpenAI/On‑prem)، اختیاری `IM_AI_PROVIDER`, `IM_AI_MODEL` (در غیاب، `MISSION_AI_*` استفاده می‌شود). وظیفه‌ها: `suggest`, `summarize`, `extract`, `nl_query`. بدون پیکربندی `{available:false}` و دستیار قاعده‌محور داخلی فعال می‌ماند.
