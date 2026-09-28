import { useState } from 'react'
import { AlertTriangle, BookOpen, ChevronDown, ListTree, MessageSquareQuote, Target } from 'lucide-react'
import { tone } from '../lib/tone'

const COLLAPSE_KEY = 'comp_interview_guidance_collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(v: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
  } catch {
    // per-viewer convenience only — never worth failing the page over
  }
}

/** The scale actually used by comp_competencies.proficiency_levels' own default — the anchors below
 * describe this same 1-5 scale in observable terms, so they never invent a different scale than the
 * one the rating buttons on each card already show. A competency configured with a custom scale still
 * maps onto this 1 (lowest) .. 5 (highest) shape; only the exact level labels shown per card may
 * differ from these defaults. */
const ANCHORS: { rating: number; labelFa: string; color: string; text: string }[] = [
  {
    rating: 1,
    labelFa: 'مبتدی',
    color: '#f43f5e',
    text: 'نمونه‌ی رفتاری ارائه نمی‌دهد یا نمونه‌ای می‌آورد که نشان‌دهنده‌ی نبود این شایستگی است — نمی‌داند در آن موقعیت چه باید می‌کرد یا نتیجه، ضعیف/نامرتبط بوده.',
  },
  {
    rating: 3,
    labelFa: 'ماهر',
    color: '#eab308',
    text: 'حداقل یک نمونه‌ی واقعی و مشخص از عملکرد خودش می‌آورد که اقدام او متناسب با موقعیت بوده و به نتیجه‌ی قابل‌قبولی رسیده — بدون نیاز به هدایت زیاد شما برای رسیدن به جزئیات.',
  },
  {
    rating: 5,
    labelFa: 'استاد',
    color: '#10b981',
    text: 'چند نمونه‌ی واقعی، با جزئیات دقیق و نتیجه‌ی قابل اندازه‌گیری می‌آورد؛ در تصمیم‌گیری‌اش الگو/روش مشخصی دیده می‌شود و از تجربه‌اش برای دیگران هم درس گرفته یا آن‌ها را هدایت کرده.',
  },
]

/**
 * Product owner: "در مصاحبه ساختاریافته نمی‌دونم بر چه اساسی امتیاز بدهم. ابتدای آزمون راهنمایی
 * لازم رو ارائه بده که داوران بر اساس اون امتیاز بدن." — a real judge starting this stage cold has no
 * basis to rate on. Shown prominently above the scoring cards; collapsible per viewer (remembered in
 * localStorage, not a DB column — a UI convenience only, so an experienced judge on a repeat visit
 * isn't forced to scroll past it every time).
 */
export function StructuredInterviewGuidance() {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggle = () => {
    setCollapsed((c) => {
      writeCollapsed(!c)
      return !c
    })
  }

  return (
    <div className="fx-card overflow-hidden" style={tone('#6366f1')}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full min-h-11 items-center justify-between gap-2 p-4 text-right"
      >
        <span className="flex items-center gap-2 text-[13px] font-extrabold">
          <BookOpen size={16} className="fx-tone-text" /> راهنمای امتیازدهی — بر چه اساسی امتیاز بدهم؟
        </span>
        <ChevronDown size={16} className={`fx-tone-text shrink-0 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
      </button>

      {!collapsed && (
        <div className="fx-text-2 space-y-4 px-4 pb-5 text-[12px] leading-7">
          <section>
            <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
              <Target size={14} className="fx-tone-text" /> این مصاحبه دنبال چیست؟
            </p>
            <p>
              آزمون فنی تخصصی می‌سنجد متقاضی چه <b>می‌داند</b>. مصاحبه ساختاریافته چیز دیگری می‌سنجد: متقاضی در موقعیت‌های واقعی گذشته‌ی خودش
              واقعاً <b>چطور رفتار کرده</b>. بنابراین امتیاز هر شایستگی باید بر پایه‌ی یک نمونه‌ی رفتاری واقعی باشد، نه پاسخ نظری («در چنین شرایطی
              معمولاً باید...») و نه دانش تئوری متقاضی درباره‌ی آن شایستگی.
            </p>
          </section>

          <section>
            <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
              <MessageSquareQuote size={14} className="fx-tone-text" /> چطور نمونه‌ی رفتاری بگیرم؟ (روش STAR)
            </p>
            <p className="mb-1.5">
              برای هر شایستگی، از متقاضی بخواهید یک موقعیت واقعی از سابقه‌ی کاری‌اش را با این چهار بخش تعریف کند:
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <b>موقعیت (Situation):</b> چه شرایط/زمینه‌ای بود؟
              </li>
              <li>
                <b>وظیفه (Task):</b> مسئولیت یا هدف خودِ متقاضی در آن موقعیت چه بود؟
              </li>
              <li>
                <b>اقدام (Action):</b> خودِ متقاضی دقیقاً چه کاری انجام داد؟ (نه «ما»، بلکه «من چه کردم»)
              </li>
              <li>
                <b>نتیجه (Result):</b> نتیجه چه بود؟ اگر دوباره پیش بیاید چه چیزی را تغییر می‌دهد؟
              </li>
            </ul>
            <p className="mt-1.5">اگر پاسخ کلی/نظری بود، با «یک نمونه‌ی مشخص از خودتان بگویید که...» او را به یک موقعیت واقعی برگردانید.</p>
          </section>

          <section>
            <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
              <ListTree size={14} className="fx-tone-text" /> امتیاز ۱ تا ۵ یعنی چه؟ (بر اساس همین مقیاس زیر هر شایستگی)
            </p>
            <div className="space-y-2">
              {ANCHORS.map((a) => (
                <div key={a.rating} className="fx-sub flex items-start gap-2.5 p-2.5" style={tone(a.color)}>
                  <span className="fx-tone-bg-strong fx-tone-text num flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-black">
                    {a.rating.toLocaleString('fa-IR')}
                  </span>
                  <div className="min-w-0">
                    <p className="fx-tone-text text-[11.5px] font-bold">{a.labelFa}</p>
                    <p className="text-[11.5px] leading-6">{a.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[10.5px]">
              امتیازهای ۲ و ۴ بین این سه حالت‌اند — مثلاً نمونه هست ولی جزئی/ناقص یا فقط یک‌بار دیده شده (۲)، یا نمونه‌ها خوب‌اند ولی به شفافیت و
              تعداد سطح ۵ نمی‌رسند (۴). عنوان دقیق هر سطح (مثل «مبتدی»/«ماهر») ممکن است برای بعضی شایستگی‌ها متفاوت باشد — همان برچسبی که کنار هر
              دکمه‌ی امتیاز همین شایستگی نوشته شده را ملاک بگیرید.
            </p>
          </section>

          <section>
            <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--text-primary)' }}>
              <AlertTriangle size={14} className="fx-tone-text" /> هشدار: امتیاز بر اساس شایستگی، نه برداشت کلی
            </p>
            <p>
              از تحت تأثیر قرار گرفتن یا برداشت کلی‌تان از متقاضی («آدم خوبی به نظر می‌رسید»، «خوش‌صحبت بود») برای امتیاز یک شایستگی خاص خودداری
              کنید (خطای هاله‌ای/Halo Effect). هر شایستگی را جدا و فقط بر اساس شواهد رفتاری همان شایستگی امتیاز بدهید — همان‌طور که در بخش «شواهد
              رفتاری و دلیل امتیاز» هر کارت می‌نویسید، امتیازتان باید مستقیماً از همان یادداشت قابل استخراج باشد.
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
