# مأموریت و بازدید پروژه — Mission & Visit Debrief

ماژول مستقل. همه‌چیز آن در `src/modules/missions` و جدول‌های `ms_*` (بخش ۶۱ `schema.sql`) است.

```
Mission → Visit → Intelligent Interview → Evidence → Project Insight
        → Issue/Risk Discovery → Action → Management Decision → Final Report
```

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
