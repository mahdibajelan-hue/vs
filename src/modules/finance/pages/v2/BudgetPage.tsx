import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Plus } from 'lucide-react'
import { useFinanceStore } from '../../store/useFinanceStore'
import { useFinanceControlStore, type FinBudgetLine } from '../../store/useFinanceControlStore'
import { certificatePaidTotal, computeAnnualBudgetRows, currentBudget, currentContractValue } from '../../lib/financeCalc'
import { buildCurves } from '../../lib/financeCurves'
import { exportFinanceReportToExcel } from '../../lib/financeExport'
import { toneOf } from '../../lib/financeKpis'
import { useThresholds } from '../../lib/useThresholds'
import { Chip, DataTable, KpiCard, NumInput, Section, StackBar, fmtBn, fmtPct, parseNum, splitMoney, type Col } from '../../components/fn'
import { JALALI_MONTHS } from '../../../../lib/jalali'
import { Download, Printer } from 'lucide-react'

interface LineRow { key: string; line: FinBudgetLine | null; title: string; code: string; approved: number; committed: number; certified: number; paid: number; remaining: number }

/**
 * Budgeting and consumption in one page: the project budget is split into budget lines; each line shows what contracts attached to it commit, what is certified and paid,
 * and what is left. Contracts without a line and the part of the budget not yet split are shown as their own rows so nothing is hidden.
 */
