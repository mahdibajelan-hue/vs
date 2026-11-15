import { useMemo, useState, type CSSProperties } from 'react'
import { Download, FileSpreadsheet, Search, Upload } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import * as repo from '../repo'
import { codeOf, fa, faDate, useQc, weldLabel, type WeldQc } from '../lib/useQc'
import { crewGrid, PASSES, QUAD_SHORT, type Quadrant } from '../lib/crew'
import { PASS_FA, VERDICT_FA, type Pass } from '../lib/rules'
import { GRADE_COLOR } from '../lib/health'
import { weldKey } from '../../execution/lib/welds'
import { crewShort } from '../lib/filmplan'
import { NUMBER_RULE_DEFAULT, natural, pipeEnds, proposeWelds, type NumberRule } from '../lib/passport'

const Q = [1, 2, 3, 4] as const
interface LogRow { r: WeldQc; cells: Record<Pass, string[]>; positions: string; time: string; vt: string; rt: string; repairs: number; defects: string; fixed: string; coat: string }

function build(r: WeldQc, last: Map<string, { overall: string }>, nameOf: (k: string) => string): LogRow {
  const st = useWqStore.getState()
  const g = crewGrid(r.crew, r.weld.sides)
  const cells = Object.fromEntries(PASSES.map((p) => [p, Q.map((q) => g[p][q].keys.join('/'))])) as Record<Pass, string[]>
  const live = r.crew.filter((c) => !c.removed)
  const positions = [...new Set(live.map((c) => [c.position, c.direction === 'uphill' ? 'سربالا' : c.direction === 'downhill' ? 'سرپایین' : ''].filter(Boolean).join(' ')).filter(Boolean))].join('، ')
  const starts = live.map((c) => c.startedAt).filter(Boolean).sort() as string[]
  const vt = st.vts.filter((v) => v.weldId === r.weld.id).at(-1)
  const e0 = last.get(`${r.weld.id}#0`)
  const ds = st.defects.filter((d) => d.weldId === r.weld.id && !d.removed && d.verdict && d.verdict !== 'accept')
  const finalOk = r.joint?.finalStatus === 'accept'
  const coat = r.coatings.at(-1)
  return {
    r, cells, positions, time: starts[0] ? faDate(starts[0]) : faDate(r.weld.weldDate || null),
    vt: vt ? (vt.result === 'accept' ? 'قبول' : 'رد') : r.weld.vtReport === 'acc' ? 'قبول' : r.weld.vtReport === 'rej' ? 'رد' : '—',
    rt: e0 ? VERDICT_FA[e0.overall as 'accept'] : '—', repairs: st.repairs.filter((x) => x.weldId === r.weld.id).length,
    defects: ds.map((d) => `${codeOf(d) || '?'} ${fa(d.lengthMm, 0)}mm${d.clock != null ? `@${fa(d.clock, 1)}` : ''}${d.welders.length ? ` (${d.welders.map(nameOf).join('/')})` : ''}`).join('، '),
    fixed: !ds.length ? '—' : finalOk ? 'رفع شد' : r.joint?.finalStatus === 'cut_out' ? 'برش' : 'باز',
    coat: coat ? `${coat.applicatorKey || '—'} · ${coat.result === 'pass' ? 'قبول' : coat.result === 'fail' ? 'رد' : coat.result === 'repair' ? 'تعمیر' : '—'}` : r.weld.coat.fj ? (r.weld.coat.fj.result === 'rej' ? 'رد' : 'اجرا شده') : '—',
  }
}

/**
 * دفتر جوش — the weld register as QC needs it: pipe, diameter, thickness, length; the welder of every pass in every
 * quadrant (recorded crew, else the report's halves); position, time, VT, first RT, repairs, rejected indications with
 * their welders and whether they were fixed; coating and the health index. Exports to Excel; crews import from Excel.
 */
