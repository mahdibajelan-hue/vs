import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, CircleCheck, CircleDot, Lightbulb, ListChecks, Loader2, Lock, Mic, MicOff, Paperclip, PenLine, Pin, Plus, Search, Send, SkipForward, Sparkles, Star, type LucideIcon } from 'lucide-react'
import { useMissionStore } from '../store/useMissionStore'
import { useNav } from '../nav'
import { interviewProgress, topicDef } from '../lib/interviewEngine'
import { topicTitle } from '../lib/questionSets'
import { faNum } from '../lib/fa'
import { KindBadge, Meter, Pill, ScoreGauge, SeverityDot, TOPIC_ICON } from '../components/ui'
import { EvidencePanel } from '../components/EvidencePanel'
import { AttendanceCard } from '../components/AttendanceCard'
import { FindingEditor } from '../components/FindingEditor'
import { useSpeech } from '../components/useSpeech'
import { planTopics, type MissionContext } from '../lib/questionSets'
import { BUILD_ID } from '../platform'
import type { Finding } from '../types'
import { liveFindings } from '../lib/reportBuilder'
import { MsModal } from '../components/MsModal'

type Pane = 'chat' | 'ledger' | 'topics'

/** Older turns were stored with a leading pictograph (📌 🔎 🔒); show a line icon instead so the chat reads as one family. */
const LEAD_ICON: Record<string, LucideIcon> = { '📌': Pin, '🔎': Search, '🔒': Lock, '✓': Check }
function BubbleText({ text }: { text: string }) {
  const m = /^(📌|🔎|🔒|✓)\s*/u.exec(text)
  if (!m) return <>{text}</>
  const Icon = LEAD_ICON[m[1]]
  return (
    <>
      <Icon size={13} className="ms-bubble-lead" aria-hidden />
      {text.slice(m[0].length)}
    </>
  )
}

