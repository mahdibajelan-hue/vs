import { useState } from 'react'
import { Printer } from 'lucide-react'
import { useEpcModel } from '../lib/useEpcModel'
import { useEpcStore } from '../store/useEpcStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { periodOf, jalaliText, addDays, type Period } from '../lib/periods'
import { cumulative } from '../lib/progress'
import { compensationScenarios, rankScenarios } from '../lib/engine/scenarios'
import { lookaheadWeeks, ppc, deviationCauses, type LookaheadItem } from '../lib/engine/lookahead'
import { weekdayOf } from '../lib/periods'
import { PaperFrame } from '../components/epc/PaperFrame'
import { EpcGate } from '../components/epc/EpcBanner'
import { qcSummary, DATA_STATUS_FA } from '../lib/qcSummary'
import { fa, pct } from '../components/common'

const CAT_FA: Record<string, string> = { material: 'مصالح', drawing: 'نقشه/مدرک', land: 'زمین/جبهه', permit: 'مجوز', weather: 'آب‌وهوا', equipment: 'تجهیزات', manpower: 'نیروی انسانی', hse: 'ایمنی', other: 'سایر' }
const f1 = (x: number | null, d = 1) => (x == null ? '—' : fa(x, d))

/** Management report assembled from approved daily data and the engines: progress, volumes, resources, stoppages, readiness, commitments, forecast, compensation options, ledger and decisions. */
export function MgmtReportPage(p: { projectId: string; sub: string }) { return <EpcGate><Inner {...p} /></EpcGate> }
function Inner({ projectId, sub }: { projectId: string; sub: string }) {
  const m = useEpcModel(projectId)
  const look = useEpcStore((s) => s.lookahead).filter((l) => l.projectId === projectId)
  const name = useMasterDataStore((s) => s.projects.find((x) => x.id === projectId)?.officialName ?? '')
  const [anchor, setAnchor] = useState(m.today)
  const e = m.ex
  const qcF = useEpcStore((s) => s.findings).filter((x) => x.projectId === projectId), qcN = useEpcStore((s) => s.ncrs).filter((x) => x.projectId === projectId), qcW = useEpcStore((s) => s.welds).filter((x) => x.projectId === projectId && x.status !== 'merged').length
  const per: Period = periodOf(sub === 'mgmt-month' ? 'month' : 'week', anchor, e.settings.weekStart)
  const inPer = e.reports.filter((r) => r.formKey === 'work' && r.reportDate >= per.from && r.reportDate <= per.to)
  const repIds = new Set(inPer.map((r) => r.id))
  const before = cumulative(e.reports, e.lines, { before: per.from, mode: 'approved' }), upto = cumulative(e.reports, e.lines, { until: per.to, mode: 'approved' })
  const rows = e.activities.filter((a) => (upto.get(a.id) ?? 0) > (before.get(a.id) ?? 0)).map((a) => ({ a, inP: (upto.get(a.id) ?? 0) - (before.get(a.id) ?? 0), cum: upto.get(a.id) ?? 0, base: e.baseOf(a, per.to) }))
  const res = e.resources.filter((r) => repIds.has(r.reportId)), man = res.filter((r) => r.kind === 'man'), eq = res.filter((r) => r.kind === 'equip')
  const stops = e.stoppages.filter((s) => repIds.has(s.reportId)), byCat = new Map<string, number>(); for (const s of stops) byCat.set(s.category, (byCat.get(s.category) ?? 0) + s.hours)
  const items: LookaheadItem[] = look.map((l) => ({ id: l.id, weekStart: l.weekStart, activityId: l.activityId, front: l.front, responsible: l.responsible, plannedQty: l.plannedQty, committed: l.committed, achievedQty: l.achievedQty, deviationCause: l.deviationCause, recoveryPlan: l.recoveryPlan }))
  const weeks = lookaheadWeeks(items, m.today, e.settings.weekStart, weekdayOf, new Map([...m.insights].map(([id, i]) => [id, i.forecast.perWeek])))
  const pp = ppc(items, per.from)
  const late = [...m.insights.values()].filter((i) => i.remaining > 0 && (i.forecast.lateRisk === 'high' || i.forecast.lateRisk === 'medium')).sort((a, b) => (a.forecast.onTimeProb ?? 1) - (b.forecast.onTimeProb ?? 1)).slice(0, 5)
  const title = (id: string) => e.actById.get(id)?.title ?? '—'
  const crit = m.alerts.filter((a) => a.severity === 'critical')
  const T = ({ children }: { children: React.ReactNode }) => <h3 style={{ margin: '14px 0 6px', fontSize: 14 }}>{children}</h3>
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="mt-filters no-print">
        <input type="date" value={anchor} onChange={(x) => setAnchor(x.target.value || m.today)} aria-label="تاریخ" />
        <button className="im-btn im-btn-sm" onClick={() => setAnchor(addDays(per.from, -1))}>دورهٔ قبل</button>
        <button className="im-btn im-btn-sm" onClick={() => setAnchor(addDays(per.to, 1))}>دورهٔ بعد</button>
        <button className="im-btn im-btn-primary im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => { document.body.classList.add('mt-printing'); const off = () => { document.body.classList.remove('mt-printing'); window.removeEventListener('afterprint', off) }; window.addEventListener('afterprint', off); window.print() }}><Printer size={13} /> چاپ / PDF</button>
      </div>
      <PaperFrame projectId={projectId}>
        <div className="ex-paper">
          <header className="ex-paper-head"><div><small>{name}</small><h2>گزارش مدیریتی کنترل اجرا — {per.label}</h2></div><div style={{ textAlign: 'end' }}><span>تاریخ تهیه: <b>{jalaliText(m.today)}</b></span></div></header>
          <T>۱. پیشرفت</T>
          <p>پیشرفت فیزیکی تأییدشده {pct(e.approved.overall)}، برنامه‌ای {pct(e.planned.overall)}{m.spi != null ? `، SPI = ${fa(m.spi, 2)}` : ''}.</p>
          <T>۲. احجام اجراشده در دوره (تأییدشدهٔ نظارت)</T>
          <table><thead><tr><th>فعالیت</th><th>واحد</th><th className="num">دوره</th><th className="num">تجمعی</th><th className="num">باقیمانده</th></tr></thead><tbody>{rows.length ? rows.map((r) => <tr key={r.a.id}><td>{r.a.title}</td><td>{r.a.unit}</td><td className="num">{fa(r.inP, 2)}</td><td className="num">{fa(r.cum, 2)}</td><td className="num">{fa(Math.max(0, r.base - r.cum), 2)}</td></tr>) : <tr><td colSpan={5}>کارکرد تأییدشده‌ای در این دوره نیست.</td></tr>}</tbody></table>
          {m.metrics.length > 0 && <><T>شاخص‌های تجمیعی</T><table><tbody>{m.metrics.map((x) => <tr key={x.key}><td>{x.label}</td><td className="num">{fa(x.done, 0)} {x.unit}</td><td className="num">باقیمانده {fa(x.remaining, 0)}</td><td className="num">{pct(x.pct, 0)}</td></tr>)}</tbody></table></>}
          <T>۳. منابع و بهره‌وری</T>
          <p>ردیف نیروی انسانی ثبت‌شده: {fa(man.length)} · ردیف ماشین‌آلات: {fa(eq.length)} · مجموع نفرساعت گزارش‌شده: {fa(man.reduce((s, r) => s + r.hours, 0), 0)} · ماشین‌ساعت: {fa(eq.reduce((s, r) => s + r.hours, 0), 0)}.</p>
          <table><thead><tr><th>فعالیت</th><th className="num">نرخ اکیپ/روز</th><th className="num">در ساعت مفید</th><th className="num">اطمینان داده</th></tr></thead><tbody>{[...m.insights.values()].filter((i) => i.prod.rates.perCrewDay != null).map((i) => <tr key={i.activityId}><td>{title(i.activityId)}</td><td className="num">{f1(i.prod.rates.perCrewDay, 2)}</td><td className="num">{f1(i.prod.rates.perUsefulHour, 3)}</td><td className="num">{({ high: 'بالا', medium: 'متوسط', low: 'کم', none: '—' })[i.prod.quality.confidence]}</td></tr>)}</tbody></table>
          <T>۴. توقف‌ها، محدودیت‌ها و موانع</T>
          <p>{byCat.size ? [...byCat].sort((a, b) => b[1] - a[1]).map(([c, h]) => `${CAT_FA[c] ?? c}: ${fa(h, 0)} ساعت`).join(' · ') : 'توقفی ثبت نشده است.'}</p>
          <T>۵. آمادگی مهندسی و تأمین</T>
          <p>{[...m.insights.values()].filter((i) => i.readiness.state === 'blocked' || i.readiness.state === 'at_risk').map((i) => `${title(i.activityId)} (${i.readiness.state === 'blocked' ? 'مسدود' : 'در معرض خطر'}${i.readiness.blockers.length ? `: ${i.readiness.blockers.join('؛ ')}` : ''})`).join(' — ') || 'مانعی برای فعالیت‌های دارای پیش‌نیاز ثبت نشده است.'}</p>
          <T>۶. تعهدات کوتاه‌مدت</T>
          <p>تحقق تعهدات این دوره (PPC): {pp.ppc == null ? '—' : pct(pp.ppc, 0)} از {fa(pp.committed)} تعهد. علل انحراف: {deviationCauses(items).slice(0, 4).map((c) => `${c.cause} (${fa(c.count)})`).join('، ') || '—'}. برنامهٔ سه هفتهٔ آینده: {weeks.map((w) => `${jalaliText(w.weekStart)}: ${fa(w.items.length)} ردیف${w.overCommit.length ? ` (${fa(w.overCommit.length)} بیش از ظرفیت)` : ''}`).join(' · ')}.</p>
          <T>۷. پیش‌بینی و سناریوهای جبرانی</T>
          {late.length ? <table><thead><tr><th>فعالیت</th><th>پایان پیش‌بینی</th><th className="num">احتمال اتمام در موعد</th><th>بهترین گزینه جبران</th></tr></thead><tbody>{late.map((i) => { const st = m.stateFor(i.activityId, { frontsAvailable: Math.max(1, e.settings.expectedFronts.length) }); const best = st ? rankScenarios(compensationScenarios(st.state, m.scenarioParams(), st.basis))[0] : null; return <tr key={i.activityId}><td>{title(i.activityId)}</td><td>{i.forecast.finish ? jalaliText(i.forecast.finish) : '—'}</td><td className="num">{pct(i.forecast.onTimeProb, 0)}</td><td>{best ? `${best.label} → ${best.finish ? jalaliText(best.finish) : '—'}${best.basis === 'assumed' ? ' (سناریوی فرضی)' : ''}` : 'گزینهٔ مؤثری با شرایط فعلی یافت نشد'}</td></tr> })}</tbody></table> : <p>فعالیت پرریسکی شناسایی نشد.</p>}
          <T>۸. مغایرت مقادیر اجرایی، اندازه‌گیری‌شده و صورت‌وضعیت‌شده</T>
          <p>{m.ledger.filter((l) => l.mismatches.some((x) => x.kind !== 'approved_not_measured')).map((l) => `${l.title}: ${l.mismatches.map((x) => x.detail).join('، ')}`).join(' — ') || 'مغایرتی ثبت نشده است. (تأیید فنی به‌معنای استحقاق پرداخت نیست.)'}</p>
          <T>۹. تصمیم‌های موردنیاز مدیران</T>
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>{crit.length ? crit.slice(0, 8).map((a) => <li key={a.id}>{a.title} — {a.reason}</li>) : <li>مورد بحرانی نیست.</li>}</ul>
          <T>۱۰. کیفیت (فرم‌های فنی)</T>
          {(() => { const q = qcSummary(e.reports, qcF, qcN, qcW, per.from, per.to); return <><p>وضعیت داده: <b>{DATA_STATUS_FA[q.dataStatus]}</b> ({fa(q.approvedForms)} از {fa(q.forms)} فرم فنی ثبت‌شدهٔ دوره تأیید شده است).</p>
            <p>مغایرت ثبت‌شده در دوره: {fa(q.findingsInPeriod)} · مغایرت باز تا امروز: {fa(q.openFindings)} (شدید: {fa(q.highOpen)}) · NCR گشوده/بسته‌شده در دوره: {fa(q.ncrOpened)}/{fa(q.ncrClosed)} · NCR باز: {fa(q.ncrOpen)} · سرجوش‌های رجیستر: {fa(q.welds)}. این بخش فقط اطلاع‌رسانی است و در درصد پیشرفت و کارکرد دخالتی ندارد.</p></> })()}
        </div>
      </PaperFrame>
    </div>
  )
}
