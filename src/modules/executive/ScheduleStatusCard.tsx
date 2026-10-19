import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { listSchedulingProjects } from '../scheduling/lib/portfolioLoader'
import { loadAllScheduleSummaries } from '../scheduling/lib/summaryLoader'
import type { ScheduleSummary } from '../scheduling/lib/summary'
import { jalaliText } from '../execution/lib/periods'

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(Math.round(n))
const tone = (s: ScheduleSummary): { c: string; t: string } => {
  if ((s.contractorDelay ?? 0) > 0 || s.criticalOverdue > 5) return { c: '#ef4444', t: 'بحرانی' }
  if ((s.baselineSlip ?? 0) > 7 || s.criticalOverdue > 0 || s.noticesLost > 0) return { c: '#f59e0b', t: 'نیازمند توجه' }
  return { c: '#22c55e', t: 'مطابق برنامه' }
}

/** One row per project with an approved schedule: forecast against baseline and contract, overdue critical work, delay damages. Read live from the scheduling module. */
export function ScheduleStatusCard() {
  const projects = useMasterDataStore((s) => s.projects)
  const [rows, setRows] = useState<{ id: string; name: string; s: ScheduleSummary }[] | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const ids = (await listSchedulingProjects()).filter((id) => projects.some((p) => p.id === id))
        const m = await loadAllScheduleSummaries(ids)
        if (live) setRows(ids.filter((id) => m.has(id)).map((id) => ({ id, name: projects.find((p) => p.id === id)?.officialName ?? id, s: m.get(id)! })))
      } catch { if (live) setRows([]) }
    })()
    return () => { live = false }
  }, [projects])
  if (rows && rows.length === 0) return null
  return (
    <section className="glass-panel mb-3 p-3" dir="rtl" aria-label="وضعیت زمان‌بندی پروژه‌ها">
      <div className="mb-2 flex items-center gap-2"><CalendarClock size={16} style={{ color: '#0ea5a4' }} aria-hidden /><b className="text-sm">وضعیت زمان‌بندی پروژه‌ها</b><span className="text-[10px] text-muted">بر پایهٔ برنامهٔ جاری؛ بدون اعمال کار زندهٔ ماژول اجرا</span></div>
      {!rows ? <div className="im-skeleton" style={{ height: 60 }} /> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'right', opacity: 0.7 }}><th className="p-1.5">پروژه</th><th className="p-1.5">وضعیت</th><th className="p-1.5">پایان پیش‌بینی</th><th className="p-1.5">انحراف از مبنا</th><th className="p-1.5">تأخیر قابل‌جریمه</th><th className="p-1.5">بحرانی عقب‌افتاده</th><th className="p-1.5">اخطار ازدست‌رفته</th></tr></thead>
            <tbody>
              {rows.map(({ id, name, s }) => { const t = tone(s); return (
                <tr key={id} style={{ borderTop: '1px solid rgba(148,163,184,.2)' }}>
                  <td className="p-1.5 font-bold">{name}</td>
                  <td className="p-1.5"><span style={{ color: t.c, fontWeight: 700 }}>● {t.t}</span></td>
                  <td className="p-1.5">{s.forecastFinish ? jalaliText(s.forecastFinish) : '—'}</td>
                  <td className="p-1.5">{s.baselineSlip == null ? '—' : `${s.baselineSlip > 0 ? '+' : ''}${fa(s.baselineSlip)} روز`}</td>
                  <td className="p-1.5">{s.contractorDelay == null ? '—' : s.contractorDelay > 0 ? `${fa(s.contractorDelay)} روز${s.ldAmount > 0 ? ` · ${fa(s.ldAmount)} ریال` : ''}` : 'ندارد'}</td>
                  <td className="p-1.5">{fa(s.criticalOverdue)}</td>
                  <td className="p-1.5">{fa(s.noticesLost)}</td>
                </tr>) })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
