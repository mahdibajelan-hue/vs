import { useState } from 'react'
import { ArrowUpRight, Lock, Pencil, Undo2 } from 'lucide-react'
import { formatJalali } from '../../../../lib/jalali'
import { JalaliDateField } from '../../../issues/components/JalaliDateField'
import { useRiskStore } from '../../store/useRiskStore'
import { useRiskDirectory } from '../../lib/useRiskData'
import { todayIso } from '../../lib/riskScore'
import { IMPACT_ANCHORS_FA, ZONE_LABEL_FA, zoneOf } from '../../lib/riskPolicy'
import { RM_ESCALATION_LEVEL_LABEL_FA, RM_ESCALATION_STATUS_LABEL_FA, RM_IMPACT_DIMS, RM_IMPACT_DIM_LABEL_FA, RM_PROJECT_PHASE_LABEL_FA, RM_RESPONSE_STRATEGY_LABEL_FA, RM_RISK_TYPE_LABEL_FA, type RmEscalationLevel } from '../../types'
import { Field, nf, useCategoryLabel } from '../rk'
import type { TabProps } from './common'

const DIM_COLOR = ['#334155', '#22c55e', '#eab308', '#f97316', '#ef4444', '#b91c1c']

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="im-kv"><span>{k}</span><b>{children}</b></div>
}

