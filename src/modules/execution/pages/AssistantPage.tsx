import { useMemo, useRef, useState } from 'react'
import { Mic, MicOff, Send, Volume2 } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { useSpeech } from '../../missions/components/useSpeech'
import { useEpcModel } from '../lib/useEpcModel'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { answer, type Answer, type AssistantFacts } from '../lib/engine/assistant'
import { resourcesForTarget } from '../lib/engine/scenarios'
import { workingDays, addDays, jalaliText, weekOf } from '../lib/periods'
import { Empty } from '../components/common'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { EpcGate } from '../components/epc/EpcBanner'

interface Turn { q: string; a: Answer; ai?: boolean }
const EXAMPLES = ['امروز پروژه نسبت به برنامه در چه وضعیتی است؟', 'کدام جبهه‌ها بیشترین عقب‌ماندگی را دارند و علت اصلی چیست؟', 'برای جبران عقب‌ماندگی جوشکاری در سه هفته آینده چه منابعی لازم است؟', 'چه موانع مهندسی یا تأمین کالایی اثر دارند؟', 'کدام تعهدات انجام نشده است؟', 'وضعیت مقادیر اجرایی در مقایسه با صورت‌وضعیت چیست؟', 'چه تصمیم‌هایی لازم است؟']

/** Management assistant: answers come from the engines' results (rule-based router over a facts snapshot). Optionally the server re-phrases the answer — it can never change the numbers. */
export function AssistantPage(p: { projectId: string }) { return <EpcGate><Inner {...p} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const m = useEpcModel(projectId)
  const ex = useExecutionStore()
  const look = useEpcStore((s) => s.lookahead)
  const projectName = useMasterDataStore((s) => s.projects.find((x) => x.id === projectId)?.officialName ?? '')
  const allowed = ex.can(projectId, '*') || ex.can(projectId, 'assistant')
  const [q, setQ] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [useAi, setUseAi] = useState(false)
  const [busy, setBusy] = useState(false)
  const voice = useSpeech((chunk) => setQ((x) => `${x} ${chunk}`.trim()), false) // browser recogniser only: audio is not sent to our servers
  const endRef = useRef<HTMLDivElement>(null)
  const facts = useMemo<AssistantFacts>(() => {
    const e = m.ex, today = m.today
    const wd = workingDays(addDays(today, 1), addDays(today, 21), e.settings.workDays).length
    const acts = e.activities.filter((a) => a.active && a.approval === 'approved')
    const ins = (id: string) => m.insights.get(id)
    const welding = acts.filter((a) => (a.metric === 'weld_joint' || a.title.includes('جوش')) && (ins(a.id)?.remaining ?? 0) > 0).slice(0, 4).map((a) => {
      const i = ins(a.id)!, st = m.stateFor(a.id, { frontsAvailable: Math.max(1, e.settings.expectedFronts.length) })
      const required = wd > 0 ? i.remaining / wd : null
      const rt = st && required != null ? resourcesForTarget(st.state, required) : null
      return { title: a.title, remaining: i.remaining, perDay: i.forecast.perDay, requiredPerDay: required, extraCrews: rt ? rt.extraCrews : null, reachable: rt ? rt.reachable : null, capLabel: rt?.cap?.label ?? null, basis: st?.basis ?? 'assumed', confidence: i.prod.quality.confidence, workDays: wd }
    })
    const prevWeek = addDays(weekOf(today, e.settings.weekStart).from, -7)
    const title = (id: string) => e.actById.get(id)?.title ?? '—'
    const missed = look.filter((l) => l.projectId === projectId && l.weekStart === prevWeek && l.committed && (l.achievedQty ?? 0) < l.plannedQty * 0.9).map((l) => ({ title: title(l.activityId), cause: l.deviationCause }))
    return {
      today, projectName, progress: { actual: e.approved.overall, planned: e.planned.overall, spi: m.spi },
      activities: acts.map((a) => { const i = ins(a.id); const pe = a.plannedEnd; return { id: a.id, title: a.title, unit: a.unit, remaining: i?.remaining ?? 0, pct: i && i.base ? 1 - i.remaining / i.base : 0, plannedEnd: pe, late: !!pe && pe < today && (i?.remaining ?? 0) > 0, forecastFinish: i?.forecast.finish ?? null, onTimeProb: i?.forecast.onTimeProb ?? null, lateRisk: i?.forecast.lateRisk ?? 'unknown', unreliable: i?.forecast.unreliable ?? true, readiness: i?.readiness.state ?? 'unknown', blockers: i?.readiness.blockers ?? [], front: a.front } }),
      stoppages: e.stoppages.map((s) => ({ category: s.category, hours: s.hours, critical: s.critical })),
      alerts: m.alerts.map((a) => ({ severity: a.severity, title: a.title, reason: a.reason })),
      ledger: m.ledger.map((l) => ({ title: l.title, mismatches: l.mismatches.filter((x) => x.kind !== 'approved_not_measured').map((x) => x.detail) })),
      lookahead: { ppc: m.ppcLast?.ppc ?? null, committed: m.ppcLast?.committed ?? 0, missed },
      pendingReviews: e.reports.filter((r) => r.status === 'submitted' || r.status === 'partially_approved').length,
      welding,
    }
  }, [m, look, projectId, projectName])
  if (!allowed) return <Empty>دسترسی به دستیار هوشمند برای مدیر طرح، مدیر اجرا، کارفرما، مشاور، نظارت و مدیر برنامه‌ریزی فعال است.</Empty>
  const ask = async (text: string) => {
    const t = text.trim(); if (!t) return
    setBusy(true); setQ('')
    let a = answer(t, facts), ai = false
    if (useAi && a.known) {
      const { data, error } = await supabase.functions.invoke('ex-assistant', { body: { question: t, answer: a.text } })
      if (!error && data?.available && data.text) { a = { ...a, text: data.text }; ai = !!data.rewritten }
    }
    setTurns((x) => [...x, { q: t, a, ai }]); setBusy(false)
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }
  const speak = (t: string) => { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(t); u.lang = 'fa-IR'; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u) } }
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 900 }}>
      <p className="im-helper" style={{ margin: 0 }}>پاسخ‌ها از نتایج موتورهای محاسباتی و داده‌های ثبت‌شدهٔ همین پروژه ساخته می‌شود؛ دستیار خودش محاسبه نمی‌کند و اگر داده کافی نباشد صریحاً می‌گوید پاسخ قطعی ممکن نیست. دسترسی شما همان دسترسی سامانه است. ورودی صوتی از تشخیص‌دهندهٔ مرورگر استفاده می‌کند (در برخی مرورگرها صدا برای سرویس تشخیص گفتار خود مرورگر ارسال می‌شود).</p>
      <div className="ex-chiprow">{EXAMPLES.map((e) => <button key={e} className="mt-pill" onClick={() => void ask(e)}>{e}</button>)}</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {turns.map((t, i) => (
          <div key={i} className="im-card" style={{ padding: '10px 14px', display: 'grid', gap: 6 }}>
            <b>{t.q}</b>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9 }}>{t.a.text}</div>
            <small style={{ color: 'var(--im-muted)' }}>{t.a.known ? `منبع: ${t.a.sources.join('، ')} · داده تا ${jalaliText(t.a.asOf)}${t.ai ? ' · بازنویسی‌شده با مدل زبانی (اعداد ثابت)' : ''}` : 'خارج از دادهٔ قابل‌پاسخ'}</small>
            <div><button className="im-btn im-btn-sm" onClick={() => speak(t.a.text)} aria-label="خواندن پاسخ"><Volume2 size={13} /> خواندن</button></div>
          </div>))}
        <div ref={endRef} />
      </div>
      <form className="im-card" style={{ padding: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); void ask(q) }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="پرسش خود را بنویسید یا بگویید…" dir="auto" style={{ flex: 1, minWidth: 220 }} aria-label="پرسش" />
        {voice.supported && <button type="button" className="im-btn im-btn-sm" onClick={() => (voice.listening ? voice.stop() : voice.start())} aria-label="ورودی صوتی">{voice.listening ? <MicOff size={14} /> : <Mic size={14} />}</button>}
        <button className="im-btn im-btn-primary im-btn-sm" disabled={busy || !q.trim()}><Send size={13} /> بپرس</button>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }} title="فقط متن پاسخ محاسبه‌شده برای بازنویسی ارسال می‌شود، نه داده‌های پروژه"><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> بازنویسی با هوش مصنوعی</label>
      </form>
      {voice.error && <p className="ex-bad" style={{ margin: 0 }}>{voice.error}</p>}
    </div>
  )
}
