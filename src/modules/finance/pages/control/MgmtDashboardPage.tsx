import { useState } from 'react'
import { PENDING_CHANGE_STATUSES, type FinException } from '../../lib/financeControl'
import { Download, Printer } from 'lucide-react'
import { useFinanceControlStore } from '../../store/useFinanceControlStore'
import { usePortfolioModel } from '../../lib/usePortfolioModel'
import { exportFinanceReportToExcel } from '../../lib/financeExport'
import { fmtCurrency } from '../../components/FinanceKpiTile'
import { FINANCE_ACCENT } from '../../FinanceApp'

type Audience = 'ceo' | 'executive' | 'pm' | 'finance'
const AUD: { key: Audience; label: string; hint: string }[] = [
  { key: 'ceo', label: 'مدیرعامل', hint: 'تصویر کلان سبد، مقایسهٔ پروژه‌ها و بحرانی‌ترین موارد' },
  { key: 'executive', label: 'مجری طرح', hint: 'پروژه‌ها، پیمانکاران، تغییرات در جریان' },
  { key: 'pm', label: 'مدیر پروژه', hint: 'یک پروژه: بودجه، تعهد، پیش‌بینی و موارد باز' },
  { key: 'finance', label: 'مسئول مالی و قراردادی', hint: 'کارهای عملیاتی: صورت‌وضعیت‌ها، ضمانت‌نامه‌ها، مفاصاحساب‌ها' },
]

