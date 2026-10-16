import { useEffect, useMemo, useState } from 'react'
import { usePipeStore, type PipeInput } from '../../store/usePipeStore'
import { useMaterialStore } from '../../store/useMaterialStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { Chip, KpiCard, NumInput, Section, fmtD } from '../../../finance/components/fn'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { fa } from '../../components/control/common'
import { GridSheet, printPlan } from '../../../execution/forms/GridTemplate'
import { GRID_SPECS, specPage, specPages } from '../../../execution/forms/gridSpecs'
import { jdLatin, useSheet } from '../../../execution/components/PersonSheet'
import type { Pipe } from '../../../execution/lib/registers'

/** The pipe-delivery record printed from the register for one entry date: the register is the source, nothing is typed again. Totals «to date» add every earlier entry. */
function EntryPreview({ pipes, date }: { pipes: Pipe[]; date: string }) {
  const { layout, approved } = useSheet('pipe_entry')
  if (!layout) return null
  const spec = GRID_SPECS.pipe_entry
  const today = pipes.filter((p) => p.entryDate === date).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
  const prior: Record<string, { len: number; joints: number }> = {}
  for (const p of pipes) if (p.entryDate < date && p.wtIn != null) { const k = p.wtIn.toFixed(3), e = prior[k] ?? { len: 0, joints: 0 }; e.len += p.lengthM ?? 0; e.joints++; prior[k] = e }
  const rows = today.map((p) => ({ pipeNo: p.raw, lengthM: String(p.lengthM ?? ''), thkIn: String(p.wtIn ?? ''), sizeIn: String(p.odIn ?? ''), billNo: p.wayBill, loadDate: '', truckNo: '', unloadDate: jdLatin(p.entryDate), status: '' }))
  const other = today.filter((p) => p.wtIn == null || ![0.406, 0.562, 0.688, 0.75].some((t) => Math.abs(t - (p.wtIn as number)) < 0.0005)).length
  const plan = printPlan(layout), n = specPages(spec, rows.length)
  return (
    <div className="mt-printable gt-paper" dir="ltr">
      <p className="no-print" style={{ margin: '0 0 4px', fontSize: 11, textAlign: 'center' }}>{approved ? '' : 'پیش‌نمایش با قالب همراه برنامه؛ برای چاپ رسمی قالب را در کتابخانه تأیید کنید. '}{other ? `${other} لوله ضخامتی خارج از چهار ضخامت جدول جمع‌بندی فرم دارد و در جمع‌ها نمی‌آید.` : ''}</p>
      <style>{`${plan.css} @media print { .gt-page { zoom: ${plan.scale}; break-after: page; } .gt-page:last-child { break-after: auto; } }`}</style>
      {Array.from({ length: n }, (_, i) => <div key={i} className="gt-page" style={{ width: 'fit-content', margin: '0 auto', maxWidth: '100%', overflow: 'auto' }}><GridSheet tpl={layout} values={specPage(spec, layout, { header: { date: jdLatin(date), reportNo: '' }, rows, priorByThk: prior }, i).values} /></div>)}
    </div>
  )
}

const ST_FA = { in_stock: 'سالم', rejected: 'مردود', scrapped: 'اسقاط' } as const
const today = () => new Date().toISOString().slice(0, 10)
const num = (v: unknown): number | null => { const n = Number(String(v ?? '').replace('٫', '.').replace(',', '.').trim()); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null }

