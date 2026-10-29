import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpenText, X } from 'lucide-react'
import type { GuideKey, ModuleGuide } from '../../guides/moduleGuides'

let cache: Record<GuideKey, ModuleGuide> | null = null
const load = () => (cache ? Promise.resolve(cache) : import('../../guides/moduleGuides').then((m) => (cache = m.MODULE_GUIDES)))

/** The module's guide as a panel sliding in from the side the guide button sits on; Esc, the scrim or × closes it. */
export function ModuleGuideDrawer({ guideKey, onClose }: { guideKey: GuideKey; onClose: () => void }) {
  const [guide, setGuide] = useState<ModuleGuide | null>(() => cache?.[guideKey] ?? null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => { let live = true; void load().then((g) => { if (live) setGuide(g[guideKey]) }); return () => { live = false } }, [guideKey])
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('keydown', k); back?.focus?.() }
  }, [])

  return createPortal(
    <div className="mg-root" dir="rtl">
      <div className="mg-scrim" onClick={onClose} aria-hidden />
      <aside className="mg-panel" role="dialog" aria-modal="true" aria-labelledby="mg-title">
        <header className="mg-head">
          <span className="mg-badge" aria-hidden><BookOpenText size={18} /></span>
          <div className="min-w-0 flex-1">
            <small>راهنمای ماژول</small>
            <h2 id="mg-title">{guide?.title ?? 'راهنما'}</h2>
          </div>
          <button ref={closeRef} type="button" className="mg-x" onClick={onClose} aria-label="بستن راهنما"><X size={17} /></button>
        </header>
        <div className="mg-body">
          {!guide ? <p className="mg-wait">در حال بارگذاری…</p> : (
            <>
              <p className="mg-sum">{guide.summary}</p>
              {guide.sections.map((s) => {
                const L = s.steps ? 'ol' : 'ul'
                return (
                  <section key={s.title} className="mg-sec">
                    <h3>{s.title}</h3>
                    {s.text && <p>{s.text}</p>}
                    {s.items && <L className={s.steps ? 'is-steps' : ''}>{s.items.map((t) => <li key={t}>{t}</li>)}</L>}
                  </section>
                )
              })}
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}
