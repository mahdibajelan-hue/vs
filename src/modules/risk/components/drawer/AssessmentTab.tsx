import { useMemo, useState } from 'react'
import { CheckCheck, Plus } from 'lucide-react'
import { formatJalali } from '../../../../lib/jalali'
import { JalaliDateField } from '../../../issues/components/JalaliDateField'
import { Trend } from '../../../issues/components/charts'
import { useRiskStore } from '../../store/useRiskStore'
import { useRiskDirectory } from '../../lib/useRiskData'
import { todayIso } from '../../lib/riskScore'
import { IMPACT_LABELS_FA, PROBABILITY_LABELS_FA, zoneOf, ZONE_COLOR, ZONE_LABEL_FA, levelOf } from '../../lib/riskPolicy'
import { assignReviewNumbers } from '../../lib/riskScore'
import { RM_METHOD_LABEL_FA, RM_TREND_COLOR, RM_TREND_LABEL_FA, type RmMethod, type RmRiskAssessment, type RmTrend } from '../../types'
import { Field, Scale, ScoreBox, ScoreTriple } from '../rk'
import type { TabProps } from './common'

const KIND_FA = { review: 'بازبینی', post_action: 'پس از اقدام', kri_triggered: 'پس از هشدار KRI', periodic: 'دوره‌ای' } as const

