import { useMemo, useState } from 'react'
import { AlarmClock, CheckCircle2, CircleDot, ListChecks, Scale, Search, TriangleAlert } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { IM_PRIORITY_LABEL_FA, type ImIssuePriority } from '../types'
import { buildItems, delayText, groupByProject, type ItemKind, type TrackItem } from '../lib/imTracking'
import { normalizeFa } from '../lib/imText'
import { todayIso } from '../lib/issueRing'
import { useScoped } from '../lib/useScoped'
import { useUserDirectory } from '../lib/useUsers'
import { Segmented } from '../components/ui'
import { HelpButton } from '../components/Help'
import { CHART_COLORS } from '../components/charts'

const KIND_META: Record<ItemKind, { icon: typeof CircleDot; color: string; fa: string }> = {
  issue: { icon: CircleDot, color: '#f97316', fa: 'مسئله' },
  task: { icon: ListChecks, color: '#0ea5e9', fa: 'اقدام' },
  decision: { icon: Scale, color: '#8b5cf6', fa: 'تصمیم' },
}
const SEV_COLOR: Record<ImIssuePriority, string> = { low: 'var(--im-sky)', medium: 'var(--im-amber)', high: '#f97316', critical: 'var(--im-coral)' }
const TONE_COLOR = { done: 'var(--im-mint)', late: 'var(--im-coral)', today: 'var(--im-amber)', soon: 'var(--im-amber)', ok: 'var(--im-sky)', none: 'var(--im-muted)' } as const

type KindFilter = 'all' | 'issue' | 'task' | 'decision'

