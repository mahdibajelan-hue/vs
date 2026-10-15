import { useMemo, useRef, useState } from 'react'
import { Printer } from 'lucide-react'
import welding from '../forms/templates/welding.grid.json'
import { GridSheet, printPlan } from '../forms/GridTemplate'
import { addr, type GridTemplate } from '../forms/gridTypes'
import { WELDING_BINDINGS, WELDING_LOGO_SLOTS, weldingValues } from '../forms/welding.bindings'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { epcSettings } from '../lib/epcSettings'
import { Section } from '../../finance/components/fn'
import { fa } from '../components/common'

const tpl = welding as unknown as GridTemplate
const fixedText = Object.fromEntries(tpl.cells.filter((c) => c.v).map((c) => [addr(c.r, c.c), c.v as string]))

/** Pilot of the approved-sheet approach: the real «DAILY WELDING REPORT» grid, drawn from the frozen template, with only the proposed bound cells filled from the project identity. */
export function FormTemplatePilot({ projectId }: { projectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId))
  const settings = useExecutionStore((s) => s.settingsByProject.get(projectId))
  const parties = epcSettings(settings as unknown as Record<string, unknown>).parties
  const [f, setF] = useState({ diameterIn: '48', pipeGrade: 'API 5L X70', pipeStandard: 'API 1104', wpsNo: 'WPS-01', reportNo: 'WLD-001', dateJalali: '1405/07/23' })
  const [showBound, setShowBound] = useState(true)
  const [useOriginalLogo, setUseOriginalLogo] = useState(true)
  const wrap = useRef<HTMLDivElement>(null)
  const values = useMemo(() => weldingValues({ projectTitle: project?.officialName ?? 'عنوان رسمی پروژه', ...f, page: 1, pages: 1 }, fixedText), [project, f])
  const mark = useMemo(() => new Set(showBound ? Object.keys(values) : []), [values, showBound])
  const logos: Record<string, string> = {}
  for (const l of WELDING_LOGO_SLOTS) {
    const own = parties[l.slot]?.logo
    const url = own || (useOriginalLogo ? `${import.meta.env.BASE_URL}form-logo-welding-original.png` : '')
    if (url) logos[l.anchor] = url
  }
  const plan = printPlan(tpl)
  const total = tpl.cols.filter((c) => !c.hidden).reduce((s, c) => s + c.w, 0)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <style>{`${plan.css} @media print { body * { visibility: hidden !important; } .gt-print, .gt-print * { visibility: visible !important; } .gt-print { position: absolute; inset: 0 auto auto 0; zoom: ${plan.scale}; } .gt-noprint { display: none !important; } }`}</style>
      <div className="im-card gt-noprint" style={{ padding: 12, display: 'grid', gap: 8 }}>
        <b>الگوی آزمایشی فرم مصوب — «DAILY WELDING REPORT» (برگ WELDING از فایل ارسالی)</b>
        <span className="im-helper" style={{ margin: 0 }}>شبکهٔ فرم عیناً از اکسل ساخته شده است ({fa(tpl.stats.cells)} سلول، {fa(tpl.stats.merged)} ادغام، {fa(tpl.stats.hiddenCols)} ستون پنهان). فقط سلول‌های زردرنگ (پیشنهاد نگاشت) از شناسنامهٔ پروژه پر می‌شوند؛ هیچ چیز دیگر تغییر نکرده است. ورودی‌های زیر فقط برای آزمایش‌اند.</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {([['diameterIn', 'قطر (in)'], ['pipeGrade', 'گرید'], ['pipeStandard', 'استاندارد'], ['wpsNo', 'WPS'], ['reportNo', 'شمارهٔ گزارش'], ['dateJalali', 'تاریخ']] as const).map(([k, l]) => <label key={k} className="ex-lab">{l}<input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} dir="auto" style={{ width: 110 }} /></label>)}
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={showBound} onChange={(e) => setShowBound(e.target.checked)} /> نمایش سلول‌های نگاشت‌شده</label>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={useOriginalLogo} onChange={(e) => setUseOriginalLogo(e.target.checked)} /> لوگوی اصلی فایل (اگر لوگوی کارفرما تعریف نشده)</label>
          <button className="im-btn im-btn-primary im-btn-sm" onClick={() => window.print()}><Printer size={13} /> چاپ / PDF</button>
        </div>
        <span className="im-helper" style={{ margin: 0 }}>چاپ: A4 {tpl.print.orientation === 'portrait' ? 'عمودی' : 'افقی'}، مقیاس اکسل {fa((plan.excelScale) * 100)}٪؛ مقیاس اعمال‌شده {fa(plan.scale * 100, 1)}٪ (عرض فرم {fa(total)} پیکسل در برابر عرض قابل چاپ {fa(plan.pageW)}). اگر این دو یکی نیستند، یعنی در اکسل هم باید همین‌قدر کوچک می‌شد تا در یک صفحه جا شود.</span>
      </div>
      <div ref={wrap} className="gt-print" style={{ overflow: 'auto', background: '#e2e8f0', padding: 12, borderRadius: 12 }}>
        <div style={{ background: '#fff', width: 'fit-content', boxShadow: '0 4px 18px rgba(0,0,0,.18)' }}><GridSheet tpl={tpl} values={values} logos={logos} mark={mark} /></div>
      </div>
      <div className="gt-noprint"><Section title="نگاشت‌های پیشنهادی (نیازمند تأیید مالک فرم)" flush>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>سلول</th><th>منبع در سامانه</th><th>روش</th><th>توضیح</th><th>مقدار آزمایشی</th></tr></thead>
          <tbody>{WELDING_BINDINGS.map((b) => <tr key={b.cell}><td className="fn-code">{b.cell}</td><td className="fn-code">{b.source}</td><td>{b.mode === 'append' ? 'افزودن به برچسب' : 'جایگزینی متن'}</td><td style={{ whiteSpace: 'normal' }}>{b.note}</td><td dir="auto">{values[b.cell] ?? '—'}</td></tr>)}</tbody></table></div>
      </Section></div>
    </div>
  )
}
