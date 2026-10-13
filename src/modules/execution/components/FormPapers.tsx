import type { ReactNode } from 'react'
import { fmtD } from '../../finance/components/fn'
import { thicknessSet } from './WeldingPaper'
import { fa } from './common'
import type { PaperCtx } from './ReportPaper'
import type { ReportLine } from '../types'

/** Paper layouts of the technical forms that are drawn exactly like the contractor's printed sheets. */
export const PAPER_FORMS = new Set(['backfill', 'sand', 'rock_shield', 'geotextile', 'bend', 'weld_repair', 'bond_test', 'string', 'rt_request', 'pipe_entry', 'lowering', 'tie_in', 'pipe_permit'])

const d = (l: ReportLine | undefined, k: string) => (!l || l.detail[k] == null ? '' : String(l.detail[k]))
const jd = (iso: string) => fmtD(iso).replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/\//g, '.')
const f2 = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 21.683 → 21+683 (kilometre stationing as printed on the sheets) */
const kmTxt = (v: unknown) => { const x = Number(v); if (v === '' || v == null || !Number.isFinite(x)) return ''; const km = Math.floor(x + 1e-9), m = Math.round((x - km) * 1000); return `${km}+${String(m).padStart(3, '0')}` }
const tick = (on: boolean) => (on ? '✓' : '')
const pad = <T,>(n: number, list: T[]): (T | undefined)[] => Array.from({ length: n }, (_, i) => list[i])

function Logos({ c }: { c: PaperCtx }) {
  return <div className="fp-logos"><div>{c.orgName}</div><div>{c.projectName}</div><div>Consultant</div></div>
}
function Sign({ c, left, right }: { c: PaperCtx; left: string; right: string }) {
  const r = c.report, who = (u: string | null) => (u ? c.people.get(u) ?? '' : '')
  return <div className="fp-sign"><div><b>{left}</b><span dir="auto">{who(r.submittedBy ?? r.createdBy)}</span></div><div><b>{right}</b><span dir="auto">{r.reviewedAt && (r.status === 'approved' || r.status === 'partially_approved') ? who(r.reviewedBy) : ''}</span></div></div>
}
function Frame({ c, children }: { c: PaperCtx; children: ReactNode }) {
  return <div className="mt-printable fp-wrap"><div className="fp-page"><Logos c={c} /><div className="fp-proj">{c.projectName}</div>{children}<small className="fp-foot">{c.report.reportNo} · نسخهٔ بایگانی — سامانهٔ فرین</small></div></div>
}
const Notes = ({ c }: { c: PaperCtx }) => <div className="fp-notes"><b>توضیحات:</b> {c.report.notes}</div>

/* ---------- backfill / sand padding : NO, Sec.No., Joint From/To, Km From/To, Result, Remark + cumulative statistics ---------- */
function JointKm({ c, title }: { c: PaperCtx; title: string }) {
  const r = c.report, rows = pad(10, c.lines)
  return (
    <Frame c={c}>
      <div className="fp-meta">
        <div className="fp-meta-l"><span>Page:</span><b>1 OF 1</b><span>Contract NO:</span><b>{String(r.data.contractNo ?? '')}</b></div>
        <div className="fp-meta-c">{c.form?.title}</div>
        <div className="fp-meta-r"><span>Report No:</span><b>{r.reportNo}</b><span>Date:</span><b>{jd(r.reportDate)}</b></div>
      </div>
      <div className="fp-band">{title}</div>
      <table className="fp-tbl" dir="ltr">
        <thead>
          <tr><th rowSpan={2}>NO</th><th rowSpan={2}>Sec.No.</th><th colSpan={2}>Joint</th><th colSpan={2}>Km</th><th colSpan={2}>Result</th><th rowSpan={2} className="fp-wide">Remark</th></tr>
          <tr><th>From</th><th>To</th><th>From</th><th>TO</th><th>Acc</th><th>Rej</th></tr>
        </thead>
        <tbody>{rows.map((l, i) => <tr key={i} className={i === c.lines.length && c.lines.length > 0 ? 'fp-strike' : undefined}><td>{i + 1}</td><td>{d(l, 'sec')}</td><td>{d(l, 'jointFrom')}</td><td>{d(l, 'jointTo')}</td><td>{kmTxt(l?.detail.kmFrom)}</td><td>{kmTxt(l?.detail.kmTo)}</td><td className="fp-tick">{tick(d(l, 'result') === 'acc')}</td><td className="fp-tick">{tick(d(l, 'result') === 'rej')}</td><td>{d(l, 'remark')}</td></tr>)}</tbody>
      </table>
      <div className="fp-band">آمار تجمیعی</div>
      <table className="fp-tbl fp-stat" dir="rtl">
        <thead><tr><th>شرح عملیات</th><th>تا روز قبل</th><th>امروز</th><th>تاکنون</th></tr></thead>
        <tbody>{(c.metrics ?? []).filter((m) => m.prior || m.today).map((m, i) => <tr key={i}><td><b>{m.metric.label}</b></td><td>{f2(m.prior)}</td><td>{f2(m.today)}</td><td>{f2(m.total)}</td></tr>)}</tbody>
      </table>
      <Notes c={c} />
      <Sign c={c} left="نماینده پیمانکار" right="نماینده نظارت" />
    </Frame>
  )
}

