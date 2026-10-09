import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Plus, Printer, Search, Upload } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { JalaliDateField } from '../../issues/components/JalaliDateField'
import { HelpButton } from '../../issues/components/Help'
import { useRiskData, useRiskDirectory, useRiskRole } from '../lib/useRiskData'
import { useRiskStore } from '../store/useRiskStore'
import { RK_HELP } from '../lib/help'
import { comparePriority } from '../lib/riskPortfolio'
import { REGISTER_HEADERS, downloadText, downloadXlsx, printTable, registerRows } from '../lib/riskExport'
import { parseRiskImport, importTemplateCsv, toCsv } from '../lib/riskImport'
import { RM_RISK_STATUS_LABEL_FA, RM_SOURCE_LABEL_FA, type RmRisk, type RmSource } from '../types'
import { RISK_LEVEL_LABEL_FA } from '../lib/riskScore'
import { ZONE_LABEL_FA, type RiskZone } from '../lib/riskPolicy'
import { LevelChip, PersonSelect, ScoreTriple, StatusChip, useCategoryLabel } from '../components/rk'
import type { PageProps } from '../RiskApp'

interface Filter { q: string; project: string; status: string; level: string; zone: string; category: string; owner: string; source: string; attention: boolean; reviewOverdue: boolean; cell: { p: number; i: number } | null }
const EMPTY: Filter = { q: '', project: 'all', status: 'active', level: 'all', zone: 'all', category: 'all', owner: 'all', source: 'all', attention: false, reviewOverdue: false, cell: null }
type SortKey = 'priority' | 'code' | 'current' | 'residual' | 'review'