export function WqLog({ onOpen }: { onOpen: (id: string) => void }) {
  const st = useWqStore(); const q = useQc()
  const [text, setText] = useState(''), [busy, setBusy] = useState(''), [note, setNote] = useState('')
  const rows = useMemo(() => q.rows.map((r) => build(r, q.last, q.nameOf)).sort((a, b) => natural(a.r.weld.sec, b.r.weld.sec) || natural(a.r.weld.weld, b.r.weld.weld)), [q])
  const ends = useMemo(() => pipeEnds(st.welds, st.pipes), [st.welds, st.pipes])
  const okWps = st.wps.filter((w) => w.status === 'approved' && w.kind !== 'repair')
  const wpsOf = (id: string | null | undefined) => st.wps.find((w) => w.id === id)
  const wpsLabel = (w: repo.Wps | undefined) => (w ? `${w.wpsNo}${w.rev ? ` Rev.${w.rev}` : ''}` : '')
  /** a WPS whose diameter / wall range does not hold this weld */
  const wpsMisfit = (w: repo.Wps | undefined, x: LogRow) => { if (!w) return ''; const inch = x.r.odMm ? x.r.odMm / 25.4 : null, t = x.r.thk; return inch != null && ((w.diaMinIn != null && inch < w.diaMinIn - 0.01) || (w.diaMaxIn != null && inch > w.diaMaxIn + 0.01)) ? 'قطر این سرجوش بیرون از محدودهٔ WPS است' : t != null && ((w.thkMinMm != null && t < w.thkMinMm - 0.01) || (w.thkMaxMm != null && t > w.thkMaxMm + 0.01)) ? 'ضخامت این سرجوش بیرون از محدودهٔ WPS است' : '' }
  const shortOf = (x: LogRow) => crewShort(x.r.odMm ? x.r.odMm / 25.4 : null, Object.fromEntries(PASSES.map((p) => [p, x.cells[p].flatMap((c) => c.split('/')).filter(Boolean)])) as Record<Pass, string[]>, st.crewMin)
  const canEdit = st.caps.edit || st.caps.submit
  const [bulk, setBulk] = useState('')
  const [rule, setRule] = useState<NumberRule>(NUMBER_RULE_DEFAULT), [numOpen, setNumOpen] = useState(false)
  const proposed = useMemo(() => (numOpen ? proposeWelds(st.pipes, rule) : []), [numOpen, st.pipes, rule])
  const known = useMemo(() => new Set(st.welds.map((w) => weldKey(w.sec, w.weld))), [st.welds])
  const shown = rows.filter((x) => !text || `${x.r.weld.sec} ${x.r.weld.weld} ${x.r.weld.pipe} ${ends.get(x.r.weld.id)?.a ?? ''} ${wpsLabel(wpsOf(x.r.joint?.wpsId))} ${PASSES.flatMap((p) => x.cells[p]).join(' ')}`.includes(text))

  const exportXlsx = async () => {
    setBusy('ساخت فایل اکسل…')
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('دفتر جوش', { views: [{ rightToLeft: true, state: 'frozen', xSplit: 2, ySplit: 2 }] })
      const head1 = ['مقطع', 'سرجوش', 'لولهٔ قبل', 'لولهٔ بعد', 'WPS', 'قطر (in)', 'ضخامت (mm)', 'طول لوله (m)', 'تاریخ / زمان', 'گزارش جوشکاری', ...PASSES.flatMap((p) => Q.map(() => PASS_FA[p])), 'وضعیت و جهت', 'VT', 'نتیجهٔ اولین RT', 'تعمیر', 'ناپیوستگی‌های ردشده (کد، طول، ساعت، جوشکار)', 'رفع عیب', 'پوشش (پوشش‌کار · نتیجه)', 'شاخص سلامت']
      const head2 = ['', '', '', '', '', '', '', '', '', '', ...PASSES.flatMap(() => Q.map((x) => `ربع ${QUAD_SHORT[x]}`)), '', '', '', '', '', '', '', '']
      ws.addRow(head1); ws.addRow(head2)
      for (const x of rows) ws.addRow([x.r.weld.sec, x.r.weld.weld, ends.get(x.r.weld.id)?.a ?? '', ends.get(x.r.weld.id)?.b ?? x.r.weld.pipe, wpsLabel(wpsOf(x.r.joint?.wpsId)), x.r.weld.central.size ?? '', x.r.thk ?? '', x.r.weld.lengthM ?? '', x.time, x.r.weld.welding?.reportNo ?? '', ...PASSES.flatMap((p) => x.cells[p]), x.positions, x.vt, x.rt, x.repairs, x.defects, x.fixed, x.coat, x.r.health.score ?? ''])
      ws.getRow(1).font = { bold: true }; ws.getRow(2).font = { italic: true }
      ws.columns.forEach((c, i) => { c.width = i < 10 ? 12 : i < 26 ? 9 : 22 })
      const buf = await wb.xlsx.writeBuffer()
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = 'weld-log.xlsx'; a.click(); URL.revokeObjectURL(a.href)
    } finally { setBusy('') }
  }
  const exportProposed = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('welds', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] })
    ws.addRow(['مقطع', 'سرجوش', 'لولهٔ قبل', 'لولهٔ بعد', 'طول لولهٔ قبل (m)', 'طول لولهٔ بعد (m)', 'ضخامت (in)', 'جبهه', 'در فهرست مرکزی'])
    for (const x of proposed) ws.addRow([x.sec, x.weld, x.a, x.b, x.aLen ?? '', x.bLen ?? '', x.thkIn ?? '', x.front, known.has(weldKey(x.sec, x.weld)) ? 'ثبت شده' : ''])
    ws.getRow(1).font = { bold: true }; ws.columns.forEach((c) => { c.width = 16 })
    const buf = await wb.xlsx.writeBuffer(), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf])); a.download = 'weld-numbering.xlsx'; a.click(); URL.revokeObjectURL(a.href)
  }
  const template = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('crew', { views: [{ rightToLeft: true }] })
    ws.addRow(['sec', 'weld', 'pass (root/hot/fill/cap)', 'quadrant (0-4)', 'welder', 'position', 'direction (uphill/downhill)', 'process', 'start (YYYY-MM-DD HH:MM)', 'end', 'vt (accept/reject)'])
    ws.addRow(['14', 'W-401', 'root', 1, '145', '5G', 'downhill', 'SMAW', '2026-10-12 08:15', '2026-10-12 08:40', 'accept'])
    ws.getRow(1).font = { bold: true }; ws.columns.forEach((c) => { c.width = 16 })
    const buf = await wb.xlsx.writeBuffer(), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf])); a.download = 'crew-template.xlsx'; a.click(); URL.revokeObjectURL(a.href)
  }
  const importXlsx = async (f: File) => {
    setBusy('خواندن فایل…'); setNote('')
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await f.arrayBuffer()), sh = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, raw: false }).slice(1).filter((r) => r.length >= 5)
      const byKey = new Map(st.welds.map((w) => [weldKey(w.sec, w.weld), w]))
      const okRows: Record<string, unknown>[] = [], bad: string[] = []
      for (const [k, r] of data.entries()) {
        const w = byKey.get(weldKey(r[0], r[1]) ?? ''), pass = String(r[2] ?? '').trim().toLowerCase(), quad = Number(r[3] ?? 0), welder = String(r[4] ?? '').trim()
        if (!w || !PASSES.includes(pass as Pass) || !(quad >= 0 && quad <= 4) || !welder) { bad.push(`ردیف ${fa(k + 2)}`); continue }
        const dt = (v: unknown) => { const x = String(v ?? '').trim(); const d = x ? new Date(x.replace(' ', 'T')) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null }
        okRows.push({ project_id: st.projectId, weld_id: w.id, pass, quadrant: quad as Quadrant, welder_key: welder, position: String(r[5] ?? ''), direction: ['uphill', 'downhill'].includes(String(r[6])) ? r[6] : '', process: String(r[7] ?? ''), started_at: dt(r[8]), finished_at: dt(r[9]), vt: ['accept', 'reject'].includes(String(r[10])) ? r[10] : '', created_name: st.me() })
      }
      if (okRows.length) {
        const groups = new Map<string, Record<string, unknown>[]>(); for (const r of okRows) { const x = groups.get(r.weld_id as string) ?? []; x.push(r); groups.set(r.weld_id as string, x) }
        await st.run(`${fa(okRows.length)} ردیف جوشکار در ${fa(groups.size)} سرجوش ثبت شد`, async () => { for (const g of groups.values()) await repo.addCrew(g) })
      }
      setNote(`${fa(okRows.length)} ردیف خوانده و ثبت شد${bad.length ? `؛ ${fa(bad.length)} ردیف نامعتبر بود (سرجوش پیدا نشد یا پاس / ربع / جوشکار نادرست): ${bad.slice(0, 8).join('، ')}` : ''}.`)
    } catch (e) { setNote(`فایل خوانده نشد: ${(e as Error).message}`) } finally { setBusy('') }
  }

  return (
    <div className="wq-log">
      <div className="wq-toolbar">
        <label className="wq-search"><Search size={15} aria-hidden /><input value={text} onChange={(e) => setText(e.target.value)} placeholder="جستجو: مقطع، سرجوش، لوله یا مهر جوشکار" aria-label="جستجو در دفتر جوش" /></label>
        <button type="button" className="ps-btn is-primary" disabled={!!busy} onClick={() => void exportXlsx()}><Download size={14} aria-hidden /> خروجی اکسل</button>
        {(st.caps.edit || st.caps.submit) && <>
          <button type="button" className="ps-btn" onClick={() => void template()}><FileSpreadsheet size={14} aria-hidden /> قالب ورود جوشکاران</button>
          <label className="ps-btn wq-file-btn"><Upload size={14} aria-hidden /> ورود جوشکاران از اکسل<input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importXlsx(f) }} /></label>
        </>}
        <button type="button" className="ps-btn" aria-pressed={numOpen} onClick={() => setNumOpen(!numOpen)}>شماره‌گذاری از ریسه</button>
      </div>
      {canEdit && okWps.length > 0 && (
        <div className="wq-toolbar"><span className="ps-meta">WPS همهٔ {fa(shown.length)} سرجوش نمایش‌داده‌شده:</span>
          <select value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="WPS برای ردیف‌های نمایش‌داده‌شده"><option value="">انتخاب WPS تأییدشده…</option>{okWps.map((w) => <option key={w.id} value={w.id}>{wpsLabel(w)}{w.process ? ` — ${w.process}` : ''}</option>)}</select>
          <button type="button" className="ps-btn" disabled={!bulk || !shown.length} onClick={() => { if (window.confirm(`WPS برای ${shown.length} سرجوش ثبت شود؟`)) void st.run(`WPS برای ${fa(shown.length)} سرجوش ثبت شد`, async () => { for (const x of shown) await repo.setWps(x.r.weld.id, bulk) }) }}>اعمال</button>
        </div>
      )}
      {numOpen && (
        <section className="wq-card">
          <header className="wq-card-head"><h3>پیشنهاد شمارهٔ مقطع و سرجوش از روی ریسه</h3><span className="ps-meta">{fa(st.pipes.length)} لوله در گزارش‌های ریسه</span></header>
          <p className="ps-meta">لوله‌های هر جبهه به ترتیب ریسه کنار هم گذاشته می‌شوند و بین هر دو لولهٔ مجاور یک سرجوش پیشنهاد می‌شود. شمارهٔ مقطع و سرجوش طبق قاعدهٔ زیر ساخته می‌شود. این فهرست فقط پیشنهاد است؛ سرجوش وقتی به فهرست مرکزی می‌آید که با همین شماره در گزارش فیت‌آپ یا جوشکاری نوشته شود، و از آن پس رادیوگرافی، تعمیر، پوشش و لوله‌گذاری با همان مقطع و شماره به آن وصل می‌شوند.</p>
          <div className="wq-form is-row">
            <label><span>شمارهٔ اولین مقطع</span><input type="number" min={1} value={rule.sectionStart} onChange={(e) => setRule({ ...rule, sectionStart: Number(e.target.value) || 1 })} /></label>
            <label><span>تعداد سرجوش هر مقطع</span><input type="number" min={1} value={rule.perSection} onChange={(e) => setRule({ ...rule, perSection: Number(e.target.value) || 1 })} /></label>
            <label><span>پیشوند شمارهٔ سرجوش</span><input dir="ltr" value={rule.prefix} onChange={(e) => setRule({ ...rule, prefix: e.target.value })} /></label>
            <label><span>تعداد رقم</span><input type="number" min={1} max={6} value={rule.digits} onChange={(e) => setRule({ ...rule, digits: Math.min(6, Math.max(1, Number(e.target.value) || 1)) })} /></label>
            <label><span>شروع شماره از</span><input type="number" min={0} value={rule.weldStart} onChange={(e) => setRule({ ...rule, weldStart: Number(e.target.value) || 0 })} /></label>
            <label className="wq-check"><input type="checkbox" checked={rule.restart} onChange={(e) => setRule({ ...rule, restart: e.target.checked })} /> شماره در هر مقطع از نو</label>
            <button type="button" className="ps-btn is-primary" disabled={!proposed.length} onClick={() => void exportProposed()}><Download size={14} aria-hidden /> خروجی اکسل فهرست</button>
          </div>
          {proposed.length ? (
            <div className="wq-tbl-wrap" style={{ maxHeight: 320 }}><table className="wq-tbl"><thead><tr><th>مقطع</th><th>سرجوش</th><th>لولهٔ قبل</th><th>لولهٔ بعد</th><th>طول دو لوله (m)</th><th>ضخامت (in)</th><th>جبهه</th><th>در فهرست مرکزی</th></tr></thead>
              <tbody>{proposed.slice(0, 400).map((x) => <tr key={`${x.sec}|${x.weld}`}><td>{x.sec}</td><td><b className="ps-code">{x.weld}</b></td><td dir="ltr">{x.a}</td><td dir="ltr">{x.b}</td><td>{x.aLen != null ? fa(x.aLen, 2) : '—'} / {x.bLen != null ? fa(x.bLen, 2) : '—'}</td><td>{x.thkIn ?? '—'}</td><td>{x.front || '—'}</td><td className={known.has(weldKey(x.sec, x.weld)) ? 'is-ok' : ''}>{known.has(weldKey(x.sec, x.weld)) ? 'ثبت شده' : 'هنوز نه'}</td></tr>)}</tbody></table></div>
          ) : <p className="ps-hint">برای این پروژه گزارش ریسه‌ای با شمارهٔ لوله ثبت نشده است («مدیریت اجرا ← گزارش روزانه ← فرم‌های فنی اجرایی ← گزارش روزانه عملیات ریسه»).</p>}
        </section>
      )}
      {(busy || note) && <p className="ps-hint">{busy || note}</p>}
      <div className="wq-tbl-wrap wq-card wq-log-wrap"><table className="wq-tbl wq-log-tbl">
        <thead>
          <tr><th rowSpan={2} className="is-sticky">سرجوش</th><th rowSpan={2}>لولهٔ قبل ← لولهٔ بعد</th><th rowSpan={2}>قطر / ضخامت</th><th rowSpan={2}>WPS</th>{PASSES.map((p) => <th key={p} colSpan={4} className="wq-log-pass">{PASS_FA[p]}</th>)}<th rowSpan={2}>وضعیت · زمان</th><th rowSpan={2}>VT</th><th rowSpan={2}>RT اول</th><th rowSpan={2}>تعمیر</th><th rowSpan={2}>ناپیوستگی‌های ردشده</th><th rowSpan={2}>رفع</th><th rowSpan={2}>پوشش</th><th rowSpan={2}>سلامت</th></tr>
          <tr>{PASSES.map((p) => Q.map((x) => <th key={`${p}${x}`} className="wq-log-q">{QUAD_SHORT[x]}</th>))}</tr>
        </thead>
        <tbody>{shown.map((x) => (
          <tr key={x.r.weld.id} onClick={() => onOpen(x.r.weld.id)} className="is-click" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(x.r.weld.id) }}>
            <th scope="row" className="is-sticky">{weldLabel(x.r.weld)}</th>
            {(() => { const e = ends.get(x.r.weld.id); return <td><small dir="ltr">{e?.a || '—'} ← {e?.b || x.r.weld.pipe || '—'}</small>{(e?.aLen != null || e?.bLen != null) && <><br /><small className="ps-meta">{e?.aLen != null ? fa(e.aLen, 2) : '—'} / {e?.bLen != null ? fa(e.bLen, 2) : '—'} m{e?.strung ? ` · ریسه ${e.strung}` : ''}</small></>}</td> })()}
            <td><small>{x.r.weld.central.size ? `${x.r.weld.central.size}″` : x.r.odMm ? `${fa(x.r.odMm / 25.4, 0)}″` : '—'} · {x.r.thk ? `${fa(x.r.thk, 1)}mm` : '—'}</small></td>
            {(() => { const w = wpsOf(x.r.joint?.wpsId), bad = wpsMisfit(w, x); return <td onClick={(e) => e.stopPropagation()} className={bad ? 'is-bad' : ''} title={bad}>{canEdit && okWps.length ? <select className="wq-log-sel" value={x.r.joint?.wpsId ?? ''} onChange={(e) => void st.run('WPS سرجوش ثبت شد', () => repo.setWps(x.r.weld.id, e.target.value || null))} aria-label={`WPS سرجوش ${weldLabel(x.r.weld)}`}><option value="">—</option>{okWps.map((o) => <option key={o.id} value={o.id}>{wpsLabel(o)}</option>)}{w && !okWps.includes(w) ? <option value={w.id}>{wpsLabel(w)}</option> : null}</select> : <small>{wpsLabel(w) || '—'}</small>}</td> })()}
            {(() => { const sh = shortOf(x); return PASSES.map((p) => { const lack = sh.find((z) => z.pass === p); return Q.map((k, i) => <td key={`${p}${k}`} className={`wq-log-w ${lack ? 'is-short' : ''}`} title={lack ? `${PASS_FA[p]}: ${lack.have} جوشکار ثبت شده؛ حداقل ${lack.need} نفر برای این قطر` : undefined}>{x.cells[p][i] || '·'}</td>) }) })()}
            <td><small>{x.positions || '—'}<br />{x.time}</small></td>
            <td className={x.vt === 'رد' ? 'is-bad' : ''}>{x.vt}</td>
            <td className={x.rt === VERDICT_FA.accept ? 'is-ok' : x.rt === '—' ? '' : 'is-bad'}>{x.rt}</td>
            <td>{x.repairs ? fa(x.repairs) : '—'}</td>
            <td><small>{x.defects || '—'}</small></td>
            <td className={x.fixed === 'رفع شد' ? 'is-ok' : x.fixed === 'باز' || x.fixed === 'برش' ? 'is-bad' : ''}>{x.fixed}</td>
            <td><small>{x.coat}</small></td>
            <td><b style={{ color: GRADE_COLOR[x.r.health.grade] } as CSSProperties}>{x.r.health.score == null ? '—' : fa(x.r.health.score)}</b></td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="ps-meta">لولهٔ بعد همان لوله‌ای است که در گزارش جوشکاری برای سرجوش نوشته شده و لولهٔ قبل، لولهٔ سرجوش پیشین همان مقطع است؛ طول هر لوله از گزارش ریسه خوانده می‌شود. خانه‌های نارنجی یعنی جوشکار ثبت‌شدهٔ آن پاس کمتر از حداقل این قطر است.</p>
      <p className="ps-meta">ربع‌ها: ۱۲–۳، ۳–۶، ۶–۹، ۹–۱۲ ساعت با نگاه در جهت پیشروی خط. خانهٔ «·» یعنی جوشکار آن ربع ثبت نشده. روی هر ردیف بزنید تا شناسنامهٔ سرجوش باز شود.</p>
    </div>
  )
}
