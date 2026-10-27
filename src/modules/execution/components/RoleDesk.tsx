import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { ExecutionModel } from '../lib/useExecutionModel'
import type { ExTab } from '../ExecutionApp'
import { useExecutionStore } from '../store/useExecutionStore'
import { useEpcStore } from '../store/useEpcStore'
import { buildDelays } from '../lib/delays'
import { forecast } from '../lib/forecast'
import { deviationDrivers } from '../lib/progress'
import { daysBetween, jalaliText } from '../lib/periods'
import { EX_ROLE_LABEL_FA, type ExRole } from '../types'
import { fa, pct } from './common'

interface Task { key: string; roles: ExRole[]; title: string; detail: string; tone: 'good' | 'warn' | 'bad'; go: [ExTab, string?] }
const TONE = { good: '#10b981', warn: '#f59e0b', bad: '#ef4444' }
/** price-book titles run to a paragraph: the summary keeps the start */
const short = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n).trim()}…` : t)

/**
 * One line for the director / CEO (where the project stands and what it is waiting for), then the desk of each role the
 * person holds in the project — the site head's reports, the supervision's inbox, the planner's recovery list, the delay
 * analyst's open assessments — each a single click away. An administrator sees every desk.
 */
export function RoleDesk({ m, onGo }: { m: ExecutionModel; onGo: (t: ExTab, s?: string) => void }) {
  const ex = useExecutionStore()
  const ncrs = useEpcStore((x) => x.ncrs)
  const look = useEpcStore((x) => x.lookahead)
  const mine = ex.myRoles(m.projectId)
  const all = ex.can(m.projectId, '*')
  const s = useMemo(() => {
    const fc = forecast({ curve: m.curve, actual: m.approved.overall, planned: m.planned.overall, activities: m.activities, today: m.today })
    const d = buildDelays({ stoppages: m.stoppages, reports: m.reports, today: m.today, noticeDays: m.settings.delayNoticeDays ?? 14, hoursPerDay: m.settings.workdayHours })
    const employer = ((m.settings as unknown as { employerStep?: string }).employerStep === 'binding' ? 'binding' : 'off') as 'binding' | 'off'
    const drivers = deviationDrivers({ activities: m.activities, baselines: m.baselines, blines: m.blines, reports: m.reports, lines: m.lines, asOf: m.today, groupWeights: m.settings.groupWeights, employer }).filter((x) => x.points > 0.0005)
    const waiting = m.reports.filter((r) => r.status === 'submitted' || r.status === 'partially_approved')
    const late = waiting.filter((r) => r.submittedAt && daysBetween(r.submittedAt.slice(0, 10), m.today) > (m.settings.reviewDays ?? 2))
    const returned = m.reports.filter((r) => r.status === 'returned' || r.status === 'incomplete')
    const today = m.reports.filter((r) => r.formKey === 'work' && r.reportDate === m.today)
    const missingToday = (m.settings.expectedFronts ?? []).filter((f) => !today.some((r) => r.front === f))
    const drafts = m.reports.filter((r) => r.formKey === 'work' && r.status === 'draft' && r.reportDate < m.today)
    const openNcr = ncrs.filter((n) => n.projectId === m.projectId && n.status !== 'closed' && n.status !== 'void')
    const lateNcr = openNcr.filter((n) => n.dueDate && n.dueDate < m.today)
    const gaps = m.detected.filter((g) => g.kind !== 'form_missing')
    const thisWeek = look.filter((l) => l.projectId === m.projectId && l.weekStart <= m.today && daysBetween(l.weekStart, m.today) < 7)
    return { fc, d, drivers, waiting, late, returned, today, missingToday, drafts, openNcr, lateNcr, gaps, thisWeek }
  }, [m, ncrs, look])

  const dev = m.planned.overall == null ? null : m.approved.overall - m.planned.overall
  const tone: keyof typeof TONE = dev == null ? 'warn' : dev < -0.1 || (s.fc.slipDays ?? 0) > 60 ? 'bad' : dev < -0.03 ? 'warn' : 'good'
  const head = [
    `پیشرفت تأییدشده ${pct(m.approved.overall)} در برابر برنامهٔ ${pct(m.planned.overall)}`,
    s.fc.slipDays != null ? `پایان پیش‌بینی ${s.fc.forecastFinish ? jalaliText(s.fc.forecastFinish) : '—'} (${s.fc.slipDays > 0 ? `${fa(s.fc.slipDays)} روز دیرتر از برنامه` : 'مطابق برنامه'})` : null,
    s.drivers[0] ? `بیشترین سهم عقب‌افتادگی: ${short(s.drivers[0].activity.title)}` : null,
    s.d.eot.days > 0 ? `${fa(s.d.eot.days, 1)} روز تمدید زمان مستند در دفتر تأخیرات` : null,
    s.openNcr.length ? `${fa(s.openNcr.length)} NCR باز` : null,
  ].filter(Boolean) as string[]

  const tasks: Task[] = [
    { key: 'today', roles: ['contractor', 'site_head'], title: s.missingToday.length ? `گزارش امروز ${fa(s.missingToday.length)} جبهه ثبت نشده` : `گزارش امروز: ${fa(s.today.length)} گزارش`, detail: s.missingToday.length ? s.missingToday.join('، ') : 'همهٔ جبهه‌های موردانتظار گزارش دارند', tone: s.missingToday.length ? 'warn' : 'good', go: ['daily', 'work'] },
    { key: 'ret', roles: ['contractor', 'site_head'], title: `برگشت‌خورده یا نیازمند تکمیل: ${fa(s.returned.length)}`, detail: s.drafts.length ? `${fa(s.drafts.length)} پیش‌نویس روزهای قبل هنوز ارسال نشده` : 'پیش‌نویس جامانده‌ای نیست', tone: s.returned.length ? 'bad' : s.drafts.length ? 'warn' : 'good', go: ['daily', 'work'] },
    { key: 'inbox', roles: ['supervision', 'consultant'], title: `کارتابل بررسی: ${fa(s.waiting.length)} گزارش`, detail: s.late.length ? `${fa(s.late.length)} گزارش بیش از مهلت ${fa(m.settings.reviewDays ?? 2)} روزه` : 'گزارشی از مهلت بررسی نگذشته', tone: s.late.length ? 'bad' : s.waiting.length ? 'warn' : 'good', go: ['review'] },
    { key: 'ncr', roles: ['supervision', 'consultant', 'manager'], title: `NCR باز: ${fa(s.openNcr.length)}`, detail: s.lateNcr.length ? `${fa(s.lateNcr.length)} مورد از مهلت گذشته` : 'NCR مهلت‌گذشته‌ای نیست', tone: s.lateNcr.length ? 'bad' : s.openNcr.length ? 'warn' : 'good', go: ['qc', 'qc'] },
    { key: 'drivers', roles: ['manager', 'planner', 'approver'], title: s.drivers.length ? `عقب‌افتادگی ${dev == null ? '—' : fa(Math.abs(dev * 100), 1)} واحد درصد — ${fa(Math.min(3, s.drivers.length))} عامل اصلی` : 'فعالیتی از برنامه عقب نیست', detail: s.drivers.slice(0, 3).map((x) => short(x.activity.title, 40)).join('، ') || '—', tone: s.drivers.length ? (dev != null && dev < -0.05 ? 'bad' : 'warn') : 'good', go: ['progress'] },
    { key: 'look', roles: ['planner', 'site_head', 'manager'], title: `برنامهٔ سه‌هفته‌ای: ${fa(s.thisWeek.length)} تعهد این هفته`, detail: s.thisWeek.length ? `${fa(s.thisWeek.filter((l) => l.committed).length)} تعهد قطعی` : 'برای این هفته تعهدی ثبت نشده — PPC ساخته نمی‌شود', tone: s.thisWeek.length ? 'good' : 'warn', go: ['plan', 'lookahead'] },
    { key: 'delay', roles: ['claims', 'manager', 'employer', 'supervision'], title: `تأخیرات: ${fa(s.d.unassessed)} رویداد ارزیابی‌نشده`, detail: `${fa(s.d.noticeDue)} در انتظار اخطار · ${fa(s.d.noticeLost)} اخطار از دست‌رفته · ${fa(s.d.concurrentDates.length)} روز تأخیر همزمان`, tone: s.d.noticeLost || s.d.unassessed ? 'bad' : s.d.noticeDue ? 'warn' : 'good', go: ['reports', 'delays'] },
    { key: 'gaps', roles: ['manager', 'site_head', 'supervision'], title: `کسری گزارش‌ها: ${fa(s.gaps.length)}`, detail: 'گزارش دریافت‌نشده، ناقص یا ناسازگار', tone: s.gaps.length > 20 ? 'bad' : s.gaps.length ? 'warn' : 'good', go: ['gaps'] },
  ]
  const shown = all ? tasks : tasks.filter((t) => t.roles.some((r) => mine.includes(r)))

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="im-card" style={{ padding: '12px 14px', borderInlineStart: `4px solid ${TONE[tone]}`, display: 'grid', gap: 4 }}>
        <b style={{ fontSize: 14 }}>خلاصهٔ وضعیت برای مدیریت</b>
        <span style={{ lineHeight: 1.9 }}>{head.join(' · ')}</span>
      </div>
      <div className="im-card" style={{ padding: 12, display: 'grid', gap: 8 }}>
        <b>میز کار نقش‌ها <small className="im-helper" style={{ margin: 0 }}>{all ? 'شما مدیر سامانه هستید؛ میز همهٔ نقش‌ها نمایش داده می‌شود' : mine.length ? `نقش‌های شما: ${mine.map((r) => EX_ROLE_LABEL_FA[r]).join('، ')}` : 'نقشی در این پروژه ندارید'}</small></b>
        {shown.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>برای نقش شما کار باز تعریف نشده است.</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
            {shown.map((t) => (
              <button key={t.key} className="ex-form-tile" style={{ borderInlineStart: `3px solid ${TONE[t.tone]}`, textAlign: 'right' }} onClick={() => onGo(t.go[0], t.go[1])}>
                <b>{t.title}</b><small>{t.detail}</small>
                <small style={{ color: 'var(--im-muted)' }}>{t.roles.map((r) => EX_ROLE_LABEL_FA[r]).join(' · ')} <ArrowLeft size={11} style={{ verticalAlign: -1 }} /></small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
