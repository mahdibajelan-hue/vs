import { useEffect, useMemo, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useKnowledgeStore } from '../store/useKnowledgeStore'
import { IM_CATEGORY_FA } from '../lib/imModel'
import { lessonReady } from '../lib/imKnowledge'
import { normalizeFa } from '../lib/imText'
import { Segmented } from '../components/ui'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssuesMembersStore } from '../store/useIssuesMembersStore'

export function KnowledgePage({ onOpenIssue }: { onOpenIssue: (id: string) => void }) {
  const { lessons, loaded, fetchAll, setStatus, saveDraft } = useKnowledgeStore()
  const me = useAuthStore((s) => s.profile?.id)
  const projects = useIssuesStore((s) => s.projects)
  const members = useIssuesMembersStore((s) => s.membersByProject)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [tab, setTab] = useState<'published' | 'mine'>('published')
  const [editing, setEditing] = useState<string | null>(null)
  useEffect(() => { if (!loaded) fetchAll() }, [loaded, fetchAll])

  const canPublish = (projectId: string | null) => !!projectId && (members[projectId] ?? []).some((m) => m.userId === me && m.role === 'admin')
  const list = useMemo(() => lessons.filter((l) => (tab === 'published' ? l.status === 'published' : l.status !== 'published' && (l.createdBy === me || canPublish(l.projectId))))
    .filter((l) => cat === 'all' || l.category === cat)
    .filter((l) => !q.trim() || normalizeFa(q).split(' ').every((w) => normalizeFa([l.title, l.context, l.rootCause, l.solution, l.prevention, l.tags.join(' ')].join(' ')).includes(w))), [lessons, tab, cat, q, me, members])
  const [draft, setDraft] = useState<Record<string, { rootCause: string; solution: string; prevention: string }>>({})

  return (
    <div>
      <div className="im-topbar"><div><div className="im-page-title">دانش و درس‌آموخته‌ها</div><div className="im-page-sub">تجربه‌های بسته‌شده، قابل‌جستجو برای پروژه‌های بعدی</div></div>
        <Segmented value={tab} onChange={setTab} options={[{ id: 'published', label: 'منتشرشده' }, { id: 'mine', label: 'پیش‌نویس‌ها' }]} /></div>
      <div className="im-filters">
        <input placeholder="جستجو در عنوان، علت، راه‌حل…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جستجو" style={{ flex: '3 1 220px' }} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="دسته"><option value="all">همهٔ دسته‌ها</option>{Object.entries(IM_CATEGORY_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      {list.length === 0 ? <div className="im-empty"><div className="im-big">📚</div>{tab === 'published' ? 'هنوز درس‌آموخته‌ای منتشر نشده. پس از بستن هر مسئله، از «نمای کلی» آن را ثبت کنید.' : 'پیش‌نویسی وجود ندارد'}</div> : (
        <div className="im-grid">{list.map((l) => {
          const missing = lessonReady(l)
          const d = draft[l.id] ?? { rootCause: l.rootCause, solution: l.solution, prevention: l.prevention }
          return (
            <div key={l.id} className="im-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b><BookOpen size={14} style={{ display: 'inline', marginLeft: 6 }} />{l.title}</b>{l.category && <span className="im-chip">{IM_CATEGORY_FA[l.category]}</span>}</div>
              {editing === l.id ? (
                <div style={{ marginTop: 10 }}>
                  {([['rootCause', 'علت ریشه‌ای'], ['solution', 'راه‌حل'], ['prevention', 'پیشگیری در پروژه‌های بعد']] as const).map(([k, label]) => <div className="im-field" key={k}><label>{label}</label><textarea style={{ minHeight: 54 }} value={d[k]} onChange={(e) => setDraft({ ...draft, [l.id]: { ...d, [k]: e.target.value } })} /></div>)}
                  <div className="im-actions"><button className="im-btn im-btn-primary im-btn-sm" onClick={async () => { const r = await saveDraft({ ...l, ...d }); if (r.ok) setEditing(null) }}>ذخیره</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setEditing(null)}>انصراف</button></div>
                </div>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.9, color: 'var(--im-muted-2)', marginTop: 8 }}>
                  {l.context && <div><b>زمینه:</b> {l.context}</div>}
                  <div><b>علت ریشه‌ای:</b> {l.rootCause || '—'}</div>
                  <div><b>راه‌حل:</b> {l.solution || '—'}</div>
                  {l.prevention && <div><b>پیشگیری:</b> {l.prevention}</div>}
                </div>
              )}
              <div className="im-actions" style={{ marginTop: 10 }}>
                {l.sourceIssueId && <button className="im-ghostlink" onClick={() => onOpenIssue(l.sourceIssueId!)}>مسئلهٔ مبدأ</button>}
                {l.status !== 'published' && (l.createdBy === me || canPublish(l.projectId)) && editing !== l.id && <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setEditing(l.id)}>ویرایش</button>}
                {l.status === 'draft' && canPublish(l.projectId) && <button className="im-btn im-btn-primary im-btn-sm" disabled={missing.length > 0} title={missing.length ? 'ناقص: ' + missing.join('، ') : ''} onClick={() => setStatus(l.id, 'published')}>انتشار</button>}
                {l.status === 'published' && canPublish(l.projectId) && <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setStatus(l.id, 'archived')}>بایگانی</button>}
                {l.status === 'draft' && missing.length > 0 && <span className="im-helper">برای انتشار تکمیل کنید: {missing.join('، ')}</span>}
              </div>
              {projects.length === 0 && null}
            </div>
          )
        })}</div>
      )}
    </div>
  )
}