/** «ورود لوله به کارگاه»: every entry becomes an MRS (رسید انبار) with its pipes; the printed form «صورتجلسهٔ ورود لوله» is produced from it, and the Execution module reads the same pipes. */
export function PipeReceiptPage({ projectId }: { projectId: string }) {
  const st = usePipeStore()
  const mats = useMaterialStore((s) => s.materials).filter((x) => x.masterProjectId === projectId)
  const refreshMaterial = useMaterialStore((s) => s.fetchAll)
  const fetchControl = useMaterialControlStore((s) => s.fetchAll)
  useEffect(() => { void st.load(projectId) }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [one, setOne] = useState({ raw: '', heatNo: '', odIn: null as number | null, wtIn: null as number | null, lengthM: null as number | null, grade: '', supplier: '', wayBill: '', material: '' })
  const [paste, setPaste] = useState('')
  const [prev, setPrev] = useState('')
  const matByCode = useMemo(() => new Map(mats.map((x) => [x.materialCode, x])), [mats])
  const pipes = st.pipes
  const rows = pipes.filter((p) => !q || `${p.raw} ${p.heatNo} ${p.wayBill}`.toLowerCase().includes(q.toLowerCase()))
  const total = pipes.reduce((s, p) => s + (p.lengthM ?? 0), 0)
  const mrsOf = (id: string | null) => st.receipts.find((r) => r.id === id)
  const dates = useMemo(() => [...new Set(pipes.map((p) => p.entryDate))].sort().reverse(), [pipes])
  const report = (r: { added: number; skipped: string[]; number?: string } | null) => setMsg(r ? `${r.number ? `${r.number}: ` : ''}${fa(r.added)} لوله ثبت شد${r.skipped.length ? `؛ ${fa(r.skipped.length)} شمارهٔ تکراری رد شد: ${r.skipped.slice(0, 8).join('، ')}${r.skipped.length > 8 ? '…' : ''}` : ''}.` : '')
  const send = async (list: PipeInput[]) => { setBusy(true); try { const r = await st.receive(date, list, note); report(r); if (r?.added) { void refreshMaterial(); void fetchControl() } return r } finally { setBusy(false) } }
  const addOne = async () => { const r = await send([{ ...one, raw: one.raw, materialId: matByCode.get(one.material.split(' ')[0])?.id ?? null }]); if (r?.added) setOne({ ...one, raw: '', heatNo: '', lengthM: null }) }
  const addPaste = async () => {
    const parsed = paste.split('\n').map((ln) => ln.split('\t').map((x) => x.trim())).filter((c) => c[0]).map((c) => ({ raw: c[0], heatNo: c[1] ?? '', odIn: num(c[2]), wtIn: num(c[3]), lengthM: num(c[4]), grade: c[5] ?? '', supplier: c[6] ?? '', wayBill: c[7] ?? '' }))
    const r = await send(parsed); if (r?.added) setPaste('')
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard label="لوله‌های ورودی به کارگاه" value={fa(pipes.length)} sub={`${fa(Math.round(total))} متر`} />
        <KpiCard i={1} label="رسیدهای ثبت‌شده (MRS)" value={fa(st.receipts.length)} />
        <KpiCard i={2} label="مردود / اسقاط" value={fa(pipes.filter((p) => p.status !== 'in_stock').length)} tone={pipes.some((p) => p.status !== 'in_stock') ? 'warn' : 'good'} />
      </div>
      <Section title="ثبت ورود لوله به کارگاه" hint="هر ثبت یک MRS (رسید انبار با شمارهٔ MRS-0001 …) می‌سازد؛ شمارهٔ لولهٔ تکراری رد می‌شود. همین لوله‌ها برای ریسه، خم‌کاری، فیت‌آپ و جوشکاری در ماژول مدیریت اجرا استفاده می‌شوند و مشخصاتشان آنجا دوباره تایپ نمی‌شود. اگر لوله به ردیف MTO وصل شود، قلم رسید انبار هم با وضعیت «در انتظار بازرسی» ساخته می‌شود.">
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
          <label className="wide">ردیف MTO لوله (اختیاری)<input list="mtl-pipe-mat" dir="auto" value={one.material} onChange={(e) => setOne({ ...one, material: e.target.value })} placeholder="کد یا شرح ردیف MTO" /></label>
          <label className="wide">توضیح رسید<input dir="auto" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <datalist id="mtl-pipe-mat">{mats.slice(0, 600).map((x) => <option key={x.id} value={x.materialCode}>{x.description}</option>)}</datalist>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="im-btn im-btn-primary im-btn-sm" disabled={!one.raw.trim() || busy} onClick={() => void addOne()}>{busy ? 'در حال ثبت…' : 'ثبت لوله و صدور MRS'}</button>
          {msg && <span className="im-helper" style={{ margin: 0 }}>{msg}</span>}
        </div>
        <details style={{ marginTop: 10 }}><summary className="im-helper">ثبت گروهی (چسباندن از اکسل) — یک MRS برای همه</summary>
          <p className="im-helper">ستون‌ها به‌ترتیب: شمارهٔ لوله، Heat، قطر، ضخامت، طول، گرید، تأمین‌کننده، بارنامه — تاریخ و توضیح همان بالاست.</p>
          <textarea rows={6} dir="ltr" value={paste} onChange={(e) => setPaste(e.target.value)} style={{ width: '100%' }} aria-label="چسباندن از اکسل" />
          <button className="im-btn im-btn-sm" disabled={!paste.trim() || busy} onClick={() => void addPaste()}>ثبت گروهی و صدور MRS</button>
        </details>
      </Section>
      <Section title="صورتجلسهٔ ورود لوله (چاپ از MRS)" hint="تاریخ ورود را انتخاب کنید؛ فرم رسمی از همین رسید پر می‌شود و دوباره تایپ نمی‌شود.">
        <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={prev} onChange={(e) => setPrev(e.target.value)} aria-label="تاریخ ورود"><option value="">تاریخ ورود…</option>{dates.map((d) => <option key={d} value={d}>{fmtD(d)}</option>)}</select>
          {prev && <button className="im-btn im-btn-sm" onClick={() => window.print()}>چاپ</button>}
        </div>
        {prev && <EntryPreview pipes={pipes} date={prev} />}
      </Section>
      <Section title="لوله‌های ورودی" action={<input placeholder="جست‌وجوی شماره، Heat، بارنامه…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />}>
        {rows.length === 0 ? <div className="im-card im-empty" style={{ padding: 20 }}>لوله‌ای ثبت نشده است.</div> : (
          <div className="fn-tbl-wrap" style={{ maxHeight: 520 }}><table className="ex-lines"><thead><tr><th>MRS</th><th>شمارهٔ لوله</th><th>تاریخ ورود</th><th>Heat</th><th className="num">قطر</th><th className="num">ضخامت</th><th className="num">طول (m)</th><th>تأمین‌کننده</th><th>بارنامه</th><th>ردیف MTO</th><th>وضعیت</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}><td dir="ltr">{mrsOf(p.receiptId)?.number ?? <span className="sub">—</span>}</td><td dir="ltr"><b>{p.raw}</b></td><td>{fmtD(p.entryDate)}</td><td dir="ltr">{p.heatNo || '—'}</td><td className="num">{p.odIn ?? '—'}</td><td className="num">{p.wtIn ?? '—'}</td><td className="num">{p.lengthM ?? '—'}</td><td>{p.supplier || '—'}</td><td dir="ltr">{p.wayBill || '—'}</td>
                <td dir="ltr">{p.materialId ? mats.find((x) => x.id === p.materialId)?.materialCode ?? '✓' : '—'}</td>
                <td><select value={p.status} onChange={(e) => void st.setStatus(p.id, e.target.value as Pipe['status'])} aria-label="وضعیت">{Object.entries(ST_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>{p.status !== 'in_stock' && <Chip tone="warn">{ST_FA[p.status]}</Chip>}</td></tr>))}</tbody></table></div>
        )}
      </Section>
    </div>
  )
}
