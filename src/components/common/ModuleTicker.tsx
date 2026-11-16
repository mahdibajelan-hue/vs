import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ChevronUp, Megaphone, Pause, Play } from 'lucide-react'
import { useNotificationStore } from '../../store/useNotificationStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import type { ModuleKey } from '../../store/useModuleStore'
import { useInboxStore } from '../../modules/inbox/store/useInboxStore'
import { SOURCE_MODULE } from '../../modules/inbox/types'
import { useTickerFeed, type Head } from './tickerFeed'
import './moduleTicker.css'

export const TICKER_H = 34
const same = (a: ModuleKey, b: ModuleKey) => a === b || (['issues', 'taskissue'].includes(a) && ['issues', 'taskissue'].includes(b))
const HIDE_KEY = 'rasta.ticker.hidden'

/** the important things of a module for the signed-in person: work waiting for them and the system's alerts */
export function useHeadlines(module: ModuleKey | null): Head[] {
  const notes = useNotificationStore((s) => s.items), projectOf = useNotificationStore((s) => s.projectOf)
  const work = useInboxStore((s) => s.items), setOpen = useInboxStore((s) => s.setOpen)
  const projectId = useProjectContextStore((s) => s.projectId)
  const feeds = useTickerFeed((s) => s.feeds)
  return useMemo(() => {
    if (!module) return []
    const out: Head[] = []
    for (const w of work) {
      if (!same(SOURCE_MODULE[w.source], module) || (projectId && w.projectId && w.projectId !== projectId)) continue
      out.push({ id: `w:${w.key}`, text: w.title, sub: [w.sub, !projectId ? w.projectName : ''].filter(Boolean).join(' · '), tone: w.urgent ? 'bad' : 'warn', open: () => setOpen(true, w.key, 'inbox') })
    }
    for (const n of notes) {
      if (!same(n.module, module) || (projectId && projectOf[n.id] && projectOf[n.id] !== projectId)) continue
      out.push({ id: `n:${n.id}`, text: n.title, sub: n.body, tone: n.severity === 'warn' ? 'bad' : n.severity === 'action' ? 'warn' : 'info', open: () => setOpen(true, null, 'notes') })
    }
    // what the open module published for its own bar (e.g. quality control's CAPA cases)
    const feed = feeds[module]
    if (feed && projectId && feed.projectId === projectId) out.push(...feed.heads)
    const rank = { bad: 0, warn: 1, info: 2 }
    return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 30)
  }, [module, notes, projectOf, work, projectId, setOpen, feeds])
}

/** whether the bar is shown for this module (it has something to say and was not folded away) */
export function useTicker(module: ModuleKey | null) {
  const heads = useHeadlines(module)
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem(HIDE_KEY) === '1' } catch { return false } })
  const fold = (v: boolean) => { setHidden(v); try { sessionStorage.setItem(HIDE_KEY, v ? '1' : '0') } catch { /* private mode */ } }
  return { heads, shown: heads.length > 0 && !hidden, hidden, fold }
}

/**
 * نوار موضوعات مهم — one line above every module: what waits for the person there and what the system warns about,
 * moving like a news ticker from the left of the screen to the right. It stops under the pointer and on keyboard focus,
 * can be paused or folded away, and stands still for people who asked their system for less motion.
 */
export function ModuleTicker({ heads, onFold }: { heads: Head[]; onFold: () => void }) {
  const track = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false), [secs, setSecs] = useState(40)
  useLayoutEffect(() => { const el = track.current; if (el) setSecs(Math.max(18, el.scrollWidth / 2 / 55)) }, [heads]) // a steady 55 px per second whatever the length
  useEffect(() => { void useInboxStore.getState().refreshIfStale() }, [])
  const row = (dup: boolean) => heads.map((h) => (
    <button key={`${dup ? 'd' : ''}${h.id}`} type="button" className={`mtk-item is-${h.tone}`} onClick={h.open} tabIndex={dup ? -1 : 0} aria-hidden={dup || undefined} title={h.sub || undefined}>
      <i aria-hidden /><b>{h.text}</b>{h.sub && <span>{h.sub}</span>}
    </button>
  ))
  return (
    <div className="mtk" role="region" aria-label="موضوعات مهم این ماژول" style={{ height: TICKER_H }}>
      <span className="mtk-tag"><Megaphone size={13} aria-hidden /> مهم <em>{heads.length.toLocaleString('fa-IR')}</em></span>
      <div className={`mtk-view ${paused ? 'is-paused' : ''}`} dir="ltr">
        <div className="mtk-track" ref={track} style={{ '--mtk-d': `${secs}s` } as CSSProperties}>
          <div className="mtk-set" dir="rtl">{row(false)}</div>
          <div className="mtk-set" dir="rtl" aria-hidden>{row(true)}</div>
        </div>
      </div>
      <button type="button" className="mtk-btn" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? 'ادامهٔ حرکت' : 'توقف حرکت'}>{paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}</button>
      <button type="button" className="mtk-btn" onClick={onFold} aria-label="جمع کردن نوار موضوعات مهم"><ChevronUp size={14} aria-hidden /></button>
    </div>
  )
}

/** the folded bar: a small tab that brings it back */
export function TickerTab({ count, onOpen }: { count: number; onOpen: () => void }) {
  return <button type="button" className="mtk-tab" onClick={onOpen} aria-label={`نمایش ${count} موضوع مهم`}><Megaphone size={13} aria-hidden /><em>{count.toLocaleString('fa-IR')}</em></button>
}
