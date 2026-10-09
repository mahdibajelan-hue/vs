# معماری ماژول Issue Management («رصد») — نسخهٔ ۲

## اصول
1. **گسترش درجا**: `im_issues` جدول موازی ندارد؛ ستون‌های جدید additive هستند. `status` (۵ مقدار، درشت) برای کدهای قدیمی حفظ شده و `stage` (۱۲ مقدار، ریز) را تریگر `im_issue_guard` به آن نگاشت می‌کند.
2. **سرور مرجع است**: گردش‌کار، نقش‌ها، شروط بستن، کنترل تمدید و جداسازی وظایف در تریگرها/RPCهاست؛ کلاینت فقط دکمه‌های مجاز را نشان می‌دهد (`imWorkflow.ts` آینهٔ همان قواعد است).
3. **تاریخچه فقط‌افزودنی**: `im_issue_events` بدون سیاست نوشتن؛ تریگرها با `security definer` می‌نویسند. حذف مسئله نیز snapshot ثبت می‌کند.
4. **بدون وابستگی پنهان به اعتبار بیرونی**: ایمیل/پیامک/Push/پیام‌رسان و هوش مصنوعی فقط با پیکربندی واقعی کار می‌کنند و در غیر این صورت صادقانه «غیرفعال» نمایش داده می‌شوند.

## جدول‌ها (خلاصهٔ ERD)
```
im_projects(scope_level, master_ref_id) 1─* im_issues ─┬─* im_issue_tasks ─┬─* im_task_deps (DAG، تریگر ضد حلقه)
im_project_members(admin|pursuer|approver)             │                   └─* im_task_updates
                                                      ├─* im_extensions (درخواست/تصمیم تمدید)
                                                      ├─* im_issue_links (mission|risk|lifecycle|land|document|decision|issue)
                                                      ├─* im_attachments → Storage: issue-evidence/<issue_id>/…
                                                      ├─1 im_rca (۵ چرا | استخوان ماهی | آزاد)  ├─* im_capa (اصلاحی/پیشگیرانه)
                                                      ├─* im_issue_events (audit، فقط‌افزودنی)  └─* im_issue_people
im_issues.corporate_issue_id → im_issues (مسئلهٔ مادر، ضد حلقه در کلاینت + check خودارجاعی)
im_decisions ─* im_decision_options ;  im_issue_tasks.blocked_decision_id → im_decisions
im_lessons (پایگاه دانش)  ;  im_templates, im_saved_filters, im_categories, im_sla_policies
im_workflow_stages / im_workflow_transitions (گردش‌کار قابل تنظیم، seed استاندارد)
im_notif_rules · im_notif_prefs · im_notif_outbox · im_notif_state
```

## لایه‌ها
| لایه | فایل‌ها |
|---|---|
| مهاجرت‌ها | `supabase/issue_mgmt/010…021_*.sql` (به‌ترتیب؛ راهنمای اجرا در سربرگ هر فایل) |
| محاسبات خالص + تست | `src/modules/issues/lib/{imModel,imWorkflow,imSla,imKpi,imText,imScoring,imRegister,imDecisions,imPortfolio,imAi,imForecast,imKnowledge}.ts` — تست: `issuesV2.test.mjs` |
| داده/استور | `store/{useIssuesStore,useIssueWorkStore,useIssueConfigStore,useDecisionStore,useKnowledgeStore}.ts` |
| رابط | `IssuesApp.tsx` + `pages/*` + `components/IssueDrawer` و تب‌ها |
| توابع لبه | `supabase/functions/im-notify` (ارسال)، `supabase/functions/im-ai` (هوش مصنوعی) |

## امنیت
- RLS روی همهٔ جدول‌های `im_*`؛ دید از مسیر عضویت پروژه، نقش‌های Owner/Follow-up/Pursuer/Approver و دید پورتفولیویی (`rasta_scope_ok_for_source`).
- تست‌شده با کاربر بیرونی: هیچ مسئله/رویداد/اقدام/تصمیم/اعلان/درسی نمی‌بیند؛ درج، Bulk، Ingest و `im_generate_notifications` برایش رد می‌شود.
- شواهد در باکت خصوصی `issue-evidence` با سیاست بر پایهٔ `im_can_see_issue/im_can_write_issue`؛ دانلود با لینک امضاشدهٔ ۱۲۰ثانیه‌ای.
- هوش مصنوعی: JWT کاربر لازم، ایمیل/تلفن/کارت پیش از ارسال ماسک می‌شود، خروجی به enumهای مجاز محدود و صرفاً «پیشنهاد» است.
