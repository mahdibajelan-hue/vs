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
import { PlotsTab } from './parcel/PlotsTab'
import { ApprovalStrip } from './ApprovalStrip'
import { useAuthStore } from '../platform'
import { APPROVAL_LABEL, ROLE_LABEL, canEditData } from '../lib/approval'
import { Lock } from 'lucide-react'

const TABS = [
  { key: 'summary', label: 'خلاصه' },
  { key: 'workflow', label: 'مراحل' },
  { key: 'owners', label: 'مالکین' },
  { key: 'plots', label: 'قطعات (UTM)' },
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
  const role = useLandStore((s) => s.data?.myRole ?? null)
  const isAdmin = !!useAuthStore((s) => s.profile?.isAdmin)
  const editable = canEditData(p, role, isAdmin, true)
  // legal officers may still edit the legal dates; everything else is read-only outside the contractor's draft stage
  const readOnly = !editable && !(role === 'employer_legal' && tab === 'legal')
  return (
    <>
      <Drawer
        onClose={onClose}
        title={<span className="la-km">{fmtKmRange(p.kmStart, p.kmEnd)}</span>}
        badge={<>{a.status !== 'critical' && <StatusBadge status={a.status} />}<LevelBadge level={a.crit.level} score={a.crit.score} /></>}
        subtitle={`${p.code}${p.title ? ` · ${p.title}` : ''} · ${OWNERSHIP_LABEL[p.ownershipClass]} · ${LAND_TYPE_LABEL[p.landType]}`}
        footer={<button className="la-btn la-btn-danger la-btn-sm me-auto" onClick={() => setConfirm(true)}><Trash2 size={13} /> حذف قطعه</button>}
      >
        <ApprovalStrip p={p} />
        <div className="la-tabs sticky top-0 z-10 border-b px-3" style={{ borderColor: 'var(--la-line)', background: 'var(--la-surface)' }} role="tablist">
          {TABS.map((t) => {
            const alarms = t.key === 'legal' ? a.clocks.filter((c) => c.status === 'overdue' || c.status === 'due_soon').length : 0
            return <button key={t.key} className="la-tab" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>{t.label}{alarms > 0 && <span className="la-num rounded-full px-1.5 text-[10.5px] font-bold" style={{ background: '#ef4444', color: '#fff' }}>{alarms.toLocaleString('fa-IR')}</span>}</button>
          })}
        </div>
        {readOnly && (
          <div role="alert" className="mx-5 mt-4 flex gap-3 rounded-xl p-3.5" style={{ background: 'color-mix(in srgb, #f59e0b 12%, var(--la-surface))', border: '1px solid color-mix(in srgb, #f59e0b 45%, transparent)' }}>
            <Lock size={17} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} aria-hidden />
            <p className="m-0 text-[12.5px] leading-7">
              <b>امکان تغییر اطلاعات این قطعه وجود ندارد.</b>{' '}
              {role === 'contractor' || !role
                ? `قطعه در مرحلهٔ «${APPROVAL_LABEL[p.approvalStatus]}» است و پس از ارسال برای بررسی قفل می‌شود؛ برای اصلاح، مرحلهٔ بعدی باید آن را «برگشت برای اصلاح» بدهد.`
                : `نقش شما «${ROLE_LABEL[role]}» است و فقط بررسی، تأیید یا برگشت‌دادن را در مرحلهٔ خودتان انجام می‌دهید؛ ورود و اصلاح داده با پیمانکار است و فقط تا پیش از ارسال برای بررسی ممکن است.`}
            </p>
          </div>
        )}
        <fieldset key={tab} className="la-rise" disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          {tab === 'summary' && <SummaryTab a={a} />}
          {tab === 'workflow' && <WorkflowTab a={a} />}
          {tab === 'owners' && <OwnersTab a={a} />}
          {tab === 'docs' && <DocsTab a={a} />}
          {tab === 'legal' && <LegalTab a={a} />}
          {tab === 'schedule' && <ScheduleTab a={a} />}
          {tab === 'links' && <LinksTab a={a} />}
          {tab === 'plots' && <PlotsTab a={a} />}
        </fieldset>
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
