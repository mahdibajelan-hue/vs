# برنامهٔ اجرایی تفصیلی اصلاح ماژول اجرا

> وضعیت: **فقط برنامه. هیچ کد، ساختار دیتابیس یا داده‌ای تغییر نکرده است.**
> مبنا: `docs/execution/06-execution-review-and-redesign-proposal.md`.
> هر مرحله پس از دستور جداگانهٔ شما شروع می‌شود و در پایان‌اش متوقف می‌شوم تا تحویل را تأیید کنید (دروازه).
> همهٔ SQLهای این سند **پیش‌نویس طرح‌اند**، اعمال نشده‌اند و پیش از اجرا دوباره بررسی می‌شوند.

---

## ۰. قواعد حاکم بر همهٔ مراحل

### ۰-۱ انضباط تغییر
| قاعده | روش |
|---|---|
| یک مرحله = یک شاخهٔ کاری کوچک روی `claude/piping-isometric-tracker-x8y5i1` با commitهای جدا برای کد، SQL و سند | هر commit مستقل قابل `git revert` |
| تغییر دیتابیس فقط **افزودنی** (جدول/ستون/ایندکس/تابع جدید) | بدون `DROP`/`ALTER ... TYPE`/`UPDATE` گسترده روی جدول‌های موجود |
| ساختار DDL به عبارت‌های کوچک شکسته می‌شود، با `set lock_timeout='10s'` | (تجربهٔ قبلی: دسته‌های بزرگ DDL و DELETE در این دیتابیس ۶۰ ثانیه time-out می‌شوند) |
| برای هر DDL یک فایل **بازگشت** | `supabase/execution/rollback/NNN_*.sql` همراه فایل اصلی `supabase/execution/NNN_*.sql` |
| پیش از هر بک‌فیل/تغییر داده، نسخهٔ پشتیبان همان جدول(های) تحت تأثیر | `create table _bak_<مرحله>_<جدول> as select …` (حذف پس از تأیید دروازه) |
| پرچم‌های ویژگی در `ex_settings.values_json` (بدون DDL) | هر قابلیت جدید پشت یک پرچم خاموش برای پروژه‌های موجود؛ بازگشت = خاموش‌کردن پرچم |
| داده آزمایشی فقط در محیط جدا یا با پیشوند `TEST-` و شناسهٔ پروژهٔ جدا | بخش M2 |
| پایان هر مرحله: تایپ‌چک، همهٔ آزمون‌های موجود، آزمون‌های جدید همان مرحله، بیلد، lint بدون خطای جدید | `npx tsc -p tsconfig.app.json --noEmit` · `node --disable-warning=ExperimentalWarning scripts/run-tests.mjs` · `npx vite build` · `npx oxlint` |
| هر ادعا با شواهد گزارش می‌شود؛ بخش‌هایی که در مرورگر آزموده نشده‌اند صریحاً علامت می‌خورند | |

### ۰-۲ تأثیر بر سایر ماژول‌ها (برنامه‌ریزی‌شده)
| ماژول | چه چیزی را لمس می‌کنیم | چه چیزی را لمس **نمی‌کنیم** |
|---|---|---|
| مسائل (`im_*`) | فقط ایجاد/لینک‌کردن رکورد از طریق همان الگوی `ex_raise` (درج در `im_issues` با `source_ref_type/source_ref_id` برای جلوگیری از تکرار) و استفاده از `im_rca`/`im_capa` از طریق همان استور/RPCهای موجود | ساختار جدول‌ها، RLS، گردش وضعیت |
| ریسک (`rm_*`) | فقط درج از طریق `ex_raise` موجود | ساختار |
| متریال | هیچ | — |
| اعلان صفحهٔ اول | افزودن بلوک به تابع `my_execution_notifications()` (جایگزینی تابع، نه جدول) | سایر توابع اعلان |
| مدیریت پروژه/نگاشت پروژه | خواندن `rasta_project_mappings` (موجود) | — |

### ۰-۳ سطح تأیید (دروازه‌ها)
هر مرحله یک **گزارش تحویل** می‌دهد: فهرست commitها، نتیجهٔ آزمون‌ها، تصویر/PDF شواهد، آنچه آزموده نشده، و SQL بازگشت. مرحلهٔ بعد فقط با دستور شما.

### ۰-۴ مقیاس تلاش و ریسک
تلاش: **S** ≈ ۱ نشست کاری کوتاه · **M** ≈ ۲–۴ نشست · **L** ≈ ۵ نشست یا بیشتر (برآورد نسبی، نه تعهد زمانی). ریسک: کم/متوسط/زیاد برای آسیب به امکانات موجود.

---

## نمای کلی و ترتیب

```
M0 آماده‌سازی و تصمیم‌ها ─┬─► M1 صحت چاپ + رفع ناسازگاری‌ها ───────────────┐
                         └─► M2 محیط آزمایشی + سناریو                        │
M2 ─► M3 رجیستر سرجوش ─► M4 NCR + قواعد ─► M5 کیفیت در گزارش‌های مدیریتی    │
M3 ─► M6 «امروز در کارگاه» + مدارک لازم                                      │
M1 ─► M7 ارتقای معماری فرم‌ها (نگاشت/نسخه/تأیید فرم جدید)                    │
M4,M5 ─► M8 دستیار هوشمند ─► M9 تطبیق با نمونه‌های واقعی و گذار (cutover) ◄──┘
```
مسیر بحرانی: M0 → M1 → M2 → M3 → M4 → M5. M7 و M6 موازی‌پذیرند.

---

## M0 — آماده‌سازی و تصمیم‌ها (بدون کد)

