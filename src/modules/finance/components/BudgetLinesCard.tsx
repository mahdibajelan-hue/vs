import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useFinanceStore } from '../store/useFinanceStore'
import { useFinanceControlStore, type FinBudgetLine } from '../store/useFinanceControlStore'
import { currentContractValue, certificatePaidTotal } from '../lib/financeCalc'
import { fmtCurrency } from './FinanceKpiTile'
import { FINANCE_ACCENT } from '../FinanceApp'

/** Budget lines (ردیف بودجه) of a project: approved amount per line, with what contracts attached to the line commit and what has been paid. Land has its own line, read by the land module. */
export function BudgetLinesCard({ masterProjectId }: { masterProjectId: string }) {
  const lines = useFinanceControlStore((s) => s.budgetLines).filter((l) => l.masterProjectId === masterProjectId)
  const items = useFinanceControlStore((s) => s.configItems)
  const land = useFinanceControlStore((s) => s.land.get(masterProjectId))
  const save = useFinanceControlStore((s) => s.saveBudgetLine)
  const contracts = useFinanceStore((s) => s.contracts)
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const [draft, setDraft] = useState<{ code: string; title: string; cat: string; kind: 'general' | 'land'; amount: string } | null>(null)

  const rows = useMemo(() => lines.map((l) => {
    const mine = contracts.filter((c) => c.budgetLineId === l.id && (c.status === 'active' || c.status === 'completed' || c.status === 'suspended'))
    const ids = new Set(mine.map((c) => c.id))
    const committed = l.kind === 'land' ? (land?.exposure ?? 0) : mine.reduce((n, c) => n + currentContractValue(c, amendments), 0)
    const paid = l.kind === 'land' ? (land?.paid ?? 0) : certificates.filter((c) => ids.has(c.contractId)).reduce((n, c) => n + certificatePaidTotal(c), 0)
    return { l, committed, paid, remaining: l.approvedAmount - committed }
  }), [lines, contracts, amendments, certificates, land])
  const cats = items.filter((i) => i.kind === 'cost_category' && i.active)

  return (
    <div className="fin-card space-y-3 p-4">
      <div className="flex items-center justify-between"><p className="text-sm font-extrabold">ردیف‌های بودجه</p>
        <button onClick={() => setDraft({ code: '', title: '', cat: '', kind: 'general', amount: '' })} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white" style={{ background: FINANCE_ACCENT }}><Plus size={12} /> ردیف جدید</button></div>
      {rows.length === 0 && !draft && <p className="py-3 text-center text-xs fin-text-muted">ردیفی تعریف نشده است. هر قرارداد را می‌توان به یک ردیف وصل کرد تا تعهد هر ردیف دیده شود.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="fin-text-muted text-right"><th className="py-1.5 font-medium">ردیف</th><th className="font-medium">دسته</th><th className="text-left font-medium">مصوب</th><th className="text-left font-medium">تعهد</th><th className="text-left font-medium">پرداخت‌شده</th><th className="text-left font-medium">مانده</th></tr></thead>
          <tbody>{rows.map(({ l, committed, paid, remaining }: { l: FinBudgetLine; committed: number; paid: number; remaining: number }) => (
            <tr key={l.id} className="border-t" style={{ borderColor: 'var(--fin-divider)', opacity: l.isActive ? 1 : 0.45 }}>
              <td className="py-1.5"><b className="num" dir="ltr">{l.code}</b> {l.title}{l.kind === 'land' && <span className="ms-1 text-[10px] fin-text-muted">(تملک اراضی؛ ارقام از ماژول تحصیل)</span>}</td>
              <td>{items.find((i) => i.kind === 'cost_category' && i.key === l.costCategory)?.label ?? '—'}</td>
              <td className="num text-left">{fmtCurrency(l.approvedAmount, l.currency)}</td><td className="num text-left">{fmtCurrency(committed, l.currency)}</td><td className="num text-left">{fmtCurrency(paid, l.currency)}</td>
              <td className="num text-left font-bold" style={{ color: remaining < 0 ? '#b5573a' : undefined }}>{fmtCurrency(remaining, l.currency)}</td></tr>))}</tbody></table></div>
      )}
      {draft && (
        <div className="grid items-end gap-2 sm:grid-cols-[90px_1fr_150px_150px_auto]">
          <input className="fin-input" dir="ltr" placeholder="کد" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
          <input className="fin-input" placeholder="عنوان ردیف" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <select className="fin-input" value={draft.cat} onChange={(e) => setDraft({ ...draft, cat: e.target.value, kind: e.target.value === 'land' ? 'land' : 'general' })}><option value="">دسته</option>{cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
          <input className="fin-input num" type="number" placeholder="مبلغ مصوب" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          <div className="flex gap-1.5"><button disabled={!draft.code.trim() || !draft.title.trim()} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-40" style={{ background: FINANCE_ACCENT }} onClick={async () => { if (await save({ projectId: masterProjectId, code: draft.code, title: draft.title, costCategory: draft.cat, kind: draft.kind, amount: Number(draft.amount) || 0, currency: 'ریال' })) setDraft(null) }}>ثبت</button><button className="px-2 text-xs fin-text-muted" onClick={() => setDraft(null)}>انصراف</button></div>
        </div>
      )}
    </div>
  )
}
