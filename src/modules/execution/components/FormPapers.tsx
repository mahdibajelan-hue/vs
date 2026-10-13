import type { ReactNode } from 'react'
import { fmtD } from '../../finance/components/fn'
import type { PaperCtx } from './ReportPaper'
import type { ReportLine } from '../types'

/** Paper layouts of the technical forms that are drawn exactly like the contractor's printed sheets. */
export const PAPER_FORMS = new Set(['backfill', 'sand', 'bend', 'weld_repair', 'bond_test'])

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
        <tbody>{rows.map((l, i) => <tr key={i}><td>{i + 1}</td><td>{d(l, 'sec')}</td><td>{d(l, 'jointFrom')}</td><td>{d(l, 'jointTo')}</td><td>{kmTxt(l?.detail.kmFrom)}</td><td>{kmTxt(l?.detail.kmTo)}</td><td className="fp-tick">{tick(d(l, 'result') === 'acc')}</td><td className="fp-tick">{tick(d(l, 'result') === 'rej')}</td><td>{d(l, 'remark')}</td></tr>)}</tbody>
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

export function FormPaper({ c }: { c: PaperCtx }) {
  switch (c.form?.key) {
    case 'backfill': return <JointKm c={c} title="بکفیل" />
    case 'sand': return <JointKm c={c} title="خاک سرندی" />
    case 'bend': return <Bend c={c} />
    case 'weld_repair': return <WeldRepair c={c} />
    case 'bond_test': return <CoatTest c={c} />
    default: return null
  }
}