**هدف:** قفل‌کردن تصمیم‌هایی که ساختار بعدی را تعیین می‌کنند و فراهم‌کردن زیرساخت آزمون.

**محدوده**
- تصمیم دربارهٔ پنج اختلاف (سند ۰۶، بخش ۴):
  | کد | پرسش | پیشنهاد |
  |---|---|---|
  | D1 | رجیستر سرجوش اجباری یا ساخته‌شده از فرم‌ها | ساخته‌شده از فرم‌ها (اجباری بعداً برای RT) |
  | D2 | NCR مستقل یا رکورد مبدأ + RCA/CAPA مسائل | رکورد مبدأ در اجرا + اتصال به RCA/CAPA مسائل |
  | D3 | پیشرفت از فرم تأییدشده | فقط «پیشنهاد با تأیید یک‌کلیکی» |
  | D4 | مسیر چاپ قدیمی | غیرفعال‌سازی فرم‌به‌فرم، نه حذف |
  | D5 | ادغام منو | ابتدا «امروز در کارگاه»، ادغام پس از آزمون رفتار |
- تعیین **مسیر محیط آزمایشی** (M2): شاخهٔ Supabase یا پروژهٔ `TEST-` با پاک‌سازی خودکار.
- تعیین نقش‌ها برای NCR: نگاشت نقش‌های موجود (`ex_project_roles`: پیمانکار، سرپرست کارگاه، دستگاه نظارت، مشاور، کارفرما، مدیر اجرا، …) به «بازرس»، «QC پیمانکار»، «تأییدکنندهٔ نهایی» (ببینید M4).
- دریافت از شما: نمونهٔ چاپ/PDF مصوب فرم‌ها، لوگوها، تأیید حذف رکورد تکراری W-404.

**فایل/جدول:** هیچ.

**خروجی:** یک سند تصمیم (۱ صفحه) که این برنامه را به‌روز می‌کند.

**پذیرش:** هر پنج تصمیم ثبت‌شده؛ مسیر آزمایشی انتخاب‌شده.

**بازگشت:** ندارد (فقط سند).

**ریسک/تلاش:** کم / S.

---

## M1 — صحت چاپ و رفع ناسازگاری‌های کوچک

**هدف:** رفع عیوب قابل‌اثبات در قابلیت‌هایی که هم‌اکنون فعال‌اند.

### M1-الف: صفحهٔ اضافه در چاپ
- **شواهد:** چاپ PDF با Chromium: جوشکاری و فیت‌آپ ۲ صفحه؛ ۷ قالب ۲–۳٪ بلندتر از یک صفحه.
- **گام ۱ — تشخیص (بدون تغییر رفتار):** اسکریپت `scripts/print-check.mjs` (Playwright): برای هر قالب با ۱ صفحه داده و (ظرفیت+۱) رکورد، PDF می‌سازد و تعداد صفحه + ارتفاع اندازه‌گیری‌شدهٔ DOM را گزارش می‌کند. فرضیه‌ها: (۱) ارتفاع ردیف‌های pt→px؛ (۲) اثر `border-collapse` و `line-height`؛ (۳) تداخل با قاعدهٔ چاپ `.mt-printable` در `material-control.css`؛ (۴) حاشیهٔ `@page` در برابر `zoom`.
- **گام ۲ — اصلاح:** در `printPlan` (`forms/GridTemplate.tsx`) مقیاس چاپ را علاوه بر عرض، با ارتفاع نیز محدود کند (`min(excelScale, pageW/W, pageH/H)`) برای قالب‌هایی که Excel آن‌ها را روی یک صفحه می‌بسته؛ در صورت نیاز، تنظیم CSS چاپ در `components/TemplatePaper.tsx`.
- **فایل‌ها:** `scripts/print-check.mjs` (جدید) · `src/modules/execution/forms/GridTemplate.tsx` · `src/modules/execution/components/TemplatePaper.tsx` · `src/modules/execution/execution.css` · `src/modules/execution/forms/gridPrint.test.mjs` (جدید؛ آزمون هندسی خالص برای `printPlan`).
- **جدول‌ها:** هیچ.
- **توجه:** مقیاس کمتر = چاپ کمی کوچک‌تر از Excel. این مصالحه با مقایسهٔ نمونهٔ واقعی (M9) باید تأیید شود؛ تا آن زمان فقط «حذف صفحهٔ اضافه» هدف است.

### M1-ب: کلید کارت جوشکار
- **مشکل:** قالب مصوب با کلید `card_welder` ثبت شده؛ کاتالوگ `welder_card`.
- **راه‌حل (بدون دست‌زدن به رکورد قفل‌شده):** (۱) تغییر کلید در `forms/bundled.ts` به `welder_card`؛ (۲) ثبت نسخهٔ جدید پیش‌نویس از کتابخانه؛ (۳) تأیید آن؛ (۴) بازنشسته‌کردن رکورد `card_welder` (بازنشسته‌شدن مجاز است؛ تریگر `ex_form_templates_guard` تغییر کلید را رد می‌کند).
- **جدول:** `ex_form_templates` (فقط درج/بازنشستگی — داده، نه ساختار).
- **فایل:** `forms/bundled.ts` · `forms/gridSpecs.test.mjs` (در صورت لزوم).

### M1-پ: یکتایی مغایرت و جلوگیری از ثبت مضاعف
- **پیش‌نیاز داده:** حذف رکورد تکراری W-404 (با اجازهٔ صریح شما؛ پیش از آن پشتیبان).
- **DDL (افزودنی):** ایندکس یکتای جزئی  
  `create unique index ex_qc_findings_open_uq on ex_qc_findings (tech_report_id, weld_ref, kind) where status='open' and tech_report_id is not null;`