/* ---------- bending ---------- */
function Bend({ c }: { c: PaperCtx }) {
  const r = c.report, rows = pad(18, c.lines)
  return (
    <Frame c={c}>
      <div className="fp-band fp-title">گزارش روزانه خمکاری</div>
      <div className="fp-line"><span>تاریخ گزارش: <b>{jd(r.reportDate)}</b></span><span>شماره گزارش: <b>{r.reportNo}</b></span></div>
      <div className="fp-line fp-en"><span>BEND MACHINE MODEL : <b>{String(r.data.machine ?? '')}</b></span></div>
      <table className="fp-tbl" dir="ltr">
        <thead>
          <tr><th colSpan={2}>BEND RESULT</th><th colSpan={2}>OVALITY</th><th colSpan={2}>Bend</th><th colSpan={4}>PIPE</th><th>LOCATION</th><th rowSpan={3}>ROW</th></tr>
          <tr><th rowSpan={2}>REJ.</th><th rowSpan={2}>ACC.</th><th rowSpan={2}>%</th><th rowSpan={2}>mm</th><th colSpan={2}>DIRECT.</th><th rowSpan={2}>DIA<br />(in)</th><th rowSpan={2}>LENGTH<br />(m)</th><th rowSpan={2}>W.T<br />(mm)</th><th rowSpan={2}>Pipe<br />No.</th><th rowSpan={2}>Km</th></tr>
          <tr><th>Left/Right</th><th>Sag/Over</th></tr>
        </thead>
        <tbody>{rows.map((l, i) => <tr key={i}><td>{d(l, 'result') === 'rej' ? 'REJ.' : ''}</td><td>{d(l, 'result') === 'acc' ? 'ACC.' : ''}</td><td>{d(l, 'ovalPct')}</td><td>{d(l, 'ovalMm')}</td><td>{d(l, 'dirLR')}</td><td>{d(l, 'dirSO')}</td><td>{d(l, 'diaIn')}</td><td>{d(l, 'lengthM')}</td><td>{d(l, 'wtMm')}</td><td>{d(l, 'pipeNo')}</td><td>{kmTxt(l?.detail.km)}</td><td>{i + 1}</td></tr>)}</tbody>
      </table>
      <Notes c={c} />
      <Sign c={c} left="نماینده پیمانکار" right="نماینده دستگاه نظارت" />
    </Frame>
  )
}

/* ---------- weld repair ---------- */
function WeldRepair({ c }: { c: PaperCtx }) {
  const r = c.report, rows = pad(20, c.lines)
  const man = c.resources.filter((x) => x.kind === 'man'), eq = c.resources.filter((x) => x.kind === 'equip')
  return (
    <Frame c={c}>
      <div className="fp-band fp-title">گزارش روزانه عملیات تعمیرات جوش</div>
      <div className="fp-meta2" dir="ltr"><span>Date:</span><b>{jd(r.reportDate)}</b><span className="fp-rep">Rep Report No:</span><b>{r.reportNo}</b></div>
      <table className="fp-tbl" dir="ltr">
        <thead>
          <tr><th rowSpan={2}>Row</th><th rowSpan={2}>Sec.</th><th rowSpan={2}>Weld no.</th><th rowSpan={2}>STAMP<br />No.</th><th colSpan={2}>Defect Type and Location og Defect</th><th colSpan={2}>Repair Status</th><th rowSpan={2}>VT CHEEK</th><th rowSpan={2}>RT Report<br />No.</th><th rowSpan={2}>RT Request<br />No.</th></tr>
          <tr><th>Type</th><th>Location</th><th>Not Done</th><th>Done</th></tr>
        </thead>
        <tbody>{rows.map((l, i) => <tr key={i}><td>{i + 1}</td><td>{d(l, 'sec')}</td><td>{d(l, 'weldNo')}</td><td>{d(l, 'stamp')}</td><td>{d(l, 'defectType')}</td><td>{d(l, 'defectLoc')}</td><td className="fp-tick">{tick(d(l, 'repairDone') === 'notdone')}</td><td className="fp-tick">{tick(d(l, 'repairDone') === 'done')}</td><td>{({ acc: 'ACC', rej: 'REJ' } as Record<string, string>)[d(l, 'vtCheck')] ?? d(l, 'vtCheck')}</td><td>{d(l, 'rtReportNo')}</td><td>{d(l, 'rtReqNo')}</td></tr>)}</tbody>
      </table>
      <div className="fp-band">نفرات و ماشین‌آلات</div>
      <div className="fp-res" dir="rtl">
        <table className="fp-tbl"><thead><tr><th>ردیف</th><th>فعال</th><th>نیروی انسانی</th></tr></thead><tbody>{pad(8, man).map((x, i) => <tr key={i}><td>{i + 1}</td><td>{x && x.activeQty ? x.activeQty : ''}</td><td>{x?.name ?? ''}</td></tr>)}</tbody></table>
        <table className="fp-tbl"><thead><tr><th>غیر فعال</th><th>فعال</th><th>ماشین آلات</th></tr></thead><tbody>{pad(8, eq).map((x, i) => <tr key={i}><td>{x && x.idleQty ? x.idleQty : ''}</td><td>{x && x.activeQty ? x.activeQty : ''}</td><td>{x?.name ?? ''}</td></tr>)}</tbody></table>
      </div>
      <Sign c={c} left="نماینده پیمانکار" right="نماینده محترم دستگاه نظارت" />
    </Frame>
  )
}