/** One page, four views by audience. Data access is still decided by project access in the database; the view only chooses what to emphasise. Rial and foreign currency amounts are not added together. */
export function MgmtDashboardPage() {
  const ctl = useFinanceControlStore()
  const [aud, setAud] = useState<Audience>('ceo')
  const [pid, setPid] = useState('')
  const { model, today, projects } = usePortfolioModel()

  const focus = aud === 'pm' ? model.rows.filter((r) => r.p.id === (pid || model.rows[0]?.p.id)) : model.rows
  const exc = (aud === 'pm' ? model.exceptions.filter((e) => e.masterProjectId === (pid || model.rows[0]?.p.id)) : model.exceptions)
  const nameOf = (id: string) => projects.find((p) => p.id === id)?.officialName ?? ''
  const pendingChanges = ctl.changes.filter((c) => PENDING_CHANGE_STATUSES.includes(c.status))
  const exportRows = () => void exportFinanceReportToExcel(focus.map((r) => ({ 'پروژه': r.p.officialName, 'بودجه جاری': Math.round(r.budget), 'تعهد (قرارداد + تملک)': Math.round(r.commitment), 'پرداخت واقعی': Math.round(r.fc.paid), 'هزینه نهایی (مصوب)': Math.round(r.fc.baseEac), 'هزینه نهایی با سناریو': Math.round(r.fc.scenarioEac), 'وضعیت بودجه': r.fc.overrun, 'موارد استثنا': exc.filter((e) => e.masterProjectId === r.p.id).length })), `مقایسه-پروژه-ها-${today}.xlsx`)
  const exportExc = () => void exportFinanceReportToExcel(exc.map((e: FinException) => ({ 'پروژه': nameOf(e.masterProjectId), 'شدت': e.severity, 'عنوان': e.title, 'توضیح': e.detail })), `استثناها-${today}.xlsx`)

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="fin-text-muted text-xs">داشبورد مدیریتی سبد پروژه‌ها</p><h1 className="fin-text mt-1 text-lg font-extrabold">{AUD.find((a) => a.key === aud)!.label}</h1><p className="text-[11px] fin-text-muted">{AUD.find((a) => a.key === aud)!.hint}</p></div>
        <div className="no-print flex flex-wrap items-center gap-1.5">
          {AUD.map((a) => <button key={a.key} onClick={() => setAud(a.key)} className="rounded-lg border px-3 py-1.5 text-xs font-bold" style={{ borderColor: 'var(--fin-divider)', background: aud === a.key ? FINANCE_ACCENT : undefined, color: aud === a.key ? '#16110a' : undefined }}>{a.label}</button>)}
          {aud === 'pm' && <select className="fin-input w-48" value={pid || model.rows[0]?.p.id || ''} onChange={(e) => setPid(e.target.value)}>{model.rows.map((r) => <option key={r.p.id} value={r.p.id}>{r.p.officialName}</option>)}</select>}
          <button onClick={exportRows} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: 'var(--fin-divider)' }}><Download size={12} /> Excel</button>
          <button onClick={() => window.print()} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: 'var(--fin-divider)' }}><Printer size={12} /> گزارش دوره‌ای / PDF</button>
        </div>
      </div>

      {aud !== 'finance' && (
        <div className="fin-card overflow-x-auto p-4">
          <p className="mb-2 text-xs font-extrabold">مقایسهٔ پروژه‌ها (مبالغ ریالی)</p>
          {focus.length === 0 ? <p className="py-6 text-center text-xs fin-text-muted">داده‌ای نیست.</p> : (
            <table className="w-full text-xs"><thead><tr className="fin-text-muted text-right"><th className="py-1.5 font-medium">پروژه</th><th className="text-left font-medium">بودجه</th><th className="text-left font-medium">تعهد</th><th className="text-left font-medium">پرداخت</th><th className="text-left font-medium">هزینهٔ نهایی</th><th className="text-left font-medium">با سناریو</th><th className="font-medium">وضعیت</th><th className="text-left font-medium">استثنا</th></tr></thead>
              <tbody>{focus.map((r) => (
                <tr key={r.p.id} className="border-t" style={{ borderColor: 'var(--fin-divider)' }}>
                  <td className="py-1.5 font-bold">{r.p.officialName}</td><td className="num text-left">{r.budget ? fmtCurrency(r.budget) : '—'}</td><td className="num text-left">{fmtCurrency(r.commitment)}</td><td className="num text-left">{fmtCurrency(r.fc.paid)}</td><td className="num text-left">{fmtCurrency(r.fc.baseEac)}</td><td className="num text-left fin-text-muted">{fmtCurrency(r.fc.scenarioEac)}</td>
                  <td style={{ color: r.fc.overrun === 'likely' ? '#b5573a' : r.fc.overrun === 'none' ? '#3e7c74' : '#c28a2b' }}>{{ none: 'در محدوده', watch: 'نزدیک سقف', possible: 'احتمال تجاوز', likely: 'تجاوز' }[r.fc.overrun]}</td>
                  <td className="num text-left">{exc.filter((e) => e.masterProjectId === r.p.id).length.toLocaleString('fa-IR')}</td></tr>))}</tbody></table>
          )}
        </div>
      )}

      {(aud === 'ceo' || aud === 'executive') && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="fin-card p-4">
            <p className="mb-2 text-xs font-extrabold">پرداخت واقعی ۶ ماه اخیر (ریال)</p>
            {(() => { const mx = Math.max(1, ...model.months.map((m) => m.paid)); return model.months.map((m, i) => (
              <div key={m.idx} className="mb-1.5 flex items-center gap-2 text-[11px]"><span className="w-16 shrink-0 fin-text-muted">{m.label}</span><div className="h-3 flex-1 overflow-hidden rounded" style={{ background: 'var(--fin-divider)' }}><div className="h-full rounded" style={{ width: `${(m.paid / mx) * 100}%`, background: i === 5 ? FINANCE_ACCENT : '#5c7290' }} /></div><span className="num w-24 text-left">{fmtCurrency(m.paid)}</span></div>)) })()}
            <p className="mt-1 text-[10.5px] fin-text-muted">مقایسهٔ دوره‌ای: ماه جاری در برابر ماه قبل {(() => { const a = model.months[5].paid, b = model.months[4].paid; return b > 0 ? `${Math.round(((a - b) / b) * 100).toLocaleString('fa-IR')}٪` : '—' })()}</p>
          </div>
          <div className="fin-card p-4">
            <p className="mb-2 text-xs font-extrabold">پیمانکاران — کمترین امتیاز اول</p>
            <div className="space-y-1">{model.contractors.slice(0, 6).map(({ c, s, project }) => (
              <div key={c.id} className="flex items-center gap-2 text-[11px]"><span className="min-w-0 flex-1 truncate">{c.contractNumber || c.title} <span className="fin-text-muted">· {project}</span></span><span className="num fin-text-muted">تأخیر {s.avgPaymentDelayDays ?? '—'} روز</span><b className="num w-8 text-left" style={{ color: s.score < 60 ? '#b5573a' : undefined }}>{s.score.toLocaleString('fa-IR')}</b></div>))}</div>
          </div>
        </div>
      )}

      {aud === 'executive' && <div className="fin-card p-4 text-xs"><b>{pendingChanges.length.toLocaleString('fa-IR')}</b> درخواست تغییر قراردادی در جریان تصویب است؛ مبلغ پیشنهادی مجموع (سناریو، مصوب نیست): <b className="num">{fmtCurrency(pendingChanges.reduce((n, c) => n + c.proposedAmount, 0))}</b></div>}

      {aud === 'finance' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ListCard title="صورت‌وضعیت‌های معطل و پرداخت‌های معوق" items={exc.filter((e) => e.kind === 'certificate_stuck' || e.kind === 'payment_overdue')} name={nameOf} />
          <ListCard title="ضمانت‌نامه‌ها" items={exc.filter((e) => e.kind.startsWith('guarantee'))} name={nameOf} />
          <ListCard title="ادعاها و افزایش مبلغ قرارداد" items={exc.filter((e) => e.kind === 'claim_stale' || e.kind === 'amendment_jump')} name={nameOf} />
          <div className="fin-card p-4 text-xs"><p className="mb-1 font-extrabold">یافته‌های تحلیلی در انتظار بررسی انسانی</p><p className="num text-2xl font-extrabold">{model.insights.length.toLocaleString('fa-IR')}</p><p className="fin-text-muted">در «استثناها و اقدام» هر پروژه بررسی و تأیید یا رد می‌شوند.</p></div>
        </div>
      )}

      {aud !== 'finance' && (
        <div className="fin-card p-4">
          <div className="mb-2 flex items-center justify-between"><p className="text-xs font-extrabold">موارد نیازمند تصمیم ({exc.length.toLocaleString('fa-IR')})</p><button onClick={exportExc} className="no-print flex items-center gap-1 text-[11px] fin-text-muted"><Download size={11} /> Excel</button></div>
          {exc.slice(0, aud === 'ceo' ? 8 : 15).map((e) => <p key={e.key} className="border-t py-1 text-[11.5px]" style={{ borderColor: 'var(--fin-divider)' }}><b style={{ color: e.severity === 'critical' ? '#b5573a' : undefined }}>{e.severity === 'critical' ? 'بحرانی' : e.severity === 'high' ? 'زیاد' : 'متوسط'}</b> · {nameOf(e.masterProjectId)} — {e.title}</p>)}
          {exc.length === 0 && <p className="py-3 text-center text-xs fin-text-muted">مورد استثنایی نیست.</p>}
        </div>
      )}
    </div>
  )
}

function ListCard({ title, items, name }: { title: string; items: FinException[]; name: (id: string) => string }) {
  return (
    <div className="fin-card p-4">
      <p className="mb-2 text-xs font-extrabold">{title} ({items.length.toLocaleString('fa-IR')})</p>
      {items.length === 0 ? <p className="py-3 text-center text-xs fin-text-muted">موردی نیست.</p> : items.slice(0, 12).map((e) => <p key={e.key} className="border-t py-1 text-[11.5px]" style={{ borderColor: 'var(--fin-divider)' }}>{name(e.masterProjectId)} — {e.title}</p>)}
    </div>
  )
}
