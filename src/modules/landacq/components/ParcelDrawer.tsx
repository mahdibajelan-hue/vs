import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useLandStore } from '../store/useLandStore'
import type { Analysis } from '../lib/kpis'
import { fmtKmRange } from '../lib/dates'
import { LAND_TYPE_LABEL, OWNERSHIP_LABEL } from '../lib/labels'
import { Drawer, ConfirmDialog, LevelBadge, StatusBadge } from './ui'
import { SummaryTab } from './parcel/SummaryTab'
import { WorkflowTab } from './parcel/WorkflowTab'
import { OwnersTab } from './parcel/OwnersTab'
import { DocsTab } from './parcel/DocsTab'
import { ScheduleTab } from './parcel/ScheduleTab'
import { LinksTab } from './parcel/LinksTab'
import { LegalTab } from './parcel/LegalTab'

const TABS = [
  { key: 'summary', label: 'خلاصه' },
  { key: 'workflow', label: 'مراحل' },
  { key: 'owners', label: 'مالکین' },
  { key: 'docs', label: 'اسناد' },
  { key: 'legal', label: 'مواعد قانونی' },
  { key: 'schedule', label: 'برنامه' },
  { key: 'links', label: 'اتصال' },
] as const
type Tab = (typeof TABS)[number]['key']

/** Side panel for one parcel — opened by clicking a block on the map, the ribbon or any list. */
export function ParcelDrawer({ a, onClose }: { a: Analysis; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('summary')
  const [confirm, setConfirm] = useState(false)
  const del = useLandStore((s) => s.deleteParcel)
  const p = a.parcel
  return (
    <>
      <Drawer
        onClose={onClose}
        title={<span className="la-km">{fmtKmRange(p.kmStart, p.kmEnd)}</span>}
        badge={<>{a.status !== 'critical' && <StatusBadge status={a.status} />}<LevelBadge level={a.crit.level} score={a.crit.score} /></>}
        subtitle={`${p.code}${p.title ? ` · ${p.title}` : ''} · ${OWNERSHIP_LABEL[p.ownershipClass]} · ${LAND_TYPE_LABEL[p.landType]}`}
        footer={<button className="la-btn la-btn-danger la-btn-sm me-auto" onClick={() => setConfirm(true)}><Trash2 size={13} /> حذف قطعه</button>}
      >
        <div className="la-tabs sticky top-0 z-10 border-b px-3" style={{ borderColor: 'var(--la-line)', background: 'var(--la-surface)' }} role="tablist">
          {TABS.map((t) => {
            const alarms = t.key === 'legal' ? a.clocks.filter((c) => c.status === 'overdue' || c.status === 'due_soon').length : 0
            return <button key={t.key} className="la-tab" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>{t.label}{alarms > 0 && <span className="la-num rounded-full px-1.5 text-[10.5px] font-bold" style={{ background: '#ef4444', color: '#fff' }}>{alarms.toLocaleString('fa-IR')}</span>}</button>
          })}
        </div>
        <div key={tab} className="la-rise">
          {tab === 'summary' && <SummaryTab a={a} />}
          {tab === 'workflow' && <WorkflowTab a={a} />}
          {tab === 'owners' && <OwnersTab a={a} />}
          {tab === 'docs' && <DocsTab a={a} />}
          {tab === 'legal' && <LegalTab a={a} />}
          {tab === 'schedule' && <ScheduleTab a={a} />}
          {tab === 'links' && <LinksTab a={a} />}
        </div>
      </Drawer>
      {confirm && (
        <ConfirmDialog
          title="حذف قطعه"
          confirmLabel="حذف قطعه"
          description={<>قطعهٔ <b>{p.code}</b> با مراحل، مالکین و اسناد ثبت‌شده‌اش حذف می‌شود. ریسک/مسئلهٔ منتقل‌شده در ماژول‌های دیگر باقی می‌ماند.</>}
          onClose={() => setConfirm(false)}
          onConfirm={async () => { await del(p.id); setConfirm(false); onClose() }}
        />
      )}
    </>
  )
}