/* ---------- field-joint coating test: one sheet per weld ---------- */
const Box = ({ on, children }: { on: boolean; children: ReactNode }) => <span className="fp-opt"><i className={on ? 'on' : ''}>{on ? '✓' : ''}</i>{children}</span>
function CoatTest({ c }: { c: PaperCtx }) {
  const r = c.report, sheets = c.lines.length ? c.lines : [undefined]
  const eq: [string, string][] = [['رطوبت سنج ( Psychrometer )', 'eqPsy'], ['دماسنج ( Pyrometer )', 'eqPyro'], ['زبری سنج سطح', 'eqRough'], ['منفذیاب ( Holiday Detector )', 'eqHol'], ['ضخامت سنج پوشش', 'eqThk'], ['دستگاه آزمایش چسبندگی ( Peel Test )', 'eqPeel']]
  const who = (u: string | null) => (u ? c.people.get(u) ?? '' : '')
  return (
    <div className="mt-printable fp-wrap">
      {sheets.map((l, p) => (
        <div key={p} className="fp-page fp-bo">
          <div className="fp-bo-head"><div>{c.orgName}</div><div className="fp-proj2">{c.projectName}</div><div>Consultant</div></div>
          <div className="fp-bo-meta" dir="ltr"><span>Date:</span><b>{jd(r.reportDate)}</b><span>Contract No.:</span><b>{String(r.data.contractNo ?? '')}</b><span>Form No :</span><b>{String(r.data.formNo ?? '')}</b></div>
          <div className="fp-band fp-title">گزارش عملیات تست پوشش سرجوش</div>
          <div className="fp-bo-row"><span>شماره سرجوش : <b>{d(l, 'weldNo')}</b></span><span>شماره سکشن : <b>{d(l, 'sec')}</b></span><span>ساعت : <b>{d(l, 'testTime')}</b></span></div>
          <div className="fp-bo-sec"><div className="fp-bo-k">آزمایش چسبندگی پوشش</div><div className="fp-bo-v">
            <div className="fp-bo-grid"><div className="fp-bo-k2">میزان چسبندگی ( Kg/Cm )</div><div>
              <div className="fp-bo-l"><span>به سطح لوله : ( kg/2cm^2 ) <b>{d(l, 'adhPipe')}</b></span><Box on={d(l, 'adhPipeOk') === 'ok'}>تایید</Box><Box on={d(l, 'adhPipeOk') === 'rej'}>مردود</Box></div>
              <div className="fp-bo-l"><span>به پوشش اصلی : ( kg/2cm^2 ) <b>{d(l, 'adhMain')}</b></span><Box on={d(l, 'adhMainOk') === 'ok'}>تایید</Box><Box on={d(l, 'adhMainOk') === 'rej'}>مردود</Box></div></div></div>
            <div className="fp-bo-grid"><div className="fp-bo-k2">نوع جدایش</div><div>
              <Box on={d(l, 'sepType') === 'pe_adhesive'}>جدایش لایه پلی اتیلن از چسب</Box><br />
              <Box on={d(l, 'sepType') === 'epoxy'}>جدایش لایه پلی اتیلن و چسب از لایه اپوکس</Box><br />
              <Box on={d(l, 'sepType') === 'full'}>جدایش کامل پوشش از سطح لوله</Box></div></div>
          </div></div>
          <div className="fp-bo-sec"><div className="fp-bo-k">شرایط ظاهری پوشش</div><div className="fp-bo-v">
            <div className="fp-bo-l">وجود هوا زیر پوشش <Box on={d(l, 'defects') === 'air'}>{''}</Box> چروک <Box on={d(l, 'defects') === 'wrinkle'}>{''}</Box> ترک <Box on={d(l, 'defects') === 'crack'}>{''}</Box> سوختگی <Box on={d(l, 'defects') === 'burn'}>{''}</Box> عدم خروج چسب از لبه های نوار <Box on={d(l, 'defects') === 'edge'}>{''}</Box> منفذ <Box on={d(l, 'defects') === 'hole'}>{''}</Box></div>
            <div className="fp-bo-l">چسبندگی پچ سرجوش ( Clousre Patch ) : <Box on={d(l, 'patch') === 'ok'}>مناسب</Box><Box on={d(l, 'patch') === 'bad'}>نامناسب</Box></div>
            <div className="fp-bo-l">همپوشانی ( Over Lap ) مناسب روی پوشش اصلی لوله : <Box on={d(l, 'overlap') === 'yes'}>دارد</Box><Box on={d(l, 'overlap') === 'no'}>ندارد</Box></div>
            <div className="fp-bo-l"><Box on={d(l, 'appearance') === 'ok'}>تایید</Box><Box on={d(l, 'appearance') === 'rej'}>عدم تایید</Box></div>
          </div></div>
          <div className="fp-bo-sec"><div className="fp-bo-k">تست منفذیابی</div><div className="fp-bo-v">
            <div className="fp-bo-l">ولتاژ آزمایش : <Box on={d(l, 'holVolt') === 'ok'}>تایید</Box><Box on={d(l, 'holVolt') === 'rej'}>عدم تایید</Box> تعداد منافذ : <b>{d(l, 'holCount')}</b> <Box on={d(l, 'holAction') === 'repair'}>تعمیر</Box><Box on={d(l, 'holAction') === 'defect'}>منافذ</Box><Box on={d(l, 'holAction') === 'final'}>تایید نهایی</Box></div>
          </div></div>
          <table className="fp-tbl fp-eq" dir="rtl">
            <thead><tr><th>تجهیزات موردنیاز تست و بازرسی کارگاه</th><th>موجود است</th><th>موجود نیست</th><th>کالیبره است</th><th>کالیبره نیست</th></tr></thead>
            <tbody>{eq.map(([name, k]) => { const v = d(l, k); return <tr key={k}><td>{name}</td><td className="fp-tick">{tick(v === 'ok' || v === 'uncal')}</td><td className="fp-tick">{tick(v === 'na')}</td><td className="fp-tick">{tick(v === 'ok')}</td><td className="fp-tick">{tick(v === 'uncal' || v === 'na')}</td></tr> })}</tbody>
          </table>
          <div className="fp-notes"><b>توضیحات :</b> {d(l, 'remark') || r.notes}</div>
          <div className="fp-sign"><div><b>ناظر</b><span dir="auto">{r.reviewedAt && (r.status === 'approved' || r.status === 'partially_approved') ? who(r.reviewedBy) : ''}</span></div><div><b>نماینده پیمانکار</b><span dir="auto">{who(r.submittedBy ?? r.createdBy)}</span></div></div>
        </div>
      ))}
    </div>
  )
}