export function RegisterPage({ onOpenRisk, onNew }: PageProps) {
  const d = useRiskData()
  const dir = useRiskDirectory()
  const role = useRiskRole(d.scope === 'all' ? null : d.scope)
  const catLabel = useCategoryLabel()
  const { updateRisk, bulkAdd } = useRiskStore.getState()
  const categories = useRiskStore((s) => s.categories)
  const [f, setF] = useState<Filter>(EMPTY)
  const [sort, setSort] = useState<SortKey>('priority')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<{ owner: string | null; review: string | null } | null>(null)
  const [imp, setImp] = useState(false)
  const set = <K extends keyof Filter>(k: K, v: Filter[K]) => setF((o) => ({ ...o, [k]: v }))
  const projName = (id: string) => d.allProjects.find((p) => p.id === id)?.name ?? '—'

  const list = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    const out = d.risks.filter((r) => {
      const s = d.states.get(r.id)!
      if (f.status === 'active' ? r.status === 'closed' : f.status !== 'all' && r.status !== f.status) return false
      if (f.project !== 'all' && r.projectId !== f.project) return false
      if (f.level !== 'all' && s.level !== f.level) return false
      if (f.zone !== 'all' && s.residualZone !== f.zone) return false
      if (f.category !== 'all' && r.category !== f.category && r.subcategory !== f.category) return false
      if (f.owner !== 'all' && (f.owner === 'none' ? !!r.ownerId : r.ownerId !== f.owner)) return false
      if (f.source !== 'all' && r.source !== f.source) return false
      if (f.attention && !s.attention.length) return false
      if (f.reviewOverdue && !s.reviewOverdue) return false
      if (f.cell && !(s.currentP === f.cell.p && s.currentI === f.cell.i)) return false
      if (q && !`${r.code} ${r.title} ${r.cause} ${r.riskEvent} ${r.consequence} ${r.description} ${r.station} ${r.contractor} ${r.routeSegment}`.toLowerCase().includes(q)) return false
      return true
    })
    const pairs = out.map((risk) => ({ risk, state: d.states.get(risk.id)! }))
    pairs.sort((a, b) => sort === 'priority' ? comparePriority(a, b) : sort === 'code' ? a.risk.code.localeCompare(b.risk.code, 'en', { numeric: true }) : sort === 'current' ? b.state.current - a.state.current : sort === 'residual' ? b.state.residual - a.state.residual : a.state.reviewDue.localeCompare(b.state.reviewDue))
    return pairs
  }, [d.risks, d.states, f, sort])

  const activeFilters = Object.entries(f).filter(([k, v]) => v !== (EMPTY as never)[k] && v !== false && v !== null).length
  const allSel = list.length > 0 && list.every((p) => sel.has(p.risk.id))
  const exportCtx = { project: projName, user: dir.name, category: catLabel, states: d.states }
  const filterSummary = (): string[] => {
    const s: string[] = []
    if (f.q) s.push(`جستجو: ${f.q}`)
    if (f.project !== 'all') s.push(`پروژه: ${projName(f.project)}`)
    s.push(`وضعیت: ${f.status === 'active' ? 'فعال' : f.status === 'all' ? 'همه' : RM_RISK_STATUS_LABEL_FA[f.status as RmRisk['status']]}`)
    if (f.level !== 'all') s.push(`سطح: ${RISK_LEVEL_LABEL_FA[f.level as 'low']}`)
    if (f.zone !== 'all') s.push(`ناحیه: ${ZONE_LABEL_FA[f.zone as RiskZone]}`)
    if (f.category !== 'all') s.push(`دسته: ${catLabel(f.category)}`)
    if (f.owner !== 'all') s.push(`مالک: ${f.owner === 'none' ? 'بدون مالک' : dir.name(f.owner)}`)
    if (f.attention) s.push('نیازمند توجه')
    if (f.reviewOverdue) s.push('بازنگری معوق')
    return s
  }
  const rowsOut = () => registerRows(list.map((p) => p.risk), exportCtx)
  const applyBulk = async () => {
    if (!bulk) return
    for (const id of sel) {
      const patch: Partial<RmRisk> = {}
      if (bulk.owner) patch.ownerId = bulk.owner
      if (bulk.review) patch.nextReviewDate = bulk.review
      if (Object.keys(patch).length) await updateRisk(id, patch)
    }
    setBulk(null); setSel(new Set())
  }

  return (
    <div className="im-page">
      <div className="im-topbar">
        <div><div className="im-page-title">شناسایی و ثبت ریسک</div><div className="im-page-sub">{list.length} از {d.risks.length} ریسک</div></div>
        <div className="im-actions">
          <HelpButton content={RK_HELP.register} />
          <button className="im-btn im-btn-ghost im-btn-sm" disabled={!list.length} onClick={() => printTable('رجیستر ریسک', 'بر اساس فیلترهای اعمال‌شده', filterSummary(), REGISTER_HEADERS, rowsOut()) || window.alert('مرورگر پنجرهٔ چاپ را مسدود کرد.')}><Printer size={14} /> چاپ / PDF</button>
          <button className="im-btn im-btn-ghost im-btn-sm" disabled={!list.length} onClick={() => downloadXlsx('risk-register', [{ name: 'Risk Register', headers: REGISTER_HEADERS, rows: rowsOut() }])}><FileSpreadsheet size={14} /> Excel</button>
          <button className="im-btn im-btn-ghost im-btn-sm" disabled={!list.length} onClick={() => downloadText('risk-register.csv', toCsv([REGISTER_HEADERS, ...rowsOut()]))}><Download size={14} /> CSV</button>
          {role.canEdit && d.scope !== 'all' && <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setImp(true)}><Upload size={14} /> ورود از فایل</button>}
          {role.canEdit && <button className="im-btn im-btn-primary" onClick={onNew}><Plus size={16} /> ریسک جدید</button>}
        </div>
      </div>

      <div className="im-filters" role="search">
        <div style={{ position: 'relative', flex: '2 1 200px' }}><Search size={14} style={{ position: 'absolute', right: 11, top: 11, color: 'var(--im-muted)' }} /><input style={{ paddingInlineStart: 32 }} placeholder="جستجو در کد، عنوان، علت، رویداد، پیمانکار، ایستگاه…" value={f.q} onChange={(e) => set('q', e.target.value)} aria-label="جستجو" /></div>
        {d.scope === 'all' && <select value={f.project} onChange={(e) => set('project', e.target.value)} aria-label="پروژه"><option value="all">همه پروژه‌ها</option>{d.allProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <select value={f.status} onChange={(e) => set('status', e.target.value)} aria-label="وضعیت"><option value="active">فعال (باز)</option><option value="all">همهٔ وضعیت‌ها</option>{Object.entries(RM_RISK_STATUS_LABEL_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={f.level} onChange={(e) => set('level', e.target.value)} aria-label="سطح"><option value="all">همهٔ سطوح</option>{(['critical', 'high', 'medium', 'low'] as const).map((l) => <option key={l} value={l}>{RISK_LEVEL_LABEL_FA[l]}</option>)}</select>
        <select value={f.zone} onChange={(e) => set('zone', e.target.value)} aria-label="ناحیه"><option value="all">همهٔ نواحی (باقیمانده)</option>{(Object.keys(ZONE_LABEL_FA) as RiskZone[]).map((z) => <option key={z} value={z}>{ZONE_LABEL_FA[z]}</option>)}</select>
        <select value={f.category} onChange={(e) => set('category', e.target.value)} aria-label="دسته"><option value="all">همهٔ دسته‌ها</option>{categories.filter((c) => c.active).map((c) => <option key={c.key} value={c.key}>{c.parentKey ? '— ' : ''}{c.labelFa}</option>)}</select>
        <select value={f.owner} onChange={(e) => set('owner', e.target.value)} aria-label="مالک"><option value="all">همهٔ مالکان</option><option value="none">بدون مالک</option>{dir.all.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</select>
        <select value={f.source} onChange={(e) => set('source', e.target.value)} aria-label="منبع"><option value="all">همهٔ منابع</option>{(Object.keys(RM_SOURCE_LABEL_FA) as RmSource[]).map((s) => <option key={s} value={s}>{RM_SOURCE_LABEL_FA[s]}</option>)}</select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="مرتب‌سازی"><option value="priority">اولویت (ناحیه ← KRI ← روند)</option><option value="current">امتیاز فعلی</option><option value="residual">امتیاز باقیمانده</option><option value="review">موعد بازنگری</option><option value="code">کد</option></select>
      </div>
      <div className="im-actions" style={{ marginBottom: 12 }}>
        <label className="im-chip" style={{ cursor: 'pointer', margin: 0 }}><input type="checkbox" style={{ width: 'auto', marginInlineEnd: 6 }} checked={f.attention} onChange={(e) => set('attention', e.target.checked)} />نیازمند توجه</label>
        <label className="im-chip" style={{ cursor: 'pointer', margin: 0 }}><input type="checkbox" style={{ width: 'auto', marginInlineEnd: 6 }} checked={f.reviewOverdue} onChange={(e) => set('reviewOverdue', e.target.checked)} />بازنگری معوق</label>
        {f.cell && <span className="im-chip">خانهٔ ماتریس: احتمال {f.cell.p} × اثر {f.cell.i} <button aria-label="حذف فیلتر خانه" onClick={() => set('cell', null)}>×</button></span>}
        {activeFilters > 0 && <button className="im-ghostlink" onClick={() => setF(EMPTY)}>پاک‌کردن فیلترها ({activeFilters})</button>}
        {sel.size > 0 && role.canEdit && <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setBulk({ owner: null, review: null })}>عملیات گروهی ({sel.size})</button>}
      </div>
      {bulk && (
        <div className="im-card-flat" style={{ marginBottom: 12 }}>
          <div className="im-section-title">تغییر گروهی برای {sel.size} ریسک</div>
          <div className="rk-grid3">
            <div className="im-field"><label>مالک جدید</label><PersonSelect value={bulk.owner} onChange={(v) => setBulk({ ...bulk, owner: v })} people={dir.all.map((p) => ({ userId: p.userId, name: p.name }))} placeholder="— بدون تغییر —" /></div>
            <div className="im-field"><label>موعد بازنگری بعدی</label><div style={{ display: 'flex', gap: 6 }}><div style={{ flex: 1 }}><JalaliDateField value={bulk.review ?? new Date().toISOString().slice(0, 10)} onChange={(v) => setBulk({ ...bulk, review: v })} /></div>{bulk.review && <button className="im-ghostlink" onClick={() => setBulk({ ...bulk, review: null })}>بدون تغییر</button>}</div></div>
          </div>
          <div className="im-actions"><button className="im-btn im-btn-primary im-btn-sm" disabled={!bulk.owner && !bulk.review} onClick={applyBulk}>اعمال</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setBulk(null)}>بستن</button></div>
        </div>
      )}

      {list.length === 0 ? <div className="im-empty">ریسکی با این فیلترها یافت نشد.</div> : (
        <div className="im-table-wrap">
          <table className="im-table">
            <thead><tr>
              <th style={{ width: 30 }}><input type="checkbox" aria-label="انتخاب همه" checked={allSel} onChange={(e) => setSel(e.target.checked ? new Set(list.map((p) => p.risk.id)) : new Set())} /></th>
              <th>کد</th><th>عنوان و نشانه‌ها</th><th>دسته</th><th>ذاتی ← فعلی ← باقیمانده</th><th>وضعیت</th><th>مالک</th><th>موعد بازنگری</th>
            </tr></thead>
            <tbody>
              {list.slice(0, 400).map(({ risk: r, state: s }) => (
                <tr key={r.id} className="rk-row-click" onClick={() => onOpenRisk(r.id)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`انتخاب ${r.code}`} checked={sel.has(r.id)} onChange={(e) => setSel((o) => { const n = new Set(o); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n })} /></td>
                  <td><span className="im-code">{r.code}</span>{d.scope === 'all' && <div className="im-helper" style={{ fontSize: 10 }}>{projName(r.projectId).slice(0, 22)}</div>}</td>
                  <td style={{ minWidth: 260 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.title}</div>
                    {r.status !== 'closed' && s.attention.length > 0 && <div className="rk-flags">{s.attention.slice(0, 3).map((a) => <span key={a} className="rk-flag" style={{ ['--c' as string]: '#f59e0b' }}>{a}</span>)}{s.attention.length > 3 && <span className="rk-flag" style={{ ['--c' as string]: '#94a3b8' }}>+{s.attention.length - 3}</span>}</div>}
                  </td>
                  <td className="im-helper">{catLabel(r.category)}</td>
                  <td><div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><ScoreTriple state={s} policy={d.policyFor(r.projectId)} /><LevelChip level={s.level} /></div></td>
                  <td><StatusChip status={r.status} /></td>
                  <td className="im-helper">{r.ownerId ? dir.name(r.ownerId) : <span style={{ color: 'var(--im-coral)' }}>بدون مالک</span>}</td>
                  <td className="im-helper" style={{ color: s.reviewOverdue ? 'var(--im-coral)' : undefined, fontWeight: s.reviewOverdue ? 700 : 400 }}>{r.status === 'closed' ? '—' : formatJalali(s.reviewDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length > 400 && <div className="im-helper" style={{ padding: 10 }}>۴۰۰ ردیف اول نمایش داده می‌شود؛ برای محدودکردن از فیلتر استفاده کنید (خروجی همهٔ ردیف‌های فیلترشده را شامل می‌شود).</div>}
        </div>
      )}
      {imp && d.scope !== 'all' && <ImportModal projectId={d.scope} onClose={() => setImp(false)} onDone={() => { setImp(false); bulkDone() }} bulkAdd={bulkAdd} categories={categories} />}
    </div>
  )
  function bulkDone() { useRiskStore.getState().fetchAll() }
}

function ImportModal({ projectId, onClose, onDone, bulkAdd, categories }: { projectId: string; onClose: () => void; onDone: () => void; bulkAdd: (p: string, rows: Parameters<ReturnType<typeof useRiskStore.getState>['bulkAdd']>[1]) => Promise<{ created: number; failed: { row: number; error: string }[] }>; categories: { key: string; labelFa: string }[] }) {
  const dir = useRiskDirectory()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ created: number; failed: { row: number; error: string }[] } | null>(null)
  const parsed = useMemo(() => (text.trim() ? parseRiskImport(text, { categories, emailToUser: (e) => dir.all.find((p) => p.email.toLowerCase() === e)?.userId ?? null }) : null), [text, categories, dir.all])
  const run = async () => {
    if (!parsed?.drafts.length) return
    setBusy(true)
    const r = await bulkAdd(projectId, parsed.drafts.map((x) => x.draft))
    setBusy(false); setResult(r)
    if (!r.failed.length) onDone()
  }
  return (
    <div className="im-overlay">
      <div className="im-modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label="ورود ریسک از فایل">
        <div className="im-modal-head"><div className="im-modal-title">ورود ریسک‌ها از فایل CSV</div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
        <div className="im-helper" style={{ marginBottom: 8 }}>ستون‌های الزامی: عنوان، دسته، احتمال (۱–۵)، اثر (۱–۵). ریسک‌ها برای پروژهٔ انتخاب‌شدهٔ بالای صفحه ثبت می‌شوند و هر ردیف جداگانه اعتبارسنجی می‌شود.</div>
        <div className="im-actions" style={{ marginBottom: 8 }}>
          <label className="im-btn im-btn-ghost im-btn-sm"><Upload size={13} /> انتخاب فایل<input type="file" accept=".csv,text/csv,text/plain" hidden onChange={async (e) => { const fl = e.target.files?.[0]; if (fl) setText(await fl.text()) }} /></label>
          <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => downloadText('risk-import-template.csv', importTemplateCsv())}><Download size={13} /> فایل نمونه</button>
        </div>
        <textarea style={{ minHeight: 110 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="یا محتوای CSV را اینجا بچسبانید…" />
        {parsed && (
          <div style={{ marginTop: 10 }}>
            <div className="im-notice ok">{parsed.drafts.length} ردیف معتبر</div>
            {parsed.errors.length > 0 && <div className="im-notice bad" style={{ marginTop: 6 }}>{parsed.errors.length} ردیف نامعتبر (ثبت نمی‌شود):<ul style={{ margin: '4px 0 0', paddingInlineStart: 18, listStyle: 'disc', maxHeight: 130, overflow: 'auto' }}>{parsed.errors.slice(0, 40).map((e) => <li key={e.row + e.message}>ردیف {e.row}: {e.message}</li>)}</ul></div>}
            {parsed.unknownColumns.length > 0 && <div className="im-helper">ستون‌های نادیده‌گرفته‌شده: {parsed.unknownColumns.join('، ')}</div>}
          </div>
        )}
        {result && result.failed.length > 0 && <div className="im-notice bad" style={{ marginTop: 8 }}>{result.created} ثبت شد؛ {result.failed.length} ناموفق: {result.failed.slice(0, 5).map((x) => `ردیف ${x.row}: ${x.error}`).join(' · ')}</div>}
        <div className="im-actions" style={{ marginTop: 12 }}>
          <button className="im-btn im-btn-primary im-btn-lg" style={{ flex: 1 }} disabled={busy || !parsed?.drafts.length} onClick={run}>{busy ? 'در حال ثبت…' : `ثبت ${parsed?.drafts.length ?? 0} ریسک`}</button>
          <button className="im-btn im-btn-ghost im-btn-lg" onClick={onClose}>بستن</button>
        </div>
      </div>
    </div>
  )
}