- **UI:** در `pages/QcPage.tsx` غیرفعال‌کردن دکمه حین درخواست؛ مدیریت خطای ۲۳۵۰۵ با پیام «این مغایرت قبلاً ثبت شده است».
- **فایل‌ها:** `supabase/execution/020_qc_findings_unique.sql` + `rollback/020_*.sql` · `store/useEpcStore.ts` (`saveFinding`) · `pages/QcPage.tsx`.

### M1-ت: مسیر ورود تکراری PQR/WQT/کارت
- **تصمیم:** در «فرم‌های طراحی‌شده» فقط قالب‌هایی نمایش داده شوند که **در کاتالوگ فرم داده‌محور نیستند**؛ PQR/WQT/کارت از مسیر کاتالوگ پر شوند.
- **فایل:** `pages/DesignedForms.tsx` (حذف `FREE` set یا فیلتر بر اساس `FORM_BY_KEY`).
- **توجه:** ویژگی «پرکردن سلول‌به‌سلول» (فاز ۱۱) فقط برای قالب‌های بدون فرم کاتالوگی می‌ماند.

**آزمون‌های پذیرش M1**
1. `print-check`: برای هر ۱۱ قالب: ۲۰ رکورد ⇒ ۱ صفحه، ۲۱ رکورد ⇒ ۲ صفحه (برای قالب‌های جدول‌دار)؛ قالب‌های بدون جدول ⇒ همیشه ۱ صفحه.
2. آزمون واحد `printPlan`: برای هر قالب `scale×H ≤ pageH` و `scale×W ≤ pageW`.
3. ثبت دوبارهٔ همان مغایرت باز ⇒ رد با پیام مناسب؛ ثبت پس از بستن مغایرت قبلی ⇒ مجاز.
4. قالب `welder_card` مصوب و فعال؛ `card_welder` بازنشسته؛ چاپ کارت جوشکار از قالب درست.
5. **دروازهٔ انسانی:** مقایسهٔ چشمی PDF خروجی با نمونه‌های شما (در صورت وجود)؛ در غیر این صورت گزارش صریح «مقایسه انجام نشد».

**بازگشت:** `git revert` commit کد؛ `rollback/020` ایندکس را حذف می‌کند؛ برای کلید کارت: بازنشسته‌کردن `welder_card` و ثبت مجدد `card_welder` (رکورد بازنشسته دوباره فعال نمی‌شود → نسخهٔ جدید ثبت می‌شود).

**ریسک/تلاش:** کم / M. **وابستگی:** M0 (برای مجوز حذف).

---

## M2 — محیط آزمایشی و سناریوی سرتاسری

**هدف:** داشتن دادهٔ ساختگی ایزوله که همهٔ مراحل بعد با آن آزموده شوند.

**محدوده**
- **ایزوله‌سازی (به ترتیب ترجیح):** (الف) شاخهٔ Supabase (`create_branch`؛ در دسترس‌بودن و هزینه باید پیش از اجرا بررسی شود — در این گزارش تأیید نشده)؛ (ب) پروژهٔ جداگانهٔ `TEST-100KM` در همین دیتابیس با شناسه‌های قطعی و پیشوند `TEST-` روی همهٔ کدها/عنوان‌ها و **اسکریپت پاک‌سازی بر پایهٔ `project_id`**.
- **سناریو:** (طبق سند ۰۶، بخش ۳) پروژهٔ ۴۸″، ۱۰۰ کیلومتر، سه جبهه، ۶ روز کاری؛ جدول رویدادها:
  | روز | رویداد | هدف آزمون |
  |---|---|---|
  | ۱ | ریسه ۲۰۰ شاخه؛ ۴۰ فیت‌آپ؛ ۴۰ جوش (جبههٔ A) | رجیستر و ورود تکراری |
  | ۱ | RT: ۳۷ قبول، ۱ عیب منفرد (RS) | مغایرت منفرد، مسیر کوتاه |
  | ۲–۶ | نرخ تعمیر ۳٪→۱۲٪ برای جوشکار W-07 | قاعدهٔ نرخ |
  | ۳–۶ | عیب پوشش یکسان در ۴ سرجوش پیاپی | قاعدهٔ تکرار ⇒ NCR+RCA |
  | ۴ | NCR ← RCA ← CAPA ← اثربخشی | حلقهٔ کامل |
  | ۴ | یک Issue و یک Risk مرتبط | لینک بدون کپی |
  | ۶ | گزارش روزانه/هفتگی/داشبورد | خروجی مدیریتی |
- **فایل‌ها:** `supabase/seed/execution_test_scenario.sql` (قطعی، idempotent، همه با شناسه‌های ثابت) · `supabase/seed/execution_test_purge.sql` · `scripts/test-scenario-check.mjs` (شمارش و تأیید) · سند نتایج `docs/execution/08-scenario-baseline-results.md`.
- **اجرا:** سناریو **قبل** از هر اصلاح روی سامانهٔ فعلی اجرا و «خط پایه»ٔ مشکلات ثبت می‌شود؛ بعد از هر مرحله دوباره.

**آزمون‌های پذیرش**
1. شمارش ردیف‌ها مطابق جدول سناریو؛ هیچ ردیف با `project_id` غیر TEST تغییر نکرده (مقایسهٔ `count(*)` و `max(updated_at)` پیش/پس برای جدول‌های `ex_*` در پروژه‌های دیگر).
2. اجرای purge ⇒ صفر ردیف TEST در همهٔ جدول‌ها؛ اجرای مجدد seed ⇒ همان نتیجه.
3. گزارش خط پایه: برای هر مرحلهٔ جدول سناریو: «کار می‌کند / دستی / وجود ندارد».

