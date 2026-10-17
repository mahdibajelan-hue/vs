import { useMemo } from 'react'
import { addDays, daysBetween, jalaliText } from '../../execution/lib/periods'
import { engProgress, DEFAULT_ENG_RULES } from '../../execution/lib/engine/engineering'
import type { EpcModel } from '../../execution/lib/useEpcModel'
import { useEpcStore } from '../../execution/store/useEpcStore'
import { ENG_STATUS_LABEL_FA } from '../../execution/epcTypes'
import { Chip, DataTable, KpiCard, Section, type Col } from '../../finance/components/fn'
import { Donut, HBars, PB, Ring, Tile } from '../../finance/components/charts'
import { Empty, fa, pct } from '../../execution/components/common'
import { ProgressCurve } from '../../execution/components/ProgressCurve'
import { COURT_COLOR, COURT_LABEL_FA, courtCounts, courtOf, type EngLens } from '../lib/roles'
import { LensBar, useLens } from '../components/LensBar'

const d = (x: string | null) => (x ? jalaliText(x) : '—')
const num = (v: number) => fa(v, 0)

/** Power BI–style dashboard: weighted progress, who holds the ball, aging, discipline/phase breakdown, execution impact — with a KPI row that changes with the viewer's role. */
export function EngDash({ m, projectId }: { m: EpcModel; projectId: string }) {
  const { eng } = m
  const rows = useEpcStore((s) => s.engDocs).filter((x) => x.projectId === projectId)
  const { lens, setLens, canSwitch, real } = useLens(projectId)
  const live = rows.filter((x) => x.status !== 'superseded')
  const blocking = useMemo(() => new Set(m.impacts.filter((i) => i.state !== 'ok' && i.state !== 'restricted' && (!i.needDate || i.needDate <= addDays(m.today, 21))).map((i) => i.docId)), [m.impacts, m.today])
  if (!live.length) return <Empty><b style={{ display: 'block', marginBottom: 6 }}>فهرست مدارک مهندسی خالی است</b>در «فهرست مدارک» فهرست MDL را وارد کنید (ورود از اکسل) یا مدارک را دستی ثبت کنید.</Empty>

  const pr = eng.progress, today = m.today
  const from = m.engDocs.flatMap((x) => [x.plannedPrepared, x.actualPrepared]).filter((x): x is string => !!x).sort()[0] ?? today
  const to = [...m.engDocs.flatMap((x) => [x.plannedApproved, x.actualApproved]).filter((x): x is string => !!x), today].sort().slice(-1)[0]
  const span = Math.max(14, daysBetween(from, to)), step = Math.max(7, Math.ceil(span / 24 / 7) * 7)
  const curve: { date: string; planned: number; actual: number; registered: number }[] = []
  for (let t = from; t <= to; t = addDays(t, step)) { const s = engProgress(m.engDocs, t, DEFAULT_ENG_RULES); curve.push({ date: t, planned: s.plannedScore, actual: t <= today ? s.actualScore : 0, registered: t <= today ? s.actualPrepared : 0 }) }
  const sparkA = curve.filter((c) => c.date <= today).map((c) => c.actual * 100)
  const courts = courtCounts(live)
  const totalW = live.reduce((s, x) => s + x.weight, 0) || 1
  const overdue = (r: (typeof live)[number]) => { const c = courtOf(r.status); const due = c === 'contractor' ? r.plannedPrepared : r.plannedApproved; return c !== 'done' && due && due < today ? daysBetween(due, today) : 0 }
  const overdueRows = live.map((r) => ({ r, days: overdue(r) })).filter((x) => x.days > 0)
  const byCourtOverdue = (c: ReturnType<typeof courtOf>) => overdueRows.filter((x) => courtOf(x.r.status) === c).length
  const buckets = [['۱ تا ۷ روز', 1, 7], ['۸ تا ۱۴ روز', 8, 14], ['۱۵ تا ۳۰ روز', 15, 30], ['بیش از ۳۰ روز', 31, 9999]] as const
  const aging = buckets.map(([name, lo, hi], i) => ({ name, value: overdueRows.filter((x) => x.days >= lo && x.days <= hi).length, color: [PB.yellow, PB.orange, PB.coral, '#b91c1c'][i] }))
  const statusFunnel = (['required', 'in_preparation', 'issued', 'pending_approval', 'restricted', 'approved'] as const).map((s, i) => ({ name: ENG_STATUS_LABEL_FA[s], value: live.filter((x) => x.status === s).reduce((n, x) => n + x.weight, 0) / totalW * 100, color: [PB.slate, PB.sky, PB.blue, PB.violet, PB.yellow, PB.green][i] }))
  const donut = (Object.keys(courts) as (keyof typeof courts)[]).map((c) => ({ name: COURT_LABEL_FA[c], value: courts[c].w / totalW * 100, color: COURT_COLOR[c] }))
  const phaseP = (ph: string) => { const ids = new Set(live.filter((x) => x.phase === ph).map((x) => x.id)); return ids.size ? engProgress(m.engDocs.filter((x) => ids.has(x.id)), today, DEFAULT_ENG_RULES) : null }
  const dp = phaseP('DP1'), pp = phaseP('PP1')
  const disc = eng.byDiscipline.slice(0, 12).map((x, i) => ({ name: x.key || '—', value: x.p.actualScore * 100, color: x.p.actualScore + 0.03 >= x.p.plannedScore ? PB.green : x.p.actualScore + 0.15 >= x.p.plannedScore ? PB.yellow : PB.coral, i }))
  const typeBars = Object.entries(live.reduce<Record<string, { n: number; done: number }>>((a, x) => { const k = x.category || '—'; const e = a[k] ?? { n: 0, done: 0 }; e.n++; if (x.status === 'approved' || x.status === 'restricted') e.done++; a[k] = e; return a }, {})).sort((a, b) => b[1].n - a[1].n).slice(0, 10).map(([k, v]) => ({ name: `${k} (${fa(v.n)})`, value: v.n ? v.done / v.n * 100 : 0, color: PB.teal }))
  const impacted = [...eng.notReady].sort((a, b) => b.remaining - a.remaining).slice(0, 8)

  const kpiRole = (l: EngLens) => {
    if (l === 'contractor') return [
      <KpiCard key="a" i={0} label="با پیمانکار / طراح" value={fa(courts.contractor.n)} sub={`${pct(courts.contractor.w / totalW, 0)} وزن`} tone={courts.contractor.n ? 'warn' : 'good'} />,
      <KpiCard key="b" i={1} label="معوق تهیه" value={fa(byCourtOverdue('contractor'))} tone={byCourtOverdue('contractor') ? 'bad' : 'good'} sub="از موعد برنامه‌ای گذشته" />,
      <KpiCard key="c" i={2} label="مسدودکنندهٔ اجرا" value={fa(blocking.size)} tone={blocking.size ? 'bad' : 'good'} sub="مدرک مانع شروع/ادامهٔ فعالیت" />,
      <KpiCard key="d" i={3} label="برگشتی از مشاور" value={fa(live.filter((x) => x.status === 'in_preparation' && x.actualPrepared).length)} sub="در حال اصلاح" />,
    ]
    if (l === 'consultant') return [
      <KpiCard key="a" i={0} label="در صف بررسی مشاور" value={fa(courts.consultant.n)} tone={courts.consultant.n ? 'warn' : 'good'} sub={`${pct(courts.consultant.w / totalW, 0)} وزن`} />,
      <KpiCard key="b" i={1} label="بررسی معوق" value={fa(byCourtOverdue('consultant'))} tone={byCourtOverdue('consultant') ? 'bad' : 'good'} />,
      <KpiCard key="c" i={2} label="بحرانی در صف" value={fa(live.filter((x) => x.critical && courtOf(x.status) === 'consultant').length)} tone="warn" />,
      <KpiCard key="d" i={3} label="تأیید با محدودیت" value={fa(live.filter((x) => x.status === 'restricted').length)} sub="نیازمند رفع محدودیت" />,
    ]
    if (l === 'employer') return [
      <KpiCard key="a" i={0} label="تأییدشده" value={fa(courts.done.n)} tone="good" sub={`${pct(courts.done.w / totalW, 0)} وزن`} />,
      <KpiCard key="b" i={1} label="در بررسی مشاور" value={fa(courts.consultant.n)} tone={courts.consultant.n ? 'warn' : 'good'} sub={`${pct(courts.consultant.w / totalW, 0)} وزن`} />,
      <KpiCard key="c" i={2} label="با پیمانکار" value={fa(courts.contractor.n)} sub="در حال تهیه" />,
      <KpiCard key="d" i={3} label="بیشترین اثر بر تکمیل" value={eng.slipMax == null ? 'نامشخص' : `${fa(eng.slipMax)} روز`} tone={eng.slipMax ? 'bad' : 'neutral'} />,
    ]
    return [
      <KpiCard key="a" i={0} label="پیش‌بینی تکمیل مدارک" value={eng.completion.date ? jalaliText(eng.completion.date) : '—'} sub={eng.completion.reason} />,
      <KpiCard key="b" i={1} label="مدارک بحرانی باز" value={fa(eng.criticalOpen.length)} tone={eng.criticalOpen.some((c) => c.fc.overdue) ? 'bad' : 'neutral'} sub={`${fa(eng.criticalOpen.filter((c) => c.fc.overdue).length)} عقب‌افتاده`} />,
      <KpiCard key="c" i={2} label="فعالیت غیرآمادهٔ اجرا" value={fa(eng.notReady.length)} tone={eng.notReady.length ? 'bad' : 'good'} />,
      <KpiCard key="d" i={3} label="بیشترین اثر بر تکمیل" value={eng.slipMax == null ? 'نامشخص' : `${fa(eng.slipMax)} روز`} tone={eng.slipMax ? 'bad' : 'neutral'} />,
    ]
  }

  const lateCols: Col<(typeof overdueRows)[number]>[] = [
    { key: 'd', label: 'مدرک', render: ({ r }) => <><b>{r.docNo}</b>{r.critical && <Chip tone="bad">بحرانی</Chip>}{blocking.has(r.id) && <Chip tone="warn">مانع اجرا</Chip>}<span className="sub">{r.title}</span></> },
    { key: 'c', label: 'رشته', render: ({ r }) => <>{r.discipline}{r.category ? <span className="sub">{r.category}</span> : null}</> },
    { key: 'o', label: 'توپ دست', render: ({ r }) => <span style={{ color: COURT_COLOR[courtOf(r.status)], fontWeight: 700 }}>{COURT_LABEL_FA[courtOf(r.status)]}</span> },
    { key: 's', label: 'وضعیت', render: ({ r }) => ENG_STATUS_LABEL_FA[r.status] },
    { key: 'p', label: 'موعد', render: ({ r }) => d(courtOf(r.status) === 'contractor' ? r.plannedPrepared : r.plannedApproved) },
    { key: 'x', label: 'تأخیر', num: true, sort: (x) => x.days, render: (x) => <b className="ex-bad">{fa(x.days)} روز</b> },
  ]
  const top = overdueRows.filter((x) => lens === 'manager' || lens === 'employer' || courtOf(x.r.status) === lens).sort((a, b) => Number(blocking.has(b.r.id)) - Number(blocking.has(a.r.id)) || b.days - a.days).slice(0, 12)

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <LensBar lens={lens} setLens={setLens} canSwitch={canSwitch} real={real} />
      <div className="fn-kpis">
        <KpiCard i={0} label="امتیاز پیشرفت وزنی مهندسی" value={pct(pr.actualScore, 1)} tone={pr.actualScore + 0.03 >= pr.plannedScore ? 'good' : 'warn'} sub={`برنامه ${pct(pr.plannedScore, 1)}`} spark={sparkA} sparkColor={PB.teal} />
        <KpiCard i={1} label="پیشرفت تهیه" value={pct(pr.actualPrepared, 1)} sub={`برنامه ${pct(pr.plannedPrepared, 1)}`} spark={curve.filter((c) => c.date <= today).map((c) => c.registered * 100)} sparkColor={PB.blue} />
        <KpiCard i={2} label="پیشرفت تأیید" value={pct(pr.actualApproved, 1)} sub={`برنامه ${pct(pr.plannedApproved, 1)}`} />
        <KpiCard i={3} label="آمادهٔ اجرا" value={pct(pr.ready, 1)} sub="تأییدشدهٔ کامل + سهم تأیید با محدودیت" />
      </div>
      <div className="fn-kpis">{kpiRole(lens)}</div>
      <div className="fn-tiles">
        <Tile title="روند پیشرفت مهندسی" hint="برنامه در برابر واقعی؛ خط آبی: پیشرفت تهیه" span={2}><ProgressCurve data={curve} h={230} /></Tile>
        <Tile title="توپ دست کیست؟" hint="سهم وزنی مدارک باز نزد هر طرف"><Donut data={donut} fmt={(v) => `${fa(v, 1)}٪`} center={{ v: fa(live.length), l: 'مدرک فعال' }} /></Tile>
        <Tile title="قیف وضعیت مدارک" hint="سهم وزنی در هر وضعیت"><HBars data={statusFunnel} fmt={(v) => `${fa(v, 1)}٪`} /></Tile>
        <Tile title="مراحل پروژه" hint="طراحی تفصیلی (DP1) و مهندسی تدارکات (PP1)">
          <div style={{ display: 'flex', gap: 14, justifyContent: 'space-around', flexWrap: 'wrap', padding: '6px 0' }}>
            <Ring pct={dp ? dp.actualScore * 100 : null} color={PB.teal} label="طراحی تفصیلی" />
            <Ring pct={pp ? pp.actualScore * 100 : null} color={PB.violet} label="مهندسی تدارکات" />
            <Ring pct={pr.ready * 100} color={PB.green} label="آمادهٔ اجرا" />
          </div>
        </Tile>
        <Tile title="سن تأخیر مدارک معوق" hint={`${fa(overdueRows.length)} مدرک از موعد گذشته`}><HBars data={aging} fmt={num} /></Tile>
        <Tile title="تکمیل بر حسب نوع مدرک" hint="درصد تأییدشده از هر نوع (تعداد در پرانتز)"><HBars data={typeBars} fmt={(v) => `${fa(v, 0)}٪`} /></Tile>
        <Tile title="پیشرفت وزنی به‌تفکیک رشته" hint="سبز: مطابق برنامه · زرد: کمی عقب · قرمز: عقب" span={3}><HBars data={disc} fmt={(v) => `${fa(v, 1)}٪`} h={Math.max(160, disc.length * 34 + 20)} /></Tile>
      </div>
      <Section title={lens === 'manager' ? 'مدارک معوق (همهٔ طرف‌ها)' : `مدارک معوق نزد ${lens === 'employer' ? 'مشاور' : COURT_LABEL_FA[lens]}`} hint="مدارک مانع اجرا و بحرانی در صدر" flush>
        <DataTable cols={lateCols} rows={top} rowKey={(x) => x.r.id} empty="مدرک معوقی نزد این نقش نیست." />
      </Section>
      {impacted.length > 0 && (
        <Section title="فعالیت‌های غیرآمادهٔ اجرا به‌دلیل مدارک" hint="بیشترین مقدار باقی‌مانده" flush>
          <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>فعالیت</th><th>دلیل</th></tr></thead>
            <tbody>{impacted.map((i) => <tr key={i.activityId}><td style={{ maxWidth: 360, whiteSpace: 'normal' }}>{m.ex.actById.get(i.activityId)?.title ?? '—'}</td><td className="sub" style={{ whiteSpace: 'normal' }}>{i.exec.reasons.join('؛ ')}</td></tr>)}</tbody></table></div>
        </Section>
      )}
      <div className="im-card" style={{ padding: 12, fontSize: 12.5, lineHeight: 1.9 }}>
        <b>روش محاسبه:</b> هر مدرک با وزن خودش (سهم W.F در فهرست MDL) در پیشرفت شرکت می‌کند. «تهیه» از وضعیت «ارسال‌شده» به بعد و «تأیید» با تأیید نهایی یا تأیید با محدودیت شمرده می‌شود؛ مدارک منسوخ و بدون وزن حذف می‌شوند. «توپ دست کیست» از وضعیت مدرک برمی‌آید: شروع‌نشده/در حال تهیه ← پیمانکار، ارسال‌شده ← مشاور، در انتظار تأیید/با محدودیت ← کارفرما.
      </div>
    </div>
  )
}
