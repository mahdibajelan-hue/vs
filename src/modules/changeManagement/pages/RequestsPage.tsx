import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Plus, Printer, Search } from 'lucide-react'
import { HelpButton } from '../../issues/components/Help'
import { JalaliDateField } from '../../issues/components/JalaliDateField'
import { useChangeStore } from '../store/useChangeStore'
import { useChangeCtx } from '../lib/useChangeData'
import { STATUS_FA, STATUS_ORDER, TYPE_FA, TYPE_ORDER, type ChangeRequest, type ChangeStatus, type ChangeStep, type ChangeType } from '../types'
import { CM_HELP } from '../lib/help'
import { downloadXlsx, printTable } from '../lib/changeExport'
import { jd } from '../components/RouteTrack'
import { StatusChip, money, pct } from '../components/cm'
import { OPEN_STATUSES } from '../types'
import type { PageProps } from '../ChangeApp'

export const requestRows = (reqs: ChangeRequest[], steps: ChangeStep[], c: ReturnType<typeof useChangeCtx>) => reqs.map((r) => {
  const cur = steps.filter((s) => s.requestId === r.id && s.attempt === r.attempt && s.status === 'active').map((s) => s.roleName).join('، ')
  const b = r.routeSnapshot?.basis ?? c.preview(r).basis
  return [r.crNumber, r.title, c.projectName(r.masterProjectId), c.contractLabel(r), r.changeType ? TYPE_FA[r.changeType] : '—', STATUS_FA[r.status], Math.round(r.proposedCost), r.approvedCost == null ? '' : Math.round(r.approvedCost), r.proposedDays, r.approvedDays ?? '', b.cum_pct ?? '', cur, jd(r.createdAt), r.routeStatus === 'blocked' ? 'متوقف' : ''] as (string | number)[]
})
export const REQUEST_HEADERS = ['شماره', 'عنوان', 'پروژه', 'قرارداد', 'نوع', 'وضعیت', 'مبلغ درخواستی', 'مبلغ مصوب', 'تمدید درخواستی (روز)', 'تمدید مصوب (روز)', 'درصد تجمعی', 'مرجع جاری', 'تاریخ ثبت', 'توقف مسیر']

