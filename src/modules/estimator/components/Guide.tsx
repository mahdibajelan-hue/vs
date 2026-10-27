import { useState } from 'react'
import { BookMarked, ChevronDown, Compass, FileSliders, FolderPlus, Layers3, Lightbulb, ListChecks, Sigma, Spline } from 'lucide-react'
import { METHOD_META } from '../lib/methods'
import { BORDER, INK, INK_SOFT, MUTED_FG, SAFETY, SURFACE, SURFACE_2 } from '../lib/theme'

const KEY = 'est.guide.open'
const readOpen = () => { try { return localStorage.getItem(KEY) !== '0' } catch { return true } }

const STEPS = [
  { icon: <FolderPlus size={18} />, title: 'تعریف پروژه', text: 'نام پروژه و دامنهٔ آن را انتخاب کنید: خط خشکی یا دریایی، ایستگاه تقویت فشار، انشعاب‌ها و مخابرات. الگوهای آماده این کار را یک‌کلیکی می‌کنند.' },
  { icon: <Compass size={18} />, title: 'نرخ یورو و روش', text: 'هر برآورد با نرخ روز یورو در سامانه شروع می‌شود. مرحلهٔ تعریف پروژه (مفهومی تا طراحی پایه) و روش برآورد را هم همین‌جا انتخاب می‌کنید.' },
  { icon: <FileSliders size={18} />, title: 'مشخصات فنی', text: 'فقط مشخصات همین پروژه: طول، قطر، ضخامت، توپوگرافی، تملک اراضی، ایستگاه‌ها و زمان‌بندی. نرخ‌های واحد از «مبانی برآورد» می‌آیند و پرسیده نمی‌شوند.' },
  { icon: <ListChecks size={18} />, title: 'برآورد، نسخه و گزارش', text: 'روش‌ها را کنار هم ببینید، مبنا را انتخاب کنید، نسخه ذخیره کنید و گزارش دوصفحه‌ای را چاپ یا به PDF و اکسل بگیرید.' },
]

const METHODS = [
  { k: 'parametric' as const, icon: <Sigma size={17} />, when: 'وقتی مشخصات فنی روشن است و ساختار شکست هزینه لازم دارید.' },
  { k: 'historical' as const, icon: <BookMarked size={17} />, when: 'برای کنترل سریع عدد با واقعیت پروژه‌های اخیر؛ با سه پروژهٔ مرجع یا بیشتر قابل اتکاست.' },
  { k: 'analog' as const, icon: <Spline size={17} />, when: 'وقتی پروژهٔ بسیار شبیهی (قطر و طول نزدیک) در کتابخانه دارید.' },
  { k: 'blended' as const, icon: <Layers3 size={17} />, when: 'برای عدد نهایی قابل دفاع: میانگین وزنی روش‌هایی که داده دارند.' },
]

