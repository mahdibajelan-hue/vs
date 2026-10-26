import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle, X } from 'lucide-react'
import { HEALTH_COLOR } from '../lifecycle/lib/health'
import { HEALTH_DIMENSION_LABEL_FA, type HealthStatus } from '../lifecycle/types'
import type { ProjectHealth } from './projectMetricsLoader'
import './healthGuide.css'

export const HEALTH_STATUS_FA: Record<HealthStatus, string> = { green: 'سبز — سالم', yellow: 'زرد — نیازمند توجه', red: 'قرمز — در خطر', black: 'سیاه — گیت مسدود' }
const fa = (v: number) => v.toLocaleString('fa-IR')

/** Health verdict colour — the colour of the WORST dimension, never of the averaged score. */
export const healthColor = (h: ProjectHealth | null | undefined): string => (h ? (h.status === 'black' ? '#6b7280' : HEALTH_COLOR[h.status]) : 'var(--text-muted)')

/**
 * «سلامت پروژه چطور حساب می‌شود؟» — the rules, the colours and this project's ten dimensions with the reason behind each.
 * Opens as a dialog from a small (?) button next to any health figure.
 */
export function HealthGuideButton({ health, className = '' }: { health: ProjectHealth | null | undefined; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={`hg-btn ${className}`} onClick={() => setOpen(true)} aria-label="راهنمای محاسبهٔ سلامت پروژه" title="سلامت پروژه چطور حساب می‌شود؟">
        <HelpCircle size={14} aria-hidden />
      </button>
      {open && <HealthGuideDialog health={health} onClose={() => setOpen(false)} />}
    </>
  )
}

function HealthGuideDialog({ health, onClose }: { health: ProjectHealth | null | undefined; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const dims = health?.dims ?? []
  const counted = dims.filter((d) => d.assessed !== false)
  return createPortal(
    <div className="hg-backdrop" onClick={onClose}>
      <div className="hg-dialog" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="hg-title" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <header className="hg-head">
          <b id="hg-title">سلامت پروژه چطور حساب می‌شود؟</b>
          <button type="button" className="hg-x" onClick={onClose} aria-label="بستن"><X size={16} /></button>
        </header>

        {health && (
          <div className="hg-now" style={{ '--hc': healthColor(health) } as React.CSSProperties}>
            <span className="hg-score">{fa(health.score)}<small>/۱۰۰</small></span>
            <span className="hg-verdict">
              <i aria-hidden />
              <b>{HEALTH_STATUS_FA[health.status]}</b>
              <small>
                {health.isOverridden ? `وضعیت به‌صورت دستی تعیین شده: ${health.overrideReason || '—'}`
                  : health.status === 'black' ? `گیت مسدود است${health.blockers.length ? `: ${health.blockers.join('، ')}` : '.'}`
                  : health.drivenBy ? `رنگ را بُعد «${HEALTH_DIMENSION_LABEL_FA[health.drivenBy]}» تعیین کرده است.` : 'همهٔ ابعاد سبزند.'}
              </small>
            </span>
          </div>
        )}

        <ol className="hg-rules">
          <li><b>عدد (۰ تا ۱۰۰):</b> میانگین امتیاز ابعادی که واقعاً ارزیابی شده‌اند ({fa(counted.length)} از {fa(dims.length || 10)} بعد). بعدی که داده ندارد در میانگین شمرده نمی‌شود.</li>
          <li><b>رنگ:</b> رنگِ <u>بدترین</u> بعد است، نه رنگِ میانگین. پروژه‌ای که نُه بعد سبز و یک بعد قرمز دارد «سالم» نیست؛ برای همین ممکن است عدد بالا باشد ولی رنگ قرمز. عامل رنگ همیشه نام برده می‌شود.</li>
          <li><b>آستانه‌ها:</b> امتیاز ۸۰ و بالاتر سبز، ۶۰ تا ۸۰ زرد، زیر ۶۰ قرمز.</li>
          <li><b>سیاه (گیت مسدود):</b> وقتی در فاز جاری مسئلهٔ بحرانی باز هست یا Milestone بحرانی‌ای که تاریخش گذشته محقق نشده؛ در این حالت رنگ سیاه است و عدد همچنان میانگین ابعاد.</li>
          <li><b>مهندسی، تدارکات، اجرا:</b> از شاخص عملکرد زمانی (SPI = پیشرفت واقعی ÷ برنامه‌ای) هر ماژول. SPI ≥ ۰٫۹۵ سبز، ۰٫۹۰ تا ۰٫۹۵ زرد، زیر ۰٫۹۰ قرمز (هر ۰٫۰۱ کمتر از ۱ = ۴ امتیاز).</li>
          <li><b>زمان‌بندی:</b> SPI کل چرخهٔ عمر (همان عدد رادار). <b>هزینه:</b> CPI پیمان EPC. با همان مقیاس.</li>
          <li><b>ریسک:</b> ۱۰۰ منهای ۲۰ امتیاز برای هر ریسک بحرانی باز.</li>
          <li><b>کیفیت، HSE، قرارداد، جریان نقدی:</b> از امتیاز ثبت‌شدهٔ دستی؛ تا ثبت نشده «ارزیابی نشده» است.</li>
        </ol>

        {dims.length > 0 && (
          <table className="hg-table">
            <thead><tr><th>بعد</th><th>امتیاز</th><th>وضعیت</th><th>دلیل</th></tr></thead>
            <tbody>
              {dims.map((d) => (
                <tr key={d.dimension} className={d.assessed === false ? 'is-off' : ''}>
                  <td>{HEALTH_DIMENSION_LABEL_FA[d.dimension]}</td>
                  <td>{d.assessed === false ? '—' : fa(d.score)}</td>
                  <td><span className="hg-dot" style={{ background: d.assessed === false ? 'var(--border-soft)' : HEALTH_COLOR[d.status] }} />{d.assessed === false ? 'ارزیابی نشده' : HEALTH_STATUS_FA[d.status].split(' — ')[0]}</td>
                  <td className="hg-why">{d.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>,
    document.body,
  )
}