**بازگشت:** اجرای purge (یا حذف شاخه).

**ریسک:** کم (ایزوله) / M. **وابستگی:** M0.

---

## M3 — رجیستر سرجوش (هویت یک‌بار)

**هدف:** سکشن/سرجوش/لوله یک‌بار ثبت شود و همهٔ فرم‌ها به آن ارجاع دهند؛ بدون تغییر JSON موجود.

### ساختار پیشنهادی (افزودنی)
```sql
-- 021_weld_registry.sql  (پیش‌نویس)
create table ex_welds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  section_no text not null,
  weld_no text not null,
  pipe_no text not null default '',
  km numeric,
  front text not null default '',
  size_in numeric, thk_in numeric,
  wps_no text not null default '',
  first_report_id uuid references ex_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, section_no, weld_no)
);
create table ex_line_welds (               -- جدول ربط: ex_report_lines بدون تغییر می‌ماند
  line_id uuid primary key references ex_report_lines(id) on delete cascade,
  weld_id uuid not null references ex_welds(id) on delete cascade,
  project_id uuid not null
);
create table ex_weld_conflicts (           -- ناسازگاری‌ها: همان سرجوش با لولهٔ متفاوت، تکرار مشکوک …
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null, weld_id uuid references ex_welds(id) on delete cascade,
  kind text not null, detail text not null default '', created_at timestamptz not null default now(), resolved boolean not null default false
);
-- RLS: خواندن همه؛ نوشتن با ex_allows(project,'record') یا ex_can_configure (همان الگوی ex_report_links)
```
- **همگام‌سازی:** تابع `ex_weld_sync(p_report uuid)` (SECURITY DEFINER، idempotent) که برای ردیف‌های فرم‌های «جوشی» (`fitup`, `welding`, `weld_repair`, `tie_in`, `rt_request`, `rt_report`, `fj_coating`, …) کلید `(sec, weldNo)` را از `detail` می‌خواند، `ex_welds` را upsert و `ex_line_welds` را می‌سازد. **نرمال‌سازی کلید:** حذف فاصله/ZWNJ، یکسان‌سازی ارقام فارسی/عربی/لاتین، `W-404`≡`w404` (فقط برای تطابق؛ مقدار نمایشی دست‌نخورده).
- **بک‌فیل:** اجرای `ex_weld_sync` روی گزارش‌های موجود (پشتیبان‌گیری از جدول‌های جدید غیرضروری؛ جدول‌های موجود فقط خوانده می‌شوند).

### کد
- `src/modules/execution/lib/welds.ts` + `lib/welds.test.mjs` (نرمال‌سازی کلید، گروه‌بندی، تشخیص ناسازگاری، ماتریس مراحل هر سرجوش).
- `src/modules/execution/epcTypes.ts` (`WeldRow`, `WeldConflictRow`) · `store/useEpcStore.ts` (واکشی/همگام‌سازی).
- `components/ReportEditor.tsx`: برای ستون‌های `sec`/`weldNo`/`pipeNo` در فرم‌های جوشی، **پیشنهاد (datalist) از سرجوش‌های شناخته‌شده** و پرکردن خودکار لوله/اندازه/ضخامت پس از انتخاب (بدون اجبار).
- `pages/WeldsPage.tsx` (جدید): جدول سرجوش‌ها با ستون‌های مراحل (فیت‌آپ · جوش · VT · RT · تعمیر · پوشش) و فیلتر جبهه/کیلومتر/جوشکار؛ نمایش ناسازگاری‌ها.
- `ExecutionApp.tsx`: زیربخش «سرجوش‌ها» (تحت پرچم `flags.weldRegistry`).

### آزمون‌های پذیرش
1. بک‌فیل idempotent: دو بار اجرا ⇒ شمار `ex_welds` برابر `count(distinct normalize(sec,weldNo))` از ردیف‌های مبنا.
2. روی TEST: ۴۰ جوش ⇒ ۴۰ رکورد؛ ثبت فرم RT برای همان سرجوش‌ها ⇒ **هیچ سرجوش جدید** و ماتریس سطر هر سرجوش تکمیل می‌شود.
3. ورود تکراری ‌‌`W-404` در فرم دوم ⇒ به همان رکورد وصل می‌شود؛ ورود همان با لولهٔ دیگر ⇒ ناسازگاری ثبت می‌شود (نه بازنویسی).
4. تعداد دفعات تایپ هویت سرجوش برای یک جوش از فیت‌آپ تا پوشش (آزمون رفتاری روی TEST): ≤ ۱ (بقیه انتخاب).
5. گزارش‌های قدیمی (بدون رجیستر) باز می‌شوند و **چاپ آن‌ها بدون تغییر** است (مقایسه HTML/PDF پیش‌وپس).
6. RLS: کاربر بدون نقش نوشتن نمی‌تواند؛ خواندن مجاز.
7. `unit tests`: ≥ ۱۵ مورد برای نرمال‌سازی (ارقام فارسی، فاصله، حروف).

**بازگشت:** خاموش‌کردن `flags.weldRegistry`؛ `rollback/021` سه جدول و تابع را حذف می‌کند (هیچ جدول موجود تغییر نکرده، پس حذف بی‌اثر بر قبلی‌هاست).

**ریسک:** متوسط (کیفیت داده‌های تاریخی؛ کلیدهای ناسازگار) / L. **وابستگی:** M0 (D1)، M2.

---

## M4 — NCR، قواعد آستانه و اتصال به RCA/CAPA مسائل

**هدف:** بستن حلقهٔ کیفیت بدون تکرار پرونده.

