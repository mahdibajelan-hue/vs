# مأموریت و بازدید پروژه — Mission & Visit Debrief

ماژول مستقل. همه‌چیز آن در `src/modules/missions` و جدول‌های `ms_*` (بخش ۶۱ `schema.sql`) است.

```
Mission → Visit → Intelligent Interview → Evidence → Project Insight
        → Issue/Risk Discovery → Action → Management Decision → Final Report
```

## نقش‌ها و گردش کار

| نقش | کیست | کارها |
|---|---|---|
| کارمند | هر کاربر | ثبت درخواست مأموریت؛ پس از بازگشت، ثبت گزارش بازدید |
| مجری طرح | `ms_roles: executive`، مدیر سامانه، یا مجوز `missions:approve/review` | تأیید اولیه درخواست؛ تأیید گزارش؛ انتقال Issue/Risk |
| امور اداری | `ms_roles: admin_affairs` یا مدیر سامانه | درخواست و ثبت بلیط هواپیما؛ تأیید کلیم مأموریت |

```
کارمند ثبت می‌کند → مجری طرح تأیید می‌کند → امور اداری بلیط را ثبت می‌کند → (مأموریت)
→ کارمند گزارش می‌دهد → مجری طرح تأیید می‌کند → امور اداری کلیم را تأیید می‌کند
```
درخواستی که «بدون بلیط» ثبت شود مرحلهٔ امور اداری اول را رد می‌کند. نقش‌ها در صفحهٔ «نقش‌ها» (فقط مدیر سامانه) تعیین می‌شود.

## ساختار

| پوشه | نقش |
|---|---|
| `lib/` | منطق خالص و بدون I/O: موتور سؤال، موتور مصاحبه، تحلیل پاسخ فارسی، گزارش، امتیاز کیفیت، بینش‌های داشبورد |
| `ai/` | لایهٔ AI مستقل از ارائه‌دهنده (`AiProvider`) + موتور قواعد + درگاه `mission-ai` |
| `repo/` | مرز ذخیره‌سازی: `supabaseRepo` (محصول) و `memoryRepo` (دمو/تست) پشت یک رابط |
| `store/` | Zustand؛ فقط از `repo` و `lib` استفاده می‌کند |
| `pages/`, `components/` | رابط کاربری |
| `platform/` | **تنها درگاه** به برنامهٔ میزبان (Supabase، کاربر، اجزای UI مشترک، تقویم شمسی) |
| `integration/` | نقاط اتصال به پلتفرم: `manifest.ts` و `recordSystems.ts` |

## نقاط اتصال به برنامه (حفظ شده)

| اتصال | کجا | چگونه |
|---|---|---|
| **لانچ‌پد** | `components/Auth/launchpad/cards/MissionDebriefCard.tsx` + `ModuleLaunchpad.tsx` (`area-f`) | متن و رنگ از `integration/manifest.ts` |
| **رادار پروژه** | `components/Auth/radar/ProjectRadarPage.tsx` | آیتم با `moduleKey: 'missions'` |
| **دسترسی ماژول‌ها (RBAC)** | `rasta_modules` / `rasta_permissions` (بخش ۶۱) + `useModuleAccessStore` + `ModuleKey` + `RolesPermissionsPage` | کلید `missions`؛ ادمین همیشه دسترسی دارد |
| **مدیر** | `ms_is_manager()` | ادمین یا مجوز `missions:approve` / `missions:review` |
| **Issue Management** | `integration/recordSystems.ts` → `ms_transfer_finding` | `im_issues` از طریق `rasta_project_mappings` (`issues`) |
| **Risk Management** | همان تابع | `rm_risks` از طریق `rasta_project_mappings` (`risk`) |
| **Action** | همان تابع | `rasta_actions` (`source = 'mission_debrief'`) |
| **وضعیت زنده** | `ms_linked_status` | از سامانهٔ مالک خوانده می‌شود، کپی نمی‌شود |
| **پروژه‌ها** | `master_projects` | فقط خواندن |

این ماژول هیچ‌کدام از store یا جدول‌های ماژول‌های دیگر را import یا تغییر نمی‌دهد؛ تنها دو قید `source` در `im_issues` و `rasta_actions` یک مقدار (`mission_debrief`) گرفته‌اند.

## استقلال

