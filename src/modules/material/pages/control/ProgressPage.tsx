import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { ChartTip, PB, Tile, axisProps, gridProps } from '../../../finance/components/charts'
import { Chip, DataTable, KpiCard, Section, fmtD, type Col } from '../../../finance/components/fn'
import { ProgressBar, bn, fa, pct } from '../../components/control/common'
import { StageModal } from '../../components/control/StageModal'
import { STAGE_STATUS_LABEL_FA, type ItemStage } from '../../types'
import type { ProgressGroupRow } from '../../lib/control/progress'

const day = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)

/** Supply progress weighted by value. Three views: roll-ups (planned, actual, deviation, value), the inbox of stages waiting for a decision, and the stages that are behind their plan. */
export function ProgressPage({ projectId, sub }: { projectId: string; sub: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const [by, setBy] = useState<'package' | 'station' | 'group'>('package')
  const [pick, setPick] = useState<ItemStage | null>(null)
  const byMat = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const itemOf = useMemo(() => new Map(m.items.map((i) => [i.id, i])), [m.items])
  const defOf = useMemo(() => new Map(cs.stageDefs.map((d) => [d.key, d])), [cs.stageDefs])
  const pkgOf = useMemo(() => new Map(m.packages.map((p) => [p.id, p])), [m.packages])
  const row = (s: ItemStage) => { const it = itemOf.get(s.itemId); const mat = it ? byMat.get(it.materialId) : undefined; const pk = it ? pkgOf.get(it.packageId) : undefined; return { s, it, mat, pk, def: defOf.get(s.stageKey) } }

  const waiting = m.stages.filter((s) => s.applicable && (s.status === 'submitted' || s.status === 'reviewed')).map(row)
  const late = m.stages.filter((s) => s.applicable && s.status !== 'approved' && s.plannedDate && s.plannedDate < m.today).map(row).sort((a, b) => (a.s.plannedDate ?? '').localeCompare(b.s.plannedDate ?? ''))
  const myTurn = (r: ReturnType<typeof row>) => !!r.def && (r.def.reviewLevel === 'employer' ? cs.can(projectId, 'approve_stage') : r.def.reviewLevel === 'both' ? (r.s.status === 'submitted' ? cs.can(projectId, 'review_stage') : cs.can(projectId, 'approve_stage')) : cs.can(projectId, 'review_stage') || cs.can(projectId, 'approve_stage'))

  const stageCols = (withWait: boolean): Col<ReturnType<typeof row>>[] => [
    { key: 'i', label: 'قلم', render: (r) => <><span className="strong">{r.mat?.description ?? '—'}</span><span className="sub fn-code">{r.mat?.materialCode} · {r.pk?.code}</span></> },
    { key: 's', label: 'مرحله', render: (r) => <>{r.def?.title}<span className="sub">وزن {fa(r.s.weight, 1)}٪ · {r.def?.reviewLevel === 'employer' ? 'تأیید کارفرما' : r.def?.reviewLevel === 'both' ? 'مشاور و کارفرما' : 'تأیید مشاور'}</span></> },
    { key: 'st', label: 'وضعیت', render: (r) => <Chip tone={r.s.status === 'rejected' ? 'bad' : r.s.status === 'pending' ? 'neutral' : 'warn'}>{STAGE_STATUS_LABEL_FA[r.s.status]}</Chip> },
    ...(withWait ? [{ key: 'w', label: 'در انتظار از', render: (r: ReturnType<typeof row>) => { const d = r.s.submittedAt ? day(m.today, r.s.submittedAt.slice(0, 10)) : 0; return <>{fmtD(r.s.submittedAt)}<span className="sub" style={{ color: d > 7 ? 'var(--im-coral)' : undefined }}>{fa(d)} روز</span></> } }, { key: 'u', label: 'ارسال‌کننده', render: (r: ReturnType<typeof row>) => (r.s.submittedBy ? cs.people.get(r.s.submittedBy) ?? 'کاربر' : '—') }] as Col<ReturnType<typeof row>>[]
      : [{ key: 'p', label: 'برنامه‌ای', render: (r: ReturnType<typeof row>) => fmtD(r.s.plannedDate) }, { key: 'l', label: 'تأخیر', num: true, render: (r: ReturnType<typeof row>) => <b style={{ color: 'var(--im-coral)' }}>{fa(day(m.today, r.s.plannedDate!))} روز</b>, sort: (r: ReturnType<typeof row>) => day(m.today, r.s.plannedDate!) }, { key: 'r', label: 'مسئول', render: (r: ReturnType<typeof row>) => (r.s.responsible ? cs.people.get(r.s.responsible) ?? '—' : '—') }] as Col<ReturnType<typeof row>>[]),
    { key: 'a', label: '', render: (r) => <button className="im-btn im-btn-sm" onClick={(e) => { e.stopPropagation(); setPick(r.s) }}>{withWait && myTurn(r) ? 'بررسی و تصمیم' : 'باز کردن'}</button> },
  ]
  const modal = pick && (() => { const r = row(pick); return r.it && r.def ? <StageModal projectId={projectId} stage={pick} def={r.def} item={r.it} material={r.mat} onClose={() => setPick(null)} /> : null })()

  if (sub === 'inbox') {
    const mine = waiting.filter(myTurn)
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="fn-kpis"><KpiCard i={0} label="در انتظار تصمیم" value={fa(waiting.length)} tone={waiting.length ? 'warn' : 'good'} /><KpiCard i={1} label="نوبت نقش شما" value={fa(mine.length)} tone={mine.length ? 'warn' : 'neutral'} /><KpiCard i={2} label="بیش از ۷ روز معطل" value={fa(waiting.filter((r) => r.s.submittedAt && day(m.today, r.s.submittedAt.slice(0, 10)) > 7).length)} tone="bad" /></div>
        <Section title="کارتابل تأیید مراحل تأمین" hint="پیشرفت یک مرحله فقط پس از تأیید نقش مجاز و بر پایهٔ مدرک ثبت‌شده منظور می‌شود." flush>
          <DataTable cols={stageCols(true)} rows={[...mine, ...waiting.filter((r) => !mine.includes(r))]} rowKey={(r) => r.s.id} onRow={(r) => setPick(r.s)} empty="مرحله‌ای در انتظار تصمیم نیست." />
        </Section>
        {modal}
      </div>
    )
  }
  if (sub === 'late') {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="fn-kpis"><KpiCard i={0} label="مراحل عقب‌افتاده" value={fa(late.length)} tone={late.length ? 'bad' : 'good'} /><KpiCard i={1} label="بیش از ۳۰ روز" value={fa(late.filter((r) => day(m.today, r.s.plannedDate!) > 30).length)} tone="bad" /><KpiCard i={2} label="بسته‌های درگیر" value={fa(new Set(late.map((r) => r.pk?.id)).size)} /></div>
        <Section title="مراحل از برنامه عقب‌مانده" hint="مرحله‌ای که تاریخ برنامه‌ای‌اش گذشته و هنوز تأیید نشده است (خرید، ساخت، بازرسی، حمل…)." flush>
          <DataTable cols={stageCols(false)} rows={late} rowKey={(r) => r.s.id} onRow={(r) => setPick(r.s)} empty="مرحلهٔ عقب‌افتاده‌ای نیست." />
        </Section>
        {modal}
      </div>
    )
  }
  const tbl: ProgressGroupRow[] = by === 'package' ? m.byPackage : by === 'station' ? m.byStation : m.byGroup
  const curve = m.curve.map((c) => ({ name: fmtD(c.date), planned: Math.round(c.planned * 1000) / 10, actual: Math.round(c.actual * 1000) / 10 }))
  const p = m.progress
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="پیشرفت وزنی واقعی" value={pct(p.actual, 1)} tone="good" sub="مراحل تأییدشده با مدرک" />
        <KpiCard i={1} label="پیشرفت وزنی برنامه‌ای" value={pct(p.planned, 1)} />
        <KpiCard i={2} label="انحراف" value={`${p.deviation >= 0 ? '+' : ''}${fa(p.deviation * 100, 1)}٪`} tone={p.deviation < -0.1 ? 'bad' : p.deviation < -0.02 ? 'warn' : 'good'} sub="واقعی منهای برنامه‌ای" />
        <KpiCard i={3} label="ارزش مبنای بسته‌ها" value={bn(p.value)} unit="میلیارد" sub={`ریال · ${fa(m.items.length)} قلم در ${fa(m.packages.length)} بسته`} />
      </div>
      <Tile title="منحنی پیشرفت وزنی" hint="٪ از ارزش مبنا؛ تاریخ تأیید و تاریخ برنامه‌ای مراحل">
        {curve.length < 2 ? <p className="im-helper" style={{ margin: '24px 0', textAlign: 'center' }}>داده‌ای برای منحنی نیست؛ تاریخ برنامه‌ای مراحل را ثبت کنید.</p> : (
          <div dir="ltr" style={{ height: 290 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={curve} margin={{ left: 0, right: 8, top: 8 }}>
            <defs><linearGradient id="pgA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PB.yellow} stopOpacity={0.4} /><stop offset="100%" stopColor={PB.yellow} stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid {...gridProps} /><XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" /><YAxis {...axisProps} width={36} domain={[0, 100]} tickFormatter={(x: number) => fa(x)} />
            <Tooltip content={<ChartTip unit="٪" />} /><Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            <Line type="monotone" dataKey="planned" name="برنامه‌ای" stroke={PB.blue} strokeWidth={2.4} strokeDasharray="5 4" dot={false} /><Area type="monotone" dataKey="actual" name="واقعی" stroke={PB.yellow} strokeWidth={2.6} fill="url(#pgA)" dot={false} />
          </ComposedChart></ResponsiveContainer></div>
        )}
      </Tile>
      <div className="mt-filters no-print"><div className="mt-pills">{([['package', 'بسته خرید'], ['station', 'ایستگاه'], ['group', 'گروه کالا']] as const).map(([k, l]) => <button key={k} className={`mt-pill${by === k ? ' on' : ''}`} onClick={() => setBy(k)}>{l}</button>)}</div></div>
      <DataTable rows={tbl} rowKey={(r) => r.key} empty="قلمی در بستهٔ خرید نیست." foot cols={[
        { key: 'l', label: by === 'package' ? 'بسته' : by === 'station' ? 'ایستگاه' : 'گروه کالا', render: (r) => <span className="strong">{r.label}</span> },
        { key: 'i', label: 'قلم', num: true, render: (r) => fa(r.items) },
        { key: 'v', label: 'ارزش (میلیارد)', num: true, render: (r) => bn(r.value), sort: (r) => r.value, foot: <b>{bn(tbl.reduce((a, r) => a + r.value, 0))}</b> },
        { key: 'a', label: 'واقعی', render: (r) => <div style={{ minWidth: 120 }}><ProgressBar actual={r.actual} planned={r.planned} /><small>{pct(r.actual, 1)}</small></div>, sort: (r) => r.actual },
        { key: 'p', label: 'برنامه‌ای', num: true, render: (r) => pct(r.planned, 1), sort: (r) => r.planned },
        { key: 'd', label: 'انحراف', num: true, render: (r) => <span style={{ color: r.deviation < -0.05 ? 'var(--im-coral)' : undefined }}>{r.deviation >= 0 ? '+' : ''}{fa(r.deviation * 100, 1)}٪</span>, sort: (r) => r.deviation },
        { key: 'e', label: 'ارزش کسب‌شده (میلیارد)', num: true, render: (r) => bn(r.value * r.actual, 2), sort: (r) => r.value * r.actual, foot: <b>{bn(tbl.reduce((a, r) => a + r.value * r.actual, 0), 2)}</b> },
      ]} />
      <p className="im-helper" style={{ margin: 0 }}>پیشرفت وزنی با «پیشرفت فیزیکی تحویل» یکی نیست: رسیدن کالا به کارگاه فقط مرحلهٔ ورود را کامل می‌کند، نه همهٔ مراحل را. مقدار تحویل‌شده در «موجودی و انبار» دیده می‌شود.</p>
    </div>
  )
}
