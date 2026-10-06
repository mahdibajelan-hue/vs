import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, CircleAlert, Plus, Send } from 'lucide-react'
import { useMissionStore, engineInputFor } from '../store/useMissionStore'
import { useNav } from '../nav'
import { buildReport, liveFindings, OVERALL_STATUS_LABEL } from '../lib/reportBuilder'
import { reportGaps, scoreReport } from '../lib/qualityScore'
import { planTopics, topicTitle } from '../lib/questionSets'
import { faNum } from '../lib/fa'
import { Card, Meter, Pill, ScoreGauge, SectionHead } from '../components/ui'
import { SignaturePad } from '../platform'
import { FindingCard } from '../components/FindingCard'
import { FindingEditor } from '../components/FindingEditor'
import { EvidencePanel } from '../components/EvidencePanel'
import { FINDING_KIND_LABEL, OBJECTIVE_STATUS_LABEL, type Finding, type FindingKind, type ObjectiveStatus } from '../types'

const GROUPS: FindingKind[] = ['issue', 'risk', 'action', 'commitment', 'decision']

export function SummaryPage({ id }: { id: string }) {
  const { go } = useNav()
  const bundle = useMissionStore((s) => s.bundle)
  const sets = useMissionStore((s) => s.sets)
  const projects = useMissionStore((s) => s.projects)
  const openMission = useMissionStore((s) => s.openMission)
  const editFinding = useMissionStore((s) => s.editFinding)
  const removeFinding = useMissionStore((s) => s.removeFinding)
  const addManualFinding = useMissionStore((s) => s.addManualFinding)
  const setObjective = useMissionStore((s) => s.setObjective)
  const reopenInterview = useMissionStore((s) => s.reopenInterview)
  const jumpToTopic = useMissionStore((s) => s.jumpToTopic)
  const submitReport = useMissionStore((s) => s.submitReport)
  const signature = useMissionStore((s) => s.signature)
  const loadSignature = useMissionStore((s) => s.loadSignature)
  const saveSignature = useMissionStore((s) => s.saveSignature)
  const [savingSig, setSavingSig] = useState(false)
  const [editing, setEditing] = useState<Finding | 'new' | null>(null)
  const [sending, setSending] = useState(false)
  const [ack, setAck] = useState(false)

  useEffect(() => {
    openMission(id)
    loadSignature()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const live = bundle ? liveFindings(bundle.findings) : []
  const calc = useMemo(() => {
    if (!bundle?.interview) return null
    const input = engineInputFor({ sets, projects, aiProvider: null }, bundle)
    const content = buildReport({ mission: bundle.mission, projectName: bundle.mission.projectName, objectives: bundle.objectives, findings: bundle.findings, evidence: bundle.evidence, state: bundle.interview.state, set: input.set })
    const q = scoreReport({ mission: bundle.mission, objectives: bundle.objectives, findings: bundle.findings, evidence: bundle.evidence, state: bundle.interview.state, content })
    const { mandatory } = planTopics(input.set, { mission: bundle.mission, objectives: bundle.objectives, projectType: projects.find((p) => p.id === bundle.mission.masterProjectId)?.projectType ?? '', projectName: bundle.mission.projectName, answers: {}, openFindingKinds: [] })
    const gaps = reportGaps({ mission: bundle.mission, objectives: bundle.objectives, findings: bundle.findings, evidence: bundle.evidence, state: bundle.interview.state, content }, mandatory)
    return { content, q, gaps, set: input.set }
  }, [bundle, sets, projects])

  if (!bundle || bundle.mission.id !== id || !calc || !bundle.interview) return null
  const m = bundle.mission
  const { content, q, gaps, set } = calc
  const blockers = gaps.filter((g) => g.severity === 'blocker')
  const warnings = gaps.filter((g) => g.severity === 'warning')
  const achieved = bundle.objectives.filter((o) => o.status === 'achieved').length
  const needFollow = bundle.objectives.filter((o) => ['partial', 'not_achieved', 'follow_up'].includes(o.status)).length

  async function fixTopic(key?: string) {
    await reopenInterview()
    if (key) await jumpToTopic(key)
    go({ kind: 'interview', id })
  }

  async function send() {
    setSending(true)
    const ok = await submitReport()
    setSending(false)
    if (ok) go({ kind: 'mission', id })
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <div>
          <button className="ms-btn ms-btn-ghost ms-btn-sm mb-2" onClick={() => go({ kind: 'mission', id })}><ArrowRight size={14} aria-hidden /> بازگشت</button>
          <p className="ms-eyebrow mb-1">پیش از ارسال به مدیر</p>
          <h1 className="text-[22px] font-black leading-9">مرور و تأیید خلاصه گزارش</h1>
          <p className="ms-ink2 text-[12.5px] leading-7">این همان چیزی است که از گفته‌های شما استخراج شد. هر مورد را اصلاح کنید؛ سپس برای مجری طرح ارسال کنید.</p>
        </div>

        <Card className="p-5">
          <SectionHead eyebrow="جمع‌بندی" title={`وضعیت کلی: ${OVERALL_STATUS_LABEL[content.overallStatus]}`} />
          <p className="text-[13px] leading-8">{content.executiveSummary}</p>
        </Card>

        <Card className="p-5">
          <SectionHead eyebrow="اهداف مأموریت" title={`${faNum(achieved)} از ${faNum(bundle.objectives.length)} هدف محقق شد`} sub={needFollow ? `${faNum(needFollow)} هدف نیازمند پیگیری است` : undefined} />
          <ul className="flex flex-col gap-3">
            {bundle.objectives.map((o) => (
              <li key={o.id} className="ms-card-flat p-3.5">
                <p className="text-[13px] font-bold leading-7">{o.title}</p>
                {o.measure && <p className="ms-muted text-[11.5px] leading-6">معیار: {o.measure}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="وضعیت تحقق">
                  {(['achieved', 'partial', 'follow_up', 'not_achieved'] as ObjectiveStatus[]).map((s) => (
                    <button key={s} className={`ms-chip ${o.status === s ? 'is-on' : ''}`} aria-pressed={o.status === s} style={{ padding: '4px 11px', fontSize: 11.5 }} onClick={() => setObjective(o.id, { status: s })}>{OBJECTIVE_STATUS_LABEL[s]}</button>
                  ))}
                </div>
                {o.status === 'pending' && <p className="mt-1.5 text-[11.5px] font-bold" style={{ color: 'var(--ms-bad)' }}>وضعیت این هدف مشخص نشده است.</p>}
                {o.resultNote && <p className="ms-ink2 mt-1.5 text-[11.5px] leading-6">«{o.resultNote}»</p>}
              </li>
            ))}
          </ul>
        </Card>

        {GROUPS.map((k) => {
          const list = live.filter((f) => f.kind === k)
          return (
            <Card key={k} className="p-5">
              <SectionHead eyebrow={FINDING_KIND_LABEL[k]} title={`${faNum(list.length)} مورد`} action={<button className="ms-btn ms-btn-sm" onClick={() => setEditing('new')}><Plus size={13} aria-hidden /> افزودن</button>} />
              {list.length === 0 ? <p className="ms-muted text-[12.5px]">موردی ثبت نشده است.</p> : (
                <div className="flex flex-col gap-3">
                  {list.map((f) => <FindingCard key={f.id} finding={f} onEdit={() => setEditing(f)} onRemove={() => removeFinding(f.id)} />)}
                </div>
              )}
            </Card>
          )
        })}

        <Card className="p-5">
          <SectionHead eyebrow="شواهد" title={`${faNum(bundle.evidence.length)} مدرک پیوست شده`} />
          <EvidencePanel missionId={id} kinds={['photo', 'file', 'minutes', 'letter', 'technical', 'note']} topicKey="" compact />
        </Card>
      </div>

      {/* ----------------------------------------------------------------------- quality rail */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-0 lg:self-start">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <ScoreGauge value={q.score} size={96} label="کیفیت" />
            <div>
              <p className="text-[13px] font-extrabold">امتیاز کیفیت گزارش</p>
              <p className="ms-muted text-[11.5px] leading-6">{q.score >= 80 ? 'گزارش کامل و قابل اتکا' : q.score >= 60 ? 'قابل قبول؛ چند نکته برای بهتر شدن' : 'نیازمند تکمیل پیش از ارسال'}</p>
            </div>
          </div>
          <ul className="mt-4 flex flex-col gap-2.5">
            {q.criteria.map((c) => (
              <li key={c.key}>
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="font-bold">{c.label}</span>
                  <span className="font-black" style={{ color: c.score >= 80 ? 'var(--ms-good)' : c.score >= 60 ? 'var(--ms-warn)' : 'var(--ms-bad)' }}>{faNum(c.score)}</span>
                </div>
                <Meter value={c.score} tone={c.score >= 80 ? 'good' : c.score >= 60 ? 'warn' : 'bad'} />
                {c.score < 70 && (
                  <button className="ms-muted mt-1 text-right text-[11px] leading-5 hover:underline" onClick={() => fixTopic(c.topicKey)}>{c.hint}</button>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <SectionHead eyebrow="پیش از ارسال" title={gaps.length ? 'کمبودهای گزارش' : 'گزارش کامل است'} />
          {gaps.length === 0 ? (
            <p className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--ms-good)' }}><Check size={15} aria-hidden /> هیچ کمبودی پیدا نشد.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {gaps.map((g, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] leading-6">
                  {g.severity === 'blocker' ? <CircleAlert size={14} className="mt-1.5 shrink-0" style={{ color: 'var(--ms-bad)' }} aria-hidden /> : <AlertTriangle size={14} className="mt-1.5 shrink-0" style={{ color: 'var(--ms-warn)' }} aria-hidden />}
                  <span className="min-w-0 flex-1">
                    {g.topicKey && <b>{topicTitle(set, g.topicKey)}: </b>}
                    {g.text}
                  </span>
                  {g.topicKey && <button className="ms-btn ms-btn-ghost ms-btn-sm shrink-0" onClick={() => fixTopic(g.topicKey)}>رفع</button>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--ms-line)' }}>
            <p className="text-[12.5px] font-extrabold">امضای شما</p>
            <p className="ms-muted mb-2 text-[11px] leading-6">با ارسال، این امضا پای گزارش درج می‌شود. امضای نمونه در «پروفایل» هم نگه‌داری می‌شود.</p>
            {signature === undefined ? (
              <p className="ms-muted text-[11.5px]">در حال بارگذاری امضا…</p>
            ) : (
              <div className="ms-root" style={{ background: 'transparent' }}>
                <SignaturePad
                  value={signature}
                  saving={savingSig}
                  saveLabel="ذخیره امضا"
                  onSave={async (png) => {
                    setSavingSig(true)
                    await saveSignature(png)
                    setSavingSig(false)
                  }}
                />
              </div>
            )}
          </div>
          {blockers.length === 0 && warnings.length > 0 && (
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12px] leading-6">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1.5" />
              با وجود {faNum(warnings.length)} هشدار، می‌خواهم گزارش را ارسال کنم.
            </label>
          )}
          <button className="ms-btn ms-btn-primary mt-4 w-full" disabled={sending || !signature || blockers.length > 0 || (warnings.length > 0 && !ack) || m.status === 'report_review'} onClick={send}>
            <Send size={15} aria-hidden /> {sending ? 'در حال ارسال…' : 'تأیید و ارسال برای مجری طرح'}
          </button>
          <button className="ms-btn ms-btn-ghost mt-2 w-full" onClick={() => fixTopic()}>بازگشت به گفت‌وگو</button>
          <p className="ms-muted mt-3 text-[11px] leading-6">{blockers.length ? `${faNum(blockers.length)} مورد اجباری باقی مانده است.` : !signature ? 'برای ارسال، ابتدا امضای خود را ثبت کنید.' : 'پس از ارسال، تا تصمیم مجری طرح نمی‌توانید گزارش را تغییر دهید.'}</p>
        </Card>
        <Pill tone="info">پیش‌نمایش گزارش رسمی پس از ارسال در دسترس مدیر است</Pill>
      </aside>

      {editing && (
        <FindingEditor
          finding={editing === 'new' ? null : editing}
          topics={bundle.interview.state.plan.map((k) => ({ key: k, title: topicTitle(set, k) }))}
          onClose={() => setEditing(null)}
          onDelete={editing !== 'new' ? () => { removeFinding(editing.id); setEditing(null) } : undefined}
          onSave={(patch) => {
            if (editing === 'new') addManualFinding({ kind: patch.kind!, title: patch.title!, topicKey: patch.topicKey ?? 'issues_risks', severity: patch.severity ?? 'medium', ownerText: patch.ownerText, dueDate: patch.dueDate ?? null, details: patch.details })
            else editFinding(editing.id, patch)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
