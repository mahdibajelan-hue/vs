import { useMemo } from 'react'
import { jalaliText } from '../../execution/lib/periods'
import { Chip, DataTable, KpiCard, Section, type Col } from '../../finance/components/fn'
import { HBars, PB, Tile } from '../../finance/components/charts'
import { fa, pct } from '../../execution/components/common'
import type { ActivityIntegration } from '../lib/integration'
import type { OverdueRow, LookaheadRow, ProgressRow } from '../lib/variance'
import type { LiveModel } from '../store/useScheduleModel'
import { Hint } from '../components/Hint'

const d = (x: string | null) => (x ? jalaliText(x) : '—')
const READY = { ready: ['good', 'آماده'], at_risk: ['warn', 'در خطر'], blocked: ['bad', 'مانع'], unknown: ['neutral', 'نامشخص'] } as const
const tone = (x: number | null): 'good' | 'warn' | 'bad' | 'neutral' => (x == null ? 'neutral' : x >= 0.97 ? 'good' : x >= 0.9 ? 'warn' : 'bad')

/** Deviation analysis: planned vs actual, finish slip against the baseline, critical and near-critical work, overdue work and the 3-week look-ahead with the readiness of its prerequisites. */
export function SchAnalysis({ m }: { projectId: string; m: LiveModel }) {
  const acts = m.cur!.activities
  const byId = useMemo(() => new Map(acts.map((a) => [a.id, a])), [acts])
  const f = m.forecast
  const critRows = useMemo(() => f.criticalPath.map((id) => ({ a: byId.get(id)!, r: f.byId.get(id)! })).filter((x) => x.a), [f, byId])
  const nearRows = useMemo(() => [...f.byId.values()].filter((r) => r.nearCritical).map((r) => ({ a: byId.get(r.id)!, r })).filter((x) => x.a).sort((a, b) => (a.r.totalFloat ?? 0) - (b.r.totalFloat ?? 0)), [f, byId])
  const slipRows = useMemo(() => m.slips.filter((s) => (s.finishSlip ?? 0) > 0).sort((a, b) => (b.finishSlip ?? 0) - (a.finishSlip ?? 0)), [m.slips])
  const progRows = useMemo(() => m.progress.rows.filter((r) => r.variance != null && r.variance < -0.5).sort((a, b) => (a.variance ?? 0) - (b.variance ?? 0)), [m.progress.rows])
  const igOf = (a: { uid: string }): ActivityIntegration | undefined => m.integration.get(a.uid)
  const slip = m.finish.slipDays

  const critCols: Col<(typeof critRows)[number]>[] = [
    { key: 'c', label: 'کد', render: (x) => <b className="fn-code">{x.a.code}</b>, sort: (x) => x.a.code },
    { key: 'n', label: 'فعالیت', render: (x) => x.a.name },
    { key: 's', label: 'شروع پیش‌بینی', render: (x) => d(x.r.start), sort: (x) => x.r.start ?? '' },
    { key: 'f', label: 'پایان پیش‌بینی', render: (x) => d(x.r.finish), sort: (x) => x.r.finish ?? '' },
    { key: 'st', label: 'وضعیت', render: (x) => (x.r.status === 'complete' ? 'تمام' : x.r.status === 'in_progress' ? 'در حال انجام' : 'شروع‌نشده') },
    { key: 'rd', label: 'پیش‌نیازها', render: (x) => { const i = igOf(x.a); const [t, l] = READY[i?.readiness ?? 'unknown']; return <Chip tone={t}>{l}</Chip> } },
  ]
  const nearCols: Col<(typeof nearRows)[number]>[] = [
    { key: 'c', label: 'کد', render: (x) => <b className="fn-code">{x.a.code}</b>, sort: (x) => x.a.code },
    { key: 'n', label: 'فعالیت', render: (x) => x.a.name },
    { key: 'fl', label: 'شناوری کل (روز کاری)', num: true, render: (x) => fa(x.r.totalFloat ?? 0, 1), sort: (x) => x.r.totalFloat ?? 0 },
    { key: 'ff', label: 'شناوری آزاد', num: true, render: (x) => fa(x.r.freeFloat ?? 0, 1) },
    { key: 'f', label: 'پایان پیش‌بینی', render: (x) => d(x.r.finish) },
  ]
  const odCols: Col<OverdueRow>[] = [
    { key: 'c', label: 'کد', render: (r) => <b className="fn-code">{r.code}</b>, sort: (r) => r.code },
    { key: 'n', label: 'فعالیت', render: (r) => r.name },
    { key: 'k', label: 'نوع', render: (r) => (r.kind === 'late_finish' ? 'پایان از موعد گذشته' : 'شروع از موعد گذشته') },
    { key: 'd', label: 'روز تأخیر', num: true, render: (r) => fa(r.days), sort: (r) => r.days },
    { key: 'cr', label: 'بحرانی', render: (r) => (r.critical ? <Chip tone="bad">بحرانی</Chip> : '—') },
  ]
  const lookCols: Col<LookaheadRow>[] = [
    { key: 'c', label: 'کد', render: (r) => <b className="fn-code">{r.code}</b>, sort: (r) => r.code },
    { key: 'n', label: 'فعالیت', render: (r) => r.name },
    { key: 's', label: 'شروع', render: (r) => d(r.start), sort: (r) => r.start ?? '' },
    { key: 'f', label: 'پایان', render: (r) => d(r.finish) },
    { key: 'fl', label: 'شناوری', num: true, render: (r) => (r.float == null ? '—' : fa(r.float, 1)) },
    { key: 'rd', label: 'آمادگی پیش‌نیازها', render: (r) => { const a = byId.get(r.id); const i = a ? igOf(a) : undefined; const [t, l] = READY[i?.readiness ?? 'unknown']; return <span><Chip tone={t}>{l}</Chip>{i?.blockers[0] && <small className="sub" style={{ display: 'block', whiteSpace: 'normal' }}>{i.blockers[0].text}</small>}</span> } },
  ]
  const progCols: Col<ProgressRow>[] = [
    { key: 'c', label: 'کد', render: (r) => <b className="fn-code">{r.code}</b>, sort: (r) => r.code },
    { key: 'n', label: 'فعالیت', render: (r) => acts.find((a) => a.code === r.code)?.name ?? '' },
    { key: 'p', label: 'برنامه‌ای ٪', num: true, render: (r) => fa(r.planned ?? 0, 0) },
    { key: 'a', label: <span>تأییدشده / فایل ٪ <Hint id="pct-approved" /></span>, num: true, render: (r) => (r.actual == null ? '—' : fa(r.actual, 0)) },
    { key: 'r', label: 'گزارش‌شده (تأییدنشده) ٪', num: true, render: (r) => (r.reported == null ? '—' : fa(r.reported, 0)) },
    { key: 'v', label: 'انحراف', num: true, render: (r) => <b style={{ color: '#dc2626' }}>{fa(r.variance ?? 0, 0)}</b>, sort: (r) => r.variance ?? 0 },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label={<span>SPI <Hint id="spi" /></span>} value={m.progress.spi == null ? '—' : fa(m.progress.spi, 2)} sub={`برنامه‌ای ${m.progress.planned == null ? '—' : pct(m.progress.planned / 100, 1)} · واقعی ${m.progress.actual == null ? '—' : pct(m.progress.actual / 100, 1)}`} tone={tone(m.progress.spi)} />
        <KpiCard i={1} label="سهم وزنی با منبع قطعی" value={pct(m.progress.settledShare, 0)} sub="پیشرفت تأییدشده یا درصد فایل" tone={m.progress.settledShare >= 0.6 ? 'good' : 'warn'} />
        <KpiCard i={2} label={<span>پایان پیش‌بینی <Hint id="forecast" /></span>} value={d(f.projectFinish)} sub={slip == null ? 'خط مبنا ندارد' : slip === 0 ? 'مطابق خط مبنا' : `${slip > 0 ? '+' : ''}${fa(slip)} روز نسبت به ${d(m.finish.baselineFinish)}`} tone={slip == null ? 'neutral' : slip > 14 ? 'bad' : slip > 0 ? 'warn' : 'good'} />
        <KpiCard i={3} label="طول پروژه (روز کاری)" value={fa(f.duration)} />
      </div>
      {f.cycle && <div className="im-card ex-bad" style={{ padding: 12 }}>شبکه چرخهٔ منطقی دارد ({f.cycle.slice(0, 8).join('، ')}) و تحلیل مسیر بحرانی انجام نشد.</div>}
      {f.warnings.length > 0 && <div className="im-card" style={{ padding: '8px 12px', fontSize: 12 }}>{f.warnings.slice(0, 4).map((w) => <div key={w}>⚠ {w}</div>)}</div>}

      <Tile title="بیشترین تأخیر پایان نسبت به خط مبنا" hint="روز تقویمی؛ فقط فعالیت‌های مشترک با خط مبنا">
        {slipRows.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>فعالیتی دیرتر از خط مبنا پیش‌بینی نشده است.</p> : <HBars data={slipRows.slice(0, 10).map((s) => ({ name: s.code, value: s.finishSlip ?? 0, color: s.critical ? PB.coral : PB.yellow }))} fmt={(v) => `${fa(v)} روز`} h={Math.max(140, Math.min(10, slipRows.length) * 30 + 20)} />}
      </Tile>

      <Section title={<span>مسیر بحرانی <Hint id="float-cp" /></span>} hint={`${fa(critRows.length)} فعالیت با شناوری صفر (به ترتیب شروع)`} flush>
        <DataTable cols={critCols} rows={critRows} rowKey={(x) => x.a.id} empty="مسیر بحرانی محاسبه نشد." />
      </Section>
      <Section title="نزدیک به بحرانی" hint="شناوری مثبت تا ۱۰ روز کاری" flush>
        <DataTable cols={nearCols} rows={nearRows.slice(0, 60)} rowKey={(x) => x.a.id} empty="فعالیت نزدیک به بحرانی نیست." />
      </Section>
      <Section title="فعالیت‌های عقب‌افتاده از خط مبنا" hint="تا تاریخ وضعیت، ناتمام یا شروع‌نشده" flush>
        <DataTable cols={odCols} rows={m.overdue.slice(0, 100)} rowKey={(r) => r.id} empty="فعالیت عقب‌افتاده‌ای نیست." />
      </Section>
      <Section title={<span>برنامهٔ سه‌هفته‌ای (Lookahead) <Hint id="lookahead" /></span>} hint={`از ${d(m.dataDate)}`} flush>
        <DataTable cols={lookCols} rows={m.look.slice(0, 150)} rowKey={(r) => r.id} empty="فعالیتی در سه هفتهٔ آینده کار ندارد." />
      </Section>
      <Section title="فعالیت‌های عقب‌تر از برنامه (پیشرفت)" hint="انحراف = واقعی − برنامه‌ای (درصد)" flush>
        <DataTable cols={progCols} rows={progRows.slice(0, 100)} rowKey={(r) => r.id} empty="فعالیتی عقب‌تر از برنامه نیست." />
      </Section>
    </div>
  )
}