`node scripts/check-module-boundaries.mjs` (یا `npm run lint:boundaries`) تضمین می‌کند هیچ فایلی در ماژول، به‌جز `platform/index.ts`، از بیرون ماژول import نمی‌کند. برای استفاده در برنامهٔ دیگر کافی است `platform/index.ts` و `integration/recordSystems.ts` بازنویسی شوند.

## AI

بدون AI هم همه‌چیز کار می‌کند (قواعد). با تنظیم Secrets تابع `mission-ai`: `MISSION_AI_PROVIDER` (`gemini` یا `openai`)، و برای OpenAI/مدل داخلی `MISSION_AI_BASE_URL`, `MISSION_AI_API_KEY`, `MISSION_AI_MODEL`.

## داده نمونه

ادمین در داشبورد خالی «ساخت داده نمونه» را می‌بیند؛ داده را همان موتور مصاحبه تولید می‌کند و با برچسب `[نمونه]` قابل حذف است.

## Transferred records: origin chip, links, transfer dialog

- **Transfer dialog** (`components/TransferDialog.tsx`): «تأیید و انتقال…» lets the executive choose the target (Issue / Risk / Action), set the deadline (Issue) or probability and impact (Risk), and add a note before `ms_transfer_finding` runs.
- **Link out** (`integration/recordSystems.ts → openRecord`): a transferred finding shows «مشاهده در …». It sets the project context, files a one-shot request in `store/useDeepLinkStore` and switches module; Issues, Risk and Reporting consume the request and open the record.
- **Origin chip** (`integration/originChip.tsx → MissionOriginChip`): Issue, Risk and Action screens and the Radar signal panel render «از بازدید MIS-…» on transferred records (resolved by `ms_record_origin`, schema Section 64); clicking it opens the mission.

## Interview, report and signature (batch redesign)

- **Batch questions** (`lib/batch.ts`, `lib/interviewEngine.ts`): a topic is asked once — all its questions plus a pre-filled answer template (fields, repeating «مصوبه / اقدام» blocks with owner and due date, one block per objective). Decisions/actions typed in the blocks become findings directly. What is still missing afterwards is asked again in one consolidated «gap» round (max two). Topics define `template` / `entries` / `quick` in data (`lib/questionSets.ts`); without them a template is generated from the main questions. Sessions saved before this change continue through the legacy single-question path.
- **Report** (`components/ReportPaper.tsx`, `lib/reportVisuals.ts`, `components/ReportCharts.tsx`): cover band, KPI strip, SVG charts (progress, objectives donut, findings by kind, severity, discipline, probability × impact matrix) and tables for decisions & resolutions, actions, issues and risks with owner and due date — all drawn from the live findings.
- **Signature** (schema Section 65): the user saves a sample signature on the profile (`user_signatures`, owner-only). `ms_transition('submit_report')` refuses without one and freezes it, with name/position/time, into `ms_reports.signature`; a trigger stops clients from writing that column.

## Discipline-aware interviews and report integrity (schema Section 66)

**The visitor's field decides the questions.** `ms_missions.discipline` (general, hse, legal, quality, engineering, procurement, finance, planning, hr_admin; guessed from the position by `lib/discipline.ts`, editable on the request form). `planTopics` skips topics that belong to another specialist field (`TopicDef.field`) unless one of the visitor's objectives names them, adds the legal / finance / hr_admin topics, and `QuestionDef.byDiscipline` / `TemplateField.forDiscipline` re-word shared questions («مشکل اجرایی» becomes «مشکل قراردادی» for a lawyer). Obstacles are therefore not only schedule/execution deviations.

**Safeguards against suppressed reporting**
- *Conflict of interest* — `ms_is_interested()`: the visited project's own manager/director (never the requester, never an admin). On a mission to that project they cannot approve/return/transfer (`conflict_of_interest`), cannot read confidential findings, and only see the mission after final approval — nobody can lean on a report before it is final.
- *Confidential channel* — the `integrity` topic (pressure, limited access, fear of consequences) and any finding flagged «محرمانه». The answer never becomes a conversation turn or a note, never goes to an external AI, never enters the report text/charts/quality score (`reportFindings`); RLS hides it from the interested manager.
- *Tamper-evident audit* — `ms_finding_audit` (trigger on `ms_findings`): every insert/delete and every softening (lower severity, issue→observation, removed confidential flag, rejection). Changes after the first report submission are flagged `suspicious`. The `IntegrityPanel` shows this to the approving executive (report page and «شفافیت» tab).