export function BudgetPlanPage({ masterProjectId }: { masterProjectId: string }) {
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const payments = useFinanceStore((s) => s.payments)
  const budgets = useFinanceStore((s) => s.budgets)
  const budgetChanges = useFinanceStore((s) => s.budgetChanges)
  const annual = useFinanceStore((s) => s.annualBudgets)
  const lines = useFinanceControlStore((s) => s.budgetLines).filter((l) => l.masterProjectId === masterProjectId)
  const items = useFinanceControlStore((s) => s.configItems)
  const land = useFinanceControlStore((s) => s.land.get(masterProjectId)) ?? null
  const save = useFinanceControlStore((s) => s.saveBudgetLine)
  const { thresholds } = useThresholds()
  const [draft, setDraft] = useState<{ code: string; title: string; cat: string; amount: string } | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const m = useMemo(() => {
    const bac = currentBudget(budgets.find((b) => b.masterProjectId === masterProjectId) ?? null, budgetChanges.filter((c) => c.masterProjectId === masterProjectId))
    const ids = new Set(contracts.map((c) => c.id))
    const certs = certificates.filter((c) => ids.has(c.contractId) && c.status !== 'rejected' && c.status !== 'draft')
    const live = contracts.filter((c) => c.status === 'active' || c.status === 'completed' || c.status === 'suspended')
    const agg = (cs: typeof live) => { const set = new Set(cs.map((c) => c.id)); const cc = certs.filter((x) => set.has(x.contractId)); return { committed: cs.reduce((n, c) => n + currentContractValue(c, amendments), 0), certified: cc.reduce((n, x) => n + (x.certifiedAmount ?? 0), 0), paid: cc.reduce((n, x) => n + certificatePaidTotal(x), 0) } }
    const rows: LineRow[] = lines.filter((l) => l.isActive).map((l) => {
      const a = l.kind === 'land' ? { committed: land?.exposure ?? 0, certified: land?.paid ?? 0, paid: land?.paid ?? 0 } : agg(live.filter((c) => c.budgetLineId === l.id))
      return { key: l.id, line: l, title: l.title, code: l.code, approved: l.approvedAmount, ...a, remaining: l.approvedAmount - a.committed }
    })
    const unassigned = live.filter((c) => !c.budgetLineId || !lines.some((l) => l.id === c.budgetLineId && l.isActive))
    const ua = agg(unassigned)
    const linesTotal = rows.reduce((n, r) => n + r.approved, 0)
    if (unassigned.length) rows.push({ key: '_none', line: null, title: `قراردادهای بدون ردیف (${unassigned.length.toLocaleString('fa-IR')})`, code: '—', approved: 0, ...ua, remaining: -ua.committed })
    const hasLandLine = lines.some((l) => l.kind === 'land' && l.isActive)
    if (land && !hasLandLine && (land.exposure > 0)) rows.push({ key: '_land', line: null, title: 'تملک اراضی (بدون ردیف)', code: '—', approved: 0, committed: land.exposure, certified: land.paid, paid: land.paid, remaining: -land.exposure })
    const committed = rows.reduce((n, r) => n + r.committed, 0), certified = rows.reduce((n, r) => n + r.certified, 0), paid = rows.reduce((n, r) => n + r.paid, 0)
    const curves = buildCurves({ contracts: live, amendments, certificates: certs, payments, plans: [], manualForecasts: [], fund: { fund: 'rial', currency: 'ریال' }, todayIso: today })
    const trend = curves.months.filter((x) => !x.isFuture).map((x) => ({ name: `${JALALI_MONTHS[x.jm - 1]} ${(x.jy % 100).toLocaleString('fa-IR', { minimumIntegerDigits: 2 })}`, 'پرداخت تجمعی': (x.cumActual ?? 0) + 0 }))
    return { bac, rows, linesTotal, committed, certified, paid, annual: computeAnnualBudgetRows(masterProjectId, annual, certs), trend }
  }, [contracts, amendments, certificates, payments, budgets, budgetChanges, annual, lines, land, masterProjectId, today])

  const committedPct = m.bac > 0 ? (m.committed / m.bac) * 100 : null
  const cats = items.filter((i) => i.kind === 'cost_category' && i.active)
  const setAmount = (r: LineRow, bn: number) => { if (r.line && Number.isFinite(bn) && Math.round(bn * 1e9) !== r.approved) void save({ id: r.line.id, projectId: masterProjectId, code: r.line.code, title: r.line.title, costCategory: r.line.costCategory, kind: r.line.kind, amount: Math.round(bn * 1e9), currency: r.line.currency, notes: r.line.notes }) }
  const cols: Col<LineRow>[] = [
    { key: 't', label: 'ردیف بودجه', render: (r) => <><span className="strong">{r.title}</span><span className="sub"><span className="fn-code">{r.code}</span>{r.line && ` · ${cats.find((c) => c.key === r.line!.costCategory)?.label ?? ''}`}{r.line?.kind === 'land' ? ' · از ماژول تحصیل اراضی' : ''}</span></> },
    { key: 'a', label: 'مصوب', num: true, render: (r) => (r.line ? <NumInput value={r.approved / 1e9} decimals={2} onCommit={(n) => setAmount(r, n)} label={`بودجهٔ ${r.title} (میلیارد ریال)`} /> : '—'), foot: fmtBn(m.linesTotal) },
    { key: 'c', label: 'تعهد', num: true, render: (r) => fmtBn(r.committed), foot: fmtBn(m.committed) },
    { key: 'f', label: 'تأییدشده', num: true, render: (r) => fmtBn(r.certified), foot: fmtBn(m.certified) },
    { key: 'p', label: 'پرداخت‌شده', num: true, render: (r) => fmtBn(r.paid), foot: fmtBn(m.paid) },
    { key: 'u', label: 'مصرف', w: 200, render: (r) => <div style={{ minWidth: 130 }}><StackBar max={r.approved || r.committed} marker={r.approved} segs={[{ v: Math.min(r.paid, r.committed), c: 'var(--im-mint)', label: 'پرداخت‌شده' }, { v: Math.max(0, r.committed - r.paid), c: 'var(--im-sky)', label: 'تعهد پرداخت‌نشده' }]} /><span className="sub">{r.approved ? fmtPct((r.committed / r.approved) * 100, 0) : 'بدون بودجهٔ مصوب'}</span></div> },
    { key: 'r', label: 'مانده', num: true, render: (r) => <span className="strong" style={{ color: r.remaining < 0 ? 'var(--im-coral)' : undefined }}>{fmtBn(r.remaining)}</span>, sort: (r) => r.remaining },
    { key: 'x', label: '', render: (r) => (r.line ? <button className="im-ghostlink no-print" onClick={() => void save({ id: r.line!.id, projectId: masterProjectId, code: r.line!.code, title: r.line!.title, costCategory: r.line!.costCategory, kind: r.line!.kind, amount: r.line!.approvedAmount, currency: r.line!.currency, active: false })}>حذف</button> : null) },
  ]
  const exportIt = () => void exportFinanceReportToExcel(m.rows.map((r) => ({ 'ردیف': r.code, 'عنوان': r.title, 'مصوب': Math.round(r.approved), 'تعهد': Math.round(r.committed), 'تأییدشده': Math.round(r.certified), 'پرداخت‌شده': Math.round(r.paid), 'مانده': Math.round(r.remaining) })), 'مصرف-بودجه.xlsx')
  const free = m.bac - m.committed

  return (
    <div>
      <div className="fn-kpis">
        <KpiCard i={0} label="بودجهٔ جاری پروژه" value={splitMoney(m.bac).v} unit={splitMoney(m.bac).u} sub={m.bac ? undefined : 'بودجه ثبت نشده؛ از زیرتب «بودجهٔ کل و سالانه» وارد کنید'} tone={m.bac ? 'neutral' : 'warn'} hint="بودجه مصوب + تغییرات مصوب بودجه" />
        <KpiCard i={1} label="تقسیم‌شده به ردیف‌ها" value={fmtPct(m.bac ? (m.linesTotal / m.bac) * 100 : null, 0)} sub={`بدون ردیف: ${fmtBn(Math.max(0, m.bac - m.linesTotal), 0)} میلیارد`} tone={m.bac && m.linesTotal < m.bac * 0.9 ? 'warn' : 'good'} hint="جمع بودجهٔ ردیف‌ها ÷ بودجهٔ جاری" />
        <KpiCard i={2} label="تعهد‌شده" value={fmtPct(committedPct)} sub={`${splitMoney(m.committed).v} ${splitMoney(m.committed).u}`} tone={toneOf.committedPct(committedPct, thresholds)} hint="قراردادهای فعال و تکمیل‌شده + تملک اراضی ÷ بودجه" />
        <KpiCard i={3} label="پرداخت‌شده" value={fmtPct(m.bac ? (m.paid / m.bac) * 100 : null)} sub={`${splitMoney(m.paid).v} ${splitMoney(m.paid).u}`} hint="پرداخت واقعی ÷ بودجه" />
        <KpiCard i={4} label={free < 0 ? 'کسری بودجه' : 'بودجهٔ آزاد'} value={splitMoney(Math.abs(free)).v} unit={splitMoney(Math.abs(free)).u} tone={free < 0 ? 'bad' : 'good'} hint="بودجه منهای تعهدات" />
      </div>

      <Section title="مصرف بودجه">
        <StackBar height={16} max={m.bac} marker={m.bac} segs={[{ v: Math.min(m.paid, m.committed), c: 'var(--im-mint)', label: 'پرداخت‌شده' }, { v: Math.max(0, m.certified - m.paid), c: 'var(--im-amber)', label: 'تأییدشده، پرداخت‌نشده' }, { v: Math.max(0, m.committed - Math.max(m.certified, m.paid)), c: 'var(--im-sky)', label: 'تعهد، هنوز تأییدنشده' }]} />
        <div className="fn-legend-row">{[['var(--im-mint)', 'پرداخت‌شده'], ['var(--im-amber)', 'تأییدشده، پرداخت‌نشده'], ['var(--im-sky)', 'تعهد، هنوز تأییدنشده'], ['var(--im-panel-3)', 'آزاد']].map(([c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>
      </Section>

      <Section title="ردیف‌های بودجه" hint="مبالغ به میلیارد ریال؛ مبلغ مصوب هر ردیف را مستقیم در جدول ویرایش کنید" flush action={<span className="fn-actions"><button className="im-btn im-btn-ghost im-btn-sm" onClick={exportIt}><Download size={13} /> Excel</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => window.print()}><Printer size={13} /> چاپ</button><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setDraft({ code: '', title: '', cat: '', amount: '' })}><Plus size={13} /> ردیف جدید</button></span>}>
        {draft && (
          <div className="fn-draft">
            <input dir="ltr" placeholder="کد" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} aria-label="کد ردیف" />
            <input placeholder="عنوان ردیف" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="عنوان ردیف" />
            <select value={draft.cat} onChange={(e) => setDraft({ ...draft, cat: e.target.value })} aria-label="دسته"><option value="">دسته‌بندی</option>{cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
            <input inputMode="decimal" placeholder="مصوب (میلیارد ریال)" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} aria-label="مبلغ مصوب" />
            <button className="im-btn im-btn-primary im-btn-sm" disabled={!draft.code.trim() || !draft.title.trim()} onClick={async () => { if (await save({ projectId: masterProjectId, code: draft.code, title: draft.title, costCategory: draft.cat, kind: draft.cat === 'land' ? 'land' : 'general', amount: Math.round(parseNum(draft.amount) * 1e9), currency: 'ریال' })) setDraft(null) }}>ثبت</button>
            <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setDraft(null)}>انصراف</button>
          </div>
        )}
        <DataTable cols={cols} rows={m.rows} rowKey={(r) => r.key} foot empty="ردیفی تعریف نشده است. با «ردیف جدید» بودجه را به ردیف‌ها تقسیم کنید و در فرم قرارداد، هر قرارداد را به یک ردیف وصل کنید." />
        {m.bac > m.linesTotal && <p className="im-helper" style={{ padding: '8px 14px' }}><Chip tone="warn">{fmtBn(m.bac - m.linesTotal, 1)} میلیارد</Chip> از بودجه هنوز به هیچ ردیفی تقسیم نشده است.</p>}
      </Section>

      <div className="fn-cols">
        <Section title="تخصیص سالانه" hint="سال شمسی؛ تأییدشده در برابر تخصیص" flush>
          <DataTable rowKey={(r) => String(r.jalaliYear)} rows={m.annual} empty="تخصیص سالانه‌ای ثبت نشده (زیرتب «بودجهٔ کل و سالانه»)." cols={[
            { key: 'y', label: 'سال', render: (r) => <span className="strong">{r.jalaliYear.toLocaleString('fa-IR', { useGrouping: false })}</span> },
            { key: 'b', label: 'تخصیص', num: true, render: (r) => (r.budgetAmount ? fmtBn(r.budgetAmount) : '—') },
            { key: 'a', label: 'تأییدشده', num: true, render: (r) => fmtBn(r.actualCommitted) },
            { key: 'r', label: 'مانده', num: true, render: (r) => <span style={{ color: r.budgetAmount && r.remaining < 0 ? 'var(--im-coral)' : undefined }}>{r.budgetAmount ? fmtBn(r.remaining) : '—'}</span> },
          ]} />
        </Section>
        <Section title="روند پرداخت تجمعی در برابر بودجه">
          {m.trend.length < 2 ? <p className="im-helper">پرداختی برای رسم روند ثبت نشده است.</p> : (
            <div dir="ltr" style={{ height: 220 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={m.trend} margin={{ left: 4, right: 4, top: 8 }}>
              <CartesianGrid stroke="var(--im-line)" strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--im-muted)' }} interval="preserveStartEnd" /><YAxis tick={{ fontSize: 10, fill: 'var(--im-muted)' }} tickFormatter={(v: number) => fmtBn(v, 0)} width={44} />
              <Tooltip formatter={(v) => `${fmtBn(Number(v))} میلیارد ریال`} contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--im-line)', fontSize: 12 }} />
              {m.bac > 0 && <ReferenceLine y={m.bac} stroke="var(--im-coral)" strokeDasharray="5 4" label={{ value: 'بودجه', fontSize: 10, fill: 'var(--im-coral)' }} />}
              <Line dataKey="پرداخت تجمعی" stroke="var(--im-accent)" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div>
          )}
        </Section>
      </div>
    </div>
  )
}
