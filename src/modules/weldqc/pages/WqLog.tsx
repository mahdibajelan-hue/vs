import { useMemo, useState, type CSSProperties } from 'react'
import { Download, FileSpreadsheet, Search, Upload } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import * as repo from '../repo'
import { codeOf, fa, faDate, useQc, weldLabel, type WeldQc } from '../lib/useQc'
import { crewGrid, PASSES, QUAD_SHORT, type Quadrant } from '../lib/crew'
import { PASS_FA, VERDICT_FA, type Pass } from '../lib/rules'
import { GRADE_COLOR } from '../lib/health'
import { weldKey } from '../../execution/lib/welds'

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
  const rows = useMemo(() => q.rows.map((r) => build(r, q.last, q.nameOf)), [q])
  const shown = rows.filter((x) => !text || `${x.r.weld.sec} ${x.r.weld.weld} ${x.r.weld.pipe} ${PASSES.flatMap((p) => x.cells[p]).join(' ')}`.includes(text))

  const exportXlsx = async () => {
    setBusy('ساخت فایل اکسل…')
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('دفتر جوش', { views: [{ rightToLeft: true, state: 'frozen', xSplit: 2, ySplit: 2 }] })
      const head1 = ['مقطع', 'سرجوش', 'لوله', 'قطر (in)', 'ضخامت (mm)', 'طول لوله (m)', 'تاریخ / زمان', 'گزارش جوشکاری', ...PASSES.flatMap((p) => Q.map(() => PASS_FA[p])), 'وضعیت و جهت', 'VT', 'نتیجهٔ اولین RT', 'تعمیر', 'ناپیوستگی‌های ردشده (کد، طول، ساعت، جوشکار)', 'رفع عیب', 'پوشش (پوشش‌کار · نتیجه)', 'شاخص سلامت']
      const head2 = ['', '', '', '', '', '', '', '', ...PASSES.flatMap(() => Q.map((x) => `ربع ${QUAD_SHORT[x]}`)), '', '', '', '', '', '', '', '']
      ws.addRow(head1); ws.addRow(head2)
      for (const x of rows) ws.addRow([x.r.weld.sec, x.r.weld.weld, x.r.weld.pipe, x.r.weld.central.size ?? '', x.r.thk ?? '', x.r.weld.lengthM ?? '', x.time, x.r.weld.welding?.reportNo ?? '', ...PASSES.flatMap((p) => x.cells[p]), x.positions, x.vt, x.rt, x.repairs, x.defects, x.fixed, x.coat, x.r.health.score ?? ''])
      ws.getRow(1).font = { bold: true }; ws.getRow(2).font = { italic: true }
      ws.columns.forEach((c, i) => { c.width = i < 8 ? 12 : i < 24 ? 9 : 22 })
      const buf = await wb.xlsx.writeBuffer()
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = 'weld-log.xlsx'; a.click(); URL.revokeObjectURL(a.href)
    } finally { setBusy('') }
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
      </div>
      {(busy || note) && <p className="ps-hint">{busy || note}</p>}
      <div className="wq-tbl-wrap wq-card wq-log-wrap"><table className="wq-tbl wq-log-tbl">
        <thead>
          <tr><th rowSpan={2} className="is-sticky">سرجوش</th><th rowSpan={2}>لوله / قطر / ضخامت / طول</th>{PASSES.map((p) => <th key={p} colSpan={4} className="wq-log-pass">{PASS_FA[p]}</th>)}<th rowSpan={2}>وضعیت · زمان</th><th rowSpan={2}>VT</th><th rowSpan={2}>RT اول</th><th rowSpan={2}>تعمیر</th><th rowSpan={2}>ناپیوستگی‌های ردشده</th><th rowSpan={2}>رفع</th><th rowSpan={2}>پوشش</th><th rowSpan={2}>سلامت</th></tr>
          <tr>{PASSES.map((p) => Q.map((x) => <th key={`${p}${x}`} className="wq-log-q">{QUAD_SHORT[x]}</th>))}</tr>
        </thead>
        <tbody>{shown.map((x) => (
          <tr key={x.r.weld.id} onClick={() => onOpen(x.r.weld.id)} className="is-click" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(x.r.weld.id) }}>
            <th scope="row" className="is-sticky">{weldLabel(x.r.weld)}</th>
            <td><small>{x.r.weld.pipe || '—'} · {x.r.weld.central.size ? `${x.r.weld.central.size}″` : '—'} · {x.r.thk ? `${fa(x.r.thk, 1)}mm` : '—'} · {x.r.weld.lengthM != null ? `${fa(x.r.weld.lengthM, 1)}m` : '—'}</small></td>
            {PASSES.map((p) => Q.map((k, i) => <td key={`${p}${k}`} className="wq-log-w">{x.cells[p][i] || '·'}</td>))}
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
      <p className="ps-meta">ربع‌ها: ۱۲–۳، ۳–۶، ۶–۹، ۹–۱۲ ساعت با نگاه در جهت پیشروی خط. خانهٔ «·» یعنی جوشکار آن ربع ثبت نشده. روی هر ردیف بزنید تا شناسنامهٔ سرجوش باز شود.</p>
    </div>
  )
}
