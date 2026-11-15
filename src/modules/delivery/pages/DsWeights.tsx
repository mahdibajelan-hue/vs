import { RotateCcw } from 'lucide-react'
import { CRITERIA, type CriterionKey } from '../lib/bank'
import { defaultWeights, normalise, type Result, type Weights } from '../lib/engine'
import type { Answers } from '../lib/questions'
import { fa, nameOf } from '../lib/useLive'

const PRESETS: { k: string; fa: string; w: Partial<Record<CriterionKey, number>> }[] = [
  { k: 'time', fa: 'زمان‌محور', w: { time: 30, costCert: 8, cost: 8, quality: 8, flex: 6, ownerLoad: 8, interface: 8, risk: 8, market: 6, finance: 5, compliance: 5 } },
  { k: 'cost', fa: 'هزینه‌محور', w: { time: 6, costCert: 20, cost: 22, quality: 7, flex: 5, ownerLoad: 6, interface: 6, risk: 10, market: 7, finance: 6, compliance: 5 } },
  { k: 'risk', fa: 'کم‌ریسک', w: { time: 7, costCert: 14, cost: 7, quality: 9, flex: 6, ownerLoad: 9, interface: 12, risk: 20, market: 6, finance: 5, compliance: 5 } },
  { k: 'control', fa: 'کنترل فنی کارفرما', w: { time: 9, costCert: 7, cost: 9, quality: 22, flex: 14, ownerLoad: 4, interface: 6, risk: 10, market: 7, finance: 6, compliance: 6 } },
]

export function DsWeights({ answers, weights, set, locked, live }: { answers: Answers; weights: Partial<Weights> | null; set: (w: Partial<Weights> | null) => void; locked: boolean; live: Result | null }) {
  const def = defaultWeights(answers)
  const cur = weights ? normalise(weights) : def
  const raw = weights ?? def
  const change = (k: CriterionKey, v: number) => set({ ...raw, [k]: v })
  return (
    <section className="ds-card ds-weights" aria-labelledby="ds-w-h">
      <header>
        <h3 id="ds-w-h">وزن معیارها</h3>
        <p>وزن‌های پیش‌فرض از پاسخ‌ها مشتق می‌شوند (مثلاً زمان حیاتی وزن «سرعت تحویل» را بالا می‌برد). هر وزن را می‌توانید تغییر دهید؛ مجموع همیشه به ۱۰۰ نرمال می‌شود و وزن‌های شما در نسخهٔ تحلیل ثبت می‌شود.</p>
        <div className="ds-presets">
          <button type="button" className="ds-btn is-ghost" disabled={locked || !weights} onClick={() => set(null)}><RotateCcw size={14} aria-hidden />بازگشت به پیش‌فرض</button>
          {PRESETS.map((p) => <button key={p.k} type="button" className="ds-btn is-ghost" disabled={locked} onClick={() => set(p.w)}>{p.fa}</button>)}
        </div>
        <p className="ds-muted">{weights ? 'وزن‌های دستی فعال است.' : 'وزن‌های پیش‌فرض (مشتق از پاسخ‌ها) فعال است.'}{live && <> گزینهٔ برتر با این وزن‌ها: <b>{nameOf(live, live.winner)}</b>.</>}</p>
      </header>
      <ul className="ds-w-list">
        {CRITERIA.map((c) => (
          <li key={c.key}>
            <label htmlFor={`dsw-${c.key}`}><b>{c.fa}</b><small>{c.help}</small></label>
            <input id={`dsw-${c.key}`} type="range" min={0} max={40} step={1} disabled={locked} value={Math.round(raw[c.key] ?? 0)} onChange={(e) => change(c.key, Number(e.target.value))} aria-valuetext={`${fa(cur[c.key], 1)} درصد`} />
            <span className="ds-w-v">{fa(cur[c.key], 1)}٪{weights && Math.abs(cur[c.key] - def[c.key]) >= 0.5 && <small>پیش‌فرض {fa(def[c.key], 1)}</small>}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
