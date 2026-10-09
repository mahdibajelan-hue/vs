import { useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark, Download, LayoutList, Columns3, GanttChart, Plus, Search, Sparkles, Upload } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import { formatJalali } from '../../../lib/jalali'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssueConfigStore } from '../store/useIssueConfigStore'
import { IM_PRIORITIES, IM_PRIORITY_LABEL_FA, type ImIssue } from '../types'
import { IM_CATEGORY_FA, IM_SOURCE_FA, IM_STAGE_LABEL_FA, IM_STAGE_ORDER, dayDiff, effectiveDue, stageOf } from '../lib/imModel'
import { EMPTY_FILTER, KANBAN_STAGES, applyFilter, groupByStage, parseImport, sortIssues, toCsv, type IssueFilter, type SortKey } from '../lib/imRegister'
import { todayIso } from '../lib/issueRing'
import { useUserDirectory } from '../lib/useUsers'
import { useScoped } from '../lib/useScoped'
import { askRegister, extractIssues } from '../lib/imAiClient'
import { IssueCode, Segmented, SeverityChip, SlaBadge, StageChip } from '../components/ui'

type View = 'table' | 'kanban' | 'timeline'
interface Saved { id: string; name: string; filter: IssueFilter; isShared: boolean }

export function RegisterPage({ onSelectIssue, onNewIssue, lockedProjectId, initialFilter }: { onSelectIssue: (id: string) => void; onNewIssue: () => void; lockedProjectId?: string | null; initialFilter?: Partial<IssueFilter> }) {
  const sc = useScoped()
  const { projects, issues, tasks } = sc
  if (sc.scope !== 'all') lockedProjectId = sc.scope
  const cfg = useIssueConfigStore()
  const users = useUserDirectory()
  const me = useAuthStore((s) => s.profile?.id)
  const [view, setView] = useState<View>('table')
  const [f, setF] = useState<IssueFilter>({ ...EMPTY_FILTER, ...(lockedProjectId ? { projectId: lockedProjectId } : {}), ...initialFilter })
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'due', dir: 1 })
  const [saved, setSaved] = useState<Saved[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [ask, setAsk] = useState('')
  const [askWhy, setAskWhy] = useState<{ why: string[]; src: 'ai' | 'rules' } | null>(null)
  const [asking, setAsking] = useState(false)
  const today = todayIso()
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '—'

  useEffect(() => {
    supabase.from('im_saved_filters').select('*').eq('scope', 'register').then(({ data }) => {
      setSaved(((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, name: r.name as string, filter: { ...EMPTY_FILTER, ...(r.filter as Partial<IssueFilter>) }, isShared: !!r.is_shared })))
    })
  }, [])

  const list = useMemo(() => sortIssues(applyFilter(issues, f, today), sort.key, sort.dir, today), [issues, f, sort, today])
  const set = <K extends keyof IssueFilter>(k: K, v: IssueFilter[K]) => setF((o) => ({ ...o, [k]: v }))
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))
  const arrow = (k: SortKey) => (sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : '')

  const saveFilter = async () => {
    const name = window.prompt('نام این فیلتر ذخیره‌شده:')
    if (!name?.trim() || !me) return
    const { data, error } = await supabase.from('im_saved_filters').insert({ user_id: me, scope: 'register', name: name.trim(), filter: f }).select().single()
    if (!error && data) setSaved((s) => [...s, { id: data.id, name: data.name, filter: f, isShared: false }])
  }
  const removeSaved = async (id: string) => { await supabase.from('im_saved_filters').delete().eq('id', id); setSaved((s) => s.filter((x) => x.id !== id)) }

  const exportCsv = () => {
    const csv = toCsv(list, { project: projectName, user: (id) => users.name(id), tasks })
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `issues-${today}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const runAsk = async () => {
    if (!ask.trim()) return
    setAsking(true)
    const res = await askRegister(ask, { projects, users: users.all, meId: me })
    setF({ ...EMPTY_FILTER, ...(lockedProjectId ? { projectId: lockedProjectId } : {}), ...res.filter } as IssueFilter)
    setAskWhy({ why: res.explanation, src: res.source })
    setAsking(false)
  }
  const activeCount = (Object.keys(EMPTY_FILTER) as (keyof IssueFilter)[]).filter((k) => f[k] !== EMPTY_FILTER[k]).length

  return (
    <div className="im-page">
      <div className="im-topbar">
        <div><div className="im-page-title">ثبت‌نامهٔ مسائل</div><div className="im-page-sub">{list.length} از {issues.length} مسئله</div></div>
        <div className="im-actions">
          <Segmented<View> value={view} onChange={setView} options={[{ id: 'table', label: <><LayoutList size={14} /> جدول</> }, { id: 'kanban', label: <><Columns3 size={14} /> کانبان</> }, { id: 'timeline', label: <><GanttChart size={14} /> زمان‌بندی</> }]} />
          <button className="im-btn im-btn-ghost im-btn-sm" onClick={exportCsv} title="خروجی CSV (سازگار با Excel)"><Download size={14} /> خروجی</button>
          <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setImportOpen(true)}><Upload size={14} /> ورود انبوه</button>
          <button className="im-btn im-btn-primary" onClick={onNewIssue}><Plus size={16} /> مسئلهٔ جدید</button>
        </div>
      </div>

      <div className="im-actions" style={{ marginBottom: 10 }}>
        <div style={{ position: 'relative', flex: '1 1 320px' }}>
          <Sparkles size={14} style={{ position: 'absolute', right: 11, top: 12, color: 'var(--im-amber)' }} />
          <input style={{ paddingRight: 32 }} value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runAsk()} placeholder="بپرسید: مسائل بحرانی تأخیردار پروژه خط لوله…" aria-label="پرسش به زبان طبیعی" />
        </div>
        <button className="im-btn im-btn-ghost im-btn-sm" disabled={asking || !ask.trim()} onClick={runAsk}>{asking ? '…' : 'اعمال روی فیلترها'}</button>
        {askWhy && <span className="im-helper">{askWhy.src === 'ai' ? 'تفسیر هوش مصنوعی' : 'تفسیر سامانه'}: {askWhy.why.join(' · ')} — فیلترها را می‌توانید ویرایش کنید</span>}
      </div>
      <div className="im-filters" role="search">
        <div style={{ position: 'relative', flex: '2 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', right: 11, top: 11, color: 'var(--im-muted)' }} />
          <input style={{ paddingRight: 32, padding: 8 , paddingInlineStart: 32 }} placeholder="جستجو در شناسه، عنوان، شرح، محل…" value={f.q} onChange={(e) => set('q', e.target.value)} aria-label="جستجو" />
        </div>
        {!lockedProjectId && <select value={f.projectId} onChange={(e) => set('projectId', e.target.value)} aria-label="پروژه"><option value="all">همه پروژه‌ها</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <select value={f.stage} onChange={(e) => set('stage', e.target.value as IssueFilter['stage'])} aria-label="مرحله"><option value="active">فعال (باز)</option><option value="all">همهٔ مراحل</option>{(cfg.stages.length ? cfg.stages.map((s) => s.key) : IM_STAGE_ORDER).map((s) => <option key={s} value={s}>{IM_STAGE_LABEL_FA[s]}</option>)}</select>
        <select value={f.severity} onChange={(e) => set('severity', e.target.value as IssueFilter['severity'])} aria-label="شدت"><option value="all">همهٔ شدت‌ها</option>{IM_PRIORITIES.map((p) => <option key={p} value={p}>{IM_PRIORITY_LABEL_FA[p]}</option>)}</select>
        <select value={f.category} onChange={(e) => set('category', e.target.value)} aria-label="دسته"><option value="all">همهٔ دسته‌ها</option>{Object.entries(IM_CATEGORY_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={f.userId} onChange={(e) => set('userId', e.target.value)} aria-label="مسئول"><option value="all">همهٔ افراد</option>{me && <option value={me}>من</option>}{users.all.filter((u) => u.userId !== me).map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}</select>
        <select value={f.source} onChange={(e) => set('source', e.target.value)} aria-label="منبع"><option value="all">همهٔ منابع</option>{Object.entries(IM_SOURCE_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <div className="im-actions" style={{ marginBottom: 14 }}>
        <label className="im-chip" style={{ cursor: 'pointer', margin: 0 }}><input type="checkbox" style={{ width: 'auto', marginLeft: 6 }} checked={f.overdueOnly} onChange={(e) => set('overdueOnly', e.target.checked)} /> فقط دارای تأخیر</label>
        <label className="im-chip" style={{ cursor: 'pointer', margin: 0 }}><input type="checkbox" style={{ width: 'auto', marginLeft: 6 }} checked={f.blockedOnly} onChange={(e) => set('blockedOnly', e.target.checked)} /> فقط مسدود</label>
        {activeCount > 0 && <button className="im-ghostlink" onClick={() => setF({ ...EMPTY_FILTER, ...(lockedProjectId ? { projectId: lockedProjectId } : {}) })}>پاک‌کردن فیلترها ({activeCount})</button>}
        <button className="im-ghostlink" onClick={saveFilter}><Bookmark size={12} style={{ display: 'inline' }} /> ذخیرهٔ فیلتر</button>
        {saved.map((s) => (
          <span key={s.id} className="im-chip" style={{ cursor: 'pointer', gap: 6 }}>
            <button onClick={() => setF({ ...s.filter, ...(lockedProjectId ? { projectId: lockedProjectId } : {}) })}>{s.name}</button>
            <button aria-label="حذف فیلتر" onClick={() => removeSaved(s.id)} style={{ color: 'var(--im-muted)' }}>×</button>
          </span>
        ))}
      </div>

      {list.length === 0 ? <div className="im-empty"><div className="im-big">🔍</div>مسئله‌ای با این فیلترها یافت نشد</div> : view === 'table' ? (
        <div className="im-table-wrap">
          <table className="im-table">
            <thead><tr>
              <th onClick={() => sortBy('code')}>شناسه{arrow('code')}</th><th onClick={() => sortBy('title')}>عنوان{arrow('title')}</th>
              <th className="hide-sm">پروژه</th><th onClick={() => sortBy('stage')}>مرحله{arrow('stage')}</th><th onClick={() => sortBy('severity')}>شدت{arrow('severity')}</th>
              <th className="hide-sm">مسئول</th><th onClick={() => sortBy('due')}>سررسید{arrow('due')}</th><th className="hide-sm" onClick={() => sortBy('age')}>سن{arrow('age')}</th>
            </tr></thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className="row" onClick={() => onSelectIssue(i.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelectIssue(i.id)}>
                  <td><IssueCode issue={i} /></td>
                  <td className="ttl" title={i.title}>{i.title}{i.blockedSince && <span className="im-chip" style={{ marginRight: 6, color: 'var(--im-coral)' }}>مسدود</span>}</td>
                  <td className="hide-sm" style={{ color: 'var(--im-muted)' }}>{projectName(i.projectId)}</td>
                  <td><StageChip stage={stageOf(i)} /></td>
                  <td><SeverityChip level={i.severity ?? i.priority} /></td>
                  <td className="hide-sm">{users.name(i.followUpId ?? i.pursuerId)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatJalali(effectiveDue(i))} <SlaBadge issue={i} /></td>
                  <td className="hide-sm" style={{ color: 'var(--im-muted)' }}>{dayDiff(i.createdAt.slice(0, 10), today)} روز</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : view === 'kanban' ? (
        <Kanban list={list} onSelect={onSelectIssue} users={users.name} />
      ) : (
        <Timeline list={list} onSelect={onSelectIssue} today={today} />
      )}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}

function Kanban({ list, onSelect, users }: { list: ImIssue[]; onSelect: (id: string) => void; users: (id: string | null) => string }) {
  const g = groupByStage(list)
  const cols: string[] = [...KANBAN_STAGES.filter((s) => s !== 'closed' || g.closed.length), ...(g.other.length ? ['other'] : [])]
  return (
    <div className="im-kanban">
      {cols.map((s) => (
        <div className="im-kcol" key={s}>
          <div className="im-kcol-h"><span>{s === 'other' ? 'خارج از مسیر (بازگشتی/ابطال/تکراری)' : IM_STAGE_LABEL_FA[s as keyof typeof IM_STAGE_LABEL_FA]}</span><span>{g[s].length}</span></div>
          {g[s].map((i) => (
            <button className="im-kcard" key={i.id} onClick={() => onSelect(i.id)}>
              <div className="t">{i.title}</div>
              <div className="im-issue-meta"><IssueCode issue={i} /><SeverityChip level={i.severity ?? i.priority} /><SlaBadge issue={i} /></div>
              <div className="im-helper">{users(i.followUpId ?? i.pursuerId)}</div>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Due-date lanes: each issue is a bar from its registration date to its effective due date; today is the vertical rule. */
function Timeline({ list, onSelect, today }: { list: ImIssue[]; onSelect: (id: string) => void; today: string }) {
  const rows = list.slice(0, 80)
  const t0 = Math.min(...rows.map((i) => Date.parse(i.createdAt.slice(0, 10))), Date.parse(today) - 7 * 86400000)
  const t1 = Math.max(...rows.map((i) => Date.parse(effectiveDue(i))), Date.parse(today) + 14 * 86400000)
  const span = Math.max(1, t1 - t0)
  const pct = (t: number) => ((t - t0) / span) * 100
  const todayPct = pct(Date.parse(today))
  return (
    <div className="im-card" style={{ overflowX: 'auto' }}>
      {list.length > rows.length && <div className="im-helper" style={{ marginBottom: 8 }}>۸۰ مورد اول نمایش داده می‌شود؛ برای محدودکردن از فیلتر استفاده کنید.</div>}
      <div style={{ position: 'relative', minWidth: 640 }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${100 - todayPct}%`, width: 2, background: 'var(--im-amber)', opacity: 0.7, zIndex: 1 }} title="امروز" />
        {rows.map((i) => {
          const a = pct(Date.parse(i.createdAt.slice(0, 10))), b = pct(Date.parse(effectiveDue(i)))
          const late = effectiveDue(i) < today && stageOf(i) !== 'closed'
          return (
            <button key={i.id} onClick={() => onSelect(i.id)} style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 10, alignItems: 'center', width: '100%', padding: '6px 0', textAlign: 'right' }}>
              <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span className="im-code">{i.code}</span> {i.title}</span>
              <span style={{ position: 'relative', height: 14, background: 'var(--im-panel-2)', borderRadius: 7 }}>
                <span style={{ position: 'absolute', right: `${a}%`, width: `${Math.max(1.5, b - a)}%`, top: 0, bottom: 0, borderRadius: 7, background: late ? 'var(--im-coral)' : stageOf(i) === 'closed' ? 'var(--im-mint)' : 'var(--im-amber)', opacity: 0.85 }} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'csv' | 'text'>('csv')
  const projects = useIssuesStore((s) => s.projects)
  const fetchAll = useIssuesStore((s) => s.fetchAll)
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [text, setText] = useState('')
  const [result, setResult] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (text.trim() ? parseImport(text) : null), [text])

  const run = async () => {
    if (!preview || !preview.rows.length) return
    setBusy(true)
    const { data, error } = await supabase.rpc('im_bulk_create', { p_project: projectId, p_rows: preview.rows })
    setBusy(false)
    if (error) { setResult('خطا: ' + error.message); return }
    setResult(`${(data as { created: number }).created} مسئله ثبت شد · ${(data as { skipped: number }).skipped} مورد تکراری رد شد`)
    await fetchAll()
  }

  return (
    <div className="im-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="im-modal" style={{ maxWidth: 640 }}>
        <div className="im-modal-head"><div className="im-modal-title">ورود انبوه از فایل CSV</div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
        <div style={{ marginBottom: 10 }}><Segmented value={mode} onChange={setMode} options={[{ id: 'csv', label: 'فایل CSV' }, { id: 'text', label: 'استخراج از متن (صورت‌جلسه/گزارش بازدید)' }]} /></div>
        {mode === 'text' ? <TextExtract projectId={projectId} setProjectId={setProjectId} projects={projects} onDone={onClose} /> : <>
        <div className="im-helper" style={{ marginBottom: 10 }}>ستون‌های پشتیبانی‌شده: عنوان (الزامی)، شرح، شدت، دسته، محل، رشته، مهلت (روز)، شناسه منبع. مقدارهای فارسی و انگلیسی پذیرفته می‌شود.</div>
        <div className="im-field"><label>پروژه مقصد</label><select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={async (e) => { const fl = e.target.files?.[0]; if (fl) setText(await fl.text()) }} />
        <div className="im-field" style={{ marginTop: 10 }}><label>یا متن CSV را اینجا بچسبانید</label><textarea value={text} onChange={(e) => setText(e.target.value)} style={{ direction: 'ltr', minHeight: 90 }} /></div>
        {preview && (
          <div style={{ marginBottom: 10 }}>
            <div className="im-notice ok">{preview.rows.length} ردیف معتبر</div>
            {preview.errors.length > 0 && <div className="im-notice bad" style={{ marginTop: 6 }}>{preview.errors.slice(0, 8).map((e) => <div key={e.line}>ردیف {e.line}: {e.message}</div>)}{preview.errors.length > 8 && <div>… و {preview.errors.length - 8} خطای دیگر</div>}</div>}
          </div>
        )}
        {result && <div className="im-notice ok" style={{ marginBottom: 10 }}>{result}</div>}
        <button className="im-btn im-btn-primary" disabled={busy || !preview?.rows.length || !projectId} onClick={run}>{busy ? 'در حال ثبت…' : `ثبت ${preview?.rows.length ?? 0} مسئله`}</button>
        </>}
      </div>
    </div>
  )
}

