import { useEffect, useMemo, useState } from 'react'
import { Bot, Lightbulb, MessageSquareText, Radar, ScanText, Sparkles } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { HelpButton } from '../../issues/components/Help'
import { useRiskData, useRiskDirectory, useRiskRole } from '../lib/useRiskData'
import { useRiskStore } from '../store/useRiskStore'
import { aiStatus, askRisks, extractRisks, summarize, type AskResult } from '../lib/riskAiClient'
import { proposeMitigations, realizationSignal, SIGNAL_LABEL_FA, type RiskCandidate } from '../lib/riskAi'
import { LevelChip, ScoreTriple, useCategoryLabel } from '../components/rk'
import type { PageProps } from '../RiskApp'

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) }
const SIG_COLOR = { low: '#22c55e', moderate: '#eab308', elevated: '#f97316', high: '#ef4444' } as const
const HELP_ASSIST = {
  title: 'دستیار هوشمند ریسک',
  purpose: 'پرسش به زبان طبیعی، استخراج ریسک از متن گزارش‌ها، خلاصهٔ وضعیت، پیشنهاد اقدام کاهشی و نشانه‌های هشدار — همه به‌صورت پیشنهاد؛ تصمیم با شماست.',
  steps: ['پرسش بنویسید (مثلاً «ریسک‌های بحرانی بدون مالک»)؛ پاسخ فقط از ریسک‌هایی می‌آید که دسترسی دارید و کدهای مرجع نشان داده می‌شود.', 'متن صورت‌جلسه یا گزارش بازدید را بچسبانید تا ریسک‌های بالقوه استخراج شوند؛ هر مورد با دلیل و درجهٔ اطمینان می‌آید و پس از تأیید شما ثبت می‌شود.', 'پیشنهاد اقدام کاهشی فقط از اقدام‌هایی ساخته می‌شود که در ریسک‌های مشابه واقعاً اثر داشته‌اند.'],
  how: ['بدون سرویس هوش مصنوعی، موتور قاعده‌محور داخلی (واژه‌ها و شباهت متنی) کار می‌کند و برچسب «قاعده‌محور» دارد.', 'نشانهٔ هشدار تحقق، احتمال آماری نیست؛ جمع امتیازِ نشانه‌های قابل‌مشاهده است و عوامل آن نشان داده می‌شود.'],
  tips: ['اطلاعات حساس (ایمیل، تلفن، کارت) پیش از ارسال به سرویس هوش مصنوعی پوشانده می‌شود و نام افراد ارسال نمی‌شود.', 'تصمیمات حساس و تغییرات مهم همیشه نیازمند تأیید انسان‌اند.'],
}