/* ---------- stringing: two blocks of 23 pipes + summary per wall thickness ---------- */
function StringPaper({ c }: { c: PaperCtx }) {
  const r = c.report, thk = thicknessSet(r.data.thkSet), PER = 46
  const pages = Math.max(1, Math.ceil(c.lines.length / PER))
  const colOf = (l: ReportLine) => thk.findIndex((t) => t > 0 && Math.abs(t - (Number(l.detail.thkIn) || 0)) < 0.0005)
  const pr = (key: string, i: number) => (c.metrics ?? []).filter((m) => m.metric.key === key && Math.abs((Number(m.group) || 0) - thk[i]) < 0.0005).reduce((x, m) => x + m.prior, 0)
  const priorLen = thk.map((_, i) => pr('length', i)), priorJ = thk.map((_, i) => pr('joints', i))
  const t3 = (n: number) => (n ? `${n.toFixed(3)}"` : '')
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  const nf0 = (x: number) => x.toLocaleString('en-US'), nf2 = f2
  const half = (rows: (ReportLine | undefined)[], from: number) => rows.map((l, i) => (
    <tr key={i}><td>{fa(from + i + 1)}</td><td>{d(l, 'pipeNo')}</td><td>{l && l.detail.lengthM !== '' && l.detail.lengthM != null ? Number(l.detail.lengthM).toFixed(2) : ''}</td><td>{l && l.detail.thkIn !== '' && l.detail.thkIn != null ? `${Number(l.detail.thkIn).toFixed(3)}"` : ''}</td><td className="fp-tick">{tick(d(l, 'origin') === 'factory')}</td><td className="fp-tick">{tick(d(l, 'origin') === 'depot')}</td></tr>
  ))
  return (
    <div className="mt-printable fp-wrap">
      {Array.from({ length: pages }, (_, p) => {
        const slice = c.lines.slice(p * PER, (p + 1) * PER), before = c.lines.slice(0, p * PER)
        const rows = pad(PER, slice)
        const lenOf = (ls: ReportLine[]) => thk.map((_, i) => ls.filter((l) => colOf(l) === i).reduce((x, l) => x + (Number(l.detail.lengthM) || 0), 0))
        const cntOf = (ls: ReportLine[]) => thk.map((_, i) => ls.filter((l) => colOf(l) === i).length)
        const yL = lenOf(before).map((x, i) => x + priorLen[i]), tL = lenOf(slice), yJ = cntOf(before).map((x, i) => x + priorJ[i]), tJ = cntOf(slice)
        const nL = yL.map((x, i) => x + tL[i]), nJ = yJ.map((x, i) => x + tJ[i])
        return (
          <div key={p} className="fp-page" dir="rtl">
            <div className="fp-logos"><div>{c.orgName}</div><div>{c.projectName}</div><div>Consultant</div></div>
            <div className="fp-proj">{c.projectName}</div>
            <div className="fp-band fp-title">گزارش روزانه عملیات ریسه</div>
            <div className="fp-line"><span>شماره گزارش : <b>{r.reportNo}</b></span><span>صفحه : <b>{fa(p + 1)} از {fa(pages)}</b></span><span>تاریخ : <b>{fmtD(r.reportDate)}</b></span></div>
            <div className="fp-2col">
              {[0, 1].map((b) => (
                <table key={b} className="fp-tbl">
                  <thead><tr><th rowSpan={2}>ردیف</th><th rowSpan={2}>شماره لوله</th><th rowSpan={2}>طول لوله</th><th rowSpan={2}>ضخامت</th><th colSpan={2}>وضعیت</th></tr><tr><th>حمل از کارخانه</th><th>حمل از دپو</th></tr></thead>
                  <tbody>{half(rows.slice(b * 23, b * 23 + 23), p * PER + b * 23)}</tbody>
                </table>
              ))}
            </div>
            <table className="fp-tbl fp-sumstr">
              <thead>
                <tr><th rowSpan={2}>ردیف</th><th rowSpan={2}>ضخامت ( اینچ)</th><th colSpan={2}>تا روز قبل</th><th colSpan={2}>امروز</th><th colSpan={2}>تا امروز</th><th colSpan={2}>جمع کل</th></tr>
                <tr><th>تعداد شاخه</th><th>متراژ</th><th>تعداد شاخه</th><th>متراژ</th><th>تعداد شاخه</th><th>متراژ</th><th>تعداد شاخه</th><th>متراژ</th></tr>
              </thead>
              <tbody>{thk.map((t, i) => (
                <tr key={i}><td>{fa(i + 1)}</td><td><b>{t3(t)}</b></td><td>{nf0(yJ[i])}</td><td>{nf2(yL[i])}</td><td>{tJ[i]}</td><td>{nf2(tL[i])}</td><td>{nf0(nJ[i])}</td><td>{nf2(nL[i])}</td>
                  {i === 0 && <><td rowSpan={4}><b>{nf0(sum(nJ))}</b></td><td rowSpan={4}><b>{nf2(sum(nL))}</b></td></>}</tr>
              ))}</tbody>
            </table>
            <Notes c={c} />
            <Sign c={c} left="نماینده پیمانکار" right="نماینده دستگاه نظارت" />
          </div>
        )
      })}
    </div>
  )
}