export function OverviewTab({ risk, state, policy, canEdit, canManage, onEdit }: TabProps & { onEdit: () => void }) {
  const projects = useRiskStore((s) => s.projects)
  const corporate = useRiskStore((s) => s.corporate)
  const { closeRisk, reopenRisk, updateRisk } = useRiskStore.getState()
  const dir = useRiskDirectory()
  const catLabel = useCategoryLabel()
  const [closing, setClosing] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [esc, setEsc] = useState<{ level: RmEscalationLevel; to: string; reason: string; decision: string } | null>(null)
  const [dec, setDec] = useState('')
  const [nextDate, setNextDate] = useState<string | null>(null)
  const project = projects.find((p) => p.id === risk.projectId)
  const hasPipeline = risk.kmFrom !== null || risk.kmTo !== null || risk.routeSegment || risk.station || risk.workFront || risk.contractor || risk.workPackage || risk.execStage
  const dimsUsed = RM_IMPACT_DIMS.filter((d) => (risk.impactDims[d] ?? 0) > 0)

  const doClose = async () => {
    const r = await closeRisk(risk.id, reason)
    if (!r.ok) { setErr(r.error ?? ''); return }
    setClosing(false); setReason(''); setErr('')
  }
  const doEscalate = async () => {
    if (!esc) return
    if (esc.reason.trim().length < 5) { setErr('دلیل ارجاع را بنویسید'); return }
    const r = await updateRisk(risk.id, { escalationLevel: esc.level, escalatedTo: esc.to, escalationReason: esc.reason.trim(), requiredDecision: esc.decision.trim(), escalationDate: todayIso(), escalationStatus: 'escalated', status: 'escalated' })
    if (!r.ok) { setErr(r.error ?? ''); return }
    setEsc(null); setErr('')
  }
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {err && <div className="im-notice bad" role="alert">{err}</div>}
      {state.attention.length > 0 && risk.status !== 'closed' && <div className="rk-flags" style={{ marginTop: 0 }}>{state.attention.map((a) => <span key={a} className="rk-flag" style={{ ['--c' as string]: '#f59e0b' }}>{a}</span>)}</div>}
      {risk.status === 'closed' && <div className="im-notice ok"><Lock size={13} style={{ display: 'inline', marginInlineEnd: 5 }} />بسته‌شده {risk.closedAt ? formatJalali(risk.closedAt.slice(0, 10)) : ''} — {risk.closedReason}</div>}
      {risk.status === 'realized' && <div className="im-notice" style={{ borderColor: '#a855f7' }}>این ریسک محقق شده است{risk.realizedAt ? ` (${formatJalali(risk.realizedAt.slice(0, 10))})` : ''}. سوابق ارزیابی و اقدام‌ها حفظ شده؛ پیگیری رویداد در «مسئله» انجام می‌شود (تب ارتباطات).</div>}

      {(risk.cause || risk.riskEvent || risk.consequence) && (
        <div className="rk-grid3">
          {[['علت', risk.cause, '#0ea5e9'], ['رویداد ریسک', risk.riskEvent, '#f59e0b'], ['پیامد', risk.consequence, '#ef4444']].map(([t, v, c]) => (
            <div key={t} className="im-card-flat" style={{ borderTop: `3px solid ${c}` }}><div className="im-helper" style={{ marginBottom: 4 }}>{t}</div><div style={{ fontSize: 13 }}>{v || '—'}</div></div>
          ))}
        </div>
      )}
      {risk.description && <div className="im-card-flat" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{risk.description}</div>}

      <div className="im-card-flat">
        <div className="rk-grid3" style={{ gap: 8 }}>
          <KV k="پروژه">{project ? `${project.shortCode ? project.shortCode + ' · ' : ''}${project.name}` : '—'}</KV>
          <KV k="دسته‌بندی">{catLabel(risk.category)}{risk.subcategory ? ` / ${catLabel(risk.subcategory)}` : ''}</KV>
          <KV k="نوع">{RM_RISK_TYPE_LABEL_FA[risk.riskType]}</KV>
          <KV k="مرحلهٔ چرخه عمر">{risk.projectPhase ? RM_PROJECT_PHASE_LABEL_FA[risk.projectPhase] : '—'}</KV>
          <KV k="حوزهٔ تخصصی">{risk.discipline || '—'}</KV>
          <KV k="تاریخ شناسایی">{formatJalali(risk.identifiedDate)}</KV>
          <KV k="مالک ریسک">{dir.name(risk.ownerId)}</KV>
          <KV k="مسئول اقدامات">{dir.name(risk.responseOwnerId)}</KV>
          <KV k="مسئول پایش">{dir.name(risk.monitorId)}</KV>
          <KV k="مرجع تأیید">{dir.name(risk.approverId)}</KV>
          <KV k="راهبرد پاسخ">{RM_RESPONSE_STRATEGY_LABEL_FA[risk.responseStrategy]}</KV>
          <KV k="زمان تا وقوع">{risk.timeToImpactDays !== null ? `${risk.timeToImpactDays} روز` : '—'}</KV>
          <KV k="موعد بازنگری">{formatJalali(state.reviewDue)}{state.reviewOverdue ? ' (عقب‌افتاده)' : ''}</KV>
          <KV k="فاصلهٔ بازنگری">{risk.reviewIntervalDays ? `${risk.reviewIntervalDays} روز` : `طبق سیاست (${policy.reviewDays[state.level]} روز)`}</KV>
          <KV k="برچسب‌ها">{risk.tags.length ? risk.tags.join('، ') : '—'}</KV>
        </div>
        {hasPipeline && (
          <div className="rk-grid3" style={{ gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--im-line)' }}>
            {(risk.kmFrom !== null || risk.kmTo !== null) && <KV k="کیلومتراژ">{risk.kmFrom ?? '؟'} تا {risk.kmTo ?? '؟'}</KV>}
            {risk.routeSegment && <KV k="قطعهٔ مسیر">{risk.routeSegment}</KV>}
            {risk.station && <KV k="ایستگاه">{risk.station}</KV>}
            {risk.workFront && <KV k="جبهه کاری">{risk.workFront}</KV>}
            {risk.contractor && <KV k="پیمانکار / تأمین‌کننده">{risk.contractor}</KV>}
            {risk.workPackage && <KV k="بستهٔ کاری">{risk.workPackage}</KV>}
            {risk.execStage && <KV k="مرحلهٔ اجرایی">{risk.execStage}</KV>}
          </div>
        )}
      </div>

      <div className="im-card-flat">
        <div className="im-section-title" style={{ marginBottom: 8 }}>اثر بر پروژه <span className="im-helper">اثر کلی = بدترین بُعد</span></div>
        {dimsUsed.length === 0 && risk.impactTimeDays === null && risk.impactCost === null && !risk.impactObjectives ? <div className="im-helper">ارزیابی چندبعدی ثبت نشده است (اثر کلی {risk.initialImpact}).</div> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {dimsUsed.map((d) => <div key={d} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 150px', gap: 8, alignItems: 'center', fontSize: 12.5 }}><span>{RM_IMPACT_DIM_LABEL_FA[d]}</span><div className="im-bar"><i style={{ width: `${(risk.impactDims[d]! / 5) * 100}%`, background: DIM_COLOR[risk.impactDims[d]!] }} /></div><span className="im-helper">{risk.impactDims[d]} — {IMPACT_ANCHORS_FA[d][risk.impactDims[d]! - 1]}</span></div>)}
            <div className="im-helper">{risk.impactTimeDays !== null && <>اثر زمانی: {risk.impactTimeDays} روز · </>}{risk.impactCost !== null && <>اثر مالی: {nf(risk.impactCost)} ریال · </>}{risk.impactObjectives && <>اهداف: {risk.impactObjectives}</>}</div>
          </div>
        )}
      </div>

      {(risk.escalationStatus !== 'none' || esc) && (
        <div className="im-card-flat" style={{ borderInlineStart: '4px solid #c026d3' }}>
          <div className="im-section-title">ارجاع به مقام بالاتر <span className="rk-flag" style={{ ['--c' as string]: '#c026d3' }}>{RM_ESCALATION_STATUS_LABEL_FA[risk.escalationStatus]}</span></div>
          {risk.escalationLevel && <div className="im-helper">سطح: {RM_ESCALATION_LEVEL_LABEL_FA[risk.escalationLevel]}{risk.escalatedTo ? ` · به: ${risk.escalatedTo}` : ''}{risk.escalationDate ? ` · ${formatJalali(risk.escalationDate)}` : ''}</div>}
          {risk.escalationReason && <div style={{ fontSize: 12.5 }}>دلیل: {risk.escalationReason}</div>}
          {risk.requiredDecision && <div style={{ fontSize: 12.5 }}>تصمیم موردنیاز: <b>{risk.requiredDecision}</b></div>}
          {risk.escalationDecision && <div style={{ fontSize: 12.5 }}>تصمیم: <b>{risk.escalationDecision}</b>{risk.escalationDecisionDate ? ` (${formatJalali(risk.escalationDecisionDate)})` : ''}</div>}
          {risk.escalationStatus === 'escalated' && canManage && (
            <div className="im-actions" style={{ marginTop: 8 }}>
              <input style={{ flex: 1 }} placeholder="تصمیم مرجع بالاتر" value={dec} onChange={(e) => setDec(e.target.value)} />
              <button className="im-btn im-btn-primary im-btn-sm" onClick={async () => { if (dec.trim().length < 3) { setErr('متن تصمیم را بنویسید'); return } const r = await updateRisk(risk.id, { escalationDecision: dec.trim(), escalationDecisionDate: todayIso(), escalationStatus: 'decided', status: 'monitoring' }); if (!r.ok) setErr(r.error ?? ''); else { setDec(''); setErr('') } }}>ثبت تصمیم</button>
            </div>
          )}
        </div>
      )}
      {esc && (
        <div className="im-card-flat">
          <div className="rk-grid3">
            <Field label="سطح ارجاع"><select value={esc.level} onChange={(e) => setEsc({ ...esc, level: e.target.value as RmEscalationLevel })}>{Object.entries(RM_ESCALATION_LEVEL_LABEL_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="ارجاع به (نام/سمت)"><input value={esc.to} onChange={(e) => setEsc({ ...esc, to: e.target.value })} /></Field>
            <Field label="تصمیم موردنیاز"><input value={esc.decision} onChange={(e) => setEsc({ ...esc, decision: e.target.value })} /></Field>
          </div>
          <Field label="دلیل ارجاع *"><input value={esc.reason} onChange={(e) => setEsc({ ...esc, reason: e.target.value })} /></Field>
          <div className="im-actions"><button className="im-btn im-btn-primary im-btn-sm" onClick={doEscalate}>ارجاع</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setEsc(null)}>انصراف</button></div>
        </div>
      )}

      {canEdit && risk.status !== 'closed' && (
        <div className="im-actions">
          <button className="im-btn im-btn-ghost im-btn-sm" onClick={onEdit}><Pencil size={13} /> ویرایش شناسنامه</button>
          {canManage && risk.escalationStatus !== 'escalated' && <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setEsc({ level: state.zone === 'escalate' ? 'management' : 'project_manager', to: '', reason: '', decision: '' })}><ArrowUpRight size={13} /> ارجاع به مقام بالاتر</button>}
          {canManage && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ width: 170 }}><JalaliDateField value={nextDate ?? state.reviewDue} onChange={(v) => { setNextDate(v); updateRisk(risk.id, { nextReviewDate: v }) }} /></div>
              <span className="im-helper">موعد بازنگری بعدی</span>
            </div>
          )}
          {canManage && <button className="im-btn im-btn-danger im-btn-sm" onClick={() => setClosing(true)}>بستن ریسک</button>}
        </div>
      )}
      {closing && (
        <div className="im-card-flat">
          <Field label="دلیل بستن ریسک *" hint={`وضعیت فعلی: امتیاز ${state.current}، ${ZONE_LABEL_FA[zoneOf(state.current, policy)]}. دلیل در تاریخچه می‌ماند و ریسک قابل بازگشایی است.`}><textarea style={{ minHeight: 54 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: مرحلهٔ مؤثر پایان یافت و رویداد دیگر امکان‌پذیر نیست" autoFocus /></Field>
          <div className="im-actions"><button className="im-btn im-btn-danger im-btn-sm" onClick={doClose}>بستن ریسک</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => { setClosing(false); setErr('') }}>انصراف</button></div>
        </div>
      )}
      {risk.status === 'closed' && canManage && <div><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => reopenRisk(risk.id)}><Undo2 size={13} /> بازگشایی ریسک</button></div>}
      {risk.corporateRiskId && <div className="im-helper">متصل به ریسک سازمانی: {corporate.find((c) => c.id === risk.corporateRiskId)?.code ?? ''} — {corporate.find((c) => c.id === risk.corporateRiskId)?.title ?? ''}</div>}
    </div>
  )
}
