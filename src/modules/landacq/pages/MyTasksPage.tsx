import { useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck } from 'lucide-react'
import { useAuthStore } from '../platform'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import { ACTION_LABEL, ROLE_HINT, ROLE_LABEL } from '../lib/approval'
import { OWNER_LABEL, actionOf, buildTasks, tasksFor, type TaskLevel, type TaskOwner } from '../lib/myTasks'
import { faNum } from '../lib/fa'
import { Card, EmptyState } from '../components/ui'
import { NoRoute } from '../components/shared'

const OWNERS: TaskOwner[] = ['contractor', 'consultant', 'employer_legal', 'project_manager']
const COLOR: Record<TaskLevel, string> = { bad: '#ef4444', warn: '#f59e0b', info: '#38bdf8' }
const LEVEL_FA: Record<TaskLevel, string> = { bad: 'فوری', warn: 'در انتظار', info: 'اطلاع' }

/**
 * «کارهای من»: what is waiting for the signed-in user, by the role they hold in this project. Each role sees its own queue; the executive (مجری طرح)
 * and admins see everyone's and may act on any of it. Buttons appear only for actions the server would accept.
 */
export function MyTasksPage() {
  const data = useLandStore((s) => s.data)
  const select = useLandStore((s) => s.selectParcel)
  const selectCrossing = useLandStore((s) => s.selectCrossing)
  const setTab = useLandStore((s) => s.setTab)
  const review = useLandStore((s) => s.review)
  const isAdmin = !!useAuthStore((s) => s.profile?.isAdmin)
  const { byId, crossings, today } = useLandAnalysis()
  const [filter, setFilter] = useState<TaskOwner | 'all'>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const role = data?.myRole ?? null
  const all = useMemo(() => buildTasks([...byId.values()], crossings, today), [byId, crossings, today])
  const mine = useMemo(() => tasksFor(all, role, isAdmin), [all, role, isAdmin])
  if (!data?.route) return <NoRoute />
  const sees = isAdmin || role === 'executive' || !role
  const shown = filter === 'all' ? mine : mine.filter((t) => t.owner === filter)
  const count = (o: TaskOwner) => mine.filter((t) => t.owner === o).length

  const open = (t: { parcelId?: string; crossingId?: string }) => {
    if (t.crossingId) {
      setTab('crossings')
      selectCrossing(t.crossingId)
    } else if (t.parcelId) select(t.parcelId)
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <div className="la-card flex flex-wrap items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: 'var(--la-accent-soft)', color: 'var(--la-accent)' }}><ClipboardCheck size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[14px] font-black">{role ? `نقش شما: ${ROLE_LABEL[role]}` : isAdmin ? 'مدیر سامانه' : 'نقشی در این پروژه برای شما تعریف نشده'}</p>
          <p className="la-eyebrow m-0 leading-6">{role ? ROLE_HINT[role] : isAdmin ? 'همهٔ کارها را می‌بینید و می‌توانید هر اقدامی را انجام دهید.' : 'فهرست همهٔ کارها فقط برای مشاهده است؛ برای انجام کار، مدیر سامانه نقش شما را در «تنظیمات» تعریف کند.'}</p>
        </div>
        <b className="la-num text-[22px]" style={{ color: mine.length ? 'var(--la-accent)' : 'var(--la-ok)' }}>{faNum(mine.length)}</b>
      </div>

      {sees && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="فیلتر بر اساس نقش">
          <button className={`la-btn la-btn-sm ${filter === 'all' ? 'la-btn-primary' : ''}`} onClick={() => setFilter('all')}>همه ({faNum(mine.length)})</button>
          {OWNERS.map((o) => <button key={o} className={`la-btn la-btn-sm ${filter === o ? 'la-btn-primary' : ''}`} onClick={() => setFilter(o)}>{OWNER_LABEL[o]} ({faNum(count(o))})</button>)}
        </div>
      )}

      <Card title="کارهای در انتظار" hint="اول موارد فوری؛ روی هر ردیف بزنید تا قطعه یا عبور باز شود" pad={false}>
        {shown.length === 0 ? <EmptyState icon={<CheckCircle2 size={20} />} title="کار بازی نیست" text="هر چیزی که منتظر شما باشد اینجا می‌آید." /> : (
          <ul className="m-0 list-none p-0">
            {shown.slice(0, 200).map((t) => {
              const status = t.parcelId ? byId.get(t.parcelId)?.parcel.approvalStatus : undefined
              const act = status ? actionOf(t, status, role, isAdmin) : undefined
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5" style={{ borderColor: 'var(--la-line)' }}>
                  <button className="flex min-w-0 flex-1 items-start gap-2.5 text-start" onClick={() => open(t)}>
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR[t.level] }} aria-label={LEVEL_FA[t.level]} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold leading-6">{t.title}</span>
                      <span className="la-eyebrow block leading-5">{t.detail}</span>
                    </span>
                  </button>
                  {sees && <span className="la-badge" style={{ '--c': '#94a3b8' } as React.CSSProperties}><i /> {OWNER_LABEL[t.owner]}</span>}
                  {act && (
                    <button className="la-btn la-btn-sm la-btn-primary" disabled={busy === t.id} onClick={async () => { setBusy(t.id); await review(t.parcelId!, act); setBusy(null) }}>{ACTION_LABEL[act]}</button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