/* ---------- radiography request — full ---------- */
function RtRequest({ c }: { c: PaperCtx }) {
  const r = c.report, PER = 20, pages = Math.max(1, Math.ceil(c.lines.length / PER))
  return (
    <div className="mt-printable fp-wrap">
      {Array.from({ length: pages }, (_, p) => {
        const rows = pad(PER, c.lines.slice(p * PER, (p + 1) * PER))
        const st = (l: ReportLine | undefined, suf: '' | 'C') => (['Root', 'Hot', 'Fill', 'Cap'] as const).map((k) => <td key={k}>{d(l, `stamp${k}${suf}`)}</td>)
        return (
          <div key={p} className="fp-page" dir="ltr">
            <div className="fp-logos"><div>{c.orgName}</div><div>{c.projectName}</div><div>Consultant</div></div>
            <div className="fp-band fp-title fp-en">Radioghraphy Request - Full</div>
            <div className="fp-rt-line"><span><b>Project :</b> {c.projectName}</span><b>{String(r.data.pipeSpec ?? '')}</b></div>
            <div className="fp-rt-line"><span><b>Date :</b> {jd(r.reportDate)}</span><span><b>REQ NO:</b> {String(r.data.reqNo ?? '')}</span><span><b>PAGE:</b> {p + 1} <b>OF</b> {pages}</span></div>
            <table className="fp-tbl fp-rt">
              <thead>
                <tr><th rowSpan={2}>NO</th><th rowSpan={2}>sec</th><th rowSpan={2}>WELD NO</th><th rowSpan={2}>THK (inch)</th><th rowSpan={2}>DIA/OD<br />(INCH)</th><th colSpan={5}>WELDERS STAMP</th><th rowSpan={2} className="fp-wide">Remark</th></tr>
                <tr><th>R<br />C</th><th>Root</th><th>Hot</th><th>Fill</th><th>CAP</th></tr>
              </thead>
              <tbody>{rows.map((l, i) => [
                <tr key={`a${i}`} className="fp-top"><td rowSpan={2}>{p * PER + i + 1}</td><td rowSpan={2}>{d(l, 'sec')}</td><td rowSpan={2}>{d(l, 'weldNo')}</td><td rowSpan={2}>{l && l.detail.thkIn !== '' && l.detail.thkIn != null ? `${Number(l.detail.thkIn).toFixed(3)}"` : ''}</td><td rowSpan={2}>{d(l, 'odIn')}</td><td><b>R</b></td>{st(l, '')}<td rowSpan={2}>{d(l, 'remark')}</td></tr>,
                <tr key={`b${i}`}><td><b>C</b></td>{st(l, 'C')}</tr>,
              ])}</tbody>
            </table>
            <Sign c={c} left="Contractor" right="Consultant" />
          </div>
        )
      })}
    </div>
  )
}