export function InterviewPage({ id }: { id: string }) {
  const { go } = useNav()
  const user = useMissionStore((s) => s.user)
  const bundle = useMissionStore((s) => s.bundle)
  const sets = useMissionStore((s) => s.sets)
  const projects = useMissionStore((s) => s.projects)
  const ai = useMissionStore((s) => s.ai)
  const thinking = useMissionStore((s) => s.thinking)
  const error = useMissionStore((s) => s.error)
  const openMission = useMissionStore((s) => s.openMission)
  const transition = useMissionStore((s) => s.transition)
  const beginInterview = useMissionStore((s) => s.beginInterview)
  const answer = useMissionStore((s) => s.answer)
  const skipTopic = useMissionStore((s) => s.skipTopic)
  const jumpToTopic = useMissionStore((s) => s.jumpToTopic)
  const reopenInterview = useMissionStore((s) => s.reopenInterview)
  const editFinding = useMissionStore((s) => s.editFinding)
  const addManualFinding = useMissionStore((s) => s.addManualFinding)
  const removeFinding = useMissionStore((s) => s.removeFinding)

  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<'text' | 'voice'>('text')
  const [interim, setInterim] = useState('')
  const [pane, setPane] = useState<Pane>('chat')
  const [editing, setEditing] = useState<Finding | 'new' | null>(null)
  const [skipping, setSkipping] = useState(false)
  const [skipReason, setSkipReason] = useState('')
  const [starting, setStarting] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    openMission(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Dictation lands where the cursor is (so it fills the template line being edited), else at the end.
  const speech = useSpeech((finalChunk, partial) => {
    if (finalChunk) {
      const chunk = finalChunk.trim()
      const el = taRef.current
      setDraft((d) => {
        const at = el && el.selectionStart != null && el.selectionStart <= d.length ? el.selectionStart : d.length
        const before = d.slice(0, at)
        const sep = before && !/[\s:：]$/.test(before) ? ' ' : before.endsWith(':') || before.endsWith('：') ? ' ' : ''
        return before + sep + chunk + d.slice(at)
      })
    }
    setInterim(partial)
    setMode('voice')
  }, ai.enhanced)

  const set = sets[0]
  const turns = bundle?.turns ?? []
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length, thinking])

  const state = bundle?.interview?.state ?? null
  // Each topic arrives with a pre-filled answer template: put it in the answer box (fresh for every question).
  const pendingId = state?.pending?.id
  const pendingTemplate = state?.pending?.template
  useEffect(() => {
    if (pendingTemplate) {
      setDraft(pendingTemplate)
      taRef.current?.scrollTo?.({ top: 0 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId])
  const progress = state ? interviewProgress(state) : null

  const ctx: MissionContext | null = useMemo(() => {
    if (!bundle) return null
    const project = projects.find((p) => p.id === bundle.mission.masterProjectId)
    return { mission: bundle.mission, objectives: bundle.objectives, projectType: project?.projectType ?? '', projectName: bundle.mission.projectName, answers: {}, openFindingKinds: [] }
  }, [bundle, projects])
  const mandatory = useMemo(() => (ctx && set ? planTopics(set, ctx).mandatory : []), [ctx, set])

  if (!bundle || bundle.mission.id !== id || !set) return null
  const m = bundle.mission
  const isReq = m.requesterId === user?.id
  const pending = state?.pending ?? null
  const findings = liveFindings(bundle.findings)
  const current = state?.current ?? null
  const canWrite = isReq && (m.status === 'debrief' || m.status === 'revision_requested')

  // --------------------------------------------------------------------------- gates before the chat
  if (!bundle.interview) {
    const plan = ctx ? planTopics(set, ctx).plan : []
    const canStart = isReq && (m.status === 'approved' || m.status === 'debrief')
    // Say precisely WHY the report cannot be started, instead of a generic sentence.
    const blocked = canStart
      ? null
      : !isReq
        ? `گزارش این مأموریت را فقط بازدیدکننده (${m.requesterName}) می‌تواند ثبت کند.`
        : m.status === 'draft' || m.status === 'returned'
          ? 'درخواست مأموریت هنوز برای تأیید ارسال نشده است. ابتدا درخواست را ارسال کنید.'
          : m.status === 'pending_approval'
            ? 'درخواست مأموریت هنوز توسط مجری طرح تأیید نشده است. گزارش پس از تأیید و پس از انجام مأموریت قابل ثبت است.'
            : m.status === 'ticketing'
              ? 'درخواست شما تأیید شد و منتظر صدور بلیط توسط امور اداری است. پس از صدور بلیط و انجام مأموریت، گزارش را ثبت کنید.'
            : m.status === 'report_review' || m.status === 'ready_for_claim' || m.status === 'claimed'
              ? 'گزارش این مأموریت قبلاً ثبت و ارسال شده است.'
              : 'برای این مأموریت امکان ثبت گزارش وجود ندارد.'
    const start = async () => {
      setStarting(true)
      if (m.status === 'approved') {
        const ok = await transition('start_debrief')
        if (!ok) { setStarting(false); return }
      }
      await beginInterview()
      setStarting(false)
    }
    // This page lives in the immersive (non-scrolling) shell, so it must scroll itself — on a phone the
    // start button used to sit below the fold with no way to reach it.
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-28 sm:p-8">
          <button className="ms-btn ms-btn-ghost ms-btn-sm self-start" onClick={() => go({ kind: 'mission', id })}><ArrowRight size={14} aria-hidden /> بازگشت</button>
          {error && <p role="alert" className="rounded-xl px-4 py-3 text-[12.5px] leading-7" style={{ background: 'color-mix(in srgb, var(--ms-bad) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--ms-bad) 40%, transparent)' }}>{error}</p>}
          <div className="ms-card p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'var(--ms-accent-soft)', color: 'var(--ms-accent)' }}><Sparkles size={24} aria-hidden /></span>
              <div className="min-w-0">
                <h1 className="text-[19px] font-black leading-8">ثبت گزارش بازدید</h1>
                <p className="ms-muted truncate text-[12px]">{m.projectName} · {m.code}</p>
              </div>
            </div>

            {blocked ? (
              <div className="mt-4 rounded-xl px-4 py-3 text-[13px] leading-8" style={{ background: 'color-mix(in srgb, var(--ms-warn) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--ms-warn) 38%, transparent)' }}>
                {blocked}
                <button className="ms-btn ms-btn-sm mt-2 block" onClick={() => go({ kind: m.status === 'draft' || m.status === 'returned' ? 'form' : 'mission', id })}>
                  {m.status === 'draft' || m.status === 'returned' ? 'رفتن به درخواست' : 'رفتن به صفحه مأموریت'}
                </button>
              </div>
            ) : (
              <>
                <p className="ms-ink2 mt-4 text-[13px] leading-8">
                  گزارش را با گفت‌وگو ثبت می‌کنید. سؤال‌های هر موضوع را یکجا و همراه با یک قالب پاسخ می‌پرسم؛ شما قالب را پر می‌کنید (تایپ یا میکروفون). اگر اطلاعاتی ناقص ماند، فقط همان را یک بار دیگر می‌پرسم.
                </p>
                <button className="ms-btn ms-btn-primary mt-4 w-full max-md:hidden" style={{ minHeight: 48, fontSize: 15 }} disabled={starting} onClick={start}>
                  <Sparkles size={17} aria-hidden /> {starting ? 'در حال آماده‌سازی…' : m.status === 'debrief' ? 'شروع گفت‌وگو' : 'شروع ثبت گزارش'}
                </button>
              </>
            )}
          </div>

          <div className="ms-card p-5">
            <p className="ms-eyebrow mb-3">راهنما</p>
            <ol className="flex flex-col gap-3">
              {[
                ['۱', 'شروع را بزنید', 'گفت‌وگو باز می‌شود و اولین سؤال نمایش داده می‌شود.'],
                ['۲', 'قالب هر موضوع را پر کنید', 'همه سؤال‌های یک موضوع با هم می‌آید و قالب پاسخ در کادر پایین آماده است. جلوی هر خط بنویسید یا با میکروفون بگویید، سپس «ارسال» را بزنید. موردی نداشتید بنویسید «ندارم».'],
                ['۳', 'موارد ناقص را یکجا تکمیل کنید', 'اگر مسئله یا مصوبه‌ای علت، اثر، مسئول یا موعد نداشت، همه کسری‌ها را در یک قالب جدید می‌پرسم. «نمی‌دانم» هم پاسخ قبول است.'],
                ['۴', 'عکس و مستند بگذارید', 'در بخش «یافته‌ها» (در موبایل: تب بالای صفحه) برای هر موضوع عکس، صورتجلسه یا نامه پیوست کنید.'],
                ['۵', 'مرور و ارسال', 'پس از پایان همه موضوع‌ها، خلاصه را بررسی و برای مجری طرح ارسال کنید. می‌توانید هر زمان خارج شوید؛ پاسخ‌ها ذخیره می‌شوند.'],
              ].map(([n, t, d]) => (
                <li key={n} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-black" style={{ background: 'var(--ms-accent-soft)', color: 'var(--ms-accent)' }}>{n}</span>
                  <span className="min-w-0"><b className="block text-[13px] leading-7">{t}</b><span className="ms-ink2 block text-[12px] leading-7">{d}</span></span>
                </li>
              ))}
            </ol>
          </div>

          <div className="ms-card p-5">
            <p className="text-[12.5px] font-extrabold">موضوعات این گفت‌وگو ({faNum(plan.length)})</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {plan.map((k) => <li key={k}><Pill tone={mandatory.includes(k) ? 'accent' : 'neutral'}>{mandatory.includes(k) && <Star size={10} aria-hidden />}{topicTitle(set, k)}</Pill></li>)}
            </ul>
            <p className="ms-muted mt-2 text-[11px] leading-6"><Star size={10} className="inline" aria-hidden /> مرتبط با اهداف مأموریت شما؛ پیش از ارسال گزارش باید کامل شوند. زمان تقریبی: ۸ تا ۱۵ دقیقه. تحلیل پاسخ‌ها: {ai.label}</p>
          </div>
        </div>

        {canStart && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 md:hidden" style={{ borderColor: 'var(--ms-line)', background: 'color-mix(in srgb, var(--ms-panel) 95%, transparent)', backdropFilter: 'blur(12px)', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
            <button className="ms-btn ms-btn-primary w-full" style={{ minHeight: 48, fontSize: 15 }} disabled={starting} onClick={start}>
              <Sparkles size={17} aria-hidden /> {starting ? 'در حال آماده‌سازی…' : m.status === 'debrief' ? 'شروع گفت‌وگو' : 'شروع ثبت گزارش'}
            </button>
          </div>
        )}
      </div>
    )
  }

  const reopened = bundle.interview.status === 'completed' && m.status === 'revision_requested'
  const inSummary = bundle.interview.status === 'summary' || (state && state.current === null && !pending)

  const send = async (text?: string) => {
    const body = (text ?? draft).trim()
    if (!body || !pending || thinking) return
    // The untouched template is not an answer.
    if (text === undefined && pending.template && body === pending.template.trim()) return
    if (speech.listening) speech.stop()
    setDraft('')
    setInterim('')
    const used = mode
    setMode('text')
    await answer(body, used)
    taRef.current?.focus()
  }

  const topicStateIcon = (k: string) => {
    const s = state!.topics[k]
    if (s.state === 'complete') return <Check size={13} style={{ color: 'var(--ms-good)' }} aria-hidden />
    if (s.state === 'skipped') return <SkipForward size={13} className="ms-muted" aria-hidden />
    return <CircleDot size={13} style={{ color: current === k ? 'var(--ms-accent)' : 'var(--ms-muted)' }} aria-hidden />
  }

  const extraTopics = set.topics.filter((t) => !state!.plan.includes(t.key))

  // --------------------------------------------------------------------------- panes
  const topicsPane = (
    <div className="flex flex-col gap-1">
      <div className="mb-2 flex items-center gap-3 px-1">
        <ScoreGauge value={progress?.percent ?? 0} size={64} neutral />
        <div>
          <p className="text-[12.5px] font-extrabold">پیشرفت گفت‌وگو</p>
          <p className="ms-muted text-[11px] leading-5">{faNum(progress?.done ?? 0)} از {faNum(progress?.total ?? 0)} موضوع</p>
        </div>
      </div>
      {state!.plan.map((k) => {
        const def = topicDef(set, k)
        const tp = state!.topics[k]
        const Icon = TOPIC_ICON[def.icon] ?? ListChecks
        return (
          <button key={k} className={`ms-topic ${current === k ? 'is-current' : ''} ${tp.state === 'complete' ? 'is-done' : ''}`} onClick={() => canWrite && current !== k && jumpToTopic(k).then(() => setPane('chat'))} disabled={!canWrite} title={tp.closedReason}>
            <Icon size={15} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{def.title}</span>
            {mandatory.includes(k) && tp.state === 'open' && <Star size={11} style={{ color: 'var(--ms-accent)' }} aria-label="اجباری" />}
            {topicStateIcon(k)}
          </button>
        )
      })}
      {canWrite && extraTopics.length > 0 && (
        <details className="mt-2">
          <summary className="ms-muted cursor-pointer px-2 py-1 text-[11.5px] font-bold">افزودن موضوع دیگر</summary>
          <div className="mt-1 flex flex-col gap-1">
            {extraTopics.map((t) => (
              <button key={t.key} className="ms-topic" onClick={() => jumpToTopic(t.key).then(() => setPane('chat'))}>
                <Plus size={14} aria-hidden /> {t.title}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  )

  const ledgerPane = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-extrabold">آنچه تاکنون فهمیدم</p>
        <Pill tone="accent">{faNum(findings.length)} مورد</Pill>
      </div>
      {findings.length === 0 && <p className="ms-muted text-[12px] leading-7">با پاسخ‌های شما، مسئله‌ها، ریسک‌ها، اقدام‌ها، تعهدها و تصمیم‌ها این‌جا ظاهر می‌شوند.</p>}
      <ul className="flex flex-col gap-2">
        {[...findings].reverse().map((f) => {
          const needs = f.kind === 'issue' ? 4 : f.kind === 'risk' ? 3 : f.kind === 'action' || f.kind === 'commitment' ? 2 : 0
          const have = f.kind === 'issue' ? ['cause', 'impact', 'party', 'newDate'].filter((s) => f.details[s] || (s === 'party' && f.ownerText) || (s === 'newDate' && f.dueDate)).length
            : f.kind === 'risk' ? ['impact', 'probability', 'mitigation'].filter((s) => f.details[s]).length
            : needs ? [f.ownerText || f.details.owner, f.dueDate || f.details.due].filter(Boolean).length : 0
          return (
            <li key={f.id} className={`ms-ledger-item is-plain ms-k-${f.kind}`}>
              <button className="block w-full text-right" onClick={() => canWrite && setEditing(f)} disabled={!canWrite}>
                <span className="flex items-center gap-2">
                  <KindBadge kind={f.kind} />
                  {(f.kind === 'issue' || f.kind === 'risk') && <SeverityDot severity={f.severity} />}
                </span>
                <span className="mt-1.5 block text-[12.5px] font-semibold leading-6">{f.title}</span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="ms-muted text-[10.5px]">{topicTitle(set, f.topicKey)}</span>
                  {needs > 0 && have < needs && <span className="mr-auto text-[10.5px] font-bold" style={{ color: 'var(--ms-warn)' }}>{faNum(have)}/{faNum(needs)} اطلاعات</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {canWrite && <button className="ms-btn ms-btn-sm" onClick={() => setEditing('new')}><Plus size={13} aria-hidden /> افزودن دستی</button>}
      {current && canWrite && (
        <div className="mt-2 border-t pt-3" style={{ borderColor: 'var(--ms-line)' }}>
          <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-extrabold"><Paperclip size={14} aria-hidden /> شواهد «{topicTitle(set, current)}»</p>
          {current === 'evidence' && <div className="mb-3"><AttendanceCard missionId={id} /></div>}
          <EvidencePanel missionId={id} kinds={['photo', 'file', 'minutes', 'letter', 'technical', 'note', 'voice']} topicKey={current} compact />
        </div>
      )}
    </div>
  )

  const chatPane = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="ms-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        <div className="ms-chat mx-auto max-w-3xl">
          {turns.map((t) => (
            <div key={t.id} className={`ms-bubble ${t.role === 'user' ? 'ms-bubble-user' : t.role === 'system' ? 'ms-bubble-system' : `ms-bubble-bot ${t.kind === 'followup' ? 'ms-bubble-follow' : ''}`}`}>
              {t.role === 'assistant' && t.kind === 'followup' && <span className="ms-muted mb-0.5 block text-[10.5px] font-bold">سؤال تکمیلی</span>}
              <BubbleText text={t.text} />
              {t.role === 'user' && t.inputMode === 'voice' && <Mic size={11} className="ms-muted mr-1.5 inline" aria-label="پاسخ صوتی" />}
            </div>
          ))}
          {thinking && (
            <div className="ms-bubble ms-bubble-bot" aria-live="polite"><span className="ms-typing" aria-label="در حال تحلیل پاسخ"><span /><span /><span /></span></div>
          )}
          {reopened && (
            <div className="ms-card-flat self-center p-4 text-center">
              <p className="text-[12.5px] leading-7">مجری طرح گزارش را برای اصلاح برگرداند{m.managerComment ? `: «${m.managerComment}»` : '.'}</p>
              <button className="ms-btn ms-btn-primary mt-2" onClick={() => reopenInterview()}>بازگشایی گفت‌وگو و اصلاح</button>
            </div>
          )}
          {inSummary && !reopened && (
            <div className="ms-card self-center p-5 text-center" style={{ borderColor: 'color-mix(in srgb, var(--ms-good) 45%, transparent)' }}>
              <p className="flex items-center justify-center gap-1.5 text-[14px] font-extrabold"><CircleCheck size={16} style={{ color: 'var(--ms-good)' }} aria-hidden /> گفت‌وگو کامل است</p>
              <p className="ms-ink2 mt-1 text-[12.5px] leading-7">همه موضوع‌ها بررسی شد. حالا خلاصه استخراج‌شده را مرور و تأیید کنید.</p>
              <button className="ms-btn ms-btn-primary mt-3" onClick={() => go({ kind: 'summary', id })}>مرور خلاصه و ارسال گزارش</button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {canWrite && pending && !inSummary && (
        <div className="shrink-0 border-t px-3 pb-3 pt-2.5 sm:px-6" style={{ borderColor: 'var(--ms-line)', background: 'color-mix(in srgb, var(--ms-panel) 92%, transparent)' }}>
          <div className="mx-auto max-w-3xl">
            {pending.hint && <p className="ms-muted mb-1.5 flex items-start gap-1.5 text-[11.5px] leading-6"><Lightbulb size={13} className="mt-1 shrink-0" aria-hidden /> {pending.hint}</p>}
            {pending.template && <p className="ms-muted mb-1.5 flex items-start gap-1.5 text-[11.5px] leading-6"><PenLine size={13} className="mt-1 shrink-0" aria-hidden /> قالب پاسخ را کامل کنید: جلوی هر خط بنویسید یا با میکروفون بگویید (متن در جای نشانگر وارد می‌شود).</p>}
            {pending.quick && pending.quick.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {pending.quick.map((q) => (
                  <button key={q} className="ms-chip" style={{ fontSize: 11.5, padding: '4px 11px' }} disabled={thinking} onClick={() => send(q)}>{q}</button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="relative flex-1">
                <textarea
                  ref={taRef}
                  className="ms-textarea"
                  style={pending.template ? { minHeight: 150, maxHeight: 320, paddingLeft: 12, lineHeight: 2 } : { minHeight: 52, maxHeight: 160, paddingLeft: 12 }}
                  rows={pending.template ? 8 : 2}
                  placeholder={speech.listening ? 'در حال گوش دادن… صحبت کنید' : 'پاسخ خود را بنویسید یا با میکروفون بگویید…'}
                  dir="rtl"
                  value={draft + (interim ? ' ' + interim : '')}
                  onChange={(e) => { setDraft(e.target.value); setInterim('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
                  aria-label="پاسخ شما"
                  disabled={thinking}
                />
              </div>
              <button
                className={`ms-btn ms-btn-icon ${speech.listening ? 'ms-mic-live' : ''}`}
                onClick={() => (speech.listening ? speech.stop() : speech.start())}
                disabled={!speech.supported || thinking || speech.state === 'transcribing'}
                aria-label={speech.listening ? 'توقف ضبط' : 'پاسخ صوتی'}
                title={speech.supported ? 'پاسخ صوتی (فارسی)' : speech.unsupportedReason}
              >
                {speech.state === 'transcribing' ? <Loader2 size={18} className="animate-spin" aria-hidden /> : speech.supported ? <Mic size={18} aria-hidden /> : <MicOff size={18} aria-hidden />}
              </button>
              <button className="ms-btn ms-btn-primary ms-btn-icon" onClick={() => send()} disabled={!draft.trim() || thinking || (!!pending.template && draft.trim() === pending.template.trim())} aria-label="ارسال پاسخ">
                <Send size={17} aria-hidden style={{ transform: 'scaleX(-1)' }} />
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className={error ? '' : 'ms-muted'} style={error ? { color: 'var(--ms-bad)', fontWeight: 700 } : undefined}>{error || speech.error || (speech.state === 'transcribing' ? 'در حال تبدیل صدا به متن…' : speech.listening ? 'در حال ضبط… پس از پایان صحبت دوباره روی میکروفون بزنید' : speech.supported ? 'برای ارسال: دکمه ارسال یا Ctrl+Enter' : speech.unsupportedReason)}</span>
              <button className="ms-muted underline-offset-2 hover:underline" onClick={() => setSkipping(true)}>این موضوع را رد کن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-5" style={{ borderColor: 'var(--ms-line)' }}>
        <div className="flex min-w-0 items-center gap-2">
          <button className="ms-btn ms-btn-ghost ms-btn-sm" onClick={() => go({ kind: 'mission', id })}><ArrowRight size={14} aria-hidden /> خروج</button>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-extrabold">{m.projectName}</p>
            <p className="ms-muted truncate text-[10.5px]">{m.code} · ذخیره خودکار · <span dir="ltr">{BUILD_ID}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden w-40 sm:block"><Meter value={progress?.percent ?? 0} /></div>
          <span className="text-[12px] font-black">{faNum(progress?.percent ?? 0)}٪</span>
          {(state!.current === null || inSummary) && <button className="ms-btn ms-btn-primary ms-btn-sm" onClick={() => go({ kind: 'summary', id })}>مرور و ارسال</button>}
        </div>
      </div>

      <div className="flex shrink-0 gap-1 border-b px-3 py-1.5 lg:hidden" style={{ borderColor: 'var(--ms-line)' }} role="tablist">
        {([['chat', 'گفت‌وگو'], ['ledger', `یافته‌ها (${faNum(findings.length)})`], ['topics', 'موضوع‌ها']] as [Pane, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={pane === k} className={`ms-chip flex-1 justify-center ${pane === k ? 'is-on' : ''}`} onClick={() => setPane(k)}>{l}</button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="ms-scroll hidden w-72 shrink-0 overflow-y-auto border-l p-3 lg:block" style={{ borderColor: 'var(--ms-line)' }} aria-label="موضوع‌ها">{topicsPane}</aside>
        <div className={`min-h-0 min-w-0 flex-1 flex-col ${pane === 'chat' ? 'flex' : 'hidden'} lg:flex`}>{chatPane}</div>
        <aside className={`ms-scroll min-h-0 overflow-y-auto p-3 lg:block lg:w-80 lg:shrink-0 lg:border-r ${pane === 'ledger' ? 'block flex-1' : 'hidden'}`} style={{ borderColor: 'var(--ms-line)' }} aria-label="یافته‌ها">{ledgerPane}</aside>
        <aside className={`ms-scroll min-h-0 overflow-y-auto p-3 lg:hidden ${pane === 'topics' ? 'block flex-1' : 'hidden'}`}>{topicsPane}</aside>
      </div>

      {editing && (
        <FindingEditor
          finding={editing === 'new' ? null : editing}
          topics={state!.plan.map((k) => ({ key: k, title: topicTitle(set, k) }))}
          onClose={() => setEditing(null)}
          onDelete={editing !== 'new' ? () => { removeFinding(editing.id); setEditing(null) } : undefined}
          onSave={(patch) => {
            if (editing === 'new') addManualFinding({ kind: patch.kind!, title: patch.title!, topicKey: patch.topicKey ?? current ?? 'issues_risks', severity: patch.severity ?? 'medium', ownerText: patch.ownerText, dueDate: patch.dueDate ?? null, details: patch.details, confidential: patch.confidential })
            else editFinding(editing.id, patch)
            setEditing(null)
          }}
        />
      )}

      {skipping && current && (
        <MsModal title="رد کردن موضوع" subtitle={topicTitle(set, current)} onClose={() => setSkipping(false)} width="max-w-md">
          <div className="ms-root flex flex-col gap-3" dir="rtl" style={{ background: 'transparent' }}>
            <p className="ms-ink2 text-[12.5px] leading-7">{mandatory.includes(current) ? 'این موضوع از اهداف مأموریت است؛ دلیل رد کردن را بنویسید.' : 'اگر این موضوع در بازدید مطرح نبود، می‌توانید رد کنید.'}</p>
            <input className="ms-input" placeholder="دلیل (مثلاً: در این بازدید بررسی نشد)" value={skipReason} onChange={(e) => setSkipReason(e.target.value)} aria-label="دلیل" />
            <div className="flex justify-end gap-2">
              <button className="ms-btn" onClick={() => setSkipping(false)}>انصراف</button>
              <button className="ms-btn ms-btn-primary" disabled={mandatory.includes(current) && !skipReason.trim()} onClick={async () => { await skipTopic(skipReason.trim()); setSkipping(false); setSkipReason('') }}>رد کردن</button>
            </div>
          </div>
        </MsModal>
      )}
    </div>
  )
}