### ساختار پیشنهادی
```sql
-- 022_ncr.sql  (پیش‌نویس)
create table ex_ncr (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  code text not null,                         -- NCR-<پروژه>-<ترتیب> (تابع تولید کد؛ unique per project)
  finding_id uuid references ex_qc_findings(id) on delete set null,
  weld_id uuid references ex_welds(id) on delete set null,      -- پس از M3
  tech_report_id uuid references ex_reports(id) on delete set null,
  kind text not null check (kind in ('defect','nonconformity','observation')),
  severity text not null check (severity in ('low','medium','high')),
  description text not null default '',
  disposition text check (disposition in ('repair','accept_deviation','reject','rework')),
  status text not null default 'open' check (status in ('open','dispositioned','capa','verifying','closed','void')),
  owner_id uuid, due_date date,
  rca_required boolean not null default false,
  issue_id uuid,                              -- لینک به im_issues (ایجاد فقط در صورت لزوم؛ بدون کپی متن)
  risk_id uuid,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  closed_at timestamptz, unique (project_id, code)
);
create table ex_ncr_events (id uuid primary key default gen_random_uuid(), ncr_id uuid not null references ex_ncr(id) on delete cascade, at timestamptz not null default now(), by uuid default auth.uid(), from_status text, to_status text, note text not null default '');
```
- **RPCها (SECURITY DEFINER با کنترل `ex_allows`):** `ex_ncr_from_finding(p_finding)` (idempotent: دوباره‌صدا ⇒ همان NCR)؛ `ex_ncr_transition(p_ncr,p_to,p_note)` (گذارهای مجاز فقط)؛ `ex_ncr_open_issue(p_ncr)` — درج در `im_issues` با `source_ref_type='ex_ncr'`, `source_ref_id=<ncr id>` و جلوگیری از تکرار (همان منطق `ex_raise`؛ پیام `no_issue_mapping` اگر نگاشت پروژه نباشد).
- **RCA/CAPA:** فقط وقتی `rca_required` (یا کاربر بخواهد) ⇒ Issue ساخته می‌شود و RCA/CAPA همان صفحهٔ `issues/components/drawer/AnalysisTab` است؛ در اجرا فقط «وضعیت RCA/CAPA و اثربخشی» **خوانده و نمایش** داده می‌شود (بدون تکرار فرم).
- **قواعد آستانه (بدون DDL):** در `ex_settings.values_json.qcRules = {repairRatePct, repeatN, windowDays, requireNcrOnHigh}`؛ پیش‌فرض‌ها پیشنهادی: ۸٪ نرخ تعمیر (پنجرهٔ ۵ روز)، ۳ تکرار در ۷ روز.
- **کد خالص:** `lib/qcRules.ts` + `lib/qcRules.test.mjs`: ورودی = ردیف‌های فرم + مغایرت‌ها؛ خروجی = هشدارها `[{kind:'rate'|'repeat'|'single', subject, evidence[]}]` (اثبات‌پذیر: هر هشدار فهرست ردیف‌های مبنا را دارد).
- **نقش‌ها (بدون نقش جدید):** ثبت NCR: `supervision` (بازرس) و `contractor`/`site_head`؛ تعیین تکلیف: `supervision`/`consultant`؛ بستن/تأیید اثربخشی: `consultant`/`employer`؛ تنظیم آستانه: `manager`. (نیاز به تأیید در M0.)
- **اعلان:** جایگزینی `my_execution_notifications()` (019) با افزودن NCR‌های باز نزدیک مهلت/عقب‌افتاده.
- **فایل‌ها:** `supabase/execution/022_ncr.sql` + rollback · `epcTypes.ts` · `store/useEpcStore.ts` (یا `useQcStore.ts` جدا برای کاهش وابستگی) · `lib/qcRules.ts(+test)` · `pages/QcPage.tsx` (بازطراحی به «مغایرت‌ها و NCR») · `components/NcrDrawer.tsx` (جدید) · `supabase/execution/023_qc_notifications_v2.sql`.

### آزمون‌های پذیرش
1. **سناریو TEST:** عیب منفرد ⇒ مغایرت + مسیر کوتاه (تعیین تکلیف تعمیر ⇒ تأیید بازرس ⇒ بسته)، **بدون** Issue/RCA.
2. نرخ تعمیر: ۳٪ ثابت ⇒ بدون هشدار؛ ۳٪→۱۲٪ ⇒ هشدار با فهرست شواهد؛ مرز (برابر آستانه) طبق تعریف.
3. ۴ تکرار عیب پوشش ⇒ NCR الزامی + `rca_required=true`؛ ۲ تکرار ⇒ فقط مشاهده.
4. NCR → Issue: دوبار فراخوانی ⇒ **یک** Issue (dedupe)؛ لینک دوطرفه؛ حذف Issue ⇒ NCR سالم می‌ماند.
5. گذار غیرمجاز (مثلاً `open → closed`) ⇒ خطا؛ رویدادها ثبت می‌شوند.
6. RLS و نقش: بدون نقش ⇒ ممنوع؛ هر نقش فقط گذارهای خودش.
7. ماژول مسائل دست‌نخورده: آزمون‌های موجود issues سبز؛ جدول‌های `im_*` بدون تغییر ساختار (مقایسهٔ `information_schema`).
8. اعلان: NCR عقب‌افتاده در صفحهٔ اول ظاهر شود.

**بازگشت:** خاموش‌کردن `flags.ncr`؛ `rollback/022` جدول‌ها/توابع را حذف می‌کند؛ Issueهای ساخته‌شده از NCR **باقی می‌مانند** (متعلق به ماژول مسائل؛ حذف دستی با تأیید شما).

