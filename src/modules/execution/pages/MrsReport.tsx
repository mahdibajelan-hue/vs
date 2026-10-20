import { Fragment, useEffect, useMemo, useState } from 'react'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { useMaterialStore } from '../../material/store/useMaterialStore'
import { PIPE_STAGE_FA, PIPE_STAGE_OF_FORM, pipeProgress, type PipeStage } from '../lib/registers'
import { Chip, KpiCard, Section, fmtD } from '../../finance/components/fn'
import { Empty, fa } from '../components/common'

/** Pipes received into the site warehouse, grouped by MRS (the warehouse receipt created in the Material module) with where each pipe has got to — all read from shared records. */
export function MrsReport({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const pipesAll = useEpcStore((s) => s.pipes)
  const welds = useEpcStore((s) => s.welds)
  const receipts = useMaterialStore((s) => s.warehouseReceipts)
  const matLoaded = useMaterialStore((s) => s.loaded), fetchMaterial = useMaterialStore((s) => s.fetchAll)
  useEffect(() => { if (!matLoaded) void fetchMaterial() }, [matLoaded, fetchMaterial])
  const [open, setOpen] = useState('')
  const pipes = useMemo(() => pipesAll.filter((p) => p.projectId === projectId), [pipesAll, projectId])
  const progress = useMemo(() => {
    const items: { pipe: unknown; stage: PipeStage; date: string }[] = []
    const rep = new Map(m.reports.map((r) => [r.id, r]))
    for (const l of m.lines) { const r = rep.get(l.reportId); const st = r && PIPE_STAGE_OF_FORM[r.formKey]; if (st && l.detail.pipeNo) items.push({ pipe: l.detail.pipeNo, stage: st, date: r.reportDate }) }
    for (const w of welds) if (w.projectId === projectId && w.status !== 'merged' && w.central.pipe) items.push({ pipe: w.central.pipe, stage: 'welded', date: '' })
    return pipeProgress(items)
  }, [m.lines, m.reports, welds, projectId])
  const mrs = useMemo(() => receipts.filter((r) => r.masterProjectId === projectId && r.receiptNumber.startsWith('MRS-')).sort((a, b) => b.receiptDate.localeCompare(a.receiptDate) || b.receiptNumber.localeCompare(a.receiptNumber)), [receipts, projectId])
  const loose = pipes.filter((p) => !p.receiptId)
  const stageOf = (key: string): PipeStage => progress.get(key)?.last ?? 'received'
  const totalLen = pipes.reduce((s, p) => s + (p.lengthM ?? 0), 0)
  const used = pipes.filter((p) => stageOf(p.key) !== 'received').length
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard label="لوله‌های ورودی به کارگاه" value={fa(pipes.length)} sub={`${fa(Math.round(totalLen))} متر`} />
        <KpiCard i={1} label="رسیدهای MRS" value={fa(mrs.length)} />
        <KpiCard i={2} label="در مصرف (ریسه تا جوش)" value={fa(used)} sub={`${fa(pipes.length - used)} هنوز در انبار`} />
      </div>
      <Section title="رسیدهای ورود لوله (MRS)" hint="ثبت در «کالا ← موجودی و انبار ← ورود لوله به کارگاه (MRS)» انجام می‌شود و اینجا فقط خوانده می‌شود. مرحلهٔ هر لوله از فرم‌های ریسه، خم‌کاری، فیت‌آپ و جوشکاری مشتق می‌شود.">
        {mrs.length === 0 && loose.length === 0 ? <Empty>هنوز ورود لوله‌ای ثبت نشده است.</Empty> : (
          <div className="fn-tbl-wrap" style={{ maxHeight: 620 }}><table className="ex-lines"><thead><tr><th>MRS</th><th>تاریخ</th><th className="num">تعداد لوله</th><th className="num">طول کل (m)</th><th>مصرف‌شده</th><th /></tr></thead>
            <tbody>{mrs.map((r) => { const ps = pipes.filter((p) => p.receiptId === r.id), len = ps.reduce((s, p) => s + (p.lengthM ?? 0), 0), u = ps.filter((p) => stageOf(p.key) !== 'received').length
              return (<Fragment key={r.id}>
                <tr onClick={() => setOpen(open === r.id ? '' : r.id)} style={{ cursor: 'pointer' }}><td dir="ltr"><b>{r.receiptNumber}</b></td><td>{fmtD(r.receiptDate)}</td><td className="num">{fa(ps.length)}</td><td className="num">{fa(Math.round(len * 10) / 10, 1)}</td><td>{fa(u)} از {fa(ps.length)}</td><td className="sub">{r.notes}</td></tr>
                {open === r.id && <tr><td colSpan={6}><table className="ex-lines"><thead><tr><th>شمارهٔ لوله</th><th>Heat</th><th className="num">قطر</th><th className="num">ضخامت</th><th className="num">طول</th><th>بارنامه</th><th>وضعیت</th><th>پیشرفت</th></tr></thead>
                  <tbody>{ps.map((p) => <tr key={p.id}><td dir="ltr"><b>{p.raw}</b></td><td dir="ltr">{p.heatNo || '—'}</td><td className="num">{p.odIn ?? '—'}</td><td className="num">{p.wtIn ?? '—'}</td><td className="num">{p.lengthM ?? '—'}</td><td dir="ltr">{p.wayBill || '—'}</td><td>{p.status === 'in_stock' ? 'سالم' : <Chip tone="warn">{p.status === 'rejected' ? 'مردود' : 'اسقاط'}</Chip>}</td><td><Chip tone={stageOf(p.key) === 'welded' ? 'good' : 'neutral'}>{PIPE_STAGE_FA[stageOf(p.key)]}</Chip></td></tr>)}</tbody></table></td></tr>}
              </Fragment>) })}
              {loose.length > 0 && <tr><td colSpan={6} className="sub">{fa(loose.length)} لوله بدون MRS (ثبت‌شده پیش از این سازوکار).</td></tr>}</tbody></table></div>
        )}
      </Section>
    </div>
  )
}
