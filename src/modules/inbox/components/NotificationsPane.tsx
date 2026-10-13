import { useMemo } from 'react'
import { BellRing, ChevronLeft, PartyPopper } from 'lucide-react'
import { useDeepLinkStore } from '../../../store/useDeepLinkStore'
import { useModuleStore } from '../../../store/useModuleStore'
import { useNotificationStore, type AppNotification } from '../../../store/useNotificationStore'
import { useInboxStore } from '../store/useInboxStore'

const SOURCE_LABEL: Record<string, string> = { missions: 'مأموریت‌ها', issues: 'مدیریت مسائل', risk: 'مدیریت ریسک', finance: 'مدیریت مالی', landacq: 'تحصیل اراضی', change: 'مدیریت تغییرات', material: 'کنترل متریال', execution: 'مدیریت اجرا' }
const SEV = { warn: { color: '#fb7185', label: 'هشدار' }, action: { color: '#38bdf8', label: 'نیازمند اقدام' }, info: { color: '#94a3b8', label: 'اطلاع' } } as const
const DEEP = new Set(['issues', 'risk', 'missions', 'change'])

/** The system messages that used to live in the bell at the top of every page. */
export function NotificationsPane() {
  const items = useNotificationStore((s) => s.items)
  const loaded = useNotificationStore((s) => s.loadedOnce)
  const setOpen = useInboxStore((s) => s.setOpen)
  const groups = useMemo(() => {
    const m = new Map<string, AppNotification[]>()
    for (const n of items) m.set(n.source, [...(m.get(n.source) ?? []), n])
    return [...m.entries()]
  }, [items])
  const go = (n: AppNotification) => {
    setOpen(false)
    if (n.recordId && DEEP.has(n.module)) useDeepLinkStore.getState().request({ module: n.module as 'issues' | 'risk' | 'missions' | 'change', recordId: n.recordId })
    useModuleStore.getState().enterModule(n.module)
  }
  if (!loaded) return <p className="ib-muted ib-pad">در حال بارگذاری…</p>
  if (items.length === 0) return <div className="ib-empty tall"><PartyPopper size={34} /><b>🎉 اعلان تازه‌ای ندارید</b><span>هشدار دیرکرد، تشدید و پیام‌های سیستم اینجا جمع می‌شود.</span></div>
  const c = { warn: items.filter((n) => n.severity === 'warn').length, action: items.filter((n) => n.severity === 'action').length, info: items.filter((n) => n.severity === 'info').length }
  return (
    <div className="ib-notes">
      <div className="ib-note-kpis">{(['warn', 'action', 'info'] as const).map((k) => <span key={k}><i style={{ background: SEV[k].color }} />{SEV[k].label}<b>{c[k].toLocaleString('fa-IR')}</b></span>)}</div>
      {groups.map(([source, list]) => (
        <section key={source}>
          <h3><BellRing size={13} />{SOURCE_LABEL[source] ?? source}<em>{list.length.toLocaleString('fa-IR')}</em></h3>
          <ul>{list.slice(0, 40).map((n) => (
            <li key={n.id}><button onClick={() => go(n)}>
              <i style={{ background: SEV[n.severity].color }} aria-hidden />
              <span><b>{n.title}</b><small>{n.body}</small></span>
              <ChevronLeft size={14} aria-hidden />
            </button></li>
          ))}</ul>
        </section>
      ))}
    </div>
  )
}
