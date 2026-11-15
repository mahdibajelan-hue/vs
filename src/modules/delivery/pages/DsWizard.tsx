import { useState } from 'react'
import { ChevronLeft, ChevronRight, Database, Lock } from 'lucide-react'
import { GROUPS, QUESTIONS, isAnswered, visible, type Answers, type GroupKey, type Question } from '../lib/questions'
import type { Result } from '../lib/engine'
import { fa, nameOf } from '../lib/useLive'

function Field({ q, v, set, src, disabled }: { q: Question; v: Answers[string] | undefined; set: (v: Answers[string]) => void; src?: string; disabled: boolean }) {
  const id = `dsq-${q.key}`
  const unknown = !isAnswered(v)
  return (
    <div className={`ds-q ${unknown ? 'is-unk' : ''}`} role="group" aria-labelledby={id}>
      <div className="ds-q-h">
        <span id={id} className="ds-q-t">{q.fa}{q.critical && <em className="ds-crit" title="اطلاعات کلیدی؛ نامشخص بودن آن اطمینان تحلیل را کم می‌کند">کلیدی</em>}</span>
        {src && <span className="ds-src"><Database size={11} aria-hidden />{src}</span>}
      </div>
      {q.help && <p className="ds-q-help">{q.help}</p>}
      {q.type === 'scale' && (
        <div className="ds-scale">
          <span className="ds-scale-e">{q.lo}</span>
          <div className="ds-seg">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" disabled={disabled} aria-pressed={v === n} onClick={() => set(n)}>{fa(n)}</button>)}</div>
          <span className="ds-scale-e">{q.hi}</span>
          <button type="button" className="ds-unk" disabled={disabled} aria-pressed={unknown} onClick={() => set(null)}>نامشخص</button>
        </div>
      )}
      {q.type === 'bool' && (
        <div className="ds-seg is-wide">
          <button type="button" disabled={disabled} aria-pressed={v === true} onClick={() => set(true)}>بله</button>
          <button type="button" disabled={disabled} aria-pressed={v === false} onClick={() => set(false)}>خیر</button>
          <button type="button" disabled={disabled} aria-pressed={unknown} onClick={() => set(null)}>نامشخص</button>
        </div>
      )}
      {q.type === 'choice' && (
        <div className="ds-seg is-wide is-wrap">
          {q.options!.map((o) => <button key={o.v} type="button" disabled={disabled} aria-pressed={v === o.v} onClick={() => set(o.v)}>{o.fa}</button>)}
          <button type="button" disabled={disabled} aria-pressed={unknown} onClick={() => set(null)}>نامشخص</button>
        </div>
      )}
      {q.type === 'number' && (
        <label className="ds-num">
          <input type="number" inputMode="decimal" min={0} disabled={disabled} value={typeof v === 'number' ? v : ''} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} aria-labelledby={id} />
          {q.unit && <span>{q.unit}</span>}
        </label>
      )}
    </div>
  )
}

export function DsWizard({ answers, sources, setAnswer, locked, live }: { answers: Answers; sources: Record<string, string>; setAnswer: (k: string, v: Answers[string]) => void; locked: boolean; live: Result | null }) {
  const [g, setG] = useState<GroupKey>('general')
  const gi = GROUPS.findIndex((x) => x.key === g)
  const qs = QUESTIONS.filter((q) => q.group === g && visible(q, answers))
  const stat = (k: GroupKey) => { const xs = QUESTIONS.filter((q) => q.group === k && visible(q, answers)); return { n: xs.length, done: xs.filter((q) => isAnswered(answers[q.key])).length, crit: xs.filter((q) => q.critical && !isAnswered(answers[q.key])).length } }
  return (
    <div className="ds-wiz">
      <nav className="ds-steps" aria-label="گروه‌های پرسش">
        {GROUPS.map((x, i) => { const s = stat(x.key); return (
          <button key={x.key} type="button" aria-current={g === x.key ? 'step' : undefined} className={s.done === s.n ? 'is-done' : ''} onClick={() => setG(x.key)}>
            <span className="ds-step-n">{fa(i + 1)}</span>
            <span className="ds-step-t">{x.fa}<small>{fa(s.done)} از {fa(s.n)}{s.crit ? ` · ${fa(s.crit)} کلیدی نامشخص` : ''}</small></span>
            <span className="ds-step-p" aria-hidden><b style={{ width: `${s.n ? (s.done / s.n) * 100 : 0}%` }} /></span>
          </button>
        ) })}
      </nav>
      <section className="ds-card ds-qs" aria-labelledby="ds-g-h">
        <header>
          <h3 id="ds-g-h">{GROUPS[gi].fa}</h3><p>{GROUPS[gi].help} پرسش‌ها بر اساس نوع پروژه نمایش داده می‌شوند؛ «نامشخص» یک پاسخ معتبر است و به‌جای حدس زدن در اطمینان تحلیل منعکس می‌شود.</p>
          {locked && <p className="ds-lock"><Lock size={13} aria-hidden />این مطالعه در جریان تصمیم یا تصویب‌شده است؛ ورودی‌ها قفل‌اند.</p>}
        </header>
        <div className="ds-q-list">{qs.map((q) => <Field key={q.key} q={q} v={answers[q.key]} src={sources[q.key]} disabled={locked} set={(v) => setAnswer(q.key, v)} />)}</div>
        <footer className="ds-q-nav">
          <button type="button" className="ds-btn is-ghost" disabled={gi === 0} onClick={() => setG(GROUPS[gi - 1].key)}><ChevronRight size={15} aria-hidden />گروه قبل</button>
          {live && <span className="ds-live" aria-live="polite">جهت‌گیری فعلی: <b>{nameOf(live, live.winner)}</b> · اطمینان {fa(live.confidence.score)}</span>}
          <button type="button" className="ds-btn is-ghost" disabled={gi === GROUPS.length - 1} onClick={() => setG(GROUPS[gi + 1].key)}>گروه بعد<ChevronLeft size={15} aria-hidden /></button>
        </footer>
      </section>
    </div>
  )
}