**ریسک:** متوسط (وابستگی به نگاشت پروژه Issue، قواعد حساس به آستانه) / L. **وابستگی:** M1-پ، M3، D2.

---

## M5 — کیفیت در داشبورد و گزارش‌های مدیریتی، با برچسب وضعیت داده

**هدف:** مدیر کیفیت را ببیند و هر عدد «چه‌قدر قابل اتکاست» داشته باشد.

**محدوده**
- تعریف **وضعیت داده** در یک تابع مشترک `lib/dataStatus.ts`: `approved` (ردیف تأییدشده در گزارش تأییدشده) · `submitted` · `draft`. شاخص‌های کیفیت فقط با `approved` «رسمی» نامیده می‌شوند؛ بقیه با برچسب «موقت».
- شاخص‌ها: قبولی RT، نرخ تعمیر (کل/جوشکار/جبهه)، رد VT، NCR باز/دیرکرد، میانگین زمان بستن، سرجوش‌های بدون RT (از M3).
- **فایل‌ها:** `pages/DashboardPage.tsx` · `pages/MgmtReportPage.tsx` · `lib/periodReport.ts` · `pages/PeriodReportsPage.tsx` · `lib/engine/aggregate.ts` (فقط افزودن) · `lib/dataStatus.ts(+test)` · `components/epc/ExecutionPulse.tsx` (اختیاری).
- **جدول‌ها:** هیچ (خواندنی).

**آزمون‌های پذیرش**
1. روی TEST: اعداد داشبورد = محاسبهٔ دستی از جدول سناریو (آزمون خودکار با مقادیر مورد انتظار ثابت).
2. تغییر وضعیت یک گزارش از `draft` به `approved` ⇒ شاخص رسمی دقیقاً به‌اندازهٔ ردیف‌های آن تغییر کند؛ شاخص «موقت» جدا بماند.
3. گزارش‌های دوره‌ای قبلی (کارکرد/پیشرفت) **بدون تغییر عددی** (مقایسهٔ خروجی پیش‌وپس روی داده‌های موجود).
4. خروجی چاپی/اکسل گزارش مدیریتی شامل بخش کیفیت و برچسب‌ها.

**بازگشت:** پرچم `flags.qcReports`؛ `git revert`.

**ریسک:** کم / M. **وابستگی:** M3، M4.

---

## M6 — «امروز در کارگاه» و کنترل مدارک لازم

**هدف:** نقطهٔ شروع ساده؛ فرم‌ها از فعالیت پیدا شوند؛ کمبود فرم دیده شود.

### ساختار پیشنهادی
```sql
-- 024_required_forms.sql (پیش‌نویس)
create table ex_required_forms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  activity_id uuid references ex_activities(id) on delete cascade,   -- یا stage_key
  stage_key text,                                                     -- «جوشکاری»، «پوشش سرجوش»، …
  form_key text not null,
  mandatory boolean not null default true
);
create unique index ex_required_forms_uq on ex_required_forms (project_id, coalesce(activity_id::text,''), coalesce(stage_key,''), form_key);
```
- **کد:** `pages/TodayPage.tsx` (جدید؛ جبهه ← فعالیت‌های امروز [از برنامهٔ سه‌هفته‌ای و ردیف‌های گزارش] ← مقدار ← «فرم‌های لازم» با وضعیت ✓/ناقص) · `lib/requiredForms.ts(+test)` · گسترش `lib/completeness.ts` (نوع موجود `form_missing` به‌کار می‌افتد) · صفحهٔ پرکردن دسته‌ای نگاشت در تنظیمات با ویزارد جست‌وجوی فعالیت (موجود) + **پیشنهاد** نگاشت از روی کلیدواژه (فقط پیشنهاد).
- `ExecutionApp.tsx`: افزودن «امروز در کارگاه» (پرچم `flags.today`)؛ منوی قبلی دست‌نخورده (D5).

**آزمون‌های پذیرش**
1. روی TEST: برای هر فعالیت جوش، فرم‌های لازم نمایش داده شود؛ ایجاد فرم از آنجا ⇒ تاریخ/جبهه/پیمانکار/لینک ردیف خودکار؛ **صفر فیلد تکراری** (آزمون رفتاری).
2. سرجوش بدون RT / فعالیت بدون فرم الزامی ⇒ در «کامل‌بودن و کسری» ظاهر شود؛ پس از ثبت فرم ⇒ ناپدید شود.
3. مقایسهٔ تعداد کلیک و تغییر صفحه برای «ثبت یک فرم فنی از ردیف کارکرد» قبل/بعد (ثبت‌شده در سند نتایج).
4. نرخ فرم‌های پیش‌نویس رها شده روی TEST (قبل/بعد) ثبت شود.

**بازگشت:** پرچم؛ `rollback/024`؛ `git revert`.

**ریسک:** متوسط (کیفیت نگاشت فعالیت↔فرم) / L. **وابستگی:** M3 (برای RT/سرجوش)، D5.

---

## M7 — ارتقای معماری فرم‌ها

**هدف:** تأیید نگاشت، ثبت نسخهٔ فرم هر سابقه، مسیر معرفی فرم جدید.

