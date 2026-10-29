import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { Home, Inbox, LayoutDashboard, Radar, Search, Sun, UserCircle2, X, BookOpenText } from 'lucide-react'

const KEY = 'farin.toolbarGuide.v1'
const seen = () => { try { return localStorage.getItem(KEY) === '1' } catch { return true } }

/** Shown once per browser; reopened from the account menu («راهنمای نوار بالا»). Only one toolbar on screen shows it. */
export const useToolbarGuide = create<{ open: boolean; show: () => void; close: () => void }>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => { try { localStorage.setItem(KEY, '1') } catch { /* private mode */ } set({ open: false }) },
}))

export const TOOLBAR_ACCENTS = { user: '#22d3ee', inbox: '#fb7185', search: '#a78bfa', theme: '#fbbf24', module: '#2dd4bf', guide: '#f472b6', radar: '#22c55e', home: '#38bdf8' } as const

const ROWS = [
  { icon: UserCircle2, c: TOOLBAR_ACCENTS.user, t: 'حساب من', d: 'مشخصات، عکس و امضای شما؛ خروج از حساب. راهنمای همین نوار هم این‌جاست.' },
  { icon: Inbox, c: TOOLBAR_ACCENTS.inbox, t: 'کارتابل', d: 'همهٔ کارهایی که منتظر شماست و هشدارهای سامانه؛ عدد قرمز تعداد آن‌هاست.' },
  { icon: Search, c: TOOLBAR_ACCENTS.search, t: 'جستجو', d: 'پیدا کردن ماژول، پروژه یا کار؛ میانبر Ctrl+K.' },
  { icon: Sun, c: TOOLBAR_ACCENTS.theme, t: 'تم', d: 'جابه‌جایی بین حالت روشن و تیره.' },
  { icon: LayoutDashboard, c: TOOLBAR_ACCENTS.module, t: 'صفحهٔ اول', d: 'بازگشت به صفحهٔ اول همین ماژول.', moduleOnly: true },
    { icon: Radar, c: TOOLBAR_ACCENTS.radar, t: 'رادار', d: 'در ماژول‌های یک پروژه: بازگشت به رادار همان پروژه.', moduleOnly: true },
  { icon: Home, c: TOOLBAR_ACCENTS.home, t: 'خانه', d: 'بازگشت به صفحهٔ اصلی سامانه و فهرست همهٔ ماژول‌ها.', moduleOnly: true },
  { icon: BookOpenText, c: TOOLBAR_ACCENTS.guide, t: 'راهنما', d: 'دکمهٔ رنگی انتهای نوار: توضیح بخش‌های ماژول، روش کار و روش محاسبهٔ شاخص‌ها.', moduleOnly: true },
]

/** «میانبرهای بالای صفحه» — a small card under the bar that names each shortcut once. */
export function ToolbarGuide({ inModule = true }: { inModule?: boolean }) {
  const open = useToolbarGuide((s) => s.open)
  const show = useToolbarGuide((s) => s.show)
  const close = useToolbarGuide((s) => s.close)
  useEffect(() => { if (!seen()) { const t = setTimeout(show, 900); return () => clearTimeout(t) } }, [show])
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [open, close])
  // rendered into <body> (a header with a transform would trap a fixed card); on wide screens placed under the bar
  const anchor = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const bar = anchor.current?.closest('.tb-bar')?.getBoundingClientRect()
      if (!bar || window.innerWidth < 640) return setPos(null)
      const w = Math.min(340, window.innerWidth - 24)
      setPos({ top: bar.bottom + 8, left: Math.max(12, Math.min(bar.left, window.innerWidth - w - 12)) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])
  if (!open) return <span ref={anchor} hidden />
  return <><span ref={anchor} hidden />{createPortal(
    <div className="tb-pop tb-guide" role="dialog" aria-label="میانبرهای بالای صفحه" dir="rtl" style={pos ? { position: 'fixed', top: pos.top, left: pos.left, right: 'auto' } : undefined}>
      <div className="tb-guide-head">
        <b>میانبرهای بالای صفحه</b>
        <button className="tb-guide-x" onClick={close} aria-label="بستن"><X size={15} /></button>
      </div>
      <ul>
        {ROWS.filter((r) => inModule || !r.moduleOnly).map((r) => (
          <li key={r.t} style={{ ['--acc' as string]: r.c }}>
            <span className="tb-ico" aria-hidden><r.icon size={16} /></span>
            <span><b>{r.t}</b><small>{r.d}</small></span>
          </li>
        ))}
      </ul>
      <button className="tb-guide-ok" onClick={close}>متوجه شدم</button>
    </div>, document.body)}</>
}
