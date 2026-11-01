import { useEffect, useMemo, useState } from 'react'
import { Archive, BookmarkPlus, CheckCircle2, CopyCheck, Library, Loader2, X, XCircle } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import type { EpcModel } from '../../execution/lib/useEpcModel'
import { useEpcStore } from '../../execution/store/useEpcStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { jalaliText } from '../../execution/lib/periods'
import { fa } from '../../execution/components/common'
import { buildTemplate, planTemplate, type TplItem } from '../lib/linkTemplates'

interface Template { id: string; name: string; description: string; sourceProjectId: string | null; items: TplItem[]; itemCount: number; createdBy: string; createdAt: string }
type Row = Record<string, unknown>

const CSS = `.lt{padding:14px;display:grid;gap:10px}.lt-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.lt-head h3{margin:0;font-size:14px;font-weight:900;display:flex;align-items:center;gap:6px}
.lt-list{display:grid;gap:6px}.lt-item{display:flex;gap:10px;align-items:center;padding:9px 12px;border:1px solid var(--im-line,rgba(148,163,184,.25));border-radius:12px;background:transparent;color:inherit;text-align:right;cursor:pointer;width:100%;transition:border-color .14s,background .14s}
.lt-item[aria-pressed=true]{border-color:#14b8a6;background:color-mix(in srgb,#14b8a6 10%,transparent)}.lt-item b{font-size:13px}.lt-item small{color:var(--im-muted,#94a3b8);font-size:11.5px}
.lt-stats{display:flex;gap:8px;flex-wrap:wrap}.lt-stats span{padding:5px 10px;border-radius:99px;font-size:12px;font-weight:700;background:color-mix(in srgb,var(--c) 14%,transparent);color:var(--c)}
.lt-tbl{max-height:340px;overflow:auto;border:1px solid var(--im-line,rgba(148,163,184,.2));border-radius:10px}
.lt-tbl table{width:100%;border-collapse:collapse;font-size:11.5px}.lt-tbl th{position:sticky;top:0;background:var(--im-panel-2,#1e293b);text-align:right;padding:6px 8px;font-size:11px}
.lt-tbl td{padding:5px 8px;border-top:1px solid var(--im-line,rgba(148,163,184,.14));vertical-align:top}.lt-tbl .code{font-family:'JetBrains Mono',monospace;font-size:10.5px;direction:ltr;text-align:left;white-space:nowrap}
.lt-form{display:flex;gap:8px;flex-wrap:wrap;align-items:end}`

const MATCH_FA = { number: 'شماره', title: 'عنوان', 'item+title': 'ردیف و شرح', item: 'ردیف فهرست‌بها', title2: 'شرح' } as const

