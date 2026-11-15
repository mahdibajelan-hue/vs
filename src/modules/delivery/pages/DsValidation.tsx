import { useMemo } from 'react'
import { FlaskConical } from 'lucide-react'
import { ARCHETYPES } from '../lib/archetypes'
import { evaluate } from '../lib/engine'
import { fa, nameOf } from '../lib/useLive'

/** the engine's reasoning on five typical oil & gas cases (no real project data), and a way to start a study from one */
export function DsValidation({ canCreate, busy, onUse }: { canCreate: boolean; busy: boolean; onUse: (title: string, answers: Record<string, unknown>) => void }) {
  const rows = useMemo(() => ARCHETYPES.map((a) => ({ a, r: evaluate({ answers: a.answers }) })), [])
  return (
    <section className="ds-card" aria-labelledby="ds-val-h">
      <header><h3 id="ds-val-h"><FlaskConical size={15} aria-hidden />نمونه‌های آزمایشی موتور تصمیم</h3><p>پنج نمونهٔ نوعی پروژه‌های نفت و گاز (بدون دادهٔ واقعی). انتظار کارشناسی کنار نتیجهٔ موتور آمده است تا منطق آن قابل‌بازبینی باشد. همین نمونه‌ها در آزمون‌های خودکار سامانه نیز بررسی می‌شوند.</p></header>
      <div className="ds-scroll"><table className="ds-tbl">
        <thead><tr><th scope="col">نمونه</th><th scope="col">انتظار کارشناسی</th><th scope="col">نتیجهٔ موتور</th><th scope="col">اطمینان</th><th scope="col">حذف‌شده‌ها</th><th scope="col" /></tr></thead>
        <tbody>{rows.map(({ a, r }) => (
          <tr key={a.key}>
            <th scope="row">{a.fa}</th><td>{a.expect}</td>
            <td><b>{nameOf(r, r.winner)}</b><br /><small>دوم: {nameOf(r, r.runnerUp)} (فاصله {fa(r.gap, 1)})</small></td>
            <td>{fa(r.confidence.score)} · {r.confidence.decisive ? 'قطعی' : 'غیرقطعی'}</td>
            <td>{r.options.filter((o) => o.status === 'excluded').map((o) => o.en).join('، ') || '—'}</td>
            <td><button type="button" className="ds-btn is-ghost" disabled={!canCreate || busy} onClick={() => onUse(`نمونهٔ آزمایشی — ${a.fa}`, a.answers)}>شروع مطالعه از این نمونه</button></td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  )
}
