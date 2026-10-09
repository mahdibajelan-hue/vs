import { useEffect, useRef, useState } from 'react'
import { AlarmClockCheck, Bell, BellRing, CheckCheck, ChevronLeft } from 'lucide-react'
import { useNotificationStore, type AppNotification } from '../../store/useNotificationStore'
import { useModuleStore } from '../../store/useModuleStore'
import { useDeepLinkStore } from '../../store/useDeepLinkStore'
import { ToolbarButton } from './ToolbarButton'

const SOURCE_LABEL: Record<string, string> = { missions: 'مأموریت‌ها', issues: 'مدیریت مسائل', risk: 'مدیریت ریسک', finance: 'مدیریت مالی', landacq: 'مواعد قانونی تملک اراضی' }
const SEVERITY_COLOR = { action: '#38bdf8', warn: '#f59e0b', info: '#94a3b8' } as const
const DEEP_LINKABLE = new Set(['issues', 'risk', 'missions', 'change'])

/** Bell for system messages and things that need the user's action. Polls gently; clicking an item opens that record in its module. */
export function NotificationBell() {
  const items = useNotificationStore((s) => s.items)
  const loadedOnce = useNotificationStore((s) => s.loadedOnce)
  const refresh = useNotificationStore((s) => s.refresh)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void refresh()
    const t = setInterval(() => document.visibilityState === 'visible' && void refresh(), 3 * 60_000)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => {
    if (!open) return
    const off = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', off)
    document.addEventListener('keydown', off)
    return () => {
      document.removeEventListener('pointerdown', off)
      document.removeEventListener('keydown', off)
    }
  }, [open])

  const go = (n: AppNotification) => {
    setOpen(false)
    if (n.recordId && DEEP_LINKABLE.has(n.module)) useDeepLinkStore.getState().request({ module: n.module as 'issues' | 'risk' | 'missions' | 'change', recordId: n.recordId })
    useModuleStore.getState().enterModule(n.module)
  }
  const grouped = Object.entries(
    items.reduce<Record<string, AppNotification[]>>((acc, n) => {
      ;(acc[n.source] ??= []).push(n)
      return acc
    }, {}),
  )

  return (
    <div ref={ref} className="relative">
      <ToolbarButton label={items.length ? `${items.length.toLocaleString('fa-IR')} مورد نیازمند اقدام` : 'اعلان‌ها و کارهای من'} aria-expanded={open} badge={items.length} onClick={() => setOpen((v) => !v)}>
        {items.length ? <BellRing size={16} /> : <Bell size={16} />}
      </ToolbarButton>
      {open && (
        <div className="tb-pop" role="dialog" aria-label="اعلان‌ها و کارهای من" dir="rtl">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border-soft)' }}>
            <p className="m-0 text-sm font-extrabold">کارهای نیازمند اقدام</p>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{items.length.toLocaleString('fa-IR')} مورد</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {!loadedOnce ? (
              <p className="m-0 px-3 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>در حال بارگذاری…</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <CheckCheck size={22} style={{ color: '#34d399' }} />
                <p className="m-0 text-[13px] font-bold">همه‌چیز مرتب است</p>
                <p className="m-0 text-[11.5px] leading-6" style={{ color: 'var(--text-muted)' }}>کاری که منتظر شما باشد (تأیید، پیگیری، گزارش) اینجا ظاهر می‌شود.</p>
              </div>
            ) : (
              grouped.map(([source, list]) => (
                <section key={source} className="mb-1">
                  <p className="m-0 flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10.5px] font-bold" style={{ color: 'var(--text-muted)' }}>
                    <AlarmClockCheck size={12} /> {SOURCE_LABEL[source] ?? source}
                  </p>
                  <ul className="m-0 list-none p-0">
                    {list.slice(0, 8).map((n) => (
                      <li key={n.id}>
                        <button type="button" onClick={() => go(n)} className="tb-item flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-right">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[n.severity] }} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-bold">{n.title}</span>
                            <span className="block text-[11.5px] leading-6" style={{ color: 'var(--text-secondary)' }}>{n.body}</span>
                          </span>
                          <ChevronLeft size={14} className="mt-1 shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
