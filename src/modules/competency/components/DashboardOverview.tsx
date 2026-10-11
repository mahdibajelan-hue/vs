import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowUpLeft, Award, CheckCircle2, ClipboardCheck, Hourglass, ListTodo, Users } from 'lucide-react'
import { ChartTip, HBars, PB, Tile, axisProps, gridProps } from '../../finance/components/charts'
import { KpiCard } from '../../finance/components/fn'
import { formatJalali } from '../../../lib/jalali'
import type { NextStep } from '../lib/nextStep'
import type { CompetencyAssessment } from '../types'
import '../../finance/finance-dashboard.css'

const fa = (n: number) => n.toLocaleString('fa-IR')
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('')
const BINS: { label: string; test: (x: number) => boolean; color: string }[] = [
  { label: 'زیر ۴۰', test: (x) => x < 40, color: PB.coral }, { label: '۴۰–۴۹', test: (x) => x >= 40 && x < 50, color: PB.orange }, { label: '۵۰–۵۹', test: (x) => x >= 50 && x < 60, color: PB.yellow },
  { label: '۶۰–۷۴', test: (x) => x >= 60 && x < 75, color: PB.sky }, { label: '۷۵–۸۴', test: (x) => x >= 75 && x < 85, color: PB.teal }, { label: '۸۵+', test: (x) => x >= 85, color: PB.green },
]

export interface OverviewProps {
  assessments: CompetencyAssessment[]
  scored: { assessment: CompetencyAssessment; overall: number | null }[]
  nextStepById: Map<string, NextStep>
  readyForInterview: CompetencyAssessment[]
  awaitingDocsReview: CompetencyAssessment[]
  topPerRole: { role: string; roleLabel: string; assessment: CompetencyAssessment; overall: number | null }[]
  onOpen: (id: string) => void
  onMyTasks?: () => void
}