**محدوده**
1. **نوع فیلد در کاتالوگ:** افزودن `source?: 'auto' | 'manual' | 'calc' | 'confirm'` به `FieldDef` (`lib/formCatalog.ts`) و پرکردن برای ۲۳ فرم؛ نمایش در جدول بازبینی نگاشت. آزمون: هر فیلد یک نوع معتبر.
2. **تأیید نگاشت:** جدول `ex_form_mapping_approvals(template_id, approved_by, approved_at, note)`؛ UI در `pages/TemplateLibrary.tsx`: دکمهٔ «تأیید نگاشت» توسط نقش مجاز؛ هشدار روی قالب‌های فعال بدون نگاشت تأییدشده.
3. **نسخهٔ قالب هر سابقه:** (الف) ثبت `template_id` هنگام **ایجاد**؛ (ب) تریگر روی `ex_reports`: پس از وضعیت `submitted` تغییر `template_id` رد شود — **تغییر روی جدول موجود است؛ ریسک متوسط**؛ جایگزین کم‌ریسک‌تر: فقط کنترل در RPC `ex_report_submit` (موجود) بدون تریگر. پیشنهاد: ابتدا گزینهٔ RPC.
4. **فرم جدید:** گردش «درخواست (`ex_form_proposals` موجود) ← طراحی/بارگذاری ← نگاشت ← تأیید دو مرحله‌ای (مسئول فرم + مدیر اجرا) ← انتشار»؛ فرم طراحی‌شده تا پیش از تأیید دوم فقط پیش‌نویس.
5. **مسیر چاپ قدیمی:** پرچم `ex_settings.values_json.legacyPaper[formKey]=false` پس از تأیید تطابق (M9)؛ `components/ReportPaper.tsx` به پرچم احترام بگذارد؛ **حذف کد قدیمی انجام نمی‌شود**.
- **فایل‌ها:** `lib/formCatalog.ts` · `forms/gridSpecs.ts` · `pages/TemplateLibrary.tsx` · `store/useEpcStore.ts` · `components/ReportPaper.tsx` · `supabase/execution/025_mapping_approvals.sql` + rollback · (اختیاری) تغییر RPC `ex_report_submit` در `supabase/execution/026_submit_template_guard.sql`.

**آزمون‌های پذیرش**
1. هر فیلد کاتالوگ نوع دارد؛ آزمون خودکار.
2. قالب بدون نگاشت تأییدشده ⇒ هشدار؛ پس از تأیید ⇒ بدون هشدار.
3. گزارش ارسال‌شده ⇒ `template_id` ثابت؛ تلاش برای تغییر ⇒ خطا؛ چاپ سابقهٔ قدیمی با همان نسخه حتی پس از ثبت نسخهٔ جدید قالب (آزمون: دو نسخه، چاپ هر دو سابقه).
4. گزارش‌های قدیمی بدون `template_id` ⇒ چاپ مسیر قدیمی/پیش‌فرض، بدون خطا.
5. فرم جدید: بدون تأیید دوم ⇒ برای کاربران عادی در دسترس نیست.

**بازگشت:** `git revert`؛ `rollback/025-026` (حذف جدول تأیید، بازگشت RPC به نسخهٔ پیشین ذخیره‌شده در همان فایل rollback).

**ریسک:** متوسط / M. **وابستگی:** M1، D4.

---

## M8 — دستیار هوشمند (با نظارت انسانی)

**هدف:** پیش‌نویس و خلاصه و تشخیص ناقص؛ هرگز تصمیم رسمی.

**پیش‌شرط:** فعال‌سازی کلید مدل در Supabase توسط شما از طریق مدیریت secrets (کلید را در گفتگو نفرستید).

**محدوده**
- تابع لبه `supabase/functions/ex-assistant` (موجود؛ نیازمند secret).
- موارد مجاز: پیش‌نویس شرح NCR از روی ردیف مردود؛ خلاصهٔ روزانه/هفتگی؛ پیشنهاد «فرم لازم»؛ تحلیل روند تعمیر (با ارجاع به ردیف‌های مبنا)؛ فهرست فیلدهای ناقص.
- **قیود:** خروجی همیشه در فیلد «پیش‌نویس» با نشان `ai_generated` و منبع؛ ذخیرهٔ مقدار رسمی/تأیید/تعیین تکلیف توسط AI ممنوع؛ ثبت `prompt/response` در `ex_audit` برای ردیابی.
- **فایل‌ها:** `pages/AssistantPage.tsx` · `lib/engine/assistant.ts` · `components/NcrDrawer.tsx` (دکمهٔ «پیش‌نویس پیشنهادی») · `supabase/functions/ex-assistant/*`.

**آزمون‌های پذیرش**
1. بدون secret ⇒ پیام روشن، بدون خطای صفحه.
2. هر پیشنهاد منبع (شناسهٔ ردیف/گزارش) دارد.
3. تلاش برای ذخیرهٔ تأیید/وضعیت از مسیر AI ⇒ رد می‌شود (آزمون سمت سرور و UI).
4. داده شخصی/محرمانه خارج از دامنهٔ مجاز به مدل فرستاده نمی‌شود (بازبینی دستی payload نمونه).

**بازگشت:** پرچم `flags.assistant`؛ حذف secret.

**ریسک:** کم تا متوسط (کیفیت پیشنهاد، حریم داده) / M. **وابستگی:** M4، M5، کلید AI.

---

## M9 — تطبیق با نمونه‌های واقعی و گذار

**هدف:** تأیید نهایی تطابق چاپ و گذار کنترل‌شده.