function TextExtract({ projectId, setProjectId, projects, onDone }: { projectId: string; setProjectId: (v: string) => void; projects: { id: string; name: string }[]; onDone: () => void }) {
  const fetchAll = useIssuesStore((s) => s.fetchAll)
  const [text, setText] = useState('')
  const [items, setItems] = useState<{ title: string; description: string; category: string | null; severity: string; on: boolean }[]>([])
  const [src, setSrc] = useState<'ai' | 'rules' | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const analyze = async () => { setBusy(true); const r = await extractIssues(text); setItems(r.items.map((c) => ({ ...c, on: true }))); setSrc(r.source); setBusy(false) }
  const create = async () => {
    const rows = items.filter((i) => i.on).map((i) => ({ title: i.title, description: i.description, category: i.category ?? '', severity: i.severity, priority: i.severity, source: 'meeting' }))
    setBusy(true)
    const { data, error } = await supabase.rpc('im_bulk_create', { p_project: projectId, p_rows: rows })
    setBusy(false)
    if (error) return setMsg('خطا: ' + error.message)
    setMsg(`${(data as { created: number }).created} مسئله ثبت شد`)
    await fetchAll()
    setTimeout(onDone, 900)
  }
  return (
    <div>
      <div className="im-field"><label>پروژه مقصد</label><select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="im-field"><label>متن صورت‌جلسه یا گزارش بازدید</label><textarea style={{ minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} /></div>
      <div className="im-actions" style={{ marginBottom: 10 }}><button className="im-btn im-btn-ghost im-btn-sm" disabled={busy || text.trim().length < 20} onClick={analyze}><Sparkles size={13} /> {busy ? 'در حال تحلیل…' : 'استخراج موارد'}</button>{src && <span className="im-helper">{src === 'ai' ? 'استخراج هوش مصنوعی' : 'استخراج قاعده‌محور'} — موارد را بررسی و ویرایش کنید؛ چیزی خودکار ثبت نمی‌شود</span>}</div>
      {items.map((it, k) => (
        <div key={k} className="im-task" style={{ marginBottom: 8 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: 0 }}><input type="checkbox" checked={it.on} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, on: e.target.checked } : x)))} /><input value={it.title} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)))} /></label>
          <div className="im-helper">{it.category ? IM_CATEGORY_FA[it.category] : 'بدون دسته'} · شدت {IM_PRIORITY_LABEL_FA[it.severity as keyof typeof IM_PRIORITY_LABEL_FA] ?? it.severity}</div>
        </div>
      ))}
      {msg && <div className="im-notice ok" style={{ marginBottom: 8 }}>{msg}</div>}
      {items.length > 0 && <button className="im-btn im-btn-primary" disabled={busy || !items.some((i) => i.on) || !projectId} onClick={create}>ثبت {items.filter((i) => i.on).length} مسئلهٔ تأییدشده</button>}
    </div>
  )
}
