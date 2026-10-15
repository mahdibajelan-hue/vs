import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { FORM_BY_KEY } from '../lib/formCatalog'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { designShape, designValues } from '../forms/designGrid'
import { GridSheet, printPlan } from '../forms/GridTemplate'
import { Section, fmtD } from '../../finance/components/fn'
import { EpcGate } from '../components/epc/EpcBanner'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'

/** Forms designed in the app (future forms): fill the header and the table, save, print on the frozen approved sheet. */
export function DesignedForms({ projectId }: { projectId: string }) { return <EpcGate><Inner projectId={projectId} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const epc = useEpcStore()
  const can = useExecutionStore((s) => s.can(projectId, 'record') || s.can(projectId, '*'))
  // forms that exist in the form catalog are filled in the technical-forms entry (one entry path per form); only sheets without a catalog form are filled here
  const tpls = useMemo(() => epc.templates.filter((t) => t.status === 'approved' && !FORM_BY_KEY[t.formKey]), [epc.templates])
  const [tid, setTid] = useState('')
  const tpl = tpls.find((t) => t.id === tid) ?? tpls[0]
  const mine = epc.entries.filter((e) => e.projectId === projectId && tpl && e.templateId === tpl.id)
  const shape = useMemo(() => (tpl ? designShape(tpl.layout) : null), [tpl])
  const free = !!tpl && tpl.layout.source.file !== 'designed-in-app'
  const [sel, setSel] = useState<{ a: string; fixed: string } | null>(null)
  const [cur, setCur] = useState<{ id?: string; date: string; header: string[]; rows: string[][] } | null>(null)
  if (!tpls.length) return <p className="im-helper">هنوز فرم طراحی‌شدهٔ تأییدشده‌ای نیست. از «تنظیمات ← کتابخانهٔ قالب‌های مصوب فرم» یک فرم طراحی و تأیید کنید.</p>
  if (!tpl || !shape) return null
  const blank = () => { setSel(null); setCur({ date: new Date().toISOString().slice(0, 10), header: shape.headers.map(() => ''), rows: free ? [] : Array.from({ length: shape.rows }, () => shape.columns.map(() => '')) }) }
  const cells = (rows: string[][]) => Object.fromEntries(rows.map((r) => [r[0], r[1]]))
  const setCell = (a: string, v: string) => cur && setCur({ ...cur, rows: [...cur.rows.filter((r) => r[0] !== a), ...(v ? [[a, v]] : [])] })
  const plan = printPlan(tpl.layout)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={tpl.id} onChange={(e) => { setTid(e.target.value); setCur(null) }} aria-label="فرم">{tpls.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select>
        {can && <button className="im-btn im-btn-primary im-btn-sm" onClick={blank}>فرم جدید</button>}
      </div>
      {!cur && (
        <Section title="فرم‌های ثبت‌شده">
          <table className="ex-lines"><tbody>{mine.map((e) => <tr key={e.id}><td>{fmtD(e.entryDate)}</td><td>{e.header.filter(Boolean).join(' · ')}</td><td><button className="im-btn im-btn-sm" onClick={() => { setSel(null); setCur({ id: e.id, date: e.entryDate, header: shape.headers.map((_, i) => e.header[i] ?? ''), rows: free ? e.rows : Array.from({ length: shape.rows }, (_, k) => shape.columns.map((__, i) => e.rows[k]?.[i] ?? '')) }) }}>باز کردن</button> {can && <button className="im-btn im-btn-sm" onClick={() => { if (window.confirm('این فرم حذف شود؟')) void epc.deleteEntry(e.id) }}>حذف</button>}</td></tr>)}
            {mine.length === 0 && <tr><td className="sub">فرمی ثبت نشده است.</td></tr>}</tbody></table>
        </Section>
      )}
      {cur && (
        <Section title={tpl.title} action={<span style={{ display: 'inline-flex', gap: 6 }}><button className="im-btn im-btn-sm" onClick={() => window.print()}><Printer size={13} /> چاپ</button><button className="im-btn im-btn-sm" onClick={() => setCur(null)}>بستن</button>{can && <button className="im-btn im-btn-primary im-btn-sm" onClick={async () => { if (await epc.saveEntry({ id: cur.id, projectId, templateId: tpl.id, entryDate: cur.date, header: cur.header, rows: cur.rows.filter((r) => r.some(Boolean)) })) setCur(null) }}>ذخیره</button>}</span>}>
          <div className="no-print" style={{ display: 'grid', gap: 8 }}>
            <label>تاریخ <JalaliDateInput value={cur.date} onChange={(d) => setCur({ ...cur, date: d })} /></label>
            {free && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="im-helper" style={{ margin: 0 }}>روی یک سلول فرم کلیک کنید و مقدار را بنویسید.</span>{sel && <><b dir="ltr">{sel.a}</b><span className="sub">{sel.fixed.slice(0, 40)}</span><input autoFocus value={cells(cur.rows)[sel.a] ?? ''} onChange={(e) => setCell(sel.a, e.target.value)} aria-label="مقدار سلول" style={{ flex: 1 }} /></>}</div>}
            {!free && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{shape.headers.map((h, i) => <label key={i}>{h.label}<input value={cur.header[i]} onChange={(e) => setCur({ ...cur, header: cur.header.map((x, j) => (j === i ? e.target.value : x)) })} /></label>)}</div>}
            {!free && <div className="fn-tbl-wrap" style={{ maxHeight: 360 }}><table className="ex-lines"><thead><tr><th>#</th>{shape.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
              <tbody>{cur.rows.map((r, k) => <tr key={k}><td>{k + 1}</td>{r.map((v, i) => <td key={i}><input value={v} onChange={(e) => setCur({ ...cur, rows: cur.rows.map((rr, kk) => (kk === k ? rr.map((x, ii) => (ii === i ? e.target.value : x)) : rr)) })} aria-label={`${shape.columns[i]} ردیف ${k + 1}`} /></td>)}</tr>)}</tbody></table></div>}
          </div>
          <div className="mt-printable gt-paper" dir="ltr"><style>{plan.css}</style><div className="gt-page" style={{ width: 'fit-content', margin: '10px auto' }}><GridSheet tpl={tpl.layout} values={free ? cells(cur.rows) : designValues(tpl.layout, cur.header, cur.rows)} onCell={free ? (a, fixed) => setSel({ a, fixed }) : undefined} selected={sel?.a} /></div></div>
        </Section>
      )}
    </div>
  )
}