**محدوده**
1. برای هر فرم: چاپ PDF سیستم از داده نمونه ⇄ نمونهٔ چاپ‌شدهٔ مصوب شما؛ فهرست تفاوت‌ها (ابعاد، فونت، لوگو، شکستن صفحه، مهرها، جمع‌ها).
2. اصلاح فقط تفاوت‌های نگاشت/چاپ؛ تأیید نگاشت‌ها (M7) و تأیید کتبی هر فرم.
3. `legacyPaper[formKey]=false` برای فرم‌های تأییدشده؛ نگه‌داشتن مسیر قدیمی برای بقیه.
4. **پایلوت میدانی:** یک جبهه/یک هفته با کاربران واقعی؛ اندازه‌گیری: زمان ثبت یک روز، تعداد کلیک، تعداد ورود هویت سرجوش، نرخ پیش‌نویس رها شده؛ مقایسه با خط پایهٔ M2.
5. پاکسازی: حذف جدول‌های پشتیبان `_bak_*` پس از تأیید؛ حذف داده TEST.

**آزمون‌های پذیرش:** هر فرم «مطابق / مطابق با تفاوت پذیرفته‌شده» با امضای شما؛ معیارهای پایلوت بهتر از خط پایه (آستانه‌ها را در M0 با هم تعیین می‌کنیم).

**بازگشت:** بازگرداندن پرچم `legacyPaper`؛ بدون تغییر داده.

**ریسک:** کم / M. **وابستگی:** همهٔ مراحل قبلی، فایل‌های شما.

---

## جدول مرجع: فایل‌ها و جدول‌های هر مرحله

| مرحله | DDL (فایل جدید) | جدول‌های جدید | جدول‌های موجود (فقط داده/خواندن) | فایل‌های کد اصلی |
|---|---|---|---|---|
| M0 | — | — | — | سند تصمیم |
| M1 | 020 (ایندکس) | — | `ex_qc_findings` (داده)، `ex_form_templates` (داده) | `GridTemplate.tsx`, `TemplatePaper.tsx`, `execution.css`, `bundled.ts`, `QcPage.tsx`, `DesignedForms.tsx`, `scripts/print-check.mjs` |
| M2 | — | — | seed/purge TEST | `supabase/seed/execution_test_*.sql`, `scripts/test-scenario-check.mjs` |
| M3 | 021 | `ex_welds`, `ex_line_welds`, `ex_weld_conflicts` | `ex_report_lines` (فقط خواندن) | `lib/welds.ts`, `ReportEditor.tsx`, `WeldsPage.tsx`, `useEpcStore.ts`, `ExecutionApp.tsx` |
| M4 | 022, 023 | `ex_ncr`, `ex_ncr_events` | `ex_qc_findings`, `im_issues` (درج از طریق الگوی موجود)، `im_rca`/`im_capa` (خواندن) | `lib/qcRules.ts`, `QcPage.tsx`, `NcrDrawer.tsx`, `useEpcStore.ts` |
| M5 | — | — | خواندن | `DashboardPage.tsx`, `MgmtReportPage.tsx`, `periodReport.ts`, `PeriodReportsPage.tsx`, `dataStatus.ts` |
| M6 | 024 | `ex_required_forms` | `ex_form_activity_map`, `ex_report_links` | `TodayPage.tsx`, `requiredForms.ts`, `completeness.ts`, `SettingsPage.tsx`, `ExecutionApp.tsx` |
| M7 | 025 (+026) | `ex_form_mapping_approvals` | `ex_reports.template_id`، RPC `ex_report_submit` (اختیاری) | `formCatalog.ts`, `gridSpecs.ts`, `TemplateLibrary.tsx`, `ReportPaper.tsx` |
| M8 | — | — | `ex_audit` | `AssistantPage.tsx`, `assistant.ts`, `supabase/functions/ex-assistant` |
| M9 | — | — | حذف `_bak_*` | — |

## ریسک‌های برنامه و کاهش
| ریسک | احتمال | اثر | کاهش |
|---|---|---|---|
| کلیدهای سرجوش در داده‌های تاریخی ناسازگار | متوسط | رجیستر پر از ناسازگاری | نرمال‌سازی محافظه‌کارانه؛ ناسازگاری ثبت می‌شود نه ادغام خودکار؛ بک‌فیل قابل تکرار |
| نبود نگاشت Issue/Risk برای پروژه | بالا | NCR→Issue شکست می‌خورد | پیام صریح + NCR بدون Issue کار کند (Issue اختیاری) |
| کاهش مقیاس چاپ برای یک‌صفحه‌شدن مغایر نمونهٔ شما باشد | متوسط | عدم پذیرش فرم | M9 تصمیم نهایی؛ تا آن زمان گزارش صریح تفاوت |
| قواعد آستانه هشدار کاذب | متوسط | بی‌اعتمادی | آستانه قابل‌تنظیم + نمایش شواهد + دورهٔ «فقط نمایش» پیش از اعلان |
| time-out دیتابیس در DDL | بالا (تجربه‌شده) | نیمه‌کاره‌ماندن | عبارت‌های کوچک، `lock_timeout`، فایل بازگشت، کنترل هر عبارت |
| افزایش پیچیدگی رابط | متوسط | مخالف هدف | پرچم ویژگی؛ آزمون کلیک/زمان در هر دروازه؛ حذف قابلیتی که شاخص را بهتر نکرد |

## آنچه این برنامه **انجام نمی‌دهد**
- حذف یا بازنویسی گستردهٔ کد/داده؛ تغییر ساختار جدول‌های `im_*`/`rm_*`؛ تأیید خودکار هر چیز توسط AI؛ ادغام منو پیش از آزمون رفتار.

## چیزهایی که برای شروع لازم است (از شما)
۱. تصمیم D1–D5 و نگاشت نقش‌ها (M0). ۲. اجازهٔ حذف تکراری W-404 (M1). ۳. انتخاب مسیر محیط آزمایشی (M2). ۴. نمونه‌های چاپ‌شده/لوگوها (M9، ترجیحاً زودتر برای M1). ۵. فعال‌سازی کلید AI توسط خودتان (M8).