/* ---------- pipe delivery record (صورتجلسه ورود لوله) ---------- */
function PipeEntry({ c }: { c: PaperCtx }) {
  const r = c.report, thk = thicknessSet(r.data.thkSet), PER = 24, pages = Math.max(1, Math.ceil(c.lines.length / PER))
  const val = (key: string, i: number, f: 'prior' | 'today' | 'total') => (c.metrics ?? []).filter((m) => m.metric.key === key && Math.abs((Number(m.group) || 0) - thk[i]) < 0.0005).reduce((x, m) => x + m[f], 0)
  const jd2 = (v: unknown) => (v ? jd(String(v)) : '')
  return (
    <div className="mt-printable fp-wrap">
      {Array.from({ length: pages }, (_, p) => {
        const rows = pad(PER, c.lines.slice(p * PER, (p + 1) * PER))
        return (
          <div key={p} className="fp-page" dir="rtl">
            <div className="fp-logos"><div>{c.orgName}</div><div>{c.projectName}</div><div>Consultant</div></div>
            <div className="fp-line fp-meta3"><span>شماره گزارش <b>{r.reportNo}</b></span><span className="fp-grow">صورتجلسه ورود لوله‌های ۳۰ اینچ به کارگاه</span><span>تاریخ تنظیم : <b>{fmtD(r.reportDate)}</b></span></div>
            <table className="fp-tbl fp-pe" dir="ltr">
              <thead><tr><th>ردیف</th><th>شماره<br />WAY BILL</th><th>شماره لوله</th><th>طول بارنامه<br />(m)</th><th>ضخامت<br />(in)</th><th>سایز<br />(in)</th><th>شماره بارنامه</th><th>شماره کامیون</th><th>تاریخ بارگیری</th><th>تاریخ تخلیه</th><th className="fp-wide">وضعیت</th></tr></thead>
              <tbody>{rows.map((l, i) => <tr key={i} className={i === c.lines.length - p * PER && c.lines.length > 0 ? 'fp-strike' : undefined}><td>{p * PER + i + 1}</td><td>{d(l, 'wayBill')}</td><td>{d(l, 'pipeNo')}</td><td>{l && l.detail.lengthM !== '' && l.detail.lengthM != null ? Number(l.detail.lengthM).toFixed(2) : ''}</td><td>{l && l.detail.thkIn !== '' && l.detail.thkIn != null ? `${Number(l.detail.thkIn).toFixed(3)}"` : ''}</td><td>{d(l, 'sizeIn')}</td><td>{d(l, 'billNo')}</td><td>{d(l, 'truckNo')}</td><td>{jd2(l?.detail.loadDate)}</td><td>{jd2(l?.detail.unloadDate)}</td><td>{d(l, 'status')}</td></tr>)}</tbody>
            </table>
            <div className="fp-band fp-title">نوع بارگیری : {String(r.data.loadType ?? '')} - مبداء بارگیری : {String(r.data.origin ?? '')}</div>
            <div className="fp-pe-sum">
              <table className="fp-tbl">
                <tbody>{thk.map((t, i) => [
                  <tr key={`a${i}`}><td>جمع متراژ کل این گزارش</td><td><b>{f2(val('length', i, 'today'))}</b></td><td rowSpan={2}><b>{t ? `${t.toFixed(3)}"` : ''}</b></td><td>تعداد شاخه این گزارش</td><td><b>{val('joints', i, 'today')}</b></td></tr>,
                  <tr key={`b${i}`}><td>متراژ کل لوله‌های رسیده تاکنون</td><td><b>{f2(val('length', i, 'total'))}</b></td><td>کل شاخه رسیده تاکنون</td><td><b>{val('joints', i, 'total').toLocaleString('en-US')}</b></td></tr>,
                ])}
                  <tr className="fp-grey"><td>جمع کل لوله‌های رسیده تاکنون</td><td><b>{f2(thk.reduce((x, _, i) => x + val('length', i, 'total'), 0))}</b></td><td /><td>جمع کل لوله‌های رسیده تاکنون</td><td><b>{thk.reduce((x, _, i) => x + val('joints', i, 'total'), 0).toLocaleString('en-US')}</b></td></tr>
                </tbody>
              </table>
            </div>
            <div className="fp-note1">مقادیر فوق با احتساب یک شاخه لوله ۰/۴۰۶ اینچ بدون پوشش به طول ۱۲/۰۷ متر می‌باشند.</div>
            <Sign c={c} left="پیمانکار" right="دستگاه نظارت" />
            <small className="fp-foot">Page {p + 1} of {pages}</small>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- lowering & holiday ---------- */
function Lowering({ c }: { c: PaperCtx }) {
  const r = c.report
  const main = c.lines.filter((l) => d(l, 'kind') !== 'crossing'), cross = c.lines.filter((l) => d(l, 'kind') === 'crossing')
  const mr = pad(5, main), cr = pad(10, cross)
  const hol = (l: ReportLine | undefined) => ({ acc: 'ACC', rej: 'REJ' } as Record<string, string>)[d(l, 'holiday')] ?? d(l, 'holiday')
  const mt = (key: string, f: 'prior' | 'today' | 'total') => (c.metrics ?? []).filter((m) => m.metric.key === key).reduce((x, m) => x + m[f], 0)
  const sumM = main.reduce((x, l) => x + (Number(l.detail.loweredM) || 0), 0), sumN = main.reduce((x, l) => x + (Number(l.detail.loweredNo) || 0), 0)
  const sumC = cross.reduce((x, l) => x + (Number(l.detail.crossingM) || 0), 0)
  const q = (v: unknown) => (v === '' || v == null ? '' : Number(v).toFixed(2))
  return (
    <div className="mt-printable fp-wrap">
      <div className="fp-page fp-low" dir="ltr">
        <div className="fp-low-head"><div>{c.orgName}</div><div className="fp-low-t">{c.projectName}</div><div>Consultant</div></div>
        <div className="fp-low-row"><span><b>Contract No.:</b> {String(r.data.contractNo ?? '')}</span><span className="fp-band2">ITP PIPELINE</span><span><b>Form No.:</b> {String(r.data.formNo ?? '')}</span></div>
        <div className="fp-low-title">Lowering and Holiday Report</div>
        <div className="fp-low-info"><span><b>Specification Refrence:</b> {String(r.data.specRef ?? '')}</span><span><b>Report No:</b> {r.reportNo}</span><span><b>Date:</b> {jd(r.reportDate)}</span></div>
        <div className="fp-low-info"><span><b>Application Standard:</b> {String(r.data.standard ?? '')}</span><span><b>Weather:</b> {String(r.data.weather ?? '')}</span><span><b>Page:</b> 1</span></div>
        <table className="fp-tbl">
          <thead><tr><th rowSpan={2}>No.</th><th rowSpan={2}>Line/Sec<br />No.</th><th colSpan={2}>Weld No.</th><th colSpan={2}>Location (Km)</th><th rowSpan={2}>Lowered<br />(m)</th><th rowSpan={2}>Lowered<br />(No)</th><th rowSpan={2}>Holiday Result</th><th rowSpan={2} className="fp-wide">Remark</th></tr><tr><th>From</th><th>To</th><th>From</th><th>To</th></tr></thead>
          <tbody>
            {mr.map((l, i) => <tr key={i} className={i === main.length && main.length > 0 ? 'fp-strike' : undefined}><td>{i + 1}</td><td>{d(l, 'lineSec')}</td><td>{d(l, 'weldFrom')}</td><td>{d(l, 'weldTo')}</td><td>{kmTxt(l?.detail.kmFrom)}</td><td>{kmTxt(l?.detail.kmTo)}</td><td>{q(l?.detail.loweredM)}</td><td>{d(l, 'loweredNo')}</td><td>{hol(l)}</td><td>{d(l, 'remark')}</td></tr>)}
            <tr className="fp-tot"><td colSpan={6}>Total (m)</td><td>{f2(sumM)}</td><td>{sumN}</td><td colSpan={2} /></tr>
          </tbody>
        </table>
        <div className="fp-low-split">
          <table className="fp-tbl">
            <thead><tr><th colSpan={7}>Passage With Crossing</th></tr><tr><th rowSpan={2}>No.</th><th rowSpan={2}>Line/Sec<br />No</th><th rowSpan={2}>Crossing<br />Name/Type</th><th colSpan={2}>Weld No.</th><th rowSpan={2}>Length(m)</th><th rowSpan={2}>Holiday<br />result</th></tr><tr><th>From</th><th>To</th></tr></thead>
            <tbody>{cr.map((l, i) => <tr key={i}><td>{i + 1}</td><td>{d(l, 'lineSec')}</td><td>{d(l, 'crossing')}</td><td>{d(l, 'weldFrom')}</td><td>{d(l, 'weldTo')}</td><td>{q(l?.detail.crossingM)}</td><td>{hol(l)}</td></tr>)}
              <tr className="fp-tot"><td colSpan={5}>Total (m)</td><td>{sumC ? f2(sumC) : ''}</td><td /></tr></tbody>
          </table>
          <table className="fp-tbl"><thead><tr><th>Remark</th></tr></thead><tbody><tr><td className="fp-remark-box">{r.notes}</td></tr></tbody></table>
        </div>
        <div className="fp-low-foot">
          <div><b>Remark</b></div>
          <table className="fp-tbl fp-low-q"><tbody>
            <tr><td>Unt. Yesterday (Qty.):</td><td>{mt('lowN', 'prior')}</td><td>Unt. yesterday (m):</td><td>{f2(mt('lowM', 'prior'))}</td></tr>
            <tr><td>Today (Qty.):</td><td>{mt('lowN', 'today')}</td><td>Today (m):</td><td>{f2(mt('lowM', 'today'))}</td></tr>
            <tr><td>Total (Qty.):</td><td>{mt('lowN', 'total')}</td><td>Total (m):</td><td>{f2(mt('lowM', 'total'))}</td></tr>
          </tbody></table>
        </div>
        <div className="fp-low-sign">{['Contractor', 'Consultant'].map((t) => <div key={t}><b>{t}</b><p>Name</p><p>Date</p><p>Sign</p></div>)}</div>
      </div>
    </div>
  )
}

/* ---------- tie-in & connection ---------- */
function TieIn({ c }: { c: PaperCtx }) {
  const r = c.report, h = r.data
  const equip = c.resources.filter((x) => x.kind === 'equip'), man = c.resources.filter((x) => x.kind === 'man')
  const list = [...equip.map((x) => ({ name: x.name, on: x.activeQty, off: x.idleQty })), ...man.map((x) => ({ name: x.name, on: x.activeQty, off: x.leaveQty + x.stoppedQty }))]
  const rows = pad(24, list), lines = pad(9, c.lines)
  const meters = c.lines.reduce((x, l) => x + (Number(l.detail.lengthM) || 0), 0)
  const sk = c.lines.filter((l) => d(l, 'weldNo') || d(l, 'pipeNo')).slice(0, 3)
  const t3 = (v: unknown) => (v === '' || v == null ? '' : `${Number(v).toFixed(3)}"`)
  const L = (v: unknown) => (v === '' || v == null ? '' : String(Number(v)))
  return (
    <div className="mt-printable fp-wrap">
      <div className="fp-page" dir="rtl">
        <div className="fp-logos"><div>{c.orgName}</div><div>{c.projectName}</div><div>Consultant</div></div>
        <div className="fp-proj">{c.projectName}</div>
        <div className="fp-band fp-title">گزارش روزانه عملیات TIE- IN &amp; CONNECTION</div>
        <div className="fp-line fp-meta3"><span>شماره گزارش : <b>{r.reportNo}</b></span><span>تاریخ گزارش : <b>{fmtD(r.reportDate)}</b></span></div>
        <div className="fp-tie" dir="ltr">
          <table className="fp-tbl fp-tie-res" dir="rtl">
            <thead><tr><th>نفرات و ماشین آلات</th><th>فعال</th><th>غیر فعال</th></tr></thead>
            <tbody>{rows.map((x, i) => <tr key={i}><td>{x?.name ?? ''}</td><td>{x && x.on ? x.on : ''}</td><td>{x && x.off ? x.off : ''}</td></tr>)}</tbody>
          </table>
          <div className="fp-tie-info" dir="rtl">
            <div className="fp-tie-r"><span>کیلومتر : <b>{kmTxt(h.km)}</b></span><span>محل کار : <b>{String(h.workPlace ?? '')}</b></span></div>
            <div className="fp-tie-r"><span>نوع کار و متراژ : <b>{String(h.workType ?? '')}</b></span><span>متر <b>{meters ? meters.toFixed(2) : ''}</b></span></div>
            <div className="fp-tie-r" dir="ltr"><span>{String(h.pipeSpec ?? '')}</span><span>قطر و مشخصات لوله :</span></div>
            <div className="fp-tie-r"><span>تعداد جوشکاران : <b>{L(h.weldersCount)}</b></span><span>سمت مسیر : <b>{L(h.routeN)}</b></span><span>سمت کانال : <b>{L(h.canalN)}</b></span></div>
            <table className="fp-tbl" dir="ltr">
              <thead><tr><th colSpan={4}>WELDERS ID</th></tr><tr><th colSpan={2}>ROOT&amp; HOT</th><th colSpan={2}>FILLING &amp; CAP</th></tr><tr><th>0-180</th><th>180-0</th><th>0-180</th><th>180-0</th></tr></thead>
              <tbody><tr><td><b>{String(h.wid1 ?? '')}</b></td><td><b>{String(h.wid2 ?? '')}</b></td><td><b>{String(h.wid3 ?? '')}</b></td><td><b>{String(h.wid4 ?? '')}</b></td></tr></tbody>
            </table>
            <div className="fp-sub">شماره سکشن و سرجوش‌های انجام شده امروز</div>
            <table className="fp-tbl" dir="ltr">
              <thead><tr><th>ROW</th><th>SEC</th><th>WELD NO.</th><th>PIPE NO.</th><th>LENGTH</th><th>THK</th><th>BEND</th></tr></thead>
              <tbody>{lines.map((l, i) => <tr key={i}><td>{i + 1}</td><td><b>{d(l, 'sec')}</b></td><td><b>{d(l, 'weldNo')}</b></td><td><b>{d(l, 'pipeNo')}</b></td><td><b>{l && l.detail.lengthM !== '' && l.detail.lengthM != null ? Number(l.detail.lengthM).toFixed(2) : ''}</b></td><td><b>{t3(l?.detail.thkIn)}</b></td><td><b>{d(l, 'bendDeg')}</b></td></tr>)}</tbody>
            </table>
            <div className="fp-notes fp-tie-n"><b>توضیحات :</b> {r.notes}</div>
          </div>
        </div>
        <div className="fp-band fp-title fp-sk">کروکی : <u className="fp-en">TIE IN SEC {String(h.tieSecFrom ?? '')} TO SEC {String(h.tieSecTo ?? '')}</u></div>
        <div className="fp-sketch" dir="ltr">
          <svg viewBox="0 0 600 70" preserveAspectRatio="none" aria-hidden="true"><rect x="6" y="10" width="588" height="46" rx="22" fill="none" stroke="#000" strokeWidth="1.5" />{sk.slice(1).map((_, i) => <line key={i} x1={200 + i * 200} y1="10" x2={200 + i * 200} y2="56" stroke="#000" strokeWidth="1.5" strokeDasharray="4 3" />)}</svg>
          <div className="fp-sk-cols">{sk.map((l, i) => { const len = Number(l.detail.lengthM) || 0, cut = Number(l.detail.cutM) || 0; return (
            <div key={i}><b>W : {d(l, 'weldNo')}</b><b>P : {d(l, 'pipeNo')}</b><span>L (1) : {L(len)}</span><span>L(برش شده) : {cut ? L(cut) : 0}</span><span>L(2) : {L(len - cut)}</span><b>THK : {t3(l.detail.thkIn)}</b></div>) })}</div>
        </div>
        <Sign c={c} left="نماینده پیمانکار" right="نماینده دستگاه نظارت" />
      </div>
    </div>
  )
}

/* ---------- pipe factory release permit (مجوز خروج لوله از کارخانه) ---------- */
function PipePermit({ c }: { c: PaperCtx }) {
  const r = c.report, h = r.data, rows = pad(Math.max(6, c.lines.length), c.lines)
  const v = (k: string) => String(h[k] ?? '')
  const dt = (k: string) => (h[k] ? fmtD(String(h[k])) : '')
  return (
    <div className="mt-printable fp-wrap">
      <div className="fp-page fp-pp" dir="rtl">
        <div className="fp-pp-head">
          <div className="fp-pp-t"><b>فرم مجوز خروج لوله‌های فولادی پوشش سه‌لایه پلی‌اتیلن</b><span>{v('supplier')}</span></div>
          <div className="fp-pp-k"><div>سایز لوله : "{v('sizeIn')}</div><div>نام پروژه : {c.projectName}</div><div>شماره بارنامه : {v('billNo')}</div></div>
        </div>
        <div className="fp-pp-meta"><div><span>خریدار: {v('buyer') || c.orgName}</span><span>ضخامت: "{h.thkIn ? Number(h.thkIn).toFixed(3) : ''}</span></div><div><span>شماره سند : <b>{v('docNo')}</b></span><span>تاریخ سند : <b>{dt('docDate')}</b></span></div></div>
        <table className="fp-tbl">
          <thead><tr><th>ردیف</th><th>مشخصات کالا</th><th>شماره لوله</th><th>متراژ شاخه</th></tr></thead>
          <tbody>{rows.map((l, i) => <tr key={i}><td>{i + 1}</td><td dir="ltr">{l ? d(l, 'goods') || 'PIPE COATED 30" 3 LAY PE' : ''}</td><td>{d(l, 'pipeNo')}</td><td>{l && l.detail.lengthM !== '' && l.detail.lengthM != null ? <>{d(l, 'checked') === 'yes' && <span className="fp-tick">✓ </span>}{Number(l.detail.lengthM).toFixed(2)}</> : ''}</td></tr>)}</tbody>
        </table>
        <p className="fp-pp-p">بدین‌وسیله تأیید می‌گردد لوله‌های مندرج در این برگ خروجی صحیح و سالم تحویل اینجانب {v('receiver')} گردید.</p>
        <div className="fp-pp-box"><span>وسیله نقلیه شماره <b dir="ltr">{v('truck')}</b> به رانندگی <b>{v('driver')}</b> در تاریخ <b>{dt('exitDate')}</b> از شرکت حمل و نقل <b>{v('carrier')}</b></span><strong>مجاز است لوله‌های فوق را از کارخانه خارج نماید.</strong></div>
        <div className="fp-pp-sign">{['انبار محصول', 'بازرسی درب خروج', 'واحد کنترل کیفیت', 'ثبت اسناد'].map((t) => <div key={t}><b>{t}</b></div>)}</div>
      </div>
    </div>
  )
}

export function FormPaper({ c }: { c: PaperCtx }) {
  switch (c.form?.key) {
    case 'backfill': return <JointKm c={c} title="بکفیل" />
    case 'rock_shield': return <JointKm c={c} title="Rock Shield" />
    case 'geotextile': return <JointKm c={c} title="ژئوتکستایل" />
    case 'string': return <StringPaper c={c} />
    case 'rt_request': return <RtRequest c={c} />
    case 'pipe_entry': return <PipeEntry c={c} />
    case 'lowering': return <Lowering c={c} />
    case 'tie_in': return <TieIn c={c} />
    case 'pipe_permit': return <PipePermit c={c} />
    case 'sand': return <JointKm c={c} title="خاک سرندی" />
    case 'bend': return <Bend c={c} />
    case 'weld_repair': return <WeldRepair c={c} />
    case 'bond_test': return <CoatTest c={c} />
    default: return null
  }
}
