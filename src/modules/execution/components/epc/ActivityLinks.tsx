import { useCallback, useEffect, useState } from 'react'
import { Link2, Trash2 } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { useSystemStore } from '../../../../store/useSystemStore'
import { Chip } from '../../../finance/components/fn'

type T = 'issue' | 'risk' | 'change'
const LABEL: Record<T, string> = { issue: 'مانع/مسئله', risk: 'ریسک', change: 'تغییر' }
interface Link { id: string; type: T; targetId: string; label: string }
const SRC: Record<T, { table: string; cols: string; title: (r: Record<string, unknown>) => string }> = {
  issue: { table: 'im_issues', cols: 'id, title', title: (r) => String(r.title ?? '') },
  risk: { table: 'rm_risks', cols: 'id, code, title', title: (r) => `${r.code ?? ''} ${r.title ?? ''}`.trim() },
  change: { table: 'chg_change_requests', cols: 'id, cr_number, title', title: (r) => `${r.cr_number ?? ''} ${r.title ?? ''}`.trim() },
}

/** Traces an activity to existing issues, risks and change requests (ex_links) — the records themselves stay in their own modules. */
export function ActivityLinks({ projectId, activityId, can }: { projectId: string; activityId: string; can: boolean }) {
  const [links, setLinks] = useState<Link[]>([])
  const [type, setType] = useState<T>('issue')
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<{ id: string; title: string }[]>([])
  const [titles, setTitles] = useState<Map<string, string>>(new Map())
  const err = (m: string) => useSystemStore.getState().setStorageError(m)
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('ex_links').select('id, target_type, target_id, label').eq('source_type', 'activity').eq('source_id', activityId)
    if (error) return
    const ls = (data as Record<string, string>[]).filter((r) => r.target_type in LABEL).map((r): Link => ({ id: r.id, type: r.target_type as T, targetId: r.target_id, label: r.label }))
    setLinks(ls)
    const m = new Map<string, string>()
    for (const t of Object.keys(SRC) as T[]) {
      const ids = ls.filter((l) => l.type === t).map((l) => l.targetId); if (!ids.length) continue
      const { data: rows } = await supabase.from(SRC[t].table).select(SRC[t].cols).in('id', ids)
      for (const r of (rows ?? []) as unknown as Record<string, unknown>[]) m.set(String(r.id), SRC[t].title(r))
    }
    setTitles(m)
  }, [activityId])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (term.trim().length < 2) { setHits([]); return }
    const h = window.setTimeout(async () => {
      const s = SRC[type], like = `%${term.trim().replace(/[%_]/g, '')}%`
      const { data } = await supabase.from(s.table).select(s.cols).ilike('title', like).limit(8)
      setHits(((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({ id: String(r.id), title: s.title(r) })))
    }, 300)
    return () => window.clearTimeout(h)
  }, [term, type])
  const add = async (id: string, title: string) => {
    const { error } = await supabase.rpc('ex_link_add', { p_project: projectId, p_activity: activityId, p_type: type, p_target: id, p_label: title.slice(0, 120) })
    if (error) { err(`خطا در پیوند: ${error.message}`); return }
    setTerm(''); setHits([]); await load()
  }
  const remove = async (id: string) => { const { error } = await supabase.rpc('ex_link_remove', { p_id: id }); if (error) err(`خطا در حذف پیوند: ${error.message}`); else await load() }
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <b style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Link2 size={14} /> پیوند به مانع، ریسک و تغییر</b>
      {links.length === 0 && <span className="im-helper">پیوندی ثبت نشده است.</span>}
      {links.map((l) => <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Chip>{LABEL[l.type]}</Chip><span>{titles.get(l.targetId) ?? l.label ?? '—'}</span>{can && <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف پیوند" onClick={() => void remove(l.id)}><Trash2 size={12} /></button>}</div>)}
      {can && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <select value={type} onChange={(e) => { setType(e.target.value as T); setHits([]) }} aria-label="نوع">{(Object.keys(LABEL) as T[]).map((t) => <option key={t} value={t}>{LABEL[t]}</option>)}</select>
        <div style={{ position: 'relative' }}><input placeholder="جست‌وجوی عنوان (حداقل ۲ حرف)" value={term} onChange={(e) => setTerm(e.target.value)} dir="auto" style={{ width: 260 }} aria-label="جست‌وجو" />
          {hits.length > 0 && <div className="im-card" style={{ position: 'absolute', zIndex: 5, insetInlineStart: 0, top: '100%', width: 340, padding: 4 }}>{hits.map((h) => <button key={h.id} className="im-btn im-btn-sm" style={{ display: 'block', width: '100%', textAlign: 'start' }} onClick={() => void add(h.id, h.title)}>{h.title}</button>)}</div>}</div>
      </div>}
    </div>
  )
}