/** Save this project's document ↔ activity links as a template, or apply a template saved on another project. */
export function LinkTemplates({ m, projectId, can }: { m: EpcModel; projectId: string; can: boolean }) {
  const epc = useEpcStore()
  const uid = useAuthStore((s) => s.profile?.id)
  const isAdmin = useAuthStore((s) => !!s.profile?.isAdmin)
  const projects = useMasterDataStore((s) => s.projects)
  const [list, setList] = useState<Template[] | null>(null)
  const [mode, setMode] = useState<'' | 'save' | 'apply'>('')
  const [name, setName] = useState(''), [desc, setDesc] = useState('')
  const [sel, setSel] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [filter, setFilter] = useState<'all' | 'new' | 'missing'>('all')

  const docs = useMemo(() => epc.engDocs.filter((x) => x.projectId === projectId && x.status !== 'superseded'), [epc.engDocs, projectId])
  const acts = useMemo(() => m.ex.activities.filter((a) => a.active).map((a) => ({ id: a.id, itemNo: a.itemNo, title: a.title, plannedStart: a.plannedStart, spec: a.spec, rowNo: a.rowNo })), [m.ex.activities])
  const links = useMemo(() => epc.docLinks.filter((l) => l.projectId === projectId), [epc.docLinks, projectId])

  const load = async () => {
    const { data, error } = await supabase.from('ex_link_templates').select('*').eq('archived', false).order('created_at', { ascending: false })
    if (error) { setList([]); setMsg({ ok: false, text: /does not exist|schema cache/i.test(error.message) ? 'جدول الگوها هنوز در پایگاه داده ساخته نشده است.' : 'فهرست الگوها خوانده نشد.' }); return }
    setList(((data ?? []) as Row[]).map((r) => ({ id: r.id as string, name: r.name as string, description: (r.description as string) ?? '', sourceProjectId: (r.source_project_id as string) ?? null, items: (r.items as TplItem[]) ?? [], itemCount: Number(r.item_count) || 0, createdBy: r.created_by as string, createdAt: r.created_at as string })))
  }
  useEffect(() => { if (mode === 'apply' && list == null) void load() }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const items = buildTemplate(links, docs, acts)
    if (!items.length || !name.trim()) return
    setBusy(true)
    const { error } = await supabase.from('ex_link_templates').insert({ name: name.trim(), description: desc.trim(), source_project_id: projectId, items, item_count: items.length })
    setBusy(false)
    if (error) { setMsg({ ok: false, text: `الگو ذخیره نشد: ${error.message}` }); return }
    setMsg({ ok: true, text: `الگوی «${name.trim()}» با ${fa(items.length)} ارتباط ذخیره شد و در همهٔ پروژه‌ها قابل استفاده است.` })
    setName(''); setDesc(''); setMode(''); setList(null)
  }

  const tpl = list?.find((t) => t.id === sel) ?? null
  const plan = useMemo(() => (tpl ? planTemplate(tpl.items, docs, acts, links) : null), [tpl, docs, acts, links])
  const apply = async () => {
    if (!plan?.create.length) return
    setBusy(true)
    const rows = plan.create.map((l) => ({ project_id: projectId, doc_id: l.docId, activity_id: l.activityId, front: l.front, contract: l.contract, need_kind: l.needKind, need_date: l.needDate, min_status: l.minStatus, allow_restricted: l.allowRestricted, alt_activity_id: l.altActivityId, note: l.note }))
    let done = 0, err = ''
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from('ex_doc_links').upsert(rows.slice(i, i + 200), { onConflict: 'doc_id,activity_id', ignoreDuplicates: true })
      if (error) { err = error.message; break }
      done += Math.min(200, rows.length - i)
    }
    await epc.fetchAll()
    setBusy(false)
    setMsg(err ? { ok: false, text: `${fa(done)} ارتباط ایجاد شد و بقیه ایجاد نشد: ${err}` } : { ok: true, text: `${fa(done)} ارتباط از الگوی «${tpl?.name}» ایجاد شد.${plan.missingDoc + plan.missingAct ? ' مواردی که مدرک یا فعالیتِ متناظر نداشتند ایجاد نشدند؛ آن‌ها را دستی ثبت کنید.' : ''}` })
  }
  const archive = async (t: Template) => {
    const { error } = await supabase.from('ex_link_templates').update({ archived: true, updated_at: new Date().toISOString() }).eq('id', t.id)
    if (error) { setMsg({ ok: false, text: 'الگو بایگانی نشد.' }); return }
    if (sel === t.id) setSel('')
    setList((l) => (l ?? []).filter((x) => x.id !== t.id))
  }

  const proj = (id: string | null) => projects.find((p) => p.id === id)?.officialName ?? 'پروژهٔ نامشخص'
  const shownRows = plan ? plan.rows.filter((r) => (filter === 'new' ? !!r.link : filter === 'missing' ? !r.doc || !r.act : true)) : []

  return (
    <div className="im-card lt"><style>{CSS}</style>
      <div className="lt-head">
        <h3><Library size={16} /> الگوی ارتباط مدارک و فعالیت‌ها</h3>
        <span style={{ flex: 1 }} />
        {can && <button className={`im-btn im-btn-sm${mode === 'save' ? ' im-btn-primary' : ''}`} disabled={!links.length} title={links.length ? '' : 'این پروژه هنوز ارتباطی ندارد'} onClick={() => { setMode(mode === 'save' ? '' : 'save'); setMsg(null) }}><BookmarkPlus size={14} /> ذخیره به‌عنوان الگو</button>}
        <button className={`im-btn im-btn-sm${mode === 'apply' ? ' im-btn-primary' : ''}`} onClick={() => { setMode(mode === 'apply' ? '' : 'apply'); setMsg(null) }}><CopyCheck size={14} /> استفاده از الگو</button>
      </div>
      {!mode && <p className="im-helper" style={{ margin: 0 }}>ارتباط‌هایی که یک بار برای یک پروژه ثبت شده را به‌عنوان الگو ذخیره کنید و در پروژه‌های مشابه به کار ببرید. مدارک با شمارهٔ مدرک بدون شمارهٔ پروژه (یا عنوان) و فعالیت‌ها با ردیف فهرست‌بها و شرح تطبیق داده می‌شوند.</p>}

      {mode === 'save' && <div className="lt-form">
        <label className="ex-lab">نام الگو<input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً خط لولهٔ ۴۸ اینچ — مهندسی تفصیلی" dir="auto" style={{ minWidth: 260 }} /></label>
        <label className="ex-lab" style={{ flex: 1 }}>توضیح (اختیاری)<input value={desc} onChange={(e) => setDesc(e.target.value)} dir="auto" /></label>
        <button className="im-btn im-btn-primary im-btn-sm" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? <Loader2 size={13} className="animate-spin" /> : <BookmarkPlus size={13} />} ذخیرهٔ {fa(links.length)} ارتباط</button>
      </div>}

      {mode === 'apply' && <>
        {list == null ? <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><Loader2 size={18} className="animate-spin" /></div>
          : !list.length ? <p className="im-helper" style={{ margin: 0 }}>هنوز الگویی ذخیره نشده است. در پروژه‌ای که ارتباط‌های آن ثبت شده، «ذخیره به‌عنوان الگو» را بزنید.</p>
          : <div className="lt-list">{list.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="lt-item" aria-pressed={sel === t.id} onClick={() => { setSel(sel === t.id ? '' : t.id); setFilter('all') }}>
                <span style={{ display: 'grid', gap: 2, flex: 1 }}><b>{t.name}</b><small>{fa(t.itemCount)} ارتباط · از {t.sourceProjectId === projectId ? 'همین پروژه' : proj(t.sourceProjectId)} · {jalaliText(t.createdAt.slice(0, 10))}{t.description ? ` · ${t.description}` : ''}</small></span>
              </button>
              {(t.createdBy === uid || isAdmin) && <button className="im-btn im-btn-sm" title="بایگانی الگو" aria-label={`بایگانی الگوی ${t.name}`} onClick={() => void archive(t)}><Archive size={13} /></button>}
            </div>))}</div>}
        {plan && tpl && <>
          <div className="lt-stats">
            <span style={{ ['--c' as string]: '#22c55e' }}>{fa(plan.create.length)} ارتباط تازه</span>
            <span style={{ ['--c' as string]: '#94a3b8' }}>{fa(plan.existing)} از قبل موجود</span>
            <span style={{ ['--c' as string]: '#f59e0b' }}>{fa(plan.missingDoc)} بدون مدرک متناظر</span>
            <span style={{ ['--c' as string]: '#ef4444' }}>{fa(plan.missingAct)} بدون فعالیت متناظر</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([['all', 'همه'], ['new', 'ایجادشدنی'], ['missing', 'تطبیق‌نیافته']] as const).map(([k, l]) => <button key={k} className={`im-btn im-btn-sm${filter === k ? ' im-btn-primary' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          <div className="lt-tbl"><table>
            <thead><tr><th /><th>مدرک در الگو</th><th>مدرک در این پروژه</th><th>فعالیت در الگو</th><th>فعالیت در این پروژه</th></tr></thead>
            <tbody>{shownRows.map((r, i) => <tr key={i}>
              <td>{r.link ? <CheckCircle2 size={14} color="#22c55e" aria-label="ایجاد می‌شود" /> : r.exists ? <CheckCircle2 size={14} color="#94a3b8" aria-label="موجود" /> : <XCircle size={14} color="#ef4444" aria-label="ایجاد نمی‌شود" />}</td>
              <td><div className="code">{r.item.docNo}</div><small className="sub">{r.item.docTitle}</small></td>
              <td>{r.doc ? <><div className="code">{r.doc.docNo}</div><small className="sub">تطبیق با {MATCH_FA[r.docBy === 'title' ? 'title' : 'number']}</small></> : <span className="ex-bad">پیدا نشد</span>}</td>
              <td><small>{r.item.actItemNo ? `${r.item.actItemNo} — ` : ''}{r.item.actTitle}</small></td>
              <td>{r.act ? <><small>{r.act.itemNo ? `${r.act.itemNo} — ` : ''}{r.act.title}</small><br /><small className="sub">تطبیق با {MATCH_FA[r.actBy === 'title' ? 'title2' : (r.actBy ?? 'item')]}</small></> : <span className="ex-bad">پیدا نشد</span>}</td>
            </tr>)}
            {!shownRows.length && <tr><td colSpan={5} className="sub">موردی نیست.</td></tr>}</tbody>
          </table></div>
          {can ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="im-btn im-btn-primary im-btn-sm" disabled={busy || !plan.create.length} onClick={() => void apply()}>{busy ? <Loader2 size={13} className="animate-spin" /> : <CopyCheck size={13} />} ایجاد {fa(plan.create.length)} ارتباط</button>
            <button className="im-btn im-btn-sm" onClick={() => setSel('')}><X size={13} /> انصراف</button>
            <small className="sub">ارتباط‌های موجود تغییر نمی‌کنند. تاریخ موردنیاز نسبت به شروع برنامه‌ای فعالیت در این پروژه محاسبه می‌شود.</small>
          </div> : <p className="im-helper" style={{ margin: 0 }}>ایجاد ارتباط با کسانی است که اجازهٔ ویرایش فعالیت‌های این پروژه را دارند.</p>}
        </>}
      </>}
      {msg && <p className={msg.ok ? 'im-helper' : 'ex-bad'} style={{ margin: 0, color: msg.ok ? '#16a34a' : undefined }}>{msg.text}</p>}
    </div>
  )
}
