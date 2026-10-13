import { fmtD } from '../../finance/components/fn'
import type { PaperCtx } from './ReportPaper'
import type { ReportLine } from '../types'

const ROWS_PER_PAGE = 20
/** Jalali date written like the paper form: 1402.10.11 */
const jd = (iso: string) => fmtD(iso).replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/\//g, '.')
const d = (l: ReportLine, k: string) => (l.detail[k] == null ? '' : String(l.detail[k]))
const n = (v: unknown) => { const x = Number(String(v ?? '').replace(/[٫]/g, '.')); return Number.isFinite(x) ? x : 0 }
const f2 = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** the four wall thicknesses printed as columns A–D (the project can change them in the header) */
export const thicknessSet = (raw: unknown): number[] => {
  const v = String(raw ?? '').split(/[,،\s]+/).map((x) => Number(x.replace('٫', '.'))).filter((x) => Number.isFinite(x) && x > 0)
  const out = v.length ? v.slice(0, 4) : [0.406, 0.438, 0.688, 0.75]
  while (out.length < 4) out.push(0)
  return out
}

/** The daily welding report laid out exactly like the paper form: titles, two-line welder-stamp rows (R / C), THK summary and signature boxes — 20 welds per page. */
export function WeldingPaper({ c }: { c: PaperCtx }) {
  const r = c.report
  const thk = thicknessSet(r.data.thkSet)
  const colOf = (l: ReportLine) => thk.findIndex((t) => t > 0 && Math.abs(t - n(l.detail.thkIn)) < 0.0005)
  const lines = c.lines
  const pages = Math.max(1, Math.ceil(lines.length / ROWS_PER_PAGE))
  const pr = (key: string, i: number) => (c.metrics ?? []).filter((m) => m.metric.key === key && Math.abs(n(m.group) - thk[i]) < 0.0005).reduce((s, m) => s + m.prior, 0)
  const priorLen = thk.map((_, i) => pr('len', i)), priorJ = thk.map((_, i) => pr('joints', i))
  const who = (u: string | null) => (u ? c.people.get(u) ?? '' : '')
  const th = (t: number) => (t ? `${t.toFixed(3)}"` : '')

  return (
    <div className="mt-printable wd-wrap" dir="ltr">
      {Array.from({ length: pages }, (_, p) => {
        const slice = lines.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE)
        const before = lines.slice(0, p * ROWS_PER_PAGE)
        const sumLen = (ls: ReportLine[]) => thk.map((_, i) => ls.filter((l) => colOf(l) === i).reduce((s, l) => s + n(l.detail.lengthM), 0))
        const cntJ = (ls: ReportLine[]) => thk.map((_, i) => ls.filter((l) => colOf(l) === i).length)
        const yLen = sumLen(before).map((x, i) => x + priorLen[i]), tLen = sumLen(slice)
        const yJ = cntJ(before).map((x, i) => x + priorJ[i]), tJ = cntJ(slice)
        const nowLen = yLen.map((x, i) => x + tLen[i]), nowJ = yJ.map((x, i) => x + tJ[i])
        const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
        return (
          <div key={p} className="wd-page">
            <table className="wd-head">
              <tbody>
                <tr className="wd-logos"><td>{c.orgName}</td><td>{c.projectName}</td><td>Consultant</td></tr>
                <tr><td colSpan={3} className="wd-fa">{c.projectName}</td></tr>
                <tr><td colSpan={3} className="wd-title">DAILY WELDING REPORT</td></tr>
                <tr><td colSpan={2} className="wd-spec">{String(r.data.pipeSpec ?? '')}</td><td className="wd-wps">WPS NO. :{String(r.data.wpsNo ?? '')}</td></tr>
                <tr><td colSpan={3} className="wd-meta"><span><b>Report Number:</b> {r.reportNo}</span><span><b>Page:</b> {p + 1} <b>OF</b> {pages}</span><span><b>Date:</b> {jd(r.reportDate)}</span></td></tr>
              </tbody>
            </table>
            <table className="wd-tbl">
              <thead>
                <tr>
                  <th rowSpan={3}>ROW</th><th rowSpan={3}>Sec<br />No.</th><th rowSpan={3}>WELD No.</th><th rowSpan={3}>PIPE No.</th>
                  <th colSpan={4}>Length &amp; Thickness(inch)</th><th rowSpan={3}>SIZE<br />(inch)</th><th rowSpan={3} className="wd-bend">BEND<br />(DEGREE)</th>
                  <th colSpan={5}>WELDERS STAMP</th><th rowSpan={3}>VT<br />Result</th><th rowSpan={3} className="wd-remark">REMARK</th>
                </tr>
                <tr><th>(A)</th><th>(B)</th><th>(C)</th><th>(D)</th><th rowSpan={2}>R<br />C</th><th rowSpan={2}>Root</th><th rowSpan={2}>Hot</th><th rowSpan={2}>Fill</th><th rowSpan={2}>CAP</th></tr>
                <tr>{thk.map((t, i) => <th key={i}>{th(t)}</th>)}</tr>
              </thead>
              <tbody>
                {Array.from({ length: ROWS_PER_PAGE * 2 + 1 }, (_, r) => {
                  const k = r >> 1, lk = (r - 1) >> 1
                  const L = slice[k] // the pipe, lengths, stamps and VT of a weld sit half a row above its number (like the paper form)
                  const stamp = (l: ReportLine | undefined, suffix: '' | 'C') => (['Root', 'Hot', 'Fill', 'Cap'] as const).map((x) => <td key={x}>{l ? d(l, `stamp${x}${suffix}`) : ''}</td>)
                  const left = (i: number) => {
                    const l = slice[i]
                    return [
                      <td key="n" rowSpan={2} className="wd-wcell">{p * ROWS_PER_PAGE + i + 1}</td>,
                      <td key="s" rowSpan={2} className="wd-wcell">{l ? d(l, 'sec') : ''}</td>,
                      <td key="w" rowSpan={2} className="wd-wcell wd-weld">{l ? d(l, 'weldNo') : ''}<svg className="wd-chev" viewBox="0 0 14 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,0 14,50 0,100" vectorEffect="non-scaling-stroke" /></svg></td>,
                    ]
                  }
                  if (r === ROWS_PER_PAGE * 2) return <tr key={r}>{Array.from({ length: 14 }, (_, j) => <td key={j} />)}</tr>
                  if (r % 2 === 1) return <tr key={r}>{left(lk)}<td className="wd-rc">C</td>{stamp(slice[k], 'C')}</tr>
                  const l = L, ci = l ? colOf(l) : -1
                  return (
                    <tr key={r} className="wd-top">
                      {r === 0 && [<td key="a" className="wd-edge" />, <td key="b" className="wd-edge" />, <td key="c" className="wd-edge" />]}
                      <td rowSpan={2} className="wd-pcell">{l ? d(l, 'pipeNo') : ''}</td>
                      {thk.map((_, j) => <td key={j} rowSpan={2}>{l && ci === j && d(l, 'lengthM') !== '' ? n(l.detail.lengthM).toFixed(2) : ''}</td>)}
                      <td rowSpan={2}>{l ? d(l, 'sizeIn') : ''}</td><td rowSpan={2}>{l ? d(l, 'bendDeg') : ''}</td>
                      <td className="wd-rc">R</td>{stamp(l, '')}
                      <td rowSpan={2} className="wd-vt">{l ? ({ acc: 'ACC', rej: 'REJ' } as Record<string, string>)[d(l, 'vt')] ?? d(l, 'vt') : ''}</td><td rowSpan={2} className="wd-remark">{l ? d(l, 'remark') : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="wd-sum">
              <table>
                <tbody>
                  <tr><th>THK:</th>{thk.map((t, i) => <th key={i}>{th(t)}</th>)}<th>Total length</th></tr>
                  <tr><th>Until Yesterday</th>{yLen.map((x, i) => <td key={i}>{f2(x)}</td>)}<td className="wd-tot">{f2(sum(yLen))}</td></tr>
                  <tr><th>Today</th>{tLen.map((x, i) => <td key={i}>{f2(x)}</td>)}<td className="wd-tot">{f2(sum(tLen))}</td></tr>
                  <tr><th>Until now</th>{nowLen.map((x, i) => <td key={i}>{f2(x)}</td>)}<td className="wd-tot">{f2(sum(nowLen))}</td></tr>
                </tbody>
              </table>
              <table>
                <tbody>
                  <tr><th>THK:</th>{thk.map((t, i) => <th key={i}>{th(t)}</th>)}<th>Total number of joints</th></tr>
                  <tr><th>Until Yesterday</th>{yJ.map((x, i) => <td key={i}>{x}</td>)}<td className="wd-tot">{sum(yJ)}</td></tr>
                  <tr><th>Today</th>{tJ.map((x, i) => <td key={i}>{x}</td>)}<td className="wd-tot">{sum(tJ)}</td></tr>
                  <tr><th>Until now</th>{nowJ.map((x, i) => <td key={i}>{x}</td>)}<td className="wd-tot">{sum(nowJ)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="wd-sign">
              <div><b>Contractor</b><span dir="auto">{who(r.submittedBy ?? r.createdBy)}</span></div>
              <div><b>Consultant</b><span dir="auto">{r.reviewedAt && (r.status === 'approved' || r.status === 'partially_approved') ? who(r.reviewedBy) : ''}</span></div>
            </div>
          </div>
        )
      })}
      <small className="wd-foot">{r.reportNo} · نسخهٔ بایگانی — سامانهٔ فرین</small>
    </div>
  )
}
