import type { CSSProperties } from 'react'
import { BookOpenCheck } from 'lucide-react'
import { useOutlook } from '../../lib/useOutlook'
import { Empty } from '../../components/common'
import { OutlookDashboard } from './OutlookDashboard'
import { OutlookActivities } from './OutlookActivities'
import { OutlookCivil } from './OutlookCivil'
import { OutlookSetup } from './OutlookSetup'
import { OutlookGuide } from './OutlookGuide'
import '../../components/outlook/outlook.css'

/** «پیش‌بینی اتمام پروژه» — one forecast, five views; the scenario is shared by them all. */
export function OutlookRouter({ projectId, sub, onGo }: { projectId: string; sub: string; onGo: (tab: string, sub?: string) => void }) {
  const ctx = useOutlook(projectId)
  const go = (to: string) => { if (to.includes(':')) { const [t, s] = to.split(':'); onGo(t, s) } else onGo('outlook', to) }
  if (!ctx.m.activities.length) return <Empty>ابتدا فعالیت‌های پروژه را در «تنظیمات ← فهرست‌ها، مقادیر پیمان…» تعریف کنید.</Empty>
  const noData = ctx.o.historyDays === 0
  const view = sub || 'dash'
  return (
    <div className="olx" style={{ '--olx-a': '#8b5cf6' } as CSSProperties}>
      {view !== 'guide' && <button type="button" className="olx-help" onClick={() => go('guide')}><BookOpenCheck size={15} aria-hidden /> راهنمای گام‌به‌گام</button>}
      {noData && view !== 'guide' && view !== 'setup'
        ? <Empty><b style={{ display: 'block', marginBottom: 6 }}>هنوز گزارش روزانهٔ بررسی‌شده‌ای نیست</b>این بخش از گزارش‌های روزانهٔ کارکرد یاد می‌گیرد: مقدار تأییدشدهٔ هر فعالیت، اکیپ‌های کامل هر بخش کاری، ساعت کار ماشین‌ها، وضعیت هوا و زمین. تا آن زمان می‌توانید از «راهنما» و «تعاریف و تنظیمات» شروع کنید.</Empty>
        : view === 'acts' ? <OutlookActivities ctx={ctx} onGo={go} />
        : view === 'civil' ? <OutlookCivil ctx={ctx} onGo={go} />
        : view === 'setup' ? <OutlookSetup ctx={ctx} />
        : view === 'guide' ? <OutlookGuide ctx={ctx} onGo={go} />
        : <OutlookDashboard ctx={ctx} onGo={go} />}
    </div>
  )
}
