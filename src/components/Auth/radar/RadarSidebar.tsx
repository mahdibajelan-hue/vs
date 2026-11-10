import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'framer-motion'
import { ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, Home, Moon, Pin, PinOff, Search, Sun, X } from 'lucide-react'
import { PROJECT_STATUS_LABEL_FA, PROJECT_STATUS_TONE, type MasterProject } from '../../../modules/masterdata/types'
import type { ModuleKey } from '../../../store/useModuleStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { useAppTheme } from '../../common/useAppTheme'
import { FarinMark } from '../../common/Logo'
import { PROJECT_NAV, type ProjectNavItem } from './projectNav'
import { useRadarPeek } from './radarPeek'
import { menuPeek, type MenuPeek } from './menuPeek'
import './projectMenu.css'

const TONE: Record<'neutral' | 'green' | 'amber' | 'red', string> = { neutral: '#94a3b8', green: '#22c55e', amber: '#f59e0b', red: '#ef4444' }
const GROUPS_KEY = 'farin.menu.groups'
const fa = (n: number) => n.toLocaleString('fa-IR')
const ease = [0.32, 0.72, 0, 1] as const
const RAIL = 64, PANEL = 296

const readClosedGroups = (): string[] => { try { const v = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }

/**
 * منوی پروژه — a floating glass menu on the right (RTL). On a desktop it rests as a slim strip of module icons and
 * widens into the full panel on demand (or stays open when pinned); below 1024px it opens as a drawer.
 * Row values and hover cards read the radar's live figures (radarPeek); nothing is shown until those exist.
 */
export function RadarSidebar({ project, active, canSee, badgeFor, desktop, pinned, onPin, mobileOpen, onMobileClose, onItem, onSwitch, onHome }: {
  project: MasterProject
  active: string
  canSee: (key: ModuleKey) => boolean
  badgeFor: (key: ModuleKey) => number
  /** ≥1024px: the strip is always on screen */
  desktop: boolean
  /** desktop: the panel stays open and the page makes room for it */
  pinned: boolean
  onPin: (v: boolean) => void
  /** below 1024px: the drawer is open */
  mobileOpen: boolean
  onMobileClose: () => void
  onItem: (item: ProjectNavItem) => void
  onSwitch: () => void
  onHome: () => void
}) {
  const [peeking, setPeeking] = useState(false)
  const expanded = desktop ? pinned || peeking : mobileOpen
  const visible = desktop || mobileOpen
  const close = () => { if (desktop) setPeeking(false); else onMobileClose() }

  const tone = TONE[PROJECT_STATUS_TONE[project.status] ?? 'neutral']
  const code = project.projectIdCode || project.projectCode
  const { dark, toggle } = useAppTheme()
  const user = useAuthStore((s) => s.currentUser())
  const peekData = useRadarPeek((s) => s.byProject[project.id])
  useEffect(() => { useRadarPeek.getState().ensure(project) }, [project])

  const [q, setQ] = useState('')
  const [closedGroups, setClosedGroups] = useState<string[]>(readClosedGroups)
  const toggleGroup = (id: string) => setClosedGroups((c) => { const n = c.includes(id) ? c.filter((x) => x !== id) : [...c, id]; try { localStorage.setItem(GROUPS_KEY, JSON.stringify(n)) } catch { /* private mode */ } return n })

  const groups = useMemo(() => {
    const needle = q.trim()
    return PROJECT_NAV.map((g) => ({ ...g, items: g.items.filter((i) => (!i.module || canSee(i.module)) && (!needle || i.label.includes(needle))) })).filter((g) => g.items.length)
  }, [q, canSee])

  // hover: the soft pill follows the pointer; the card (and the strip's label) follow the hovered row
  const [hover, setHover] = useState<{ id: string; top: number } | null>(null)
  const [card, setCard] = useState<{ item: ProjectNavItem; peek: MenuPeek; top: number } | null>(null)
  const cardTimer = useRef<number | undefined>(undefined)
  const asideRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const onRowEnter = (item: ProjectNavItem, el: HTMLElement) => {
    const top = el.getBoundingClientRect().top
    setHover({ id: item.id, top })
    window.clearTimeout(cardTimer.current)
    const p = expanded ? menuPeek(item.module, peekData) : null
    if (!p) { setCard(null); return }
    cardTimer.current = window.setTimeout(() => setCard({ item, peek: p, top }), card ? 0 : 220)
  }
  const onListLeave = () => { setHover(null); window.clearTimeout(cardTimer.current); setCard(null) }
  useEffect(() => () => window.clearTimeout(cardTimer.current), [])
  useEffect(() => { if (!expanded) { setCard(null); setQ('') } }, [expanded])

  // a peeked (unpinned) panel closes on Escape or a click outside it
  useEffect(() => {
    if (!expanded || (desktop && pinned)) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onDown = (e: PointerEvent) => { if (desktop && asideRef.current && !asideRef.current.contains(e.target as Node)) setPeeking(false) }
    window.addEventListener('keydown', onKey); window.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, desktop, pinned])

  const pick = (item: ProjectNavItem) => { onItem(item); if (desktop && !pinned) setPeeking(false) }
  const openSearch = () => { if (desktop) setPeeking(true); window.setTimeout(() => searchRef.current?.focus(), 180) }
  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { const first = groups[0]?.items[0]; if (first) pick(first) }
    if (e.key === 'Escape') { if (q) setQ(''); else close() }
  }

  const width = expanded ? (desktop ? PANEL : Math.min(PANEL + 8, window.innerWidth * 0.88)) : RAIL
  const hoverItem = hover ? PROJECT_NAV.flatMap((g) => g.items).find((i) => i.id === hover.id) : null

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.34, ease }}>
      {/* always mounted and faded with CSS: an exit animation that never completes would leave a blurred layer over the page */}
      {!desktop && <button type="button" className={`pmenu-scrim ${mobileOpen ? 'is-on' : ''}`} onClick={onMobileClose} aria-label="بستن منو" tabIndex={mobileOpen ? 0 : -1} aria-hidden={!mobileOpen || undefined} />}
      <motion.aside
        ref={asideRef}
        dir="rtl"
        className={`pmenu ${expanded ? 'is-open' : 'is-rail'} ${desktop ? 'is-desktop' : 'is-drawer'}`}
        aria-label="منوی پروژه"
        aria-hidden={!visible || undefined}
        initial={false}
        animate={{ width, x: visible ? 0 : width + 24 }}
        onPointerLeave={onListLeave}
      >
        {/* ── head: brand, project, collapse ── */}
        <div className="pmenu-head" style={{ '--tone': tone } as CSSProperties}>
          <button type="button" className="pmenu-logo" onClick={() => (expanded ? close() : setPeeking(true))} aria-label={expanded ? 'بستن منو' : 'باز کردن منو'} aria-expanded={expanded}>
            <FarinMark size={26} />
          </button>
          {desktop && !expanded && (
            <button type="button" className="pmenu-expand" onClick={() => setPeeking(true)} aria-label="باز کردن منو" tabIndex={-1}><ChevronLeft size={12} aria-hidden /></button>
          )}
          <div className="pmenu-proj">
            <p className="pmenu-proj-name" title={project.officialName}>{project.officialName}</p>
            <p className="pmenu-proj-meta"><i aria-hidden />{PROJECT_STATUS_LABEL_FA[project.status] ?? project.status}{code && <span dir="ltr"> · {code}</span>}</p>
          </div>
          <div className="pmenu-head-acts">
            {desktop && <button type="button" className="pmenu-ic" onClick={() => { onPin(!pinned); if (pinned) setPeeking(false) }} aria-pressed={pinned} title={pinned ? 'برداشتن سنجاق' : 'سنجاق کردن منو'} aria-label={pinned ? 'برداشتن سنجاق منو' : 'سنجاق کردن منو'}>{pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>}
            <button type="button" className="pmenu-ic" onClick={desktop ? () => { onPin(false); setPeeking(false) } : onMobileClose} aria-label="بستن منو" title="بستن منو">{desktop ? <ChevronRight size={15} /> : <X size={15} />}</button>
          </div>
        </div>

        {/* ── search + switch ── */}
        <div className="pmenu-search">
          <button type="button" className="pmenu-search-ic" onClick={openSearch} aria-label="جست‌وجو در منو" tabIndex={expanded ? -1 : 0}><Search size={16} aria-hidden /></button>
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} placeholder="جست‌وجوی ماژول…" aria-label="جست‌وجوی ماژول در منو" tabIndex={expanded ? 0 : -1} />
          <button type="button" className="pmenu-switch" onClick={onSwitch} tabIndex={expanded ? 0 : -1} title="تعویض پروژه"><ArrowLeftRight size={13} aria-hidden /><span>تعویض</span></button>
        </div>

        {/* ── modules ── */}
        <LayoutGroup id={`pm-${desktop ? 'd' : 'm'}`}>
          <nav className="pmenu-nav" onPointerLeave={onListLeave}>
            {groups.map((g) => {
              const shut = expanded && !q && closedGroups.includes(g.id)
              return (
                <div key={g.id} className="pmenu-group">
                  <button type="button" className="pmenu-group-h" onClick={() => toggleGroup(g.id)} aria-expanded={!shut} tabIndex={expanded ? 0 : -1}>
                    <span>{g.label}</span><ChevronDown size={13} aria-hidden className={shut ? 'is-shut' : ''} />
                  </button>
                  <AnimatePresence initial={false}>
                    {!shut && (
                      <motion.div key="items" className="pmenu-items" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease }}>
                        {g.items.map((item) => {
                          const n = item.module ? badgeFor(item.module) : 0
                          const on = active === item.id
                          const pv = menuPeek(item.module, peekData)
                          return (
                            <button
                              type="button" key={item.id}
                              className={`pmenu-row ${on ? 'is-on' : ''}`} style={{ '--a': item.accent } as CSSProperties}
                              aria-current={on ? 'page' : undefined}
                              aria-label={`${item.label}${n ? ` — ${fa(n)} مورد نیازمند اقدام` : ''}`}
                              onClick={() => pick(item)}
                              onPointerEnter={(e) => onRowEnter(item, e.currentTarget)}
                              onFocus={(e) => onRowEnter(item, e.currentTarget)}
                              onBlur={onListLeave}
                            >
                              {on && <motion.span layoutId="pmenu-on" className="pmenu-pill-on" aria-hidden />}
                              {hover?.id === item.id && !on && <motion.span layoutId="pmenu-hover" className="pmenu-pill-hover" aria-hidden transition={{ type: 'spring', duration: 0.32, bounce: 0.12 }} />}
                              <span className="pmenu-row-ico"><item.icon size={16} aria-hidden />{n > 0 && <i className="pmenu-dot" aria-hidden>{n > 99 ? '۹۹+' : fa(n)}</i>}</span>
                              <span className="pmenu-row-label">{item.label}</span>
                              {pv && <span className="pmenu-row-val" aria-hidden>{pv.row}</span>}
                              {n > 0 && <span className="pmenu-badge" aria-hidden>{n > 99 ? '۹۹+' : fa(n)}</span>}
                            </button>
                          )
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
            {!groups.length && <p className="pmenu-empty">ماژولی با «{q}» پیدا نشد.</p>}
          </nav>
        </LayoutGroup>

        {/* ── foot: theme, home, person ── */}
        <div className="pmenu-foot">
          <button type="button" className="pmenu-row pmenu-theme" onClick={toggle} role="switch" aria-checked={dark} aria-label="تم تیره">
            <span className="pmenu-row-ico">{dark ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}</span>
            <span className="pmenu-row-label">تم تیره</span>
            <span className="pmenu-toggle" data-on={dark || undefined} aria-hidden><i /></span>
          </button>
          <button type="button" className="pmenu-row" onClick={onHome} aria-label="صفحهٔ اصلی و ابزارهای سازمانی">
            <span className="pmenu-row-ico"><Home size={16} aria-hidden /></span>
            <span className="pmenu-row-label">صفحهٔ اصلی و ابزارهای سازمانی</span>
          </button>
          {user && (
            <div className="pmenu-user">
              <span className="pmenu-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <b>{user.fullName.trim().slice(0, 1)}</b>}<i aria-hidden /></span>
              <span className="pmenu-user-txt"><b>{user.fullName}</b><small>{user.email ?? ''}</small></span>
            </div>
          )}
        </div>
      </motion.aside>

      {/* strip: the hovered module's name (and its count) beside the icon */}
      <AnimatePresence>
        {desktop && !expanded && hover && hoverItem && (
          <motion.div key="tip" className="pmenu-tip" style={{ top: hover.top + 6, right: RAIL + 22 }} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} aria-hidden>
            {hoverItem.label}{hoverItem.module && badgeFor(hoverItem.module) > 0 && <em>{fa(badgeFor(hoverItem.module))}</em>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* panel: a live card beside the row, for modules the radar measures */}
      <AnimatePresence>
        {expanded && card && (
          <motion.div
            key="card" className="pmenu-card" role="tooltip"
            style={{ top: Math.max(12, Math.min(card.top - 18, window.innerHeight - 260)), right: width + 24, '--a': card.item.accent } as CSSProperties}
            initial={{ opacity: 0, x: 10, scale: 0.97, filter: 'blur(4px)' }} animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, x: 6, scale: 0.98 }}
            transition={{ duration: 0.22, ease }}
          >
            <PeekCard item={card.item} peek={card.peek} />
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}

function PeekCard({ item, peek }: { item: ProjectNavItem; peek: MenuPeek }) {
  const max = Math.max(1, ...(peek.bars ?? []).map((b) => b.value))
  return (
    <>
      <p className="pmenu-card-h"><span className="pmenu-card-ico"><item.icon size={14} aria-hidden /></span>{peek.title}</p>
      <p className="pmenu-card-v"><b>{peek.value}</b>{peek.unit && <small>{peek.unit}</small>}</p>
      {peek.note && <p className="pmenu-card-note">{peek.note}</p>}
      {peek.bars && peek.bars.length > 0 && (
        <div className="pmenu-card-bars">
          {peek.bars.map((b, i) => (
            <span key={b.label} className="pmenu-card-bar" title={`${b.label}: ${fa(b.value)}${peek.pct ? '٪' : ''}`}>
              <em>{fa(b.value)}{peek.pct ? '٪' : ''}</em>
              <i><motion.span style={{ background: b.tone }} initial={{ scaleY: 0 }} animate={{ scaleY: (peek.pct ? b.value / 100 : b.value / max) || 0.02 }} transition={{ duration: 0.5, delay: i * 0.04, ease }} /></i>
              <small>{b.label}</small>
            </span>
          ))}
        </div>
      )}
    </>
  )
}
