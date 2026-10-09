import { useMemo } from 'react'
import { AlertOctagon, CalendarClock, CheckCircle2, ClipboardCheck, Hourglass } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { useAuthStore } from '../../../store/useAuthStore'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssueWorkStore } from '../store/useIssueWorkStore'
import { isActiveIssue, stageOf, effectiveDue, dayDiff, IM_TASK_STATUS_LABEL_FA } from '../lib/imModel'
import { canVerifyTask } from '../lib/imWorkflow'
import { todayIso } from '../lib/issueRing'
import { IssueCode, StageChip } from '../components/ui'
import type { ImTask } from '../types'

export function MyWorkPage({ onOpen }: { onOpen: (issueId: string, tab?: 'overview' | 'tasks' | 'extensions') => void }) {
  const me = useAuthStore((s) => s.profile?.id) ?? ''
  const issues = useIssuesStore((s) => s.issues)
  const tasks = useIssueWorkStore((s) => s.tasks)
  const exts = useIssueWorkStore((s) => s.extensions)
  const today = todayIso()
  const issueOf = (id: string) => issues.find((i) => i.id === id)

  const data = useMemo(() => {
    const mine = tasks.filter((t) => t.executorId === me && t.status !== 'done' && t.status !== 'cancelled')
    const toVerify = tasks.filter((t) => t.status === 'pending_verification' && canVerifyTask(t, me, false))
    const extToDecide = exts.filter((e) => e.status === 'pending' && e.requestedBy !== me && issueOf(e.issueId)?.approverId === me)
    const toReview = issues.filter((i) => i.approverId === me && ['resolution_review', 'effectiveness_check'].includes(stageOf(i)))
    const mineIssues = issues.filter((i) => isActiveIssue(i) && [i.ownerId, i.followUpId, i.pursuerId].includes(me))
    const bucket = (t: ImTask) => (!t.dueDate ? 'later' : t.dueDate < today ? 'overdue' : t.dueDate === today ? 'today' : dayDiff(today, t.dueDate) <= 7 ? 'week' : 'later')
    const groups = { overdue: [] as ImTask[], today: [] as ImTask[], week: [] as ImTask[], later: [] as ImTask[] }
    for (const t of mine) groups[bucket(t)].push(t)
    return { groups, mine, toVerify, extToDecide, toReview, mineIssues, blocked: mine.filter((t) => t.status === 'blocked') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, exts, issues, me, today])

  const TaskRow = ({ t }: { t: ImTask }) => {
    const i = issueOf(t.issueId)
    return (
      <button className="im-check" style={{ width: '100%', textAlign: 'right', justifyContent: 'space-between', cursor: 'pointer', color: 'var(--im-text)' }} onClick={() => onOpen(t.issueId, 'tasks')}>
        <span style={{ minWidth: 0 }}><b>{t.title}</b><div className="im-helper">{i ? <><span className="im-code">{i.code}</span> {i.title}</> : '—'}</div></span>
        <span className="im-helper" style={{ whiteSpace: 'nowrap' }}>{IM_TASK_STATUS_LABEL_FA[t.status]}{t.dueDate && ` · ${formatJalali(t.dueDate)}`}</span>
      </button>
    )
  }
  const Section = ({ icon, title, count, tone, children }: { icon: React.ReactNode; title: string; count: number; tone?: string; children: React.ReactNode }) => (
    <div className="im-card">
      <div className="im-section-title"><span style={{ display: 'flex', gap: 8, alignItems: 'center', color: tone }}>{icon}{title}</span><span className="im-chip">{count}</span></div>
      <div className="im-checklist">{count === 0 ? <div className="im-helper">موردی نیست.</div> : children}</div>
    </div>
  )

  const g = data.groups
  return (
    <div>
      <div className="im-topbar"><div><div className="im-page-title">کارهای من</div><div className="im-page-sub">آنچه امروز از شما انتظار می‌رود، به ترتیب اولویت</div></div></div>
      <div className="im-grid" style={{ gap: 14 }}>
        <Section icon={<ClipboardCheck size={16} />} title="منتظر تأیید/تصمیم شما" count={data.toVerify.length + data.extToDecide.length + data.toReview.length} tone="var(--im-violet)">
          {data.toVerify.map((t) => <TaskRow key={t.id} t={t} />)}
          {data.extToDecide.map((e) => { const i = issueOf(e.issueId); return (
            <button key={e.id} className="im-check" style={{ textAlign: 'right', cursor: 'pointer', color: 'var(--im-text)', justifyContent: 'space-between' }} onClick={() => onOpen(e.issueId, 'extensions')}>
              <span><b>درخواست تمدید</b> {i && <span className="im-code">{i.code}</span>} <div className="im-helper">{e.reason}</div></span><span className="im-helper">{formatJalali(e.fromDue)} ← {formatJalali(e.toDue)}</span>
            </button>) })}
          {data.toReview.map((i) => (
            <button key={i.id} className="im-check" style={{ textAlign: 'right', cursor: 'pointer', color: 'var(--im-text)', justifyContent: 'space-between' }} onClick={() => onOpen(i.id)}>
              <span><IssueCode issue={i} /> <b>{i.title}</b><div className="im-helper">درخواست تأیید رفع</div></span><StageChip stage={stageOf(i)} />
            </button>))}
        </Section>
        <Section icon={<AlertOctagon size={16} />} title="تأخیردار" count={g.overdue.length} tone="var(--im-coral)">{g.overdue.map((t) => <TaskRow key={t.id} t={t} />)}</Section>
        <Section icon={<CalendarClock size={16} />} title="امروز" count={g.today.length} tone="var(--im-amber)">{g.today.map((t) => <TaskRow key={t.id} t={t} />)}</Section>
        <Section icon={<Hourglass size={16} />} title="این هفته" count={g.week.length}>{g.week.map((t) => <TaskRow key={t.id} t={t} />)}</Section>
        <Section icon={<CheckCircle2 size={16} />} title="بعداً / بدون سررسید" count={g.later.length}>{g.later.map((t) => <TaskRow key={t.id} t={t} />)}</Section>
        <Section icon={<AlertOctagon size={16} />} title="مسدودشده‌های من" count={data.blocked.length} tone="var(--im-coral)">{data.blocked.map((t) => <TaskRow key={t.id} t={t} />)}</Section>
        <Section icon={<ClipboardCheck size={16} />} title="مسائلی که مسئولش هستم" count={data.mineIssues.length}>
          {data.mineIssues.sort((a, b) => effectiveDue(a).localeCompare(effectiveDue(b))).map((i) => (
            <button key={i.id} className="im-check" style={{ textAlign: 'right', cursor: 'pointer', color: 'var(--im-text)', justifyContent: 'space-between' }} onClick={() => onOpen(i.id)}>
              <span><IssueCode issue={i} /> <b>{i.title}</b></span><span className="im-helper">{formatJalali(effectiveDue(i))}</span>
            </button>))}
        </Section>
      </div>
    </div>
  )
}
