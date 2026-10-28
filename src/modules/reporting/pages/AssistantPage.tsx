import { useEffect, useRef, useState } from 'react'
import { Bot, Loader2, RotateCcw, Send, Sparkles } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { EXAMPLES, answer, type Answer, type AssistantContext, type View } from '../lib/assistantCore'
import { FactsGate, Freshness, Help, Panel, Tag } from '../components/rpx'
import type { ProjectFacts } from '../lib/analyticsCore'

interface Turn { q: string; a: Answer; ai?: { sentences: { text: string; refs: string[] }[]; rejected: number } | { error: string } }

/** Questions in Persian, answered from the facts the user can read; the model can only re-phrase a finished answer, on request. */
export function AssistantPage({ onOpen }: { onOpen: (view: View, projectId: string | null) => void }) {
  return <div className="rpx"><FactsGate>{(all) => <Chat all={all} onOpen={onOpen} />}</FactsGate></div>
}

function Chat({ all, onOpen }: { all: ProjectFacts[]; onOpen: (view: View, projectId: string | null) => void }) {
  const [q, setQ] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [ctx, setCtx] = useState<AssistantContext | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [turns.length])

  const ask = (text: string) => {
    const t = text.trim(); if (!t) return
    const a = answer(t, all, ctx)
    setTurns((x) => [...x, { q: t, a }]); setCtx(a.context); setQ('')
  }
  // optional wording: the guarded rp-narrate function returns sentences that cite line ids and reuse only their numbers
  const rephrase = async (i: number) => {
    setBusy(i)
    const items = turns[i].a.lines.map((l) => ({ id: l.id, text: [l.text, ...l.evidence].join(' — ') }))
    const { data, error } = await supabase.functions.invoke('rp-narrate', { body: { items } })
    setBusy(null)
    setTurns((x) => x.map((t, k) => (k !== i ? t : { ...t, ai: error || !data?.available ? { error: error ? 'سرویس در دسترس نیست' : 'سرویس هوش مصنوعی پیکربندی نشده است' } : { sentences: data.sentences ?? [], rejected: data.rejected ?? 0 } })))
  }

  return (
    <>
      <Panel title={<><Bot size={15} /> دستیار هوشمند مدیریتی</>} sub="پرسش خود را به فارسی بنویسید. پاسخ از داده‌های پروژه‌هایی ساخته می‌شود که شما اجازهٔ دیدنشان را دارید."
        help="دستیار منظور پرسش و محدودهٔ آن (نام پروژه، طرح، پورتفولیو، واژه‌های منطقه‌ای یا «همین پروژه‌ها») را تشخیص می‌دهد، عددها را با همان موتور «مرکز تحلیل» محاسبه می‌کند و برای هر سطر شواهد می‌آورد. مدل زبانی هیچ عددی تولید نمی‌کند؛ فقط اگر «بازنویسی روان» را بزنید، متن پاسخ را با کنترل عدد و ارجاع بازنویسی می‌کند."
        actions={<Freshness />}>
        <div className="rpx-bar">{EXAMPLES.map((e) => <button key={e} className="rpx-chip" onClick={() => ask(e)}>{e}</button>)}</div>
      </Panel>

      <div className="rpx-chat" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} style={{ display: 'grid', gap: '.45rem' }}>
            <div className="rpx-q">{t.q}</div>
            <div className="rpx-panel rpx-a">
              <div className="rpx-bar">
                {t.a.understood && <Tag tone="acc">برداشت: {t.a.understood}</Tag>}
                <Tag tone="none">محدوده: {t.a.scope.label.length > 60 ? `${t.a.scope.label.slice(0, 60)}…` : t.a.scope.label} ({t.a.scope.projectIds.length.toLocaleString('fa-IR')} پروژه)</Tag>
              </div>
              <ol>{t.a.lines.map((l) => (
                <li key={l.id}>{l.text}
                  {l.evidence.length > 0 && <details><summary>شواهد و منبع</summary><ul>{l.evidence.map((e, k) => <li key={k}>{e}</li>)}</ul></details>}
                </li>
              ))}</ol>
              {t.a.table && <div className="rpx-table-wrap"><table className="rpx-table"><thead><tr>{t.a.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{t.a.table.rows.map((r, k) => <tr key={k}>{r.map((c, m) => <td key={m}>{c}</td>)}</tr>)}</tbody></table></div>}
              {t.a.caveats.length > 0 && <div className="rpx-caveats">{t.a.caveats.map((c, k) => <span key={k}>{c}</span>)}</div>}
              {t.ai && ('error' in t.ai ? <p className="rpx-note">بازنویسی انجام نشد: {t.ai.error}. پاسخ محاسبه‌شدهٔ بالا معتبر است.</p> : (
                <div className="rpx-item t-violet" style={{ borderInlineStartColor: 'var(--c)' }}>
                  <div className="rpx-item-head"><b>بازنویسی روان</b><Tag tone="violet">متن ماشینی — عددها کنترل شده</Tag></div>
                  {t.ai.sentences.length ? t.ai.sentences.map((s, k) => <p key={k}>{s.text}</p>) : <p>جمله‌ای از کنترل عبور نکرد.</p>}
                  {t.ai.rejected > 0 && <p className="rpx-note">{t.ai.rejected.toLocaleString('fa-IR')} جمله به دلیل عدد یا ارجاع نامعتبر حذف شد.</p>}
                </div>
              ))}
              <div className="rpx-actions-row">
                {t.a.links.map((l) => <button key={l.label} className="rpx-btn" onClick={() => onOpen(l.view, l.projectId)}>{l.label}</button>)}
                {t.a.lines.length > 1 && !t.ai && <button className="rpx-btn" disabled={busy === i} onClick={() => rephrase(i)}>{busy === i ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} بازنویسی روان</button>}
                <Help>«بازنویسی روان» فقط متن همین پاسخ را به سرویس هوش مصنوعی می‌فرستد (نه رکوردهای پروژه). جمله‌ای که عدد تازه یا ارجاع نامعتبر داشته باشد حذف می‌شود.</Help>
              </div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>

      <div className="rpx-panel">
        {ctx?.projectIds && ctx.scopeLabel && turns.length > 0 && (
          <div className="rpx-bar" style={{ marginBottom: 6 }}>
            <span className="rpx-muted">پرسش بعدی می‌تواند به «همین پروژه‌ها» اشاره کند ({ctx.scopeLabel.length > 50 ? `${ctx.scopeLabel.slice(0, 50)}…` : ctx.scopeLabel}).</span>
            <button className="rpx-btn" onClick={() => { setCtx(null); setTurns([]) }}><RotateCcw size={12} /> گفت‌وگوی تازه</button>
          </div>
        )}
        <form className="rpx-compose-box" onSubmit={(e) => { e.preventDefault(); ask(q) }}>
          <textarea className="rpx-input" rows={1} aria-label="پرسش" placeholder="مثلاً: سه پروژه با بیشترین انحراف زمانی کدام‌اند؟" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q) } }} />
          <button type="submit" className="rpx-btn is-primary" disabled={!q.trim()}><Send size={13} /> پرسیدن</button>
        </form>
      </div>
    </>
  )
}
