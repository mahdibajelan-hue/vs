import { useMemo, useState } from 'react'
import { FileSpreadsheet, Printer } from 'lucide-react'
import { HelpButton } from '../../issues/components/Help'
import { HBars } from '../../issues/components/charts'
import { Segmented } from '../../issues/components/ui'
import { JalaliDateField } from '../../issues/components/JalaliDateField'
import { useChangeStore } from '../store/useChangeStore'
import { useChangeCtx } from '../lib/useChangeData'
import { APPROVED_STATUSES, cumulativeByContract, dwellByRole, endDateImpact, overdueSteps, reasonFrequency, stalled } from '../lib/changeKpi'
import { downloadXlsx, printTable } from '../lib/changeExport'
import { STATUS_FA, STATUS_ORDER, TYPE_FA, TYPE_ORDER, REASON_FA, type ChangeStatus, type ChangeType } from '../types'
import { CM_HELP } from '../lib/help'
import { jd } from '../components/RouteTrack'
import { nf, pct } from '../components/cm'
import type { PageProps } from '../ChangeApp'

type Rep = 'counts' | 'money' | 'delay' | 'time' | 'outcome' | 'causes'
type Row = (string | number | null)[]
interface Table { headers: string[]; rows: Row[]; ids?: string[] }

export function ReportsPage({ onOpen }: PageProps) {
  const ctx = useChangeCtx()
  const scope = useChangeStore((s) => s.scopeProjectId)
  const all = useChangeStore((s) => s.requests)
  const steps = useChangeStore((s) => s.steps)
  const links = useChangeStore((s) => s.links)
  const programs = useChangeStore((s) => s.programs)
  const orgs = useChangeStore((s) => s.orgs)
  const [rep, setRep] = useState<Rep>('counts')
  const [program, setProgram] = useState('')
  const [contract, setContract] = useState('')
  const [contractor, setContractor] = useState('')
  const [type, setType] = useState<'' | ChangeType>('')
  const [status, setStatus] = useState<'' | ChangeStatus>('')
  const [role, setRole] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const now = new Date().toISOString()
  const reqs = useMemo(() => all.filter((r) => r.status !== 'draft' && (scope === 'all' || r.masterProjectId === scope)).filter((r) => {
    if (program && ctx.project(r.masterProjectId)?.programId !== program) return false
    if (contract && (r.contractId ?? 'p:' + r.masterProjectId) !== contract) return false
    if (contractor && (r.contractorOrgId ?? ctx.project(r.masterProjectId)?.contractorOrgId) !== contractor) return false
    if (type && r.changeType !== type) return false
    if (status && r.status !== status) return false
    if (role && !steps.some((s) => s.requestId === r.id && s.roleName === role)) return false
    if (from && r.createdAt.slice(0, 10) < from) return false
    if (to && r.createdAt.slice(0, 10) > to) return false
    return true
  }), [all, scope, program, contract, contractor, type, status, role, from, to, steps, ctx])
  const ids = useMemo(() => new Set(reqs.map((r) => r.id)), [reqs])
  const rsteps = useMemo(() => steps.filter((s) => ids.has(s.requestId)), [steps, ids])
  const thresholds = useMemo(() => [...new Set((ctx.activeRules?.rules ?? []).filter((r) => r.dimension === 'cost' && r.active).flatMap((r) => [r.pctMin, r.pctMax]).filter((x): x is number => x != null))].sort((a, b) => a - b), [ctx.activeRules])
  const contractOpts = useMemo(() => { const m = new Map<string, string>(); for (const r of all) m.set(r.contractId ?? 'p:' + r.masterProjectId, `${ctx.projectName(r.masterProjectId)} · ${ctx.contractLabel(r)}`); return [...m] }, [all, ctx])
  const roles = useMemo(() => [...new Set(steps.map((s) => s.roleName))], [steps])
  const orgOpts = useMemo(() => [...new Set(all.map((r) => r.contractorOrgId ?? ctx.project(r.masterProjectId)?.contractorOrgId).filter((x): x is string => !!x))], [all, ctx])
  const linkCount = (id: string, t: 'risk' | 'issue') => links.filter((l) => l.requestId === id && l.targetType === t).length

  const table: Table = useMemo(() => {
    if (rep === 'counts') {
      const keys = [...new Set(reqs.map((r) => r.masterProjectId))]
      const rows: Row[] = keys.flatMap((p) => TYPE_ORDER.map((t) => { const xs = reqs.filter((r) => r.masterProjectId === p && (r.changeType ?? 'other') === t); return xs.length ? [ctx.projectName(p), TYPE_FA[t], xs.length, ...STATUS_ORDER.map((s) => xs.filter((r) => r.status === s).length)] as Row : null })).filter((x): x is Row => !!x)
      return { headers: ['پروژه', 'نوع', 'جمع', ...STATUS_ORDER.map((s) => STATUS_FA[s])], rows }
    }
    if (rep === 'money') {
      const agg = cumulativeByContract(reqs, ctx.baseOf, thresholds)
      return { headers: ['پروژه', 'قرارداد', 'مبلغ اولیه', 'مصوب (ریال)', '٪ مصوب', 'در انتظار (ریال)', '٪ با در انتظار', 'تمدید مصوب (روز)', 'تمدید در انتظار (روز)', 'هشدار'], rows: agg.map((a) => { const c = a.contractId ? ctx.contract(a.contractId) : undefined; return [ctx.projectName(a.masterProjectId), c ? c.number || c.title : 'قرارداد اصلی پروژه', a.base == null ? 'نامشخص' : Math.round(a.base), Math.round(a.approvedAmount), a.approvedPct ?? '', Math.round(a.pendingAmount), a.withPendingPct ?? '', a.approvedDays, a.pendingDays, a.crossed != null ? `عبور از حد ${a.crossed}٪` : a.next != null ? `تا حد ${a.next}٪` : ''] as Row }) }
    }
    if (rep === 'delay') {
      const live = reqs.filter((r) => r.status === 'awaiting_approval')
      const act = rsteps.filter((s) => s.status === 'active' && live.some((r) => r.id === s.requestId && r.attempt === s.attempt))
      const od = overdueSteps(act, now)
      const st = stalled(reqs, now, 14)
      const rows: Row[] = [...od.map((s) => { const r = reqs.find((x) => x.id === s.requestId)!; return [r.crNumber, r.title, ctx.projectName(r.masterProjectId), s.roleName, jd(s.enteredAt), jd(s.dueAt), Math.round((new Date(now).getTime() - new Date(s.dueAt!).getTime()) / 86400000), 'مهلت مرحله گذشته'] as Row }),
        ...reqs.filter((r) => r.routeStatus === 'blocked' && r.status === 'evaluating').map((r) => [r.crNumber, r.title, ctx.projectName(r.masterProjectId), '—', jd(r.stageEnteredAt), '', '', 'مسیر تصویب تعیین نشد'] as Row),
        ...st.filter((r) => !od.some((s) => s.requestId === r.id)).map((r) => [r.crNumber, r.title, ctx.projectName(r.masterProjectId), STATUS_FA[r.status], jd(r.stageEnteredAt), '', Math.round((new Date(now).getTime() - new Date(r.stageEnteredAt).getTime()) / 86400000), 'بیش از ۱۴ روز در یک مرحله'] as Row)]
      return { headers: ['شماره', 'عنوان', 'پروژه', 'نزد', 'ورود به مرحله', 'مهلت', 'روز تأخیر/توقف', 'علت'], rows, ids: rows.map((r) => reqs.find((x) => x.crNumber === r[0])!.id) }
    }
    if (rep === 'time') {
      const d = dwellByRole(rsteps, now)
      const roles2 = [...new Set([...d.decided.map((x) => x.role), ...d.waiting.map((x) => x.role)])]
      const appr = reqs.filter((r) => r.approvedAt && r.submittedAt).map((r) => (new Date(r.approvedAt!).getTime() - new Date(r.submittedAt!).getTime()) / 86400000)
      const rows: Row[] = roles2.map((rl) => { const a = d.decided.find((x) => x.role === rl), w = d.waiting.find((x) => x.role === rl); return [rl, a?.n ?? 0, a?.avgDays ?? '', a ? Math.round(a.maxDays * 10) / 10 : '', w?.n ?? 0, w?.avgDays ?? ''] })
      rows.push(['میانگین کل «ثبت تا تصویب»', appr.length, appr.length ? Math.round(appr.reduce((s, x) => s + x, 0) / appr.length * 10) / 10 : '', appr.length ? Math.round(Math.max(...appr) * 10) / 10 : '', '', ''])
      return { headers: ['مرجع', 'تصمیم‌های گرفته‌شده', 'میانگین روز', 'بیشینه روز', 'منتظر تصمیم', 'میانگین انتظار (روز)'], rows }
    }
    if (rep === 'outcome') {
      const xs = reqs.filter((r) => ['rejected', 'cancelled', 'implemented', 'closed'].includes(r.status) || r.implementedAsApproved === false || r.executedUnderException)
      const rows: Row[] = xs.map((r) => [r.crNumber, r.title, ctx.projectName(r.masterProjectId), STATUS_FA[r.status], r.status === 'cancelled' ? r.cancelReason : r.status === 'rejected' ? r.decisionNote : r.resultNote, r.implementedAsApproved === false ? 'مغایر با مصوبه' : r.implementedAsApproved ? 'مطابق' : '', r.executedUnderException ? 'اجرا تحت استثنا' : '', r.actualCost == null ? '' : Math.round(r.actualCost), r.approvedCost == null ? '' : Math.round(r.approvedCost), r.actualDelayDays ?? '', jd(r.updatedAt)])
      return { headers: ['شماره', 'عنوان', 'پروژه', 'وضعیت', 'دلیل / نتیجه', 'انطباق', 'استثنا', 'هزینهٔ واقعی', 'هزینهٔ مصوب', 'تأخیر واقعی', 'تاریخ'], rows, ids: xs.map((r) => r.id) }
    }
    const rf = reasonFrequency(reqs)
    const rows: Row[] = rf.map(([k, n]) => { const xs = reqs.filter((r) => r.reasonCategories.includes(k)); return [REASON_FA[k] ?? k, n, xs.reduce((s, r) => s + linkCount(r.id, 'risk'), 0), xs.reduce((s, r) => s + linkCount(r.id, 'issue'), 0), xs.filter((r) => APPROVED_STATUSES.includes(r.status)).length] })
    return { headers: ['علت تغییر', 'تعداد درخواست', 'ریسک‌های مرتبط', 'مسائل مرتبط', 'مصوب'], rows }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep, reqs, rsteps, ctx, thresholds, links])

  const proj = scope !== 'all' ? ctx.project(scope) : undefined
  const eff = proj ? endDateImpact(proj.end, reqs.filter((r) => APPROVED_STATUSES.includes(r.status)).reduce((s, r) => s + Math.abs(r.approvedDays ?? 0), 0)) : null
  const TITLE: Record<Rep, string> = { counts: 'تعداد درخواست‌ها', money: 'مبالغ و تغییر تجمعی قراردادها', delay: 'معطل‌ها و توقف‌ها', time: 'زمان بررسی و تصویب', outcome: 'ردشده، لغوشده، اجراشده و مغایر', causes: 'علل پرتکرار و ارتباط با ریسک/مسئله' }
  const filters = [program ? 'طرح: ' + programs.get(program) : '', contract ? 'قرارداد: ' + contractOpts.find(([k]) => k === contract)?.[1] : '', contractor ? 'پیمانکار: ' + orgs.get(contractor) : '', type ? 'نوع: ' + TYPE_FA[type] : '', status ? 'وضعیت: ' + STATUS_FA[status] : '', role ? 'مرجع: ' + role : '', from ? 'از ' + jd(from) : '', to ? 'تا ' + jd(to) : ''].filter(Boolean)
  const reasonRows = rep === 'causes' ? table.rows.slice(0, 10) : []

  return (
    <div className="im-page" style={{ display: 'grid', gap: 14 }}>
      <div className="im-row" style={{ justifyContent: 'space-between' }}>
        <div><div className="im-page-title">گزارش‌های مدیریتی</div><div className="im-page-sub">{reqs.length} درخواست پس از فیلتر · درصدها نسبت به مبلغ اولیهٔ قرارداد</div></div>
        <div className="im-actions"><HelpButton content={CM_HELP.reports} />
          <button className="im-btn" onClick={() => downloadXlsx('change-' + rep, [{ name: TITLE[rep], headers: table.headers, rows: table.rows }])}><FileSpreadsheet size={14} /> Excel</button>
          <button className="im-btn" onClick={() => printTable(TITLE[rep], scope === 'all' ? 'همهٔ پروژه‌ها' : ctx.projectName(scope), filters, table.headers, table.rows)}><Printer size={14} /> چاپ / PDF</button></div>
      </div>
      <div className="im-card" style={{ display: 'grid', gap: 10 }}>
        <div className="im-row">
          <select value={program} onChange={(e) => setProgram(e.target.value)} aria-label="طرح"><option value="">همهٔ طرح‌ها</option>{[...programs].map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={contract} onChange={(e) => setContract(e.target.value)} aria-label="قرارداد"><option value="">همهٔ قراردادها</option>{contractOpts.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={contractor} onChange={(e) => setContractor(e.target.value)} aria-label="پیمانکار"><option value="">همهٔ پیمانکاران</option>{orgOpts.map((o) => <option key={o} value={o}>{orgs.get(o)}</option>)}</select>
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="نوع"><option value="">همهٔ انواع</option>{TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_FA[t]}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="وضعیت"><option value="">همهٔ وضعیت‌ها</option>{STATUS_ORDER.filter((s) => s !== 'draft').map((s) => <option key={s} value={s}>{STATUS_FA[s]}</option>)}</select>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="مرجع تصویب"><option value="">همهٔ مراجع</option>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select>
        </div>
        <div className="im-row"><div style={{ minWidth: 150 }}><div className="im-helper">از تاریخ</div><JalaliDateField value={from} onChange={setFrom} /></div><div style={{ minWidth: 150 }}><div className="im-helper">تا تاریخ</div><JalaliDateField value={to} onChange={setTo} /></div></div>
      </div>
      <Segmented value={rep} onChange={setRep} options={(Object.keys(TITLE) as Rep[]).map((k) => ({ id: k, label: TITLE[k] }))} />
      {rep === 'money' && eff && <div className="cm-note"><div>اثر تمدیدهای مصوب بر تاریخ پایان قراردادی پروژه: {jd(eff.from)} ← <b>{jd(eff.to)}</b> ({nf(eff.days)} روز). این تاریخ فقط اطلاع‌رسانی است و داده‌های پایه را تغییر نمی‌دهد.</div></div>}
      {rep === 'causes' && reasonRows.length > 0 && <div className="im-card"><div className="im-section-title">علل پرتکرار</div><HBars rows={reasonRows.map((r) => ({ key: String(r[0]), label: String(r[0]), value: Number(r[1]) }))} /></div>}
      {table.rows.length === 0 ? <div className="im-empty">برای این فیلترها داده‌ای نیست.</div> : (
        <div className="im-table-wrap"><table className="im-table"><thead><tr>{table.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>
          {table.rows.map((r, i) => <tr key={i} style={table.ids ? { cursor: 'pointer' } : undefined} onClick={table.ids ? () => onOpen(table.ids![i], 'flow') : undefined}>{r.map((c, j) => <td key={j} className={typeof c === 'number' ? 'cm-mono' : undefined}>{typeof c === 'number' ? (table.headers[j].includes('٪') ? pct(c) : nf(c)) : c ?? ''}</td>)}</tr>)}
        </tbody></table></div>
      )}
    </div>
  )
}
