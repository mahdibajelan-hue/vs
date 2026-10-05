import { useEffect, useState } from 'react'
import { ArrowRight, BadgeCheck, Plane, CalendarDays, Check, ClipboardCopy, FileText, History, MapPin, Pencil, Play, Send, UserRound, X } from 'lucide-react'
import { useMissionStore } from '../store/useMissionStore'
import { useNav } from '../nav'
import { nextStepFor, STEPS, STEP_OWNER, stepIndex, waitingOn } from '../lib/workflow'
import { faNum, missionDays, shamsi, shamsiLong, timeAgoFa } from '../lib/fa'
import { Card, Field, Pill, ScoreGauge, SectionHead, StatusPill } from '../components/ui'
import { FindingCard } from '../components/FindingCard'
import { EvidencePanel } from '../components/EvidencePanel'
import { EVENT_LABEL, type TicketInfo, OBJECTIVE_STATUS_LABEL, OBJECTIVE_STATUS_TONE, VISIT_TYPE_LABEL, PRIORITY_LABEL } from '../types'
import { liveFindings } from '../lib/reportBuilder'

type Tab = 'overview' | 'findings' | 'evidence' | 'history'

export function MissionDetailPage({ id }: { id: string }) {
  const { go } = useNav()
  const user = useMissionStore((s) => s.user)
  const bundle = useMissionStore((s) => s.bundle)
  const openMission = useMissionStore((s) => s.openMission)
  const transition = useMissionStore((s) => s.transition)
  const deleteMission = useMissionStore((s) => s.deleteMission)
  const [tab, setTab] = useState<Tab>('overview')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [ticket, setTicket] = useState<TicketInfo>({})

  useEffect(() => {
    openMission(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!bundle || bundle.mission.id !== id) return null
  const { mission: m, objectives, findings, linked, events, report } = bundle
  const isReq = m.requesterId === user?.id
  const isMgr = !!user?.isManager || m.approverId === user?.id
  const isAA = !!user?.isAdminAffairs
  const idx = stepIndex(m.status)
  const next = nextStepFor(m, user)
  const live = liveFindings(findings)
  const days = missionDays(m.startDate, m.endDate)

  async function act(action: Parameters<typeof transition>[0], c = comment, data?: Record<string, unknown>) {
    setBusy(true)
    const ok = await transition(action, c, undefined, data)
    setBusy(false)
    if (ok) setComment('')
    return ok
  }

  const claimText = [
    `کد مأموریت: ${m.code}`,
    `نام: ${m.requesterName}${m.requesterPosition ? ` (${m.requesterPosition})` : ''}`,
    `پروژه: ${m.projectName}`,
    `مقصد: ${m.destination}`,
    `تاریخ شروع: ${shamsi(m.startDate)}`,
    `تاریخ پایان: ${shamsi(m.endDate)}`,
    `مدت مأموریت: ${faNum(days)} روز`,
    `تأیید گزارش توسط مجری طرح: ${m.finalApprovedAt ? shamsi(m.finalApprovedAt) : '—'}${m.approverName ? ` (${m.approverName})` : ''}`,
  ].join('\n')

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <button className="ms-btn ms-btn-ghost ms-btn-sm" onClick={() => go({ kind: 'list' })}>
          <ArrowRight size={14} aria-hidden /> مأموریت‌ها
        </button>
      </div>

      {/* ---------------------------------------------------------------- header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="ms-muted text-[12px] font-bold">{m.code}</p>
            <h1 className="text-[22px] font-black leading-9">{m.projectName}</h1>
            <div className="ms-ink2 mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] leading-7">
              <span className="inline-flex items-center gap-1.5"><UserRound size={14} aria-hidden />{m.requesterName}{m.requesterPosition ? ` · ${m.requesterPosition}` : ''}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin size={14} aria-hidden />{m.destination || '—'}</span>
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} aria-hidden />{shamsiLong(m.startDate)} تا {shamsiLong(m.endDate)} ({faNum(days)} روز)</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill status={m.status} />
              <Pill>{VISIT_TYPE_LABEL[m.visitType]}</Pill>
              {m.approverName && <Pill>مجری طرح: {m.approverName}</Pill>}
              {waitingOn(m) && <Pill tone="warn">منتظر: {waitingOn(m)}</Pill>}
            </div>
          </div>
          {m.qualityScore != null && <ScoreGauge value={m.qualityScore} size={92} label="کیفیت گزارش" />}
        </div>

        {idx >= 0 && (
          <div className="ms-steps mt-5" role="list" aria-label="مراحل مأموریت">
            {STEPS.map((s, i) => (
              <div key={s} className="contents" role="listitem">
                <div className={`ms-step ${i < idx ? 'is-done' : i === idx ? 'is-now' : ''}`}>
                  <span className="ms-step-dot">{i < idx ? <Check size={13} aria-hidden /> : faNum(i + 1)}</span>
                  <span className="ms-step-label">{s}<span className="ms-muted block text-[10px] font-medium">{STEP_OWNER[i]}</span></span>
                </div>
                {i < STEPS.length - 1 && <span className={`ms-step-bar ${i < idx ? 'is-done' : ''}`} />}
              </div>
            ))}
          </div>
        )}

        {/* ------------------------------------------------------------ actions */}
        <div className="mt-5 flex flex-col gap-3 border-t pt-4" style={{ borderColor: 'var(--ms-line)' }}>
          {(m.managerComment || m.adminComment) && ['returned', 'revision_requested', 'rejected'].includes(m.status) && (
            <p className="rounded-xl px-4 py-3 text-[12.5px] leading-7" style={{ background: 'color-mix(in srgb, var(--ms-warn) 13%, transparent)', border: '1px solid color-mix(in srgb, var(--ms-warn) 35%, transparent)' }}>
              <b>{m.managerComment ? 'نظر مجری طرح' : 'نظر امور اداری'}:</b> {m.managerComment || m.adminComment}
            </p>
          )}

          {m.status === 'pending_approval' && isMgr && (
            <div className="flex flex-col gap-3">
              <Field label="نظر شما به‌عنوان مجری طرح (برای برگشت یا رد الزامی است)">
                <textarea className="ms-textarea" style={{ minHeight: 64 }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="مثلاً: معیار تحقق هدف دوم را مشخص‌تر بنویسید" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button className="ms-btn ms-btn-primary" disabled={busy} onClick={() => act('approve_request')}><Check size={15} aria-hidden /> {m.needsTicket ? 'تأیید و ارسال به امور اداری (بلیط)' : 'تأیید مأموریت'}</button>
                <button className="ms-btn" disabled={busy || !comment.trim()} onClick={() => act('return_request')}><Pencil size={14} aria-hidden /> برگشت برای اصلاح</button>
                <button className="ms-btn ms-btn-danger" disabled={busy || !comment.trim()} onClick={() => act('reject_request')}><X size={14} aria-hidden /> رد درخواست</button>
              </div>
            </div>
          )}

          {m.status === 'pending_approval' && !isMgr && <p className="ms-ink2 text-[12.5px]">درخواست شما ارسال شده و منتظر تأیید مجری طرح است.</p>}

          {next && !['pending_approval', 'report_review', 'ticketing', 'ready_for_claim'].includes(m.status) && (
            <div className="flex flex-wrap items-center gap-3">
              <button className="ms-btn ms-btn-primary" onClick={() => go(next.view)}>
                {m.status === 'approved' || m.status === 'debrief' ? <Play size={15} aria-hidden /> : m.status === 'draft' || m.status === 'returned' ? <Pencil size={14} aria-hidden /> : <Send size={14} aria-hidden />}
                {next.label}
              </button>
              <p className="ms-ink2 text-[12.5px]">{next.hint}</p>
            </div>
          )}

          {m.status === 'report_review' && (
            <div className="flex flex-wrap items-center gap-3">
              <button className="ms-btn ms-btn-primary" onClick={() => go({ kind: 'report', id })}><FileText size={15} aria-hidden /> {isMgr ? 'بررسی گزارش و تصمیم' : 'مشاهده گزارش ارسال‌شده'}</button>
              <p className="ms-ink2 text-[12.5px]">گزارش برای مجری طرح ارسال شده است.</p>
            </div>
          )}

          {(['report_review', 'ready_for_claim', 'claimed', 'revision_requested'].includes(m.status) && report) && m.status !== 'report_review' && (
            <div><button className="ms-btn ms-btn-sm" onClick={() => go({ kind: 'report', id })}><FileText size={14} aria-hidden /> مشاهده گزارش</button></div>
          )}

          {(isReq || isMgr) && ['draft', 'pending_approval', 'returned', 'ticketing', 'approved'].includes(m.status) && (
            <div className="flex flex-wrap gap-2">
              <button className="ms-btn ms-btn-ghost ms-btn-sm" onClick={() => act('cancel', '')} disabled={busy}>لغو مأموریت</button>
              {m.status === 'draft' && isReq && <button className="ms-btn ms-btn-ghost ms-btn-sm" onClick={async () => { await deleteMission(id); go({ kind: 'list' }) }}>حذف پیش‌نویس</button>}
            </div>
          )}
        </div>
      </Card>

      {/* ---------------------------------------------------------------- Administrative Affairs: ticketing */}
      {m.status === 'ticketing' && (
        <Card className="p-5" style={{ borderColor: 'color-mix(in srgb, var(--ms-accent) 50%, transparent)' }}>
          <SectionHead eyebrow="امور اداری" title="درخواست بلیط هواپیما" action={<Pill tone="warn">منتظر صدور بلیط</Pill>} />
          <dl className="grid gap-x-8 gap-y-1 text-[12.5px] sm:grid-cols-2">
            {[['مسافر', `${m.requesterName}${m.requesterPosition ? ` (${m.requesterPosition})` : ''}`], ['مبدأ → مقصد', `${m.originCity || '—'} → ${m.destination || '—'}`], ['رفت', shamsiLong(m.startDate)], ['برگشت', shamsiLong(m.endDate)], ['پروژه', m.projectName], ['توضیح کارمند', m.ticketNote || '—']].map(([k, v]) => (
              <div key={k} className="flex gap-2 border-b py-1.5" style={{ borderColor: 'var(--ms-line)' }}><dt className="ms-muted w-28 shrink-0">{k}</dt><dd className="font-bold">{v}</dd></div>
            ))}
          </dl>
          {isAA ? (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-[12.5px] font-extrabold">پس از رزرو، مشخصات بلیط را ثبت کنید:</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ایرلاین"><input className="ms-input" value={ticket.airline ?? ''} onChange={(e) => setTicket({ ...ticket, airline: e.target.value })} placeholder="مثلاً ماهان" /></Field>
                <Field label="شماره پرواز"><input className="ms-input" dir="ltr" value={ticket.flightNo ?? ''} onChange={(e) => setTicket({ ...ticket, flightNo: e.target.value })} placeholder="W5-1234" /></Field>
                <Field label="ساعت و تاریخ رفت"><input className="ms-input" value={ticket.departAt ?? ''} onChange={(e) => setTicket({ ...ticket, departAt: e.target.value })} placeholder="مثلاً ۱۴۰۵/۰۷/۱۵ ساعت ۰۷:۳۰" /></Field>
                <Field label="ساعت و تاریخ برگشت"><input className="ms-input" value={ticket.returnAt ?? ''} onChange={(e) => setTicket({ ...ticket, returnAt: e.target.value })} placeholder="مثلاً ۱۴۰۵/۰۷/۱۶ ساعت ۱۸:۰۰" /></Field>
                <Field label="کد رزرو / شماره بلیط (PNR)"><input className="ms-input" dir="ltr" value={ticket.pnr ?? ''} onChange={(e) => setTicket({ ...ticket, pnr: e.target.value })} /></Field>
                <Field label="مبلغ بلیط (ریال)"><input className="ms-input" value={ticket.cost ?? ''} onChange={(e) => setTicket({ ...ticket, cost: e.target.value })} /></Field>
              </div>
              <Field label="توضیح برای کارمند (اختیاری؛ برای برگشت درخواست الزامی)"><textarea className="ms-textarea" style={{ minHeight: 56 }} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
              <div className="flex flex-wrap gap-2">
                <button className="ms-btn ms-btn-primary" disabled={busy || !(ticket.airline || ticket.flightNo || ticket.pnr)} onClick={() => act('issue_ticket', comment, ticket as Record<string, unknown>)}>
                  <Plane size={15} aria-hidden /> بلیط صادر شد — تأیید و اطلاع به کارمند
                </button>
                <button className="ms-btn" disabled={busy || !comment.trim()} onClick={() => act('return_ticket')}><Pencil size={14} aria-hidden /> برگشت به کارمند برای اصلاح</button>
              </div>
            </div>
          ) : (
            <p className="ms-ink2 mt-3 text-[12.5px] leading-7">درخواست بلیط برای امور اداری ارسال شده است. پس از صدور، مشخصات بلیط همین‌جا نمایش داده می‌شود.</p>
          )}
        </Card>
      )}

      {/* ---------------------------------------------------------------- issued ticket */}
      {m.ticketIssuedAt && m.needsTicket && m.status !== 'ticketing' && (
        <Card className="p-5">
          <SectionHead eyebrow="بلیط هواپیما" title="مشخصات بلیط صادرشده" action={<Pill tone="good"><Plane size={12} aria-hidden /> صادر شد {shamsi(m.ticketIssuedAt)}</Pill>} />
          <dl className="grid gap-x-8 gap-y-1 text-[12.5px] sm:grid-cols-2">
            {([['ایرلاین', m.ticket.airline], ['شماره پرواز', m.ticket.flightNo], ['رفت', m.ticket.departAt], ['برگشت', m.ticket.returnAt], ['کد رزرو (PNR)', m.ticket.pnr], ['مبلغ', m.ticket.cost]] as [string, string | undefined][]).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex gap-2 border-b py-1.5" style={{ borderColor: 'var(--ms-line)' }}><dt className="ms-muted w-28 shrink-0">{k}</dt><dd className="font-bold" dir="auto">{v}</dd></div>
            ))}
          </dl>
        </Card>
      )}

      {/* ---------------------------------------------------------------- Administrative Affairs: mission claim */}
      {(m.status === 'ready_for_claim' || m.status === 'claimed') && (
        <Card className="p-5" style={{ borderColor: `color-mix(in srgb, var(${m.status === 'claimed' ? '--ms-good' : '--ms-accent'}) 45%, transparent)` }}>
          <SectionHead eyebrow="امور اداری" title={m.status === 'claimed' ? 'کلیم مأموریت تأیید شد' : 'تأیید کلیم مأموریت'} action={<Pill tone={m.status === 'claimed' ? 'good' : 'warn'}><BadgeCheck size={12} aria-hidden /> {m.status === 'claimed' ? `تأیید ${shamsi(m.claimedAt)}` : 'گزارش توسط مجری طرح تأیید شد'}</Pill>} />
          <dl className="grid gap-x-8 gap-y-2 text-[12.5px] sm:grid-cols-2">
            {claimText.split('\n').map((line) => {
              const [k, ...rest] = line.split(': ')
              return (
                <div key={k} className="flex gap-2 border-b py-1.5" style={{ borderColor: 'var(--ms-line)' }}>
                  <dt className="ms-muted w-32 shrink-0">{k}</dt>
                  <dd className="font-bold">{rest.join(': ')}</dd>
                </div>
              )
            })}
          </dl>
          {m.status === 'ready_for_claim' && isAA && (
            <div className="mt-4 flex flex-col gap-3">
              <Field label="یادداشت امور اداری (اختیاری)"><input className="ms-input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="مثلاً: مطابق دستورالعمل حق مأموریت محاسبه شد" /></Field>
              <button className="ms-btn ms-btn-primary self-start" disabled={busy} onClick={() => act('approve_claim')}>
                <Check size={15} aria-hidden /> تأیید کلیم مأموریت
              </button>
            </div>
          )}
          {m.status === 'ready_for_claim' && !isAA && <p className="ms-ink2 mt-3 text-[12.5px] leading-7">گزارش تأیید شد و کلیم برای امور اداری ارسال شده است؛ پس از تأیید ایشان مأموریت بسته می‌شود.</p>}
          {m.status === 'claimed' && m.adminComment && <p className="ms-ink2 mt-3 text-[12px] leading-7">یادداشت امور اداری: {m.adminComment}</p>}
          <div className="mt-3">
            <button className="ms-btn ms-btn-sm" onClick={() => { navigator.clipboard?.writeText(claimText); setCopied(true); setTimeout(() => setCopied(false), 1800) }}>
              <ClipboardCopy size={14} aria-hidden /> {copied ? 'کپی شد' : 'کپی اطلاعات کلیم'}
            </button>
          </div>
        </Card>
      )}

      {/* ---------------------------------------------------------------- tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="بخش‌های مأموریت">
        {([['overview', 'نمای کلی'], ['findings', `یافته‌ها (${faNum(live.length)})`], ['evidence', `شواهد (${faNum(bundle.evidence.length)})`], ['history', 'تاریخچه']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`ms-chip ${tab === k ? 'is-on' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="p-5 lg:col-span-3">
            <SectionHead eyebrow="اهداف" title="اهداف مأموریت" />
            <ul className="flex flex-col gap-3">
              {objectives.map((o, i) => (
                <li key={o.id} className="ms-card-flat p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black" style={{ background: 'var(--ms-accent-soft)', color: 'var(--ms-accent)' }}>{faNum(i + 1)}</span>
                    <b className="min-w-0 flex-1 text-[13px] leading-7">{o.title}</b>
                    <Pill tone={OBJECTIVE_STATUS_TONE[o.status]}>{OBJECTIVE_STATUS_LABEL[o.status]}</Pill>
                  </div>
                  {o.measure && <p className="ms-ink2 mt-1 text-[12px] leading-6">معیار تحقق: {o.measure}</p>}
                  {o.resultNote && <p className="mt-1 text-[12px] leading-6">نتیجه: {o.resultNote}</p>}
                  <p className="ms-muted mt-1 text-[11px]">اولویت: {PRIORITY_LABEL[o.priority]}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="flex flex-col gap-4 p-5 lg:col-span-2">
            <SectionHead eyebrow="جزئیات" title="مشخصات درخواست" />
            <Fact k="نوع بازدید" v={VISIT_TYPE_LABEL[m.visitType]} />
            <Fact k="محل دقیق" v={m.locationDetail || '—'} />
            <Fact k="ملاقات‌شوندگان" v={m.visitees.length ? m.visitees.map((v) => [v.name, v.org, v.role].filter(Boolean).join(' / ')).join('\n') : '—'} />
            <Fact k="موضوعات مورد بررسی" v={m.topicsOfInterest || '—'} />
            <Fact k="خروجی مورد انتظار" v={m.expectedOutput || '—'} />
          </Card>
        </div>
      )}

      {tab === 'findings' && (
        <Card className="p-5">
          <SectionHead eyebrow="کشف‌شده در بازدید" title="یافته‌ها" sub="Issue و Risk فقط پیشنهاد هستند؛ پس از تأیید مجری طرح به سامانه اصلی منتقل می‌شوند." />
          {live.length === 0 ? <p className="ms-muted py-6 text-center text-[12.5px]">هنوز یافته‌ای ثبت نشده است.</p> : (
            <div className="flex flex-col gap-3">
              {live.map((f) => <FindingCard key={f.id} finding={f} linked={linked.find((l) => l.findingId === f.id)} />)}
            </div>
          )}
        </Card>
      )}

      {tab === 'evidence' && (
        <Card className="p-5">
          <SectionHead eyebrow="شواهد" title="مستندات مأموریت" />
          <EvidencePanel missionId={id} kinds={['photo', 'file', 'minutes', 'letter', 'technical', 'note']} topicKey="" />
        </Card>
      )}

      {tab === 'history' && (
        <Card className="p-5">
          <SectionHead eyebrow="تاریخچه" title="روند مأموریت" action={<History size={16} className="ms-muted" aria-hidden />} />
          <ol className="flex flex-col gap-3">
            {[...events].reverse().map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--ms-accent)' }} aria-hidden />
                <div>
                  <p className="text-[12.5px] font-bold leading-7">{EVENT_LABEL[e.event] ?? e.event}</p>
                  <p className="ms-muted text-[11px]">{e.actorName} · {timeAgoFa(e.createdAt)}</p>
                  {e.comment && <p className="ms-ink2 text-[12px] leading-6">«{e.comment}»</p>}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="ms-muted text-[11px] font-bold">{k}</p>
      <p className="whitespace-pre-line text-[12.5px] leading-7">{v}</p>
    </div>
  )
}
