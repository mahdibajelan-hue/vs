import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, CircleDot, ListChecks, Scale } from 'lucide-react'
import { JALALI_MONTHS, JALALI_WEEKDAYS, formatJalali, todayJalali } from '../../../lib/jalali'
import { buildItems, delayText, type ItemKind, type TrackItem } from '../lib/imTracking'
import { itemsByDate, monthGrid, shiftMonth } from '../lib/imCalendar'
import { todayIso } from '../lib/issueRing'
import { useScoped } from '../lib/useScoped'
import { useUserDirectory } from '../lib/useUsers'
import { HelpButton } from '../components/Help'

const KINDS: { id: ItemKind; label: string; color: string; icon: typeof CircleDot }[] = [
  { id: 'issue', label: 'مسئله', color: '#f97316', icon: CircleDot },
  { id: 'task', label: 'اقدام', color: '#0ea5e9', icon: ListChecks },
  { id: 'decision', label: 'تصمیم', color: '#8b5cf6', icon: Scale },
]

/** Working calendar (Jalali): due dates of issues, actions and decisions; a day opens its full agenda on the side. */
export function CalendarPage({ onOpen }: { onOpen: (issueId: string, tab?: 'overview' | 'tasks' | 'decisions') => void }) {
  const sc = useScoped()
  const users = useUserDirectory()
  const t = todayJalali()
  const today = todayIso()
  const [ym, setYm] = useState({ jy: t.jy, jm: t.jm })
  const [on, setOn] = useState<Record<ItemKind, boolean>>({ issue: true, task: true, decision: true })
  const [sel, setSel] = useState<string | null>(today)

  const kinds = KINDS.filter((k) => on[k.id]).map((k) => k.id)
  const items = useMemo(() => buildItems(sc.issues, sc.tasks, sc.decisions, today, kinds), [sc.issues, sc.tasks, sc.decisions, today, on]) // eslint-disable-line react-hooks/exhaustive-deps
  const byDate = useMemo(() => itemsByDate(items), [items])
  const grid = useMemo(() => monthGrid(ym.jy, ym.jm), [ym])
  const monthItems = grid.filter((c) => c.inMonth).flatMap((c) => byDate.get(c.iso) ?? [])
  const lateInMonth = monthItems.filter((x) => x.lateDays > 0).length
  const colorOf = (it: TrackItem) => (it.lateDays > 0 ? 'var(--im-coral)' : KINDS.find((k) => k.id === it.kind)!.color)
  const dayItems = sel ? byDate.get(sel) ?? [] : []
  const nav = (d: number) => setYm((o) => shiftMonth(o.jy, o.jm, d))

  return (
    <div className="im-page">
      <div className="im-topbar">
        <div>
          <div className="im-page-title"><CalendarDays size={22} style={{ color: 'var(--im-amber)' }} />تقویم کاری</div>
          <div className="im-page-sub">{monthItems.length} مورد در این ماه · <span style={{ color: 'var(--im-coral)', fontWeight: 700 }}>{lateInMonth} تأخیردار</span></div>
        </div>
        <div className="im-actions"><HelpButton topic="calendar" /></div>
      </div>

      <div className="im-cal-bar">
        <div className="im-actions">
          <button className="im-cal-nav" onClick={() => nav(-1)} aria-label="ماه قبل"><ChevronRight size={18} /></button>
          <div className="im-cal-title" aria-live="polite">{JALALI_MONTHS[ym.jm - 1]} {ym.jy}</div>
          <button className="im-cal-nav" onClick={() => nav(1)} aria-label="ماه بعد"><ChevronLeft size={18} /></button>
          <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => { setYm({ jy: t.jy, jm: t.jm }); setSel(today) }}>امروز</button>
        </div>
        <div className="im-actions">
          {KINDS.map((k) => (
            <label key={k.id} className="im-chip" style={{ cursor: 'pointer', margin: 0, padding: '6px 11px', borderColor: on[k.id] ? k.color : undefined, color: on[k.id] ? k.color : 'var(--im-muted)' }}>
              <input type="checkbox" checked={on[k.id]} onChange={(e) => setOn({ ...on, [k.id]: e.target.checked })} style={{ marginInlineEnd: 4 }} /><k.icon size={12} aria-hidden />{k.label}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, alignItems: 'start' }} className="im-cal-layout">
        <div>
          <div className="im-cal" role="grid" aria-label="تقویم">
            {JALALI_WEEKDAYS.map((w) => <div key={w} className="im-cal-wd">{w}</div>)}
            {grid.map((c, k) => {
              const list = byDate.get(c.iso) ?? []
              return (
                <button key={c.iso} role="gridcell" className={`im-cal-day ${c.inMonth ? '' : 'out'} ${c.iso === today ? 'today' : ''} ${c.iso === sel ? 'sel' : ''}`} style={{ ['--i' as string]: k }} onClick={() => setSel(c.iso)} aria-label={`${formatJalali(c.iso)}، ${list.length} مورد`}>
                  <span className="im-cal-d"><span>{c.jd}</span>{list.length > 0 && <span className="cnt">{list.length}</span>}</span>
                  {list.slice(0, 3).map((it) => <span key={it.key} className={`im-cal-ev ${it.done ? 'done' : ''}`} style={{ ['--c' as string]: colorOf(it) }} title={it.title}>{it.title}</span>)}
                  {list.length > 3 && <span className="im-cal-more">+{list.length - 3} مورد دیگر</span>}
                  {list.length > 0 && <span className="dots">{list.slice(0, 6).map((it) => <i key={it.key} style={{ ['--c' as string]: colorOf(it) }} />)}</span>}
                </button>
              )
            })}
          </div>
          <div className="im-legend" style={{ marginTop: 12 }}>
            {KINDS.map((k) => <span key={k.id} style={{ ['--c' as string]: k.color }}><i />{k.label}</span>)}
            <span style={{ ['--c' as string]: 'var(--im-coral)' }}><i />تأخیردار</span>
            <span>انجام‌شده: خط‌خورده</span>
          </div>
        </div>

        <aside className="im-card" style={{ position: 'sticky', top: 0 }} aria-label="برنامهٔ روز انتخاب‌شده">
          <div className="im-section-title">{sel ? formatJalali(sel) : 'یک روز را انتخاب کنید'}<span className="im-chip">{dayItems.length} مورد</span></div>
          {dayItems.length === 0 ? <div className="im-helper">برای این روز مورد سررسیدداری ثبت نشده است.</div> : (
            <div className="im-grid" style={{ gap: 8 }}>
              {dayItems.map((it) => {
                const K = KINDS.find((k) => k.id === it.kind)!
                const d = delayText(it)
                return (
                  <button key={it.key} className="im-check" style={{ textAlign: 'right', cursor: 'pointer', color: 'var(--im-text)', display: 'grid', gap: 3 }} onClick={() => it.issueId && onOpen(it.issueId, it.kind === 'task' ? 'tasks' : it.kind === 'decision' ? 'decisions' : 'overview')}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800, textDecoration: it.done ? 'line-through' : undefined, opacity: it.done ? 0.65 : 1 }}>
                      <span className="im-kind" style={{ ['--c' as string]: K.color }}><K.icon size={12} aria-hidden /></span>{it.title}
                    </span>
                    <span className="im-helper" style={{ marginTop: 0 }}>{it.code && <span className="im-code">{it.code} </span>}{it.statusLabel}{it.assigneeId ? ` · ${users.name(it.assigneeId)}` : ''}</span>
                    <span className="im-helper" style={{ marginTop: 0, color: d.tone === 'late' ? 'var(--im-coral)' : d.tone === 'done' ? 'var(--im-mint)' : undefined, fontWeight: 700 }}>{d.text}</span>
                  </button>
                )
              })}
            </div>
          )}
        </aside>
      </div>
      <style>{`@media (max-width: 1000px) { .im-cal-layout { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
