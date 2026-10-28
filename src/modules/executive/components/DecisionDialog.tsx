import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Gavel, X } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { usePortfolioStore } from '../store/usePortfolioStore'
import { DECISION_FA, type PfDecisionKind, type PfProjectView } from '../lib/portfolioCore'
import { faNum, HealthChip } from './pfUi'

const KINDS = Object.keys(DECISION_FA) as PfDecisionKind[]

/** Record a portfolio decision for one project. The project's health and priority at this moment are stored with it. */
export function DecisionDialog({ views, initialId, onClose }: { views: PfProjectView[]; initialId: string | null; onClose: () => void }) {
  const recordDecision = usePortfolioStore((s) => s.recordDecision)
  const [projectId, setProjectId] = useState(initialId ?? views[0]?.input.id ?? '')
  const [kind, setKind] = useState<PfDecisionKind | null>(null)
  const [rationale, setRationale] = useState('')
  const [conditions, setConditions] = useState('')
  const [reviewBy, setReviewBy] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const v = views.find((x) => x.input.id === projectId)

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  async function submit() {
    if (!v) return setErr('پروژه را انتخاب کنید.')
    if (!kind) return setErr('نوع تصمیم را انتخاب کنید.')
    if (!rationale.trim()) return setErr('دلیل تصمیم را بنویسید؛ تصمیم بدون دلیل ثبت نمی‌شود.')
    if ((kind === 'hold' || kind === 'replan') && !reviewBy) return setErr('برای توقف موقت یا بازبرنامه‌ریزی، تاریخ بازبینی را تعیین کنید.')
    setBusy(true); setErr('')
    const ok = await recordDecision({ projectId: v.input.id, decision: kind, rationale, conditions, reviewBy: reviewBy || null, healthAtDecision: v.health, priorityAtDecision: v.priority })
    setBusy(false)
    if (ok) onClose(); else setErr('ثبت نشد؛ دسترسی «تصویب» ماژول پرتفولیو لازم است.')
  }

  return createPortal(
    <div className="pf-modal-back" dir="rtl" onClick={onClose}>
      <div className="pf-modal" role="dialog" aria-modal="true" aria-labelledby="pf-dec-title" onClick={(e) => e.stopPropagation()}>
        <header className="pf-modal-head">
          <h2 id="pf-dec-title"><Gavel size={17} aria-hidden /> ثبت تصمیم سبد</h2>
          <button type="button" className="pf-icon" onClick={onClose} aria-label="بستن"><X size={16} /></button>
        </header>

        <label className="pf-field">
          <span>پروژه</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {views.map((x) => <option key={x.input.id} value={x.input.id}>{x.input.name}</option>)}
          </select>
        </label>
        {v && (
          <div className="pf-dec-now">
            <span>وضعیت فعلی:</span> <HealthChip health={v.health} />
            <span>اولویت: <b>{v.priority == null ? '—' : faNum(v.priority)}</b>{v.rank ? ` (رتبهٔ ${faNum(v.rank)})` : v.input.score?.mandatory ? ' (الزامی)' : ''}</span>
            {v.lastDecision && <span>آخرین تصمیم: <b>{DECISION_FA[v.lastDecision.decision].label}</b></span>}
          </div>
        )}

        <fieldset className="pf-field">
          <legend>تصمیم</legend>
          <div className="pf-kinds" role="radiogroup">
            {KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={`pf-kind ${kind === k ? 'is-on' : ''}`} style={{ '--c': DECISION_FA[k].color } as CSSProperties} onClick={() => setKind(k)}>
                <b>{DECISION_FA[k].label}</b><small>{DECISION_FA[k].hint}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="pf-field">
          <span>دلیل تصمیم <em>(الزامی)</em></span>
          <textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="بر چه اساسی؟ مثلاً CPI زیر ۰٫۸۵ در سه ماه اخیر و افزایش هزینهٔ لوله…" />
        </label>
        <label className="pf-field">
          <span>شرایط و اقدامات لازم</span>
          <textarea rows={2} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="اختیاری — مثلاً ارائهٔ برنامهٔ بازیابی تا پایان ماه" />
        </label>
        <label className="pf-field">
          <span>تاریخ بازبینی {kind === 'hold' || kind === 'replan' ? <em>(الزامی)</em> : null}</span>
          <JalaliDateInput value={reviewBy} onChange={setReviewBy} />
        </label>
        <p className="pf-note">تصمیم ثبت‌شده حذف نمی‌شود؛ فقط با ذکر دلیل قابل ابطال است. وضعیت سلامت و امتیاز اولویت این لحظه همراه تصمیم ذخیره می‌شود.</p>
        {err && <p className="pf-err" role="alert">{err}</p>}
        <footer className="pf-modal-foot">
          <button type="button" className="pf-btn" onClick={onClose}>انصراف</button>
          <button type="button" className="pf-btn is-primary" disabled={busy} onClick={submit}>{busy ? 'در حال ثبت…' : 'ثبت تصمیم'}</button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