export function RequestsPage({ onOpen, onNew }: PageProps) {
  const ctx = useChangeCtx()
  const scope = useChangeStore((s) => s.scopeProjectId)
  const all = useChangeStore((s) => s.requests)
  const steps = useChangeStore((s) => s.steps)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'open' | 'all' | ChangeStatus>('all')
  const [type, setType] = useState<'' | ChangeType>('')
  const [contract, setContract] = useState('')
  const [role, setRole] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [mine, setMine] = useState(false)
  const [sort, setSort] = useState<'date' | 'cost' | 'pct'>('date')
  const base = useMemo(() => all.filter((r) => scope === 'all' || r.masterProjectId === scope), [all, scope])
  const roles = useMemo(() => [...new Set(steps.filter((s) => s.status === 'active').map((s) => s.roleName))], [steps])
  const myRoles = (r: ChangeRequest) => ctx.perms(r.masterProjectId).roles
  const list = useMemo(() => base.filter((r) => {
    if (status === 'open' ? !OPEN_STATUSES.includes(r.status) : status !== 'all' && r.status !== status) return false
    if (type && r.changeType !== type) return false
    if (contract && (r.contractId ?? 'p:' + r.masterProjectId) !== contract) return false
    if (role && !steps.some((s) => s.requestId === r.id && s.attempt === r.attempt && s.status === 'active' && s.roleName === role)) return false
    if (from && r.createdAt.slice(0, 10) < from) return false
    if (to && r.createdAt.slice(0, 10) > to) return false
    if (mine && !steps.some((s) => s.requestId === r.id && s.attempt === r.attempt && s.status === 'active' && (ctx.perms(r.masterProjectId).isAdmin || myRoles(r).includes(s.roleName)))) return false
    if (q.trim() && !(`${r.crNumber} ${r.title} ${r.description}`).includes(q.trim())) return false
    return true
  }).sort((a, b) => sort === 'cost' ? Math.abs(b.proposedCost) - Math.abs(a.proposedCost) : sort === 'pct' ? (b.routeSnapshot?.basis.cum_pct ?? 0) - (a.routeSnapshot?.basis.cum_pct ?? 0) : b.createdAt.localeCompare(a.createdAt)), [base, status, type, contract, role, from, to, mine, q, sort, steps, ctx])
  const contractOpts = useMemo(() => { const m = new Map<string, string>(); for (const r of base) m.set(r.contractId ?? 'p:' + r.masterProjectId, `${ctx.projectName(r.masterProjectId)} · ${ctx.contractLabel(r)}`); return [...m] }, [base, ctx])
  const filters = [status !== 'all' ? 'وضعیت: ' + (status === 'open' ? 'باز' : STATUS_FA[status]) : '', type ? 'نوع: ' + TYPE_FA[type] : '', role ? 'مرجع: ' + role : '', from ? 'از ' + jd(from) : '', to ? 'تا ' + jd(to) : '', q ? 'جستجو: ' + q : ''].filter(Boolean)
  const rows = () => requestRows(list, steps, ctx)

  return (
    <div className="im-page" style={{ display: 'grid', gap: 14 }}>
      <div className="im-row" style={{ justifyContent: 'space-between' }}>
        <div><div className="im-page-title">درخواست‌های تغییر</div><div className="im-page-sub">{list.length} از {base.length} درخواست</div></div>
        <div className="im-actions"><HelpButton content={CM_HELP.list} />
          <button className="im-btn" onClick={() => downloadXlsx('change-requests', [{ name: 'درخواست‌ها', headers: REQUEST_HEADERS, rows: rows() }])}><FileSpreadsheet size={14} /> Excel</button>
          <button className="im-btn" onClick={() => printTable('فهرست درخواست‌های تغییر', scope === 'all' ? 'همهٔ پروژه‌ها' : ctx.projectName(scope), filters, REQUEST_HEADERS, rows())}><Printer size={14} /> چاپ / PDF</button>
          <button className="im-btn im-btn-primary" onClick={onNew}><Plus size={14} /> درخواست جدید</button></div>
      </div>
      <div className="im-card" style={{ display: 'grid', gap: 10 }}>
        <div className="im-row">
          <div style={{ position: 'relative', flex: '2 1 220px' }}><Search size={14} aria-hidden style={{ position: 'absolute', insetInlineStart: 11, top: 11, color: 'var(--im-muted)' }} /><input style={{ paddingInlineStart: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در شماره، عنوان، شرح…" aria-label="جستجو" /></div>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="وضعیت"><option value="all">همهٔ وضعیت‌ها</option><option value="open">باز (در جریان)</option>{STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_FA[s]}</option>)}</select>
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="نوع"><option value="">همهٔ انواع</option>{TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_FA[t]}</option>)}</select>
          <select value={contract} onChange={(e) => setContract(e.target.value)} aria-label="قرارداد"><option value="">همهٔ قراردادها</option>{contractOpts.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="مرجع جاری"><option value="">همهٔ مراجع</option>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select>
        </div>
        <div className="im-row" style={{ alignItems: 'flex-end' }}>
          <div style={{ minWidth: 150 }}><div className="im-helper">از تاریخ ثبت</div><JalaliDateField value={from} onChange={setFrom} /></div>
          <div style={{ minWidth: 150 }}><div className="im-helper">تا تاریخ</div><JalaliDateField value={to} onChange={setTo} /></div>
          <label className="im-check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> منتظر تصمیم من</label>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="مرتب‌سازی"><option value="date">جدیدترین</option><option value="cost">بیشترین مبلغ</option><option value="pct">بیشترین درصد تجمعی</option></select>
          {(q || type || contract || role || from || to || mine || status !== 'all') && <button className="im-btn im-btn-ghost" onClick={() => { setQ(''); setType(''); setContract(''); setRole(''); setFrom(''); setTo(''); setMine(false); setStatus('all') }}>پاک‌کردن فیلترها</button>}
        </div>
      </div>
      {list.length === 0 ? <div className="im-empty">درخواستی با این فیلترها پیدا نشد.</div> : (
        <div className="im-table-wrap"><table className="im-table"><thead><tr><th>شماره</th><th>عنوان</th><th>پروژه · قرارداد</th><th>نوع</th><th>وضعیت</th><th>مبلغ</th><th>تمدید</th><th>تجمعی</th><th>مرحلهٔ جاری</th><th>تاریخ</th></tr></thead><tbody>
          {list.map((r) => {
            const cur = steps.filter((s) => s.requestId === r.id && s.attempt === r.attempt && s.status === 'active')
            const cp = (r.routeSnapshot?.basis ?? ctx.preview(r).basis).cum_pct
            return (
              <tr key={r.id} onClick={() => onOpen(r.id, 'flow')} style={{ cursor: 'pointer' }}>
                <td><span className="im-code">{r.crNumber}</span></td><td className="ttl">{r.title}</td><td><div style={{ fontSize: 12 }}>{ctx.projectName(r.masterProjectId)}</div><div className="im-helper">{ctx.contractLabel(r)}</div></td>
                <td>{r.changeType ? TYPE_FA[r.changeType] : '—'}</td><td><StatusChip status={r.status} />{r.routeStatus === 'blocked' && <div className="cm-chip" style={{ ['--c' as string]: '#ef4444', marginTop: 3 }}>متوقف</div>}</td>
                <td className="cm-mono">{money(r.proposedCost)}</td><td className="cm-mono">{r.proposedDays ? r.proposedDays + ' روز' : '—'}</td><td className="cm-mono">{pct(cp)}</td>
                <td style={{ fontSize: 12 }}>{cur.length ? cur.map((s) => s.roleName).join('، ') : '—'}</td><td className="im-helper">{jd(r.createdAt)}</td>
              </tr>)
          })}
        </tbody></table></div>
      )}
      <div className="im-helper"><Download size={12} aria-hidden style={{ verticalAlign: 'middle' }} /> خروجی‌ها بر اساس فیلترهای فعلی ساخته می‌شوند.</div>
    </div>
  )
}