/** Assessments are append-only: a new one is added, an old one is never edited. Lowering a score needs a written basis. */
export function AssessmentTab({ risk, state, policy, canManage }: TabProps) {
  const all = useRiskStore((s) => s.assessments)
  const actions = useRiskStore((s) => s.actions).filter((a) => a.riskId === risk.id && a.status === 'completed')
  const add = useRiskStore((s) => s.addAssessment)
  const approve = useRiskStore((s) => s.approveAssessment)
  const dir = useRiskDirectory()
  const mine = useMemo(() => all.filter((a) => a.riskId === risk.id), [all, risk.id])
  const numbers = useMemo(() => assignReviewNumbers(mine), [mine])
  const sorted = useMemo(() => [...mine].sort((a, b) => (a.reviewDate !== b.reviewDate ? (a.reviewDate < b.reviewDate ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1)), [mine])
  const [open, setOpen] = useState(state.needsReviewRequest)
  const [f, setF] = useState({
    date: todayIso(), method: 'qualitative' as RmMethod, cp: state.currentP, ci: state.currentI, rp: state.residualP, ri: state.residualI, trend: 'stable' as RmTrend, basis: '', comment: '',
    kind: (actions.some((a) => a.effectStatus === 'pending') ? 'post_action' : 'review') as RmRiskAssessment['kind'], pct: '', cost: '', related: [] as string[],
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const newCur = f.cp * f.ci
  const newRes = f.rp * f.ri
  const reduces = newCur < state.current
  const labels = ['ذاتی', ...sorted.map((a) => formatJalali(a.reviewDate))]
  const submit = async () => {
    setErr('')
    if (newRes > newCur) { setErr('ریسک باقیمانده نمی‌تواند از ریسک فعلی بیشتر باشد (باقیمانده یعنی پس از اثر کنترل‌ها).'); return }
    if (reduces && (f.basis + f.comment).trim().length < 5) { setErr('کاهش امتیاز بدون مبنا پذیرفته نمی‌شود؛ در «مبنا» توضیح دهید چه چیزی تغییر کرده است.'); return }
    if (f.method !== 'qualitative' && f.basis.trim().length < 5) { setErr('برای روش نیمه‌کمی/کمی، مبنای ارزیابی الزامی است.'); return }
    if (f.method === 'quantitative' && (f.pct === '' || f.cost === '')) { setErr('برای روش کمی، احتمال (٪) و برآورد مالی را وارد کنید.'); return }
    setBusy(true)
    const r = await add(risk.id, {
      reviewDate: f.date, currentProbability: f.cp, currentImpact: f.ci, residualProbability: f.rp, residualImpact: f.ri, trend: f.trend, reviewerComment: f.comment.trim(), basis: f.basis.trim(), method: f.method,
      impactDims: risk.impactDims, probabilityPct: f.pct === '' ? null : Number(f.pct), exposureCost: f.cost === '' ? null : Number(f.cost.replace(/[^\d.]/g, '')), kind: f.kind, relatedActionIds: f.related, responseStrategy: risk.responseStrategy,
    })
    setBusy(false)
    if (!r.ok) { setErr(r.error ?? ''); return }
    setOpen(false); setF((o) => ({ ...o, basis: '', comment: '', related: [], pct: '', cost: '' }))
  }

  return (
    <div>
      {state.needsReviewRequest && <div className="im-notice bad" style={{ marginBottom: 10 }}><b>درخواست بازنگری:</b> {risk.reviewRequestReason || 'ارزیابی باید بازنگری شود.'}</div>}
      <div className="im-card-flat" style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, justifyContent: 'space-between' }}>
        <div><div className="im-helper" style={{ marginBottom: 6 }}>وضعیت فعلی (آخرین ارزیابی)</div><ScoreTriple state={state} policy={policy} large /></div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: ZONE_COLOR[state.residualZone], fontWeight: 800 }}>باقیمانده: {ZONE_LABEL_FA[state.residualZone]}</div>
          <div className="im-helper">موعد بازنگری بعدی {formatJalali(state.reviewDue)}{state.reviewOverdue ? ` (${-state.reviewDaysLeft} روز عقب‌افتاده)` : ''}</div>
          {state.reductionPct !== null && <div className="im-helper">کاهش از ذاتی تا باقیمانده: {state.reductionPct}٪</div>}
        </div>
      </div>

      {sorted.length >= 1 && (
        <div className="im-card-flat" style={{ marginBottom: 14 }}>
          <div className="im-section-title" style={{ marginBottom: 4 }}>روند امتیاز <span className="im-helper">ذاتی در آغاز، سپس هر ارزیابی</span></div>
          <Trend labels={labels} height={150} series={[
            { key: 'cur', label: 'فعلی', color: '#f97316', values: [state.inherent, ...sorted.map((a) => a.currentScore)] },
            { key: 'res', label: 'باقیمانده', color: '#22c55e', values: [state.inherent, ...sorted.map((a) => a.residualScore)] },
          ]} />
        </div>
      )}

      {canManage ? (
        <div style={{ marginBottom: 14 }}>
          {!open ? <button className="im-btn im-btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> ارزیابی جدید</button> : (
            <div className="im-card-flat">
              <div className="im-section-title">ارزیابی جدید</div>
              <div className="rk-grid3">
                <Field label="تاریخ ارزیابی"><JalaliDateField value={f.date} onChange={(v) => setF({ ...f, date: v })} max={todayIso()} /></Field>
                <Field label="روش ارزیابی"><select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as RmMethod })}>{Object.entries(RM_METHOD_LABEL_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label="نوع ارزیابی"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as RmRiskAssessment['kind'] })}>{Object.entries(KIND_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              </div>
              <div className="rk-grid2">
                <div><div className="im-section-title" style={{ fontSize: 12.5 }}>وضعیت فعلی (با کنترل‌های موجود)</div>
                  <Field label="احتمال"><Scale value={f.cp} onChange={(v) => setF({ ...f, cp: v })} labels={PROBABILITY_LABELS_FA} /></Field>
                  <Field label="اثر"><Scale value={f.ci} onChange={(v) => setF({ ...f, ci: v })} labels={IMPACT_LABELS_FA} /></Field></div>
                <div><div className="im-section-title" style={{ fontSize: 12.5 }}>باقیمانده (پس از اجرای اقدامات برنامه‌ریزی‌شده)</div>
                  <Field label="احتمال"><Scale value={f.rp} onChange={(v) => setF({ ...f, rp: v })} labels={PROBABILITY_LABELS_FA} /></Field>
                  <Field label="اثر"><Scale value={f.ri} onChange={(v) => setF({ ...f, ri: v })} labels={IMPACT_LABELS_FA} /></Field></div>
              </div>
              {f.method === 'quantitative' && (
                <div className="rk-grid2"><Field label="احتمال وقوع (٪)"><input type="number" min={0} max={100} value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></Field><Field label="برآورد زیان در صورت وقوع (ریال)"><input inputMode="numeric" dir="ltr" style={{ textAlign: 'right' }} value={f.cost ? Number(f.cost.replace(/[^\d]/g, '')).toLocaleString('en-US') : ''} onChange={(e) => setF({ ...f, cost: e.target.value.replace(/[^\d]/g, '') })} /></Field></div>
              )}
              <div className="rk-grid2">
                <Field label={`مبنا و دلیل ${reduces ? '(الزامی چون امتیاز کم می‌شود) *' : f.method !== 'qualitative' ? '*' : ''}`}><textarea style={{ minHeight: 58 }} value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })} placeholder="چه چیزی تغییر کرد؟ چه شاهدی دارید؟" /></Field>
                <Field label="نظر ارزیاب"><textarea style={{ minHeight: 58 }} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} /></Field>
              </div>
              <div className="rk-grid2">
                <Field label="روند"><select value={f.trend} onChange={(e) => setF({ ...f, trend: e.target.value as RmTrend })}>{(['improving', 'stable', 'worsening'] as const).map((t) => <option key={t} value={t}>{RM_TREND_LABEL_FA[t]}</option>)}</select></Field>
                {actions.length > 0 && <Field label="اقدام‌های تکمیل‌شدهٔ مرتبط با این ارزیابی">
                  <select multiple size={Math.min(4, actions.length)} value={f.related} onChange={(e) => setF({ ...f, related: [...e.target.selectedOptions].map((o) => o.value) })}>{actions.map((a) => <option key={a.id} value={a.id}>{a.description.slice(0, 60)}</option>)}</select>
                </Field>}
              </div>
              <div className="rk-preview" style={{ ['--c' as string]: ZONE_COLOR[zoneOf(newRes, policy)] }}>
                <ScoreBox score={state.current} label="قبلی" policy={policy} /> ‹ <ScoreBox score={newCur} label="فعلی جدید" policy={policy} /> <ScoreBox score={newRes} label="باقیمانده" policy={policy} />
                <b>{{ low: 'کم', medium: 'متوسط', high: 'زیاد', critical: 'بحرانی' }[levelOf(newCur, policy)]}</b>
                {reduces && <span className="rk-flag" style={{ ['--c' as string]: '#f59e0b' }}>کاهش امتیاز — مبنا لازم است</span>}
              </div>
              {err && <div className="im-notice bad" role="alert" style={{ marginTop: 8 }}>{err}</div>}
              <div className="im-actions" style={{ marginTop: 10 }}>
                <button className="im-btn im-btn-primary" disabled={busy} onClick={submit}>{busy ? 'در حال ثبت…' : 'ثبت ارزیابی'}</button>
                <button className="im-btn im-btn-ghost" onClick={() => setOpen(false)}>بستن</button>
              </div>
            </div>
          )}
        </div>
      ) : <div className="im-helper" style={{ marginBottom: 12 }}>ثبت ارزیابی رسمی فقط برای مدیر پروژه و مدیر ریسک است.</div>}

      <div className="im-section-title">سابقهٔ ارزیابی‌ها</div>
      <div className="rk-timeline">
        <div className="rk-tl" style={{ ['--c' as string]: '#94a3b8' }}><b>ارزیابی اولیه (ذاتی)</b> — احتمال {risk.initialProbability} × اثر {risk.initialImpact} = <ScoreBox score={risk.initialScore} policy={policy} /><br /><time>{formatJalali(risk.identifiedDate)}</time>{risk.assessmentBasis && <div className="im-helper">مبنا: {risk.assessmentBasis}</div>}</div>
        {[...sorted].reverse().map((a) => (
          <div key={a.id} className="rk-tl" style={{ ['--c' as string]: RM_TREND_COLOR[a.trend] }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <b>ارزیابی #{numbers.get(a.id)}</b> <ScoreTriple state={{ inherent: risk.initialScore, current: a.currentScore, residual: a.residualScore }} policy={policy} />
              <span className="rk-flag" style={{ ['--c' as string]: RM_TREND_COLOR[a.trend] }}>{RM_TREND_LABEL_FA[a.trend]}</span>
              <span className="rk-flag">{RM_METHOD_LABEL_FA[a.method]}</span><span className="rk-flag">{KIND_FA[a.kind]}</span>
              {a.approvedAt ? <span className="rk-flag" style={{ ['--c' as string]: '#22c55e' }}><CheckCheck size={11} /> تأییدشده</span> : canManage && <button className="im-ghostlink" onClick={() => approve(a.id)}>تأیید ارزیابی</button>}
            </div>
            {a.basis && <div className="im-helper">مبنا: {a.basis}</div>}
            {a.reviewerComment && <div className="im-helper">{a.reviewerComment}</div>}
            {a.method === 'quantitative' && a.probabilityPct !== null && a.exposureCost !== null && <div className="im-helper">احتمال {a.probabilityPct}٪ × زیان {a.exposureCost.toLocaleString('en-US')} ریال = {Math.round((a.probabilityPct / 100) * a.exposureCost).toLocaleString('en-US')} ریال (زیان مورد انتظار)</div>}
            <time>{formatJalali(a.reviewDate)} · {dir.name(a.createdBy)}</time>
          </div>
        ))}
      </div>
    </div>
  )
}
