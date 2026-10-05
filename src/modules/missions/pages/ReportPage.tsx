import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, FileQuestion, Printer, RotateCcw, Undo2 } from 'lucide-react'
import { useMissionStore, engineInputFor } from '../store/useMissionStore'
import { useNav } from '../nav'
import { buildReport, liveFindings } from '../lib/reportBuilder'
import { scoreReport } from '../lib/qualityScore'
import { faNum } from '../lib/fa'
import { Card, Field, Meter, Pill, ScoreGauge, SectionHead } from '../components/ui'
import { FindingCard } from '../components/FindingCard'
import { ReportPaper } from '../components/ReportPaper'
import type { FindingKind } from '../types'

const REVIEW_KINDS: FindingKind[] = ['issue', 'risk', 'action', 'commitment', 'decision']

export function ReportPage({ id }: { id: string }) {
  const { go } = useNav()
  const user = useMissionStore((s) => s.user)
  const bundle = useMissionStore((s) => s.bundle)
  const sets = useMissionStore((s) => s.sets)
  const projects = useMissionStore((s) => s.projects)
  const openMission = useMissionStore((s) => s.openMission)
  const transition = useMissionStore((s) => s.transition)
  const decideFinding = useMissionStore((s) => s.decideFinding)
  const transfer = useMissionStore((s) => s.transfer)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [moving, setMoving] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => {
    openMission(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const fallback = useMemo(() => {
    if (!bundle?.interview) return null
    const input = engineInputFor({ sets, projects, aiProvider: null }, bundle)
    return buildReport({ mission: bundle.mission, projectName: bundle.mission.projectName, objectives: bundle.objectives, findings: bundle.findings, evidence: bundle.evidence, state: bundle.interview.state, set: input.set })
  }, [bundle, sets, projects])

  if (!bundle || bundle.mission.id !== id) return null
  const m = bundle.mission
  const content = bundle.report?.content ?? fallback
  if (!content) {
    return <Card className="mx-auto max-w-xl p-6"><p className="ms-ink2 text-center text-[13px]">هنوز گزارشی برای این مأموریت تولید نشده است.</p></Card>
  }
  const isMgr = !!user?.isManager || m.approverId === user?.id
  const canReview = isMgr && m.status === 'report_review'
  const live = liveFindings(bundle.findings)
  const reviewable = live.filter((f) => REVIEW_KINDS.includes(f.kind))
  const criteria = bundle.report?.qualityBreakdown ?? (fallback && bundle.interview ? scoreReport({ mission: m, objectives: bundle.objectives, findings: bundle.findings, evidence: bundle.evidence, state: bundle.interview.state, content }).criteria : [])
  const seriousUnreviewed = live.filter((f) => (f.kind === 'issue' || f.kind === 'risk') && (f.severity === 'high' || f.severity === 'critical') && !f.transferredId && f.approval !== 'rejected')

  async function decide(action: 'approve_report' | 'return_report', prefix = '') {
    setBusy(true)
    const ok = await transition(action, prefix + comment)
    setBusy(false)
    if (ok) go({ kind: 'mission', id })
  }

  async function bulkTransfer() {
    const targets = reviewable.filter((f) => (f.kind === 'issue' || f.kind === 'risk') && !f.transferredId && f.approval !== 'rejected')
    if (!targets.length || !window.confirm(`${faNum(targets.length)} مسئله/ریسک به سامانه‌های اصلی منتقل شود؟`)) return
    setBulkBusy(true)
    for (const f of targets) await transfer(f.id, f.kind === 'issue' ? 'issue' : 'risk')
    setBulkBusy(false)
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="ms-no-print mb-3 flex flex-wrap items-center justify-between gap-2">
        <button className="ms-btn ms-btn-ghost ms-btn-sm" onClick={() => go({ kind: 'mission', id })}><ArrowRight size={14} aria-hidden /> بازگشت به مأموریت</button>
        <button className="ms-btn ms-btn-sm" onClick={() => window.print()}><Printer size={14} aria-hidden /> چاپ / ذخیره PDF</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3"><ReportPaper mission={m} content={content} report={bundle.report} projectName={m.projectName} /></div>

        <aside className="ms-no-print flex flex-col gap-4 lg:col-span-2">
          <Card className="p-5">
            <div className="flex items-center gap-4">
              <ScoreGauge value={m.qualityScore ?? (criteria.length ? Math.round(criteria.reduce((s, c) => s + (c.score * c.weight) / 100, 0)) : null)} size={84} label="کیفیت" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold">کیفیت گزارش</p>
                <p className="ms-muted text-[11.5px] leading-6">کامل بودن، پوشش اهداف، مسئول و موعد، شواهد</p>
              </div>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {criteria.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-[11.5px]">
                  <span className="w-32 shrink-0 truncate font-bold">{c.label}</span>
                  <span className="flex-1"><Meter value={c.score} tone={c.score >= 80 ? 'good' : c.score >= 60 ? 'warn' : 'bad'} /></span>
                  <span className="w-6 text-left font-black">{faNum(c.score)}</span>
                </li>
              ))}
            </ul>
          </Card>

          {canReview && (
            <Card className="p-5" style={{ borderColor: 'color-mix(in srgb, var(--ms-accent) 50%, transparent)' }}>
              <SectionHead eyebrow="تصمیم مجری طرح" title="تأیید یا بازگشت گزارش" />
              {seriousUnreviewed.length > 0 && (
                <p className="mb-3 rounded-xl px-3 py-2 text-[12px] leading-6" style={{ background: 'color-mix(in srgb, var(--ms-warn) 14%, transparent)' }}>
                  {faNum(seriousUnreviewed.length)} مسئله/ریسک مهم هنوز به سامانه اصلی منتقل یا ردّ نشده است.
                </p>
              )}
              <Field label="نظر شما">
                <textarea className="ms-textarea" style={{ minHeight: 70 }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="برای برگشت یا درخواست اطلاعات الزامی است" />
              </Field>
              <div className="mt-3 flex flex-col gap-2">
                <button className="ms-btn ms-btn-primary" disabled={busy} onClick={() => decide('approve_report')}><Check size={15} aria-hidden /> تأیید نهایی گزارش</button>
                <button className="ms-btn" disabled={busy || !comment.trim()} onClick={() => decide('return_report')}><Undo2 size={14} aria-hidden /> برگشت برای اصلاح</button>
                <button className="ms-btn" disabled={busy || !comment.trim()} onClick={() => decide('return_report', 'اطلاعات تکمیلی لازم است: ')}><FileQuestion size={14} aria-hidden /> درخواست اطلاعات تکمیلی</button>
              </div>
              <p className="ms-muted mt-2 text-[11px] leading-6">با تأیید نهایی، کلیم مأموریت برای تأیید امور اداری ارسال می‌شود.</p>
            </Card>
          )}

          {!canReview && m.status === 'report_review' && <Pill tone="warn">گزارش منتظر تصمیم مجری طرح است</Pill>}
          {m.status === 'ready_for_claim' && <Pill tone="good">گزارش تأیید شد؛ کلیم نزد امور اداری</Pill>}
        </aside>
      </div>

      {/* ------------------------------------------------------------ Issue/Risk/Action review */}
      {reviewable.length > 0 && (
        <Card className="ms-no-print mt-4 p-5">
          <SectionHead
            eyebrow={canReview ? 'لایه کشف و تحلیل' : 'یافته‌ها'}
            title={canReview ? 'تأیید یا رد موارد پیشنهادی و انتقال به سامانه‌های اصلی' : 'یافته‌های استخراج‌شده و وضعیت آنها در سامانه‌های اصلی'}
            sub="این ماژول مالک Issue یا Risk نیست؛ پس از تأیید، مورد در سامانه اصلی ثبت و شناسه آن اینجا نگهداری می‌شود. وضعیت از همان سامانه خوانده می‌شود."
            action={canReview ? <button className="ms-btn ms-btn-sm" disabled={bulkBusy} onClick={bulkTransfer}><RotateCcw size={13} aria-hidden /> انتقال همه Issue/Risk</button> : undefined}
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {reviewable.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                linked={bundle.linked.find((l) => l.findingId === f.id)}
                onDecide={canReview ? (a) => decideFinding(f.id, a) : undefined}
                onTransfer={canReview ? async (target) => { setMoving(f.id); await transfer(f.id, target); setMoving(null) } : undefined}
                transferring={moving === f.id}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
