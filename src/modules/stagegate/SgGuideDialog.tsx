import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { SG_HOW_TO, SG_PHASE_GUIDE, SG_READING, SG_SOURCE_LABEL } from './sgGuide'
import '../projectMetrics/healthGuide.css'

const fa = (n: number) => n.toLocaleString('fa-IR')
const TITLES: Record<string, string> = { G1: 'تعریف پروژه', G2: 'شناسایی پروژه', G3: 'خرید خدمات مشاور', G4: 'طراحی پایه', G5: 'مناقصه و انعقاد قرارداد', G6: 'اجرای پروژه (EPC)', G7: 'پیش‌راه‌اندازی و راه‌اندازی', G8: 'دوره نگهداری', G9: 'تسویه حساب' }

/** «راهنمای چرخهٔ عمر» — how to use the module, how to read the orbit, and what to do in each of the nine phases. */
export function SgGuideDialog({ phase, onClose }: { phase: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<string | null>(phase)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="hg-backdrop" onClick={onClose}>
      <div className="hg-dialog" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="sgg-title" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()} style={{ width: 'min(52rem, 100%)' }}>
        <header className="hg-head">
          <b id="sgg-title">راهنمای چرخهٔ عمر پروژه (Stage-Gate)</b>
          <button type="button" className="hg-x" onClick={onClose} aria-label="بستن"><X size={16} /></button>
        </header>
        <p className="hg-why" style={{ marginBottom: '.8rem', lineHeight: 1.9 }}>
          چرخهٔ عمر، پروژه را از تعریف تا تسویه در ۹ فاز دنبال می‌کند. هر فاز با یک «گیت» بسته می‌شود: تا معیارهای الزامی آن فاز تأیید نشود، عبور از گیت ثبت نمی‌شود. پیشرفت کل پروژه که در رادار، داشبورد و این صفحه می‌بینید از همین فازها حساب می‌شود.
        </p>
        <h5 className="sgg-h">سه قدم کار</h5>
        <ol className="hg-rules">{SG_HOW_TO.map((h) => <li key={h.title}><b>{h.title}:</b> {h.text}</li>)}</ol>
        <h5 className="sgg-h">خواندن مدار</h5>
        <ul className="hg-rules" style={{ listStyle: 'disc' }}>{SG_READING.map((t) => <li key={t}>{t}</li>)}</ul>
        <h5 className="sgg-h">راهنمای هر فاز</h5>
        <div className="sgg-phases">
          {Object.entries(SG_PHASE_GUIDE).map(([code, g], i) => (
            <details key={code} open={open === code} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setOpen(code) }} className="sgg-phase">
              <summary><span className="sgg-code">{code}</span><b>{TITLES[code] ?? code}</b><small>{fa(i + 1)} از ۹</small></summary>
              <div className="sgg-body">
                <p><b>هدف:</b> {g.purpose}</p>
                <p><b>منبع پیشرفت:</b> {SG_SOURCE_LABEL[g.source]}</p>
                <p><b>چه چیزی وارد کنم:</b></p>
                <ol>{g.enter.map((t) => <li key={t}>{t}</li>)}</ol>
                <p><b>شرط عبور از گیت:</b> {g.gate}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
