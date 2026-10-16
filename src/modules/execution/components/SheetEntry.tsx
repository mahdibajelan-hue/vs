import { useMemo, useState, type ReactNode } from 'react'
import { GridSheet, printPlan } from '../forms/GridTemplate'
import { GRID_SPECS, cellTarget, editableCells, specPage, specPages, type CellTarget } from '../forms/gridSpecs'
import { specInputOf } from './TemplatePaper'
import type { FieldDef, FormDef } from '../lib/formCatalog'
import type { FormTemplateRow } from '../epcTypes'
import type { PaperCtx } from './ReportPaper'

/**
 * Entry directly on the approved Excel sheet: the form is drawn exactly as the sheet, a click on a cell opens the field behind it (the same
 * field, same checks and same remembered/central values as the table entry). Cells that are derived (page, totals, ticks) are not editable.
 */
export function SheetEntry({ template, form, report, rows, identity, metrics, editable, ensureRows, renderRow, renderHeader }: {
  template: FormTemplateRow; form: FormDef; report: PaperCtx['report']
  rows: { key: string; detail: Record<string, unknown> }[]
  identity: { diameterIn?: string | number; pipeGrade?: string; pipeStandard?: string }
  metrics?: PaperCtx['metrics']; editable: boolean
  /** makes sure at least n records exist (clicking an empty row of the sheet creates it) */
  ensureRows: (n: number) => void
  renderRow: (f: FieldDef, rowKey: string) => ReactNode
  renderHeader: (f: FieldDef) => ReactNode
}) {
  const spec = GRID_SPECS[template.formKey]
  const [page, setPage] = useState(0)
  const [sel, setSel] = useState<{ a: string; t: CellTarget } | null>(null)
  const inp = useMemo(() => specInputOf(report, rows, identity, metrics), [report, rows, identity, metrics])
  const pages = specPages(spec, Math.max(rows.length, 1))
  const shown = specPage(spec, template.layout, inp, Math.min(page, pages - 1))
  const editable0 = useMemo(() => editableCells(spec, page), [spec, page])
  const mark = new Set([...editable0].filter((a) => !(a in shown.values) && a !== sel?.a)) // empty fillable cells are tinted
  const plan = printPlan(template.layout)
  const field = !sel ? null : sel.t.kind === 'header' ? form.header.find((f) => f.key === sel.t.key) ?? null : form.columns.find((f) => f.key === sel.t.key) ?? null
  const row = sel && sel.t.kind === 'row' ? rows[sel.t.row] : undefined
  const click = (a: string) => {
    const t = cellTarget(spec, a, Math.min(page, pages - 1)); if (!t) return
    if (t.kind === 'row' && editable && t.row >= rows.length) ensureRows(t.row + 1)
    setSel({ a, t })
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '8px 12px', background: 'rgba(14,165,233,.08)', borderRadius: 8, minHeight: 44 }}>
        {!sel || !field ? <span className="im-helper" style={{ margin: 0 }}>روی هر سلول خط‌دارِ فرم کلیک کنید و مقدار را بنویسید؛ سلول‌های محاسباتی (صفحه، جمع‌ها، تیک‌ها) خودکار پر می‌شوند.</span> : (
          <>
            <b>{field.label}</b>{sel.t.kind === 'row' && <span className="sub">ردیف {sel.t.row + 1}</span>}
            <span style={{ minWidth: 220 }}>{sel.t.kind === 'header' ? renderHeader(field) : row ? renderRow(field, row.key) : <span className="im-helper">ردیف ساخته می‌شود…</span>}</span>
            <button className="im-btn im-btn-sm" onClick={() => setSel(null)}>بستن</button>
          </>
        )}
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {pages > 1 && Array.from({ length: pages }, (_, p) => <button key={p} className={`im-btn im-btn-sm${p === page ? ' im-btn-primary' : ''}`} onClick={() => { setPage(p); setSel(null) }}>صفحه {p + 1}</button>)}
          {editable && <button className="im-btn im-btn-sm" onClick={() => { ensureRows(rows.length + 1); setPage(specPages(spec, rows.length + 1) - 1) }}>+ ردیف</button>}
        </span>
      </div>
      <div style={{ overflow: 'auto', maxWidth: '100%' }} dir="ltr"><style>{plan.css}</style>
        <div className="gt-page" style={{ width: 'fit-content', margin: '0 auto' }}><GridSheet tpl={template.layout} values={shown.values} mark={mark} selected={sel?.a} onCell={click} /></div>
      </div>
    </div>
  )
}
