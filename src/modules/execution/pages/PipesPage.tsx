import { useMemo, useState } from 'react'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { useMaterialStore } from '../../material/store/useMaterialStore'
import { PIPE_STAGE_FA, PIPE_STAGE_OF_FORM, pipeProgress, registerKey, type Pipe, type PipeStage } from '../lib/registers'
import { Chip, KpiCard, NumInput, Section, fmtD } from '../../finance/components/fn'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { Empty, fa } from '../components/common'
import { EpcGate } from '../components/epc/EpcBanner'

const ST_FA = { in_stock: 'سالم', rejected: 'مردود', scrapped: 'اسقاط' } as const
const today = () => new Date().toISOString().slice(0, 10)
const num = (v: unknown): number | null => { const n = Number(String(v ?? '').replace('٫', '.').replace(',', '.').trim()); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null }

/** Pipes received into the warehouse: one record per pipe with its entry date and specifications. Stringing, bending, fit-up and welding refer to the pipe by number; where it has got to is derived from those forms. */
export function PipesPage({ projectId }: { projectId: string }) { return <EpcGate><Inner projectId={projectId} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const epc = useEpcStore()
  const m = useExecutionModel(projectId)
  const mats = useMaterialStore((s) => s.materials).filter((x) => x.masterProjectId === projectId)
  const can = useExecutionStore((s) => s.can(projectId, 'record') || s.can(projectId, 'review') || s.can(projectId, '*') || s.can(projectId, 'configure'))
  const pipes = useMemo(() => epc.pipes.filter((p) => p.projectId === projectId), [epc.pipes, projectId])
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('')
  const [msg, setMsg] = useState('')
  const [date, setDate] = useState(today())
  const [one, setOne] = useState({ raw: '', heatNo: '', odIn: null as number | null, wtIn: null as number | null, lengthM: null as number | null, grade: '', supplier: '', wayBill: '', material: '' })
  const [paste, setPaste] = useState('')
  const matByCode = useMemo(() => new Map(mats.map((x) => [x.materialCode, x])), [mats])

  // where each pipe has got to: every row of every form that names it + the pipe numbers held by the weld records
  const progress = useMemo(() => {
    const items: { pipe: unknown; stage: PipeStage; date: string }[] = []
    const rep = new Map(m.reports.map((r) => [r.id, r]))
    for (const l of m.lines) { const r = rep.get(l.reportId); const st = r && PIPE_STAGE_OF_FORM[r.formKey]; if (st && l.detail.pipeNo) items.push({ pipe: l.detail.pipeNo, stage: st, date: r.reportDate }) }
    for (const w of epc.welds) if (w.projectId === projectId && w.status !== 'merged' && w.central.pipe) items.push({ pipe: w.central.pipe, stage: 'welded', date: '' })
    return pipeProgress(items)
  }, [m.lines, m.reports, epc.welds, projectId])
  const stageOf = (p: Pipe): PipeStage => progress.get(p.key)?.last ?? 'received'
  const rows = pipes.filter((p) => (!q || `${p.raw} ${p.heatNo} ${p.wayBill}`.toLowerCase().includes(q.toLowerCase())) && (!stage || stageOf(p) === stage))
  const total = pipes.reduce((s, p) => s + (p.lengthM ?? 0), 0)
  // pipe-delivery forms already recorded: offer them as the source instead of retyping
  const fromForm = useMemo(() => {
    const rep = new Map(m.reports.map((r) => [r.id, r])), have = new Set(pipes.map((p) => p.key))
    const out: (Partial<Pipe> & { raw: string; entryDate: string })[] = []
    for (const l of m.lines) {
      const r = rep.get(l.reportId); if (!r || r.formKey !== 'pipe_entry' || r.status === 'rejected') continue
      const raw = String(l.detail.pipeNo ?? '').trim(); if (!raw || have.has(registerKey(raw))) continue
      out.push({ raw, entryDate: r.reportDate, lengthM: num(l.detail.lengthM), wtIn: num(l.detail.thkIn), odIn: num(l.detail.sizeIn), wayBill: String(l.detail.wayBill ?? l.detail.billNo ?? ''), supplier: String(r.data.origin ?? ''), entryLineId: l.id })
    }
    return out
  }, [m.lines, m.reports, pipes])
  const report = (r: { added: number; skipped: string[] } | null) => setMsg(r ? `${fa(r.added)} لوله ثبت شد${r.skipped.length ? `؛ ${fa(r.skipped.length)} شمارهٔ تکراری رد شد: ${r.skipped.slice(0, 8).join('، ')}${r.skipped.length > 8 ? '…' : ''}` : ''}.` : '')
  const addOne = async () => { const r = await epc.savePipes(projectId, [{ ...one, entryDate: date, materialId: matByCode.get(one.material.split(' ')[0])?.id ?? null }]); report(r); if (r?.added) setOne({ ...one, raw: '', heatNo: '', lengthM: null, wayBill: one.wayBill }) }
  const addPaste = async () => {
    const parsed = paste.split('\n').map((ln) => ln.split('\t').map((x) => x.trim())).filter((c) => c[0]).map((c) => ({ raw: c[0], heatNo: c[1] ?? '', odIn: num(c[2]), wtIn: num(c[3]), lengthM: num(c[4]), grade: c[5] ?? '', supplier: c[6] ?? '', wayBill: c[7] ?? '', entryDate: date }))
    const r = await epc.savePipes(projectId, parsed); report(r); if (r) setPaste('')
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard label="لوله‌های ورودی به انبار" value={fa(pipes.length)} sub={`${fa(Math.round(total))} متر`} />
        {(['received', 'strung', 'bent', 'welded'] as PipeStage[]).map((s, i) => <KpiCard key={s} i={i + 1} label={PIPE_STAGE_FA[s] + (s === 'received' ? ' (هنوز مصرف نشده)' : '')} value={fa(pipes.filter((p) => stageOf(p) === s).length)} onClick={() => setStage(stage === s ? '' : s)} />)}
      </div>
      {can && (
        <Section title="ثبت ورود لوله به انبار" hint="هر لوله فقط یک‌بار ثبت می‌شود (شمارهٔ تکراری رد می‌شود). مشخصات (قطر، ضخامت، طول) از همین‌جا در فرم‌های ریسه، خم‌کاری و فیت‌آپ پیشنهاد می‌شود و دوباره تایپ نمی‌شود.">
          <div className="ex-sheet-grid">
            <label>تاریخ ورود *<JalaliDateInput value={date} onChange={setDate} /></label>
            <label>شمارهٔ لوله *<input dir="ltr" value={one.raw} onChange={(e) => setOne({ ...one, raw: e.target.value })} /></label>
            <label>شمارهٔ ذوب (Heat)<input dir="ltr" value={one.heatNo} onChange={(e) => setOne({ ...one, heatNo: e.target.value })} /></label>
            <label>قطر (in)<NumInput value={one.odIn ?? 0} label="قطر" decimals={2} onCommit={(n) => setOne({ ...one, odIn: n || null })} /></label>
            <label>ضخامت (in)<NumInput value={one.wtIn ?? 0} label="ضخامت" decimals={3} onCommit={(n) => setOne({ ...one, wtIn: n || null })} /></label>
            <label>طول (m)<NumInput value={one.lengthM ?? 0} label="طول" decimals={2} onCommit={(n) => setOne({ ...one, lengthM: n || null })} /></label>
            <label>گرید / استاندارد<input dir="ltr" value={one.grade} onChange={(e) => setOne({ ...one, grade: e.target.value })} /></label>
            <label>تأمین‌کننده<input dir="auto" value={one.supplier} onChange={(e) => setOne({ ...one, supplier: e.target.value })} /></label>
            <label>شمارهٔ بارنامه<input dir="ltr" value={one.wayBill} onChange={(e) => setOne({ ...one, wayBill: e.target.value })} /></label>
            <label className="wide">کالا در ماژول مدیریت کالا (اختیاری)<input list="ex-pipe-mat" dir="auto" value={one.material} onChange={(e) => setOne({ ...one, material: e.target.value })} placeholder="کد یا شرح ردیف MTO لوله" /></label>
            <datalist id="ex-pipe-mat">{mats.slice(0, 600).map((x) => <option key={x.id} value={x.materialCode}>{x.description}</option>)}</datalist>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="im-btn im-btn-primary im-btn-sm" disabled={!one.raw.trim()} onClick={() => void addOne()}>ثبت لوله</button>
            {fromForm.length > 0 && <button className="im-btn im-btn-sm" onClick={async () => report(await epc.savePipes(projectId, fromForm))}>درون‌ریزی {fa(fromForm.length)} لوله از صورتجلسه‌های ورود ثبت‌شده</button>}
            {msg && <span className="im-helper" style={{ margin: 0 }}>{msg}</span>}
          </div>
          <details style={{ marginTop: 10 }}><summary className="im-helper">ثبت گروهی (چسباندن از اکسل)</summary>
            <p className="im-helper">ستون‌ها به‌ترتیب: شمارهٔ لوله، Heat، قطر، ضخامت، طول، گرید، تأمین‌کننده، بارنامه — تاریخ ورود همان تاریخ بالاست. شمارهٔ تکراری رد می‌شود و باقی ثبت می‌شود.</p>
            <textarea rows={6} dir="ltr" value={paste} onChange={(e) => setPaste(e.target.value)} style={{ width: '100%' }} aria-label="چسباندن از اکسل" />
            <button className="im-btn im-btn-sm" disabled={!paste.trim()} onClick={() => void addPaste()}>ثبت گروهی</button>
          </details>
        </Section>
      )}
      <Section title="لوله‌های ورودی" action={<span style={{ display: 'inline-flex', gap: 6 }}><select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="مرحله"><option value="">همهٔ مراحل</option>{(Object.keys(PIPE_STAGE_FA) as PipeStage[]).map((s) => <option key={s} value={s}>{PIPE_STAGE_FA[s]}</option>)}</select><input placeholder="جست‌وجوی شماره، Heat، بارنامه…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} /></span>}>
        {rows.length === 0 ? <Empty>لوله‌ای ثبت نشده است.</Empty> : (
          <div className="fn-tbl-wrap" style={{ maxHeight: 520 }}><table className="ex-lines"><thead><tr><th>شمارهٔ لوله</th><th>تاریخ ورود</th><th>Heat</th><th className="num">قطر</th><th className="num">ضخامت</th><th className="num">طول (m)</th><th>تأمین‌کننده</th><th>بارنامه</th><th>کالا</th><th>وضعیت</th><th>پیشرفت (از فرم‌ها)</th></tr></thead>
            <tbody>{rows.map((p) => { const pr = progress.get(p.key)
              return <tr key={p.id}><td dir="ltr"><b>{p.raw}</b></td><td>{fmtD(p.entryDate)}</td><td dir="ltr">{p.heatNo || '—'}</td><td className="num">{p.odIn ?? '—'}</td><td className="num">{p.wtIn ?? '—'}</td><td className="num">{p.lengthM ?? '—'}</td><td>{p.supplier || '—'}</td><td dir="ltr">{p.wayBill || '—'}</td>
                <td dir="ltr">{p.materialId ? mats.find((x) => x.id === p.materialId)?.materialCode ?? '✓' : '—'}</td>
                <td>{can ? <select value={p.status} onChange={(e) => void epc.updatePipe(p.id, { ...p, status: e.target.value as Pipe['status'] })} aria-label="وضعیت">{Object.entries(ST_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : ST_FA[p.status]}</td>
                <td>{pr ? <span title={Object.entries(pr.stages).map(([s, d]) => `${PIPE_STAGE_FA[s as PipeStage]}: ${d ? fmtD(d) : ''}`).join(' · ')}><Chip tone={pr.last === 'welded' ? 'good' : 'neutral'}>{PIPE_STAGE_FA[pr.last]}</Chip></span> : <Chip>{PIPE_STAGE_FA.received}</Chip>}</td></tr> })}</tbody></table></div>
        )}
      </Section>
    </div>
  )
}
