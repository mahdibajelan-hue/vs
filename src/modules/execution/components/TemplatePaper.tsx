import { Fragment } from 'react'
import { fmtD } from '../../finance/components/fn'
import { useExecutionStore } from '../store/useExecutionStore'
import { epcSettings } from '../lib/epcSettings'
import { GridSheet, printPlan } from '../forms/GridTemplate'
import { ROWS_PER_PAGE, weldingGridPage, type WeldRow } from '../forms/weldingGrid'
import { WELDING_LOGO_SLOTS } from '../forms/weldingBindings'
import { thicknessSet } from './WeldingPaper'
import type { PaperCtx } from './ReportPaper'
import type { FormTemplateRow } from '../epcTypes'
import type { ReportLine } from '../types'

const jd = (iso: string) => fmtD(iso).replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/\//g, '.')
const d = (l: ReportLine, k: string) => (l.detail[k] == null ? '' : String(l.detail[k]))
const num = (v: unknown) => { const x = Number(String(v ?? '').replace('٫', '.')); return Number.isFinite(x) && String(v ?? '') !== '' ? x : null }

/** The daily welding report printed on the APPROVED sheet (frozen grid of the approved Excel version): same geometry, only the bound cells carry data. */
export function TemplatePaper({ c, template }: { c: PaperCtx; template: FormTemplateRow }) {
  const r = c.report
  const settings = useExecutionStore((s) => s.settingsByProject.get(r.projectId))
  const ep = epcSettings(settings as unknown as Record<string, unknown>)
  const thk = thicknessSet(r.data.thkSet)
  const rows: WeldRow[] = c.lines.map((l) => ({ sec: d(l, 'sec'), weldNo: d(l, 'weldNo'), pipeNo: d(l, 'pipeNo'), lengthM: num(l.detail.lengthM), thkIn: num(l.detail.thkIn), sizeIn: d(l, 'sizeIn'), bendDeg: d(l, 'bendDeg'),
    stampsL: [d(l, 'stampRoot'), d(l, 'stampHot'), d(l, 'stampFill'), d(l, 'stampCap')], stampsR: [d(l, 'stampRootC'), d(l, 'stampHotC'), d(l, 'stampFillC'), d(l, 'stampCapC')],
    vt: ({ acc: 'ACC', rej: 'REJ' } as Record<string, string>)[d(l, 'vt')] ?? d(l, 'vt'), remark: d(l, 'remark') }))
  const pr = (key: string, i: number) => (c.metrics ?? []).filter((m) => m.metric.key === key && Math.abs((num(m.group) ?? -1) - thk[i]) < 0.0005).reduce((s, m) => s + m.prior, 0)
  const id = ep.identity
  const header = { projectTitle: c.projectName, diameterIn: id.diameterIn, pipeGrade: id.pipeGrade, pipeStandard: id.pipeStandard, wpsNo: String(r.data.wpsNo ?? ''), reportNo: r.reportNo, dateJalali: jd(r.reportDate) }
  const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE))
  const logos: Record<string, string> = {}
  for (const l of WELDING_LOGO_SLOTS) { const own = ep.parties[l.slot]?.logo; logos[l.anchor] = own || `${import.meta.env.BASE_URL}form-logo-welding-original.png` }
  const plan = printPlan(template.layout)
  return (
    <div className="mt-printable gt-paper" dir="ltr">
      <style>{`${plan.css} @media print { .gt-page { zoom: ${plan.scale}; break-after: page; } .gt-page:last-child { break-after: auto; } }`}</style>
      {Array.from({ length: pages }, (_, p) => {
        const res = weldingGridPage(template.layout, { header, thk, rows, prior: { len: thk.map((_, i) => pr('len', i)), joints: thk.map((_, i) => pr('joints', i)) } }, p)
        if (r.data.pipeSpec) res.values.A4 = String(r.data.pipeSpec)
        else if (!id.diameterIn) delete res.values.A4 // nothing known yet: the approved text stays
        return <Fragment key={p}><div className="gt-page" style={{ width: 'fit-content', margin: '0 auto' }}><GridSheet tpl={template.layout} values={res.values} logos={logos} /></div></Fragment>
      })}
      <small className="wd-foot">{r.reportNo} · {template.code ? `${template.code} / ` : ''}نسخهٔ قالب {template.revision || template.version} · نسخهٔ بایگانی</small>
    </div>
  )
}
