import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

/** the app's own entry script, as this page loaded it («…/assets/index-<hash>.js») */
const currentEntry = () => (document.querySelector('script[type="module"][src*="/assets/index-"]') as HTMLScriptElement | null)?.getAttribute('src')?.split('/').pop() ?? null

/**
 * A page left open keeps running the version it was opened with — after a release that can mean old screens and old
 * rules. When the app comes back into view (at most every 2 minutes) the published index.html is read again; if its
 * entry script changed, a small notice offers to load the new version.
 */
export function UpdateNotice() {
  const [fresh, setFresh] = useState(false)
  useEffect(() => {
    const mine = currentEntry()
    if (!mine || import.meta.env.DEV) return
    let last = 0
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 120_000) return
      last = Date.now()
      try {
        const html = await (await fetch(`${import.meta.env.BASE_URL}index.html?v=${Date.now()}`, { cache: 'no-store' })).text()
        const live = /\/assets\/(index-[^"']+\.js)/.exec(html)?.[1]
        if (live && live !== mine) setFresh(true)
      } catch { /* offline: try again later */ }
    }
    const t = window.setInterval(check, 10 * 60_000)
    document.addEventListener('visibilitychange', check)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', check) }
  }, [])
  if (!fresh) return null
  return (
    <div role="status" dir="rtl" style={{ position: 'fixed', insetInline: 12, bottom: 'calc(12px + env(safe-area-inset-bottom))', zIndex: 9999, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 14, background: 'var(--bg-panel-solid, #0f172a)', color: 'var(--text-primary, #e2e8f0)', border: '1px solid var(--border-soft, rgba(148,163,184,.3))', boxShadow: '0 12px 32px -12px rgba(0,0,0,.45)', fontSize: 13 }}>
        <span>نسخهٔ تازهٔ سامانه منتشر شده است.</span>
        <button type="button" onClick={() => window.location.reload()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, border: 0, background: '#2563eb', color: '#fff', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}><RefreshCw size={14} /> بارگذاری نسخهٔ تازه</button>
        <button type="button" onClick={() => setFresh(false)} aria-label="بستن" style={{ border: 0, background: 'transparent', color: 'inherit', opacity: 0.7, cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>
    </div>
  )
}