/** The module's first screen: four numbers, three pictures and the short lists people act on — what the lists below used to say in a wall of cards. */
export function DashboardOverview({ assessments, scored, nextStepById, readyForInterview, awaitingDocsReview, topPerRole, onOpen, onMyTasks }: OverviewProps) {
  const [queue, setQueue] = useState<'ready' | 'docs'>('ready')
  const total = assessments.length
  const approved = assessments.filter((a) => a.isApproved).length
  const completed = assessments.filter((a) => a.status === 'completed').length
  const mine = assessments.filter((a) => nextStepById.get(a.id)?.mine)
  const funnel = useMemo(() => {
    const docs = assessments.filter((a) => a.selfServiceStatus === 'reviewed' || a.status === 'completed').length
    return [{ label: 'ثبت‌شده', n: total, c: PB.slate }, { label: 'مدارک تأییدشده', n: docs, c: PB.sky }, { label: 'ارزیابی تکمیل‌شده', n: completed, c: PB.blue }, { label: 'تأییدشده', n: approved, c: PB.teal }]
  }, [assessments, total, completed, approved])
  const hist = useMemo(() => BINS.map((b) => ({ name: b.label, n: scored.filter((s) => s.overall != null && b.test(s.overall as number)).length, color: b.color })), [scored])
  const byRole = useMemo(() => {
    const m = new Map<string, number>(); for (const a of assessments) m.set(a.jobRole, (m.get(a.jobRole) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [assessments])
  const roleName = (role: string) => topPerRole.find((t) => t.role === role)?.roleLabel ?? role
  const openToWork = assessments.filter((a) => a.workStatus === 'open_to_work').length
  const scoredN = scored.filter((s) => s.overall != null).length
  const avg = scoredN ? Math.round(scored.reduce((s, x) => s + (x.overall ?? 0), 0) / scoredN) : null
  const queueItems = queue === 'ready' ? readyForInterview : awaitingDocsReview

  return (
    <div className="comp-dash fx-remap">
      <div className="fn-kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <KpiCard i={0} label="کل مصاحبه‌ها" value={fa(total)} sub={`${fa(completed)} تکمیل‌شده`} />
        <KpiCard i={1} label="پذیرفته‌شده" value={fa(approved)} sub={total ? `${fa(Math.round((approved / total) * 100))}٪ از کل` : '—'} tone="good" />
        <KpiCard i={2} label="میانگین امتیاز فنی" value={avg == null ? '—' : `${fa(avg)}٪`} sub={`${fa(scoredN)} نفر دارای نمره`} tone={avg != null && avg >= 70 ? 'good' : 'neutral'} />
        <KpiCard i={3} label="آمادهٔ همکاری" value={fa(openToWork)} sub="Open to work" tone={openToWork ? 'good' : 'neutral'} />
      </div>

      <div className="comp-dash-grid">
        <Tile title="مسیر ارزیابی" hint="چند نفر در هر گام مانده‌اند">
          <div className="comp-funnel">
            {funnel.map((f, i) => (
              <div key={f.label} className="comp-funnel-row">
                <span>{f.label}</span>
                <div className="t"><i style={{ width: `${total ? Math.max(3, (f.n / total) * 100) : 0}%`, background: f.c }} /></div>
                <b>{fa(f.n)}</b>
                <em>{i && funnel[i - 1].n ? `${fa(Math.round((f.n / funnel[i - 1].n) * 100))}٪` : ''}</em>
              </div>
            ))}
          </div>
        </Tile>
        <Tile title="توزیع امتیاز" hint="تعداد متقاضی در هر بازهٔ امتیاز فنی">
          {scoredN === 0 ? <p className="im-helper" style={{ margin: '24px 0', textAlign: 'center' }}>هنوز امتیازی ثبت نشده است.</p> : (
            <div dir="ltr" style={{ height: 190 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={hist} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} /><XAxis dataKey="name" {...axisProps} interval={0} /><YAxis {...axisProps} width={26} allowDecimals={false} tickFormatter={(x: number) => fa(x)} />
              <Tooltip cursor={{ fill: 'color-mix(in srgb, var(--im-text) 5%, transparent)' }} content={<ChartTip unit=" نفر" />} />
              <Bar dataKey="n" name="تعداد" radius={[6, 6, 0, 0]}>{hist.map((h) => <Cell key={h.name} fill={h.color} />)}<LabelList dataKey="n" position="top" formatter={(v) => (Number(v) ? fa(Number(v)) : '')} style={{ fontSize: 10.5, fill: 'var(--im-muted-2)' }} /></Bar>
            </BarChart></ResponsiveContainer></div>
          )}
        </Tile>
        <Tile title="متقاضیان به‌تفکیک شغل" hint="شش شغل پرمتقاضی">
          <HBars fmt={(x) => fa(x)} data={byRole.map(([r, n], i) => ({ name: roleName(r), value: n, color: [PB.teal, PB.blue, PB.yellow, PB.violet, PB.orange, PB.sky][i % 6] }))} />
        </Tile>
      </div>

      <div className="comp-dash-grid2">
        <section className="im-card comp-box">
          <header><h3><ListTodo size={15} aria-hidden /> نیازمند اقدام من <em>{fa(mine.length)}</em></h3>{onMyTasks && <button className="im-btn im-btn-ghost im-btn-sm" onClick={onMyTasks}>کارهای من <ArrowUpLeft size={13} /></button>}</header>
          {mine.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>کاری منتظر شما نیست.</p> : (
            <ul className="comp-rows">
              {mine.slice(0, 6).map((a) => (
                <li key={a.id}><button onClick={() => onOpen(a.id)}>
                  <span className="av">{initials(a.candidateName)}</span>
                  <span className="who"><b>{a.candidateName || 'بدون نام'}</b><small>{a.candidatePosition || '—'}</small></span>
                  <span className="step">{nextStepById.get(a.id)?.label}</span>
                  <ArrowUpLeft size={14} aria-hidden />
                </button></li>
              ))}
              {mine.length > 6 && <li className="more">{fa(mine.length - 6)} مورد دیگر در «کارهای من»</li>}
            </ul>
          )}
        </section>

        <section className="im-card comp-box">
          <header>
            <h3>{queue === 'ready' ? <ClipboardCheck size={15} aria-hidden /> : <Hourglass size={15} aria-hidden />} صف مصاحبه</h3>
            <div className="comp-seg"><button className={queue === 'ready' ? 'on' : ''} onClick={() => setQueue('ready')}>آمادهٔ مصاحبه {fa(readyForInterview.length)}</button><button className={queue === 'docs' ? 'on' : ''} onClick={() => setQueue('docs')}>منتظر تأیید مدارک {fa(awaitingDocsReview.length)}</button></div>
          </header>
          {queueItems.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>{queue === 'ready' ? 'هنوز کسی تأیید مدارک نشده است.' : 'موردی در انتظار بررسی نیست.'}</p> : (
            <ul className="comp-rows">
              {queueItems.slice(0, 6).map((a) => (
                <li key={a.id}><button onClick={() => onOpen(a.id)}>
                  <span className="av">{initials(a.candidateName)}</span>
                  <span className="who"><b>{a.candidateName || 'بدون نام'}</b><small>{a.candidatePosition || '—'}</small></span>
                  <span className="step">{queue === 'ready' ? (a.reviewedAt ? `تأیید ${formatJalali(a.reviewedAt.slice(0, 10))}` : 'تأییدشده') : 'در انتظار بررسی'}</span>
                  <ArrowUpLeft size={14} aria-hidden />
                </button></li>
              ))}
            </ul>
          )}
        </section>

        {topPerRole.length > 0 && (
          <section className="im-card comp-box">
            <header><h3><Award size={15} aria-hidden /> برترین هر شغل</h3></header>
            <ul className="comp-rows">
              {topPerRole.slice(0, 5).map((t) => (
                <li key={t.role}><button onClick={() => onOpen(t.assessment.id)}>
                  <span className="av"><CheckCircle2 size={14} /></span>
                  <span className="who"><b>{t.assessment.candidateName}</b><small>{t.roleLabel}</small></span>
                  <span className="step num">{t.overall != null ? `٪${fa(t.overall)}` : '—'}</span>
                  <ArrowUpLeft size={14} aria-hidden />
                </button></li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <span hidden><Users /></span>
    </div>
  )
}

export interface MyTask { id: string; group: string; title: string; subtitle: string; action: string; onOpen: () => void }

/** «کارهای من»: everything in the module that waits for the signed-in user, grouped by kind, as plain rows in one frame per group. */
export function MyTasksView({ tasks }: { tasks: MyTask[] }) {
  const groups = useMemo(() => { const m = new Map<string, MyTask[]>(); for (const t of tasks) m.set(t.group, [...(m.get(t.group) ?? []), t]); return [...m] }, [tasks])
  if (tasks.length === 0) return <div className="im-card im-empty" style={{ padding: 28 }}>کاری منتظر شما نیست. وقتی ارزیابی، امتیازدهی، تأیید یا تصمیمی به شما ارجاع شود اینجا می‌آید.</div>
  return (
    <div className="comp-dash">
      <p className="im-helper" style={{ margin: 0 }}>{fa(tasks.length)} کار منتظر شماست.</p>
      {groups.map(([g, list]) => (
        <section key={g} className="im-card comp-box">
          <header><h3><ListTodo size={15} aria-hidden /> {g} <em>{fa(list.length)}</em></h3></header>
          <ul className="comp-rows">
            {list.map((t) => (
              <li key={t.id}><button onClick={t.onOpen}>
                <span className="av">{initials(t.title)}</span>
                <span className="who"><b>{t.title}</b><small>{t.subtitle}</small></span>
                <span className="step">{t.action}</span>
                <ArrowUpLeft size={14} aria-hidden />
              </button></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