export function AssistantPage({ onOpenRisk }: PageProps) {
  const d = useRiskData()
  const dir = useRiskDirectory()
  const catLabel = useCategoryLabel()
  const role = useRiskRole(d.scope === 'all' ? null : d.scope)
  const categories = useRiskStore((s) => s.categories)
  const addAction = useRiskStore((s) => s.addAction)
  const [ai, setAi] = useState<{ available: boolean; provider: string | null } | null>(null)
  const [q, setQ] = useState('')
  const [asking, setAsking] = useState(false)
  const [ans, setAns] = useState<AskResult | null>(null)
  const [sum, setSum] = useState<Awaited<ReturnType<typeof summarize>> | null>(null)
  const [text, setText] = useState('')
  const [project, setProject] = useState(d.scope !== 'all' ? d.scope : '')
  const [cands, setCands] = useState<{ items: RiskCandidate[]; source: 'ai' | 'rules' } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [target, setTarget] = useState('')
  useEffect(() => { aiStatus().then(setAi) }, [])

  const qctx = useMemo(() => ({ risks: d.risks, states: d.states, categories: categories.map((c) => ({ key: c.key, labelFa: c.labelFa })), projects: d.allProjects.map((p) => ({ id: p.id, name: p.name })), userIdByName: () => null }), [d, categories])
  const ask = async () => { if (!q.trim()) return; setAsking(true); setAns(await askRisks(q, qctx)); setAsking(false) }
  const doSummary = async () => { setBusy('sum'); setSum(await summarize(d.risks, d.states, d.actions, d.scope === 'all' ? 'همهٔ پروژه‌ها' : d.allProjects.find((p) => p.id === d.scope)?.name ?? '')); setBusy(null) }
  const extract = async () => { if (text.trim().length < 20) { setMsg('متن را بچسبانید (دست‌کم چند جمله).'); return } setBusy('ex'); setMsg(''); setCands(await extractRisks(text, categories.map((c) => c.key))); setBusy(null) }
  const createCand = async (c: RiskCandidate) => {
    const master = d.allProjects.find((p) => p.id === project)?.masterRefId
    if (!master) { setMsg('پروژه را انتخاب کنید (و پروژه باید به اطلاعات پایه نگاشت شده باشد).'); return }
    setBusy(c.riskEvent)
    const { data, error } = await supabase.rpc('rm_ingest_risk', { p_source: c.source === 'ai' ? 'ai' : 'meeting', p_external_system: 'assistant', p_external_id: `${project}:${hash(c.riskEvent)}`, p_master_project: master, p_payload: { title: c.title, description: c.riskEvent, cause: c.cause, risk_event: c.riskEvent, consequence: c.consequence, category: c.category, probability: c.probability, impact: c.impact } })
    setBusy(null)
    if (error) { setMsg(error.message); return }
    await useRiskStore.getState().fetchAll()
    setCands((o) => (o ? { ...o, items: o.items.filter((x) => x !== c) } : o))
    const r = data as { id: string; created: boolean }
    setMsg(r.created ? 'ریسک ساخته شد (ارزیابی اولیه حدسی است؛ لطفاً در ارزیابی بازنگری کنید).' : 'این مورد قبلاً ثبت شده بود؛ رکورد تکراری ساخته نشد.')
    if (r.id) onOpenRisk(r.id)
  }

  const mitig = useMemo(() => { const r = d.risks.find((x) => x.id === target); return r ? proposeMitigations(r, useRiskStore.getState().risks, useRiskStore.getState().assessments, useRiskStore.getState().actions) : null }, [target, d.risks])
  const signals = useMemo(() => d.active.map((r) => ({ r, sig: realizationSignal(r, d.states.get(r.id)!, d.kris.filter((k) => k.riskId === r.id && k.state === 'critical').length, d.kris.filter((k) => k.riskId === r.id && k.state === 'warn').length) })).filter((x) => x.sig.level === 'high' || x.sig.level === 'elevated').sort((a, b) => b.sig.points - a.sig.points).slice(0, 8), [d.active, d.states, d.kris])

  return (
    <div className="im-page">
      <div className="im-topbar">
        <div><div className="im-page-title"><Bot size={22} style={{ color: 'var(--im-violet)' }} />دستیار هوشمند ریسک</div><div className="im-page-sub">پیشنهادها با مبنا، درجهٔ اطمینان و محدودیت داده — تصمیم نهایی با انسان</div></div>
        <div className="im-actions"><span className="rk-flag" style={{ ['--c' as string]: ai?.available ? '#22c55e' : '#94a3b8' }}><Sparkles size={11} />{ai === null ? 'در حال بررسی…' : ai.available ? `هوش مصنوعی فعال (${ai.provider})` : 'موتور قاعده‌محور (سرویس هوش مصنوعی تنظیم نشده)'}</span><HelpButton content={HELP_ASSIST} /></div>
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title"><MessageSquareText size={16} style={{ color: 'var(--im-sky)' }} /> بپرسید</div>
        <div className="im-actions"><input style={{ flex: '1 1 320px' }} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} placeholder="مثلاً: ریسک‌های بحرانی بدون مالک · ریسک‌های HSE خارج از تحمل · اقدام‌های مسدود" aria-label="پرسش" /><button className="im-btn im-btn-primary" disabled={asking || !q.trim()} onClick={ask}>{asking ? 'در حال بررسی…' : 'پاسخ'}</button></div>
        {ans && (
          <div style={{ marginTop: 10 }}>
            {ans.answer && <div className="im-notice info" style={{ marginBottom: 8 }}>{ans.answer}<div className="im-helper">منبع پاسخ: هوش مصنوعی · اطمینان {Math.round((ans.confidence ?? 0) * 100)}٪ · فقط بر پایهٔ ریسک‌هایی که می‌بینید</div></div>}
            <div className="im-helper" style={{ marginBottom: 6 }}>{ans.source === 'rules' ? 'قاعده‌محور' : 'هوش مصنوعی'} · {ans.explanation.length ? `برداشت: ${ans.explanation.join(' + ')}` : ''} · {ans.ids.length} ریسک</div>
            {ans.limitations.map((l) => <div key={l} className="im-helper">• {l}</div>)}
            <div className="im-grid" style={{ gap: 6, marginTop: 6 }}>{ans.ids.slice(0, 12).map((id) => { const r = d.risks.find((x) => x.id === id); return r ? <button key={id} className="im-task" style={{ display: 'flex', width: '100%', textAlign: 'right', justifyContent: 'space-between', gap: 8 }} onClick={() => onOpenRisk(id)}><span><span className="im-code">{r.code}</span> {r.title}</span><ScoreTriple state={d.states.get(id)!} policy={d.policyFor(r.projectId)} /></button> : null })}{ans.ids.length > 12 && <div className="im-helper">+{ans.ids.length - 12} مورد دیگر — برای فهرست کامل از «شناسایی و ثبت» فیلتر کنید.</div>}</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div className="im-card">
          <div className="im-section-title"><ScanText size={16} style={{ color: 'var(--im-amber)' }} /> استخراج ریسک از متن (صورت‌جلسه، گزارش بازدید)</div>
          <textarea style={{ minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="متن صورت‌جلسه یا گزارش را اینجا بچسبانید…" />
          <div className="im-actions" style={{ marginTop: 8 }}>
            <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="پروژه" style={{ width: 'auto' }}><option value="">— پروژهٔ مقصد —</option>{d.allProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button className="im-btn im-btn-primary im-btn-sm" disabled={busy === 'ex'} onClick={extract}>{busy === 'ex' ? 'در حال استخراج…' : 'استخراج'}</button>
          </div>
          {msg && <div className="im-helper" style={{ marginTop: 6 }}>{msg}</div>}
          {cands && (cands.items.length === 0 ? <div className="im-helper" style={{ marginTop: 8 }}>ریسک بالقوه‌ای در متن تشخیص داده نشد.</div> : (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <div className="im-helper">{cands.source === 'ai' ? 'هوش مصنوعی' : 'قاعده‌محور'} · {cands.items.length} مورد — هر مورد پیشنهاد است و پس از تأیید شما ثبت می‌شود</div>
              {cands.items.map((c) => (
                <div key={c.riskEvent} className="im-task">
                  <b>{c.title}</b>
                  <div className="rk-flags"><span className="rk-flag">{catLabel(c.category)}</span><span className="rk-flag" style={{ ['--c' as string]: '#94a3b8' }}>احتمال {c.probability} · اثر {c.impact} (حدسی)</span><span className="rk-flag" style={{ ['--c' as string]: '#94a3b8' }}>اطمینان {Math.round(c.confidence * 100)}٪</span></div>
                  {c.reasons.map((r) => <div key={r} className="im-helper">• {r}</div>)}
                  {role.canEdit && <button className="im-btn im-btn-primary im-btn-sm" style={{ marginTop: 6 }} disabled={busy === c.riskEvent} onClick={() => createCand(c)}>تأیید و ثبت ریسک</button>}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="im-card">
          <div className="im-section-title"><Sparkles size={16} style={{ color: 'var(--im-violet)' }} /> خلاصهٔ وضعیت ریسک</div>
          <button className="im-btn im-btn-ghost im-btn-sm" disabled={busy === 'sum'} onClick={doSummary}>{busy === 'sum' ? 'در حال تهیه…' : 'تهیهٔ خلاصه'}</button>
          {sum && (
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.9 }}>
              {sum.lines.map((l) => <div key={l}>• {l}</div>)}
              <div className="im-helper" style={{ marginTop: 6 }}>{sum.source === 'ai' ? 'هوش مصنوعی' : 'قاعده‌محور'} · اطمینان داده: {{ low: 'پایین', medium: 'متوسط', high: 'بالا' }[sum.confidence]}</div>
              {sum.limitations.map((l) => <div key={l} className="rk-flag" style={{ ['--c' as string]: '#f59e0b', marginTop: 4, display: 'flex' }}>محدودیت: {l}</div>)}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
        <div className="im-card">
          <div className="im-section-title"><Lightbulb size={16} style={{ color: 'var(--im-amber)' }} /> پیشنهاد اقدام کاهشی از تجربهٔ ریسک‌های مشابه</div>
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="ریسک"><option value="">— ریسک را انتخاب کنید —</option>{d.active.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title.slice(0, 60)}</option>)}</select>
          {mitig && (
            <div style={{ marginTop: 10 }}>
              <div className="im-helper" style={{ marginBottom: 8 }}>{mitig.basis}</div>
              {mitig.items.map((m) => (
                <div key={m.description} className="im-task" style={{ marginBottom: 6 }}>
                  <b>{m.description}</b><div className="im-helper">از ریسک مشابه {m.fromRiskCode} · {m.evidence}</div>
                  {role.canEdit && <button className="im-btn im-btn-ghost im-btn-sm" style={{ marginTop: 4 }} onClick={async () => { const r = await addAction(target, { description: m.description, ownerId: null }); setMsg(r.ok ? 'اقدام افزوده شد (پیش‌نویس؛ مسئول و مهلت را تعیین کنید).' : r.error ?? '') }}>افزودن به اقدام‌ها</button>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="im-card">
          <div className="im-section-title"><Radar size={16} style={{ color: 'var(--im-coral)' }} /> نشانه‌های هشدار تحقق <span className="im-helper">قاعده‌محور و شفاف؛ پیش‌بینی آماری نیست</span></div>
          {signals.length === 0 ? <div className="im-notice ok">ریسکی با نشانهٔ هشدار بالا نیست.</div> : signals.map(({ r, sig }) => (
            <button key={r.id} className="im-task" style={{ display: 'block', width: '100%', textAlign: 'right', marginBottom: 6 }} onClick={() => onOpenRisk(r.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span><span className="im-code">{r.code}</span> {r.title.slice(0, 55)}</span><span className="rk-flag" style={{ ['--c' as string]: SIG_COLOR[sig.level] }}>نشانه {SIGNAL_LABEL_FA[sig.level]}</span></div>
              <div className="im-helper">{sig.factors.join(' · ')}</div><div className="im-helper" style={{ fontSize: 10.5 }}>{sig.note} · {dir.name(r.ownerId)}</div>
              <LevelChip level={d.states.get(r.id)!.level} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