/** How the module works, on the home page — open the first time, remembered after it is closed. */
export function Guide({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const [open, setOpen] = useState(readOpen)
  const toggle = () => setOpen((o) => { try { localStorage.setItem(KEY, o ? '0' : '1') } catch { /* private mode */ } return !o })
  return (
    <section className={`est-guide est-fade-in ${open ? 'is-open' : ''}`} aria-labelledby="est-guide-title">
      <button type="button" className="est-guide-head" onClick={toggle} aria-expanded={open}>
        <span className="est-guide-ic"><Lightbulb size={18} /></span>
        <span className="flex-1 text-right">
          <b id="est-guide-title">راهنمای برآورد</b>
          <small>چهار گام برآورد، چهار روش و این‌که هر کدام کی به کار می‌آید</small>
        </span>
        <ChevronDown size={18} className="est-chev" />
      </button>
      <div className="est-guide-body"><div className="est-guide-inner">
        <ol className="est-guide-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} style={{ animationDelay: `${i * 60}ms` }}>
              <span className="est-guide-n">{'۱۲۳۴'[i]}</span>
              <span className="est-guide-sic">{s.icon}</span>
              <b>{s.title}</b>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>

        <h3 className="est-guide-h">روش‌های برآورد</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {METHODS.map(({ k, icon, when }) => (
            <div key={k} className="est-guide-m" style={{ ['--mc' as string]: METHOD_META[k].color }}>
              <span className="est-guide-mic">{icon}</span>
              <div className="min-w-0">
                <b>{METHOD_META[k].label}</b>
                <p>{METHOD_META[k].hint}</p>
                <p className="est-guide-when">کی؟ {when}</p>
              </div>
            </div>
          ))}
        </div>

        <ul className="est-guide-tips">
          <li><b>کتابخانهٔ مرجع:</b> بهای تمام‌شده یا برآورد پروژه‌های اخیر را ثبت کنید (یورو، دلار یا ریال با نرخ همان زمان). مبالغ به قیمت امروز تعدیل و میانگین هزینهٔ هر کیلومتر و هر اینچ‌-کیلومتر نمایش داده می‌شود. <button type="button" onClick={onOpenLibrary}>رفتن به کتابخانه ←</button></li>
          <li><b>بازهٔ برآورد:</b> هر روش یک بازه دارد؛ پارامتریک از مرحلهٔ تعریف پروژه، تاریخی از پراکندگی کتابخانه و قیاسی از پروژه‌های مشابه.</li>
          <li><b>مبانی برآورد:</b> نرخ‌های واحد (فولاد، عملیات اجرایی، پوشش، فرستنده و گیرندهٔ توپک، شیر بین‌راهی، انشعاب، مخابرات و اسکادا) و درصدهای سربار و ذخایر را مدیر سامانه در «مبانی برآورد» تعیین می‌کند.</li>
          <li><b>نسخه‌ها:</b> هر ذخیره یک نسخهٔ ثابت با نام است؛ دو نسخه را علامت بزنید تا تغییر هر سرفصل را ببینید.</li>
        </ul>
      </div></div>
      <style>{GUIDE_STYLE}</style>
    </section>
  )
}

const GUIDE_STYLE = `
  .est-guide { border-radius: 20px; background: ${SURFACE}; border: 1px solid ${BORDER}; overflow: hidden; }
  .est-guide.is-open { border-color: rgba(242,183,5,.32); }
  .est-guide-head { display: flex; align-items: center; gap: .8rem; width: 100%; padding: 1rem 1.2rem; min-height: 64px; }
  .est-guide-head b { display: block; font-size: 14px; font-weight: 800; color: ${INK}; }
  .est-guide-head small { display: block; font-size: 11.5px; color: ${MUTED_FG}; }
  .est-guide-ic { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; color: #1A1400; background: ${SAFETY}; }
  .est-guide .est-chev { color: ${MUTED_FG}; transition: transform .25s var(--ease); }
  .est-guide.is-open .est-chev { transform: rotate(180deg); }
  .est-guide-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .35s var(--ease); }
  .est-guide.is-open .est-guide-body { grid-template-rows: 1fr; }
  .est-guide-inner { overflow: hidden; padding: 0 1.2rem; }
  .est-guide.is-open .est-guide-inner { padding-bottom: 1.2rem; }
  .est-guide-steps { display: grid; gap: .6rem; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); counter-reset: s; }
  .est-guide-steps li { position: relative; display: grid; gap: .35rem; align-content: start; padding: .9rem; border-radius: 14px; background: ${SURFACE_2}; border: 1px solid ${BORDER}; animation: est-fade-up .5s var(--ease) both; }
  .est-guide-steps b { font-size: 13px; color: ${INK}; }
  .est-guide-steps p { font-size: 11.5px; line-height: 1.9; color: ${INK_SOFT}; }
  .est-guide-n { position: absolute; top: .55rem; left: .7rem; font-size: 1.6rem; font-weight: 900; color: rgba(242,183,5,.2); line-height: 1; }
  .est-guide-sic { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; color: ${SAFETY}; background: rgba(242,183,5,.1); }
  .est-guide-h { font-size: 12.5px; font-weight: 800; color: ${INK}; margin: 1.1rem 0 .55rem; }
  .est-guide-m { display: flex; gap: .7rem; padding: .8rem .9rem; border-radius: 14px; background: ${SURFACE_2}; border: 1px solid ${BORDER}; border-inline-start: 3px solid var(--mc); }
  .est-guide-m b { font-size: 12.5px; color: ${INK}; }
  .est-guide-m p { font-size: 11.5px; line-height: 1.85; color: ${INK_SOFT}; }
  .est-guide-when { color: ${MUTED_FG} !important; }
  .est-guide-mic { width: 32px; height: 32px; flex-shrink: 0; border-radius: 10px; display: grid; place-items: center; color: var(--mc); background: color-mix(in srgb, var(--mc) 14%, transparent); }
  .est-guide-tips { display: grid; gap: .45rem; margin-top: 1rem; padding: .9rem 1rem; border-radius: 14px; background: rgba(242,183,5,.05); border: 1px dashed rgba(242,183,5,.28); }
  .est-guide-tips li { font-size: 11.5px; line-height: 1.95; color: ${INK_SOFT}; }
  .est-guide-tips b { color: ${INK}; }
  .est-guide-tips button { color: ${SAFETY}; font-weight: 700; margin-inline-start: .3rem; }
  @media (prefers-reduced-motion: reduce) { .est-guide-body, .est-guide .est-chev { transition: none; } .est-guide-steps li { animation: none; } }
`