/** Every issue and action of every project in one list: finished items are struck through, the rest show how late they are. */
export function TrackingPage({ onOpen }: { onOpen: (issueId: string, tab?: 'overview' | 'tasks' | 'decisions') => void }) {
  const sc = useScoped()
  const users = useUserDirectory()
  const [kind, setKind] = useState<KindFilter>('all')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sev, setSev] = useState<ImIssuePriority | 'all'>('all')
  const today = todayIso()

  const kinds: ItemKind[] = kind === 'all' ? ['issue', 'task', 'decision'] : [kind]
  const items = useMemo(() => buildItems(sc.issues, sc.tasks, sc.decisions, today, kinds), [sc.issues, sc.tasks, sc.decisions, today, kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => {
    const n = normalizeFa(q)
    return items.filter((x) => (!onlyOpen || !x.done) && (sev === 'all' || x.severity === sev) && (!n || n.split(' ').every((w) => normalizeFa(x.title + ' ' + x.code).includes(w))))
  }, [items, onlyOpen, q, sev])
  const groups = useMemo(() => groupByProject(filtered), [filtered])
  const total = filtered.length
  const late = filtered.filter((x) => x.lateDays > 0).length
  const done = filtered.filter((x) => x.done).length
  const projectName = (id: string) => sc.projects.find((p) => p.id === id)

  const open = (it: TrackItem) => it.issueId && onOpen(it.issueId, it.kind === 'task' ? 'tasks' : it.kind === 'decision' ? 'decisions' : 'overview')

  return (
    <div className="im-page">
      <div className="im-topbar">
        <div>
          <div className="im-page-title"><ListChecks size={22} style={{ color: 'var(--im-sky)' }} />پیگیری یکپارچه مسائل و اقدام‌ها</div>
          <div className="im-page-sub">{total} مورد · <span style={{ color: 'var(--im-coral)', fontWeight: 700 }}>{late} تأخیردار</span> · <span style={{ color: 'var(--im-mint)', fontWeight: 700 }}>{done} انجام‌شده</span></div>
        </div>
        <div className="im-actions"><HelpButton topic="tracking" /></div>
      </div>

      <div className="im-actions" style={{ marginBottom: 14 }}>
        <Segmented<KindFilter> value={kind} onChange={setKind} options={[{ id: 'all', label: 'همه' }, { id: 'issue', label: 'مسائل' }, { id: 'task', label: 'اقدام‌ها' }, { id: 'decision', label: 'تصمیم‌ها' }]} />
        <label className="im-chip" style={{ cursor: 'pointer', margin: 0, padding: '7px 12px' }}><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} style={{ marginInlineEnd: 6 }} />فقط باز</label>
        <select style={{ width: 'auto' }} value={sev} onChange={(e) => setSev(e.target.value as ImIssuePriority | 'all')} aria-label="شدت"><option value="all">همهٔ شدت‌ها</option>{(['critical', 'high', 'medium', 'low'] as const).map((p) => <option key={p} value={p}>{IM_PRIORITY_LABEL_FA[p]}</option>)}</select>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', insetInlineStart: 11, top: 12, color: 'var(--im-muted)' }} />
          <input style={{ paddingInlineStart: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در عنوان و شناسه…" aria-label="جستجو" />
        </div>
      </div>

      {groups.length === 0 ? <div className="im-empty"><div className="im-big">🔎</div>موردی با این فیلترها یافت نشد</div> : groups.map((g, gi) => {
        const p = projectName(g.projectId)
        const c = CHART_COLORS[gi % CHART_COLORS.length]
        return (
          <section key={g.projectId} className="im-trk-group" style={{ ['--i' as string]: gi, ['--c' as string]: c }}>
            <header className="im-trk-head">
              <div className="im-trk-name">{p?.shortCode && <span className="im-code">{p.shortCode}</span>}{p?.name ?? 'پروژه'}</div>
              <div className="im-actions" style={{ gap: 6 }}>
                <span className="im-pill" style={{ ['--c' as string]: 'var(--im-sky)' }}>{g.open} باز</span>
                {g.late > 0 && <span className="im-pill" style={{ ['--c' as string]: 'var(--im-coral)' }}><AlarmClock size={12} />{g.late} تأخیر</span>}
                {g.blocked > 0 && <span className="im-pill" style={{ ['--c' as string]: 'var(--im-amber)' }}><TriangleAlert size={12} />{g.blocked} مسدود</span>}
                <span className="im-pill" style={{ ['--c' as string]: 'var(--im-mint)' }}><CheckCircle2 size={12} />{g.done} انجام‌شده · {g.progress}٪</span>
              </div>
            </header>
            <div className="im-trk-list">
              {g.items.map((it, k) => {
                const M = KIND_META[it.kind]
                const d = delayText(it)
                const firstDone = it.done && !g.items[k - 1]?.done && k > 0
                return (
                  <button key={it.key} className={`im-trk-row ${it.done ? 'done' : ''} ${firstDone ? 'sep' : ''}`} onClick={() => open(it)}>
                    <div className="im-trk-title">
                      <span className="im-kind" style={{ ['--c' as string]: M.color }} title={M.fa}><M.icon size={13} aria-hidden /></span>
                      <span className="t">{it.title}</span>
                    </div>
                    <div className="im-trk-meta">
                      {it.code && <span className="im-code">{it.code}</span>}
                      <span>{it.statusLabel}</span>
                      {it.assigneeId && <span>· {users.name(it.assigneeId)}</span>}
                      {it.blocked && !it.done && <span style={{ color: 'var(--im-coral)', fontWeight: 700 }}>· مسدود</span>}
                    </div>
                    <div className="im-trk-side">
                      {it.severity && !it.done && <span className="im-pill" style={{ ['--c' as string]: SEV_COLOR[it.severity] }}>{IM_PRIORITY_LABEL_FA[it.severity]}</span>}
                      {it.due && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--im-muted-2)', fontVariantNumeric: 'tabular-nums' }}>{formatJalali(it.due)}</span>}
                      <span className={`im-pill ${d.tone === 'late' || d.tone === 'done' ? 'solid' : ''}`} style={{ ['--c' as string]: TONE_COLOR[d.tone] }}>
                        {d.tone === 'late' && <AlarmClock size={12} aria-hidden />}{d.tone === 'done' && <CheckCircle2 size={12} aria-hidden />}{d.text}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
