import { useMemo, useState } from 'react'
import { Activity, AlertTriangle, ShieldCheck } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { HelpButton } from '../../issues/components/Help'
import { HBars } from '../../issues/components/charts'
import { Kpi } from '../../issues/components/ui'
import { useRiskData, useRiskDirectory, useRiskRole } from '../lib/useRiskData'
import { RK_HELP } from '../lib/help'
import { analyzeActionEffects, EFFECT_VERDICT_LABEL_FA, isDisappointing, summarizeEffects } from '../lib/riskEffect'
import { effectivenessBy } from '../lib/riskKpi'
import { kriInsight } from '../lib/riskKri'
import { addDays } from '../lib/riskState'
import { todayIso } from '../lib/riskScore'
import { KriCard, KriFormModal } from '../components/KriParts'
import { ScoreTriple, useCategoryLabel } from '../components/rk'
import { RM_CONTROL_EFFECT_LABEL_FA, RM_CONTROL_TYPE_LABEL_FA, type RmKri } from '../types'
import type { PageProps } from '../RiskApp'

type Sub = 'kri' | 'effect' | 'controls'
const KRI_RANK = { critical: 0, warn: 1, normal: 2, no_data: 3 } as const

export function MonitoringPage({ onOpenRisk }: PageProps) {
  const d = useRiskData()
  const dir = useRiskDirectory()
  const catLabel = useCategoryLabel()
  const role = useRiskRole(d.scope === 'all' ? null : d.scope)
  const [sub, setSub] = useState<Sub>('kri')
  const [kriForm, setKriForm] = useState<{ projectId: string; kri?: RmKri } | null>(null)
  const [pickProject, setPickProject] = useState(false)
  const today = todayIso()
  const riskOf = useMemo(() => new Map(d.risks.map((r) => [r.id, r])), [d.risks])

  const kris = useMemo(() => [...d.kris].filter((k) => k.active).sort((a, b) => KRI_RANK[a.state] - KRI_RANK[b.state]), [d.kris])
  const insights = useMemo(() => new Map(kris.map((k) => [k.id, kriInsight(k, d.kriReadings.filter((r) => r.kriId === k.id), today)])), [kris, d.kriReadings, today])
  const kriStats = { critical: kris.filter((k) => k.state === 'critical').length, warn: kris.filter((k) => k.state === 'warn').length, rising: kris.filter((k) => insights.get(k.id)!.exposureRising && k.state === 'normal').length, overdue: kris.filter((k) => insights.get(k.id)!.readingOverdue).length }

  const effects = useMemo(() => d.risks.flatMap((r) => analyzeActionEffects(r, d.assessments, d.actions, today)), [d.risks, d.assessments, d.actions, today])
  const sum = useMemo(() => summarizeEffects(effects), [effects])
  const ctx = useMemo(() => ({ risks: d.risks, states: d.states, assessments: d.assessments, actions: d.actions, controls: d.controls, kris: d.kris, kriEvents: d.kriEvents, today }), [d, today])
  const byProject = useMemo(() => effectivenessBy(ctx, (r) => d.allProjects.find((p) => p.id === r.projectId)?.name ?? '—'), [ctx, d.allProjects])
  const byOwner = useMemo(() => effectivenessBy(ctx, (r) => dir.name(r.ownerId)), [ctx, dir])
  const byCat = useMemo(() => effectivenessBy(ctx, (r) => catLabel(r.category)), [ctx, catLabel])
  const bad = effects.filter((e) => isDisappointing(e) || e.overdueForReassessment)

  const [ctlFilter, setCtlFilter] = useState<'all' | 'critical' | 'problem'>('all')
  const ctlRows = useMemo(() => d.controls.filter((c) => c.status !== 'inactive').map((c) => {
    const r = riskOf.get(c.riskId)!
    const problem = c.isCritical && (c.status === 'expired' || (c.expiresOn && c.expiresOn < today) || c.effectiveness === 'ineffective' || (c.testIntervalDays && addDays(c.lastTestedAt ?? r.identifiedDate, c.testIntervalDays) < today))
    return { c, r, problem: !!problem }
  }).filter((x) => x.r && (ctlFilter === 'all' || (ctlFilter === 'critical' ? x.c.isCritical : x.problem))), [d.controls, riskOf, today, ctlFilter])
  const ctlAssessed = d.controls.filter((c) => c.status !== 'inactive' && c.effectiveness !== 'not_tested')

  const newKri = () => { if (d.scope !== 'all') setKriForm({ projectId: d.scope }); else setPickProject(true) }

  return (
    <div className="im-page">
      <div className="im-topbar">
        <div><div className="im-page-title">پایش و اثربخشی</div><div className="im-page-sub">آیا ریسک واقعاً کم می‌شود؟ و آیا نشانهٔ هشدار دیده می‌شود؟</div></div>
        <div className="im-actions"><HelpButton content={RK_HELP.monitoring} /><div className="im-seg" role="tablist">{([['kri', 'شاخص‌های هشدار (KRI)'], ['effect', 'اثربخشی اقدام‌ها'], ['controls', 'کنترل‌ها']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={sub === k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{l}</button>)}</div></div>
      </div>

      {sub === 'kri' && (
        <>
          <div className="im-kpi-grid">
            <Kpi label="بحرانی" value={kriStats.critical} tone={kriStats.critical ? 'bad' : 'good'} icon={AlertTriangle} index={0} />
            <Kpi label="در هشدار" value={kriStats.warn} tone={kriStats.warn ? 'warn' : 'good'} icon={AlertTriangle} index={1} />
            <Kpi label="روند افزایشی (هنوز عادی)" value={kriStats.rising} tone={kriStats.rising ? 'warn' : 'good'} icon={Activity} hint="طبق روند، تا سه دورهٔ پایش به آستانهٔ هشدار می‌رسد" index={2} />
            <Kpi label="قرائت عقب‌افتاده" value={kriStats.overdue} tone={kriStats.overdue ? 'warn' : 'good'} icon={Activity} index={3} />
          </div>
          <div className="im-actions" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="im-helper">{kris.length} شاخص فعال</span>
            {role.canEdit && <button className="im-btn im-btn-primary" onClick={newKri}>شاخص هشدار جدید</button>}
          </div>
          {kris.length === 0 ? <div className="im-empty">هنوز شاخص هشداری تعریف نشده است. برای هر ریسک مهم، شاخصی تعریف کنید که پیش از وقوع آن تغییر می‌کند.</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>{kris.map((k) => <KriCard key={k.id} kri={k} canEdit={role.canEdit} onEdit={(x) => setKriForm({ projectId: x.projectId, kri: x })} />)}</div>
          )}
        </>
      )}

      {sub === 'effect' && (
        <>
          <div className="im-kpi-grid">
            <Kpi label="اقدام تکمیل‌شده" value={sum.completed} icon={ShieldCheck} index={0} />
            <Kpi label="راستی‌آزمایی‌شده" value={`${sum.verifiedShare ?? '—'}${sum.verifiedShare !== null ? '٪' : ''}`} hint="سهم اقدام‌های تکمیل‌شده‌ای که اثرشان تأیید شده" icon={ShieldCheck} index={1} />
            <Kpi label="اثربخشی تأییدشده" value={sum.effectivenessPct === null ? '—' : sum.effectivenessPct + '٪'} tone={sum.effectivenessPct === null ? undefined : sum.effectivenessPct >= 70 ? 'good' : sum.effectivenessPct >= 40 ? 'warn' : 'bad'} icon={ShieldCheck} index={2} />
            <Kpi label="بدون کاهش امتیاز" value={sum.noReduction} tone={sum.noReduction ? 'bad' : 'good'} icon={AlertTriangle} hint="تکمیل شد ولی ارزیابی بعدی امتیاز را کم نکرد" index={3} />
            <Kpi label="منتظر ارزیابی مجدد" value={sum.awaiting} tone={sum.awaiting ? 'warn' : 'good'} icon={AlertTriangle} index={4} />
          </div>
          <div className="im-notice info" style={{ marginBottom: 14 }}>تکمیل یک اقدام به‌تنهایی امتیاز را کم نمی‌کند. اثر وقتی تأیید می‌شود که ریسک پس از اقدام دوباره ارزیابی شود یا اثر با شاهد راستی‌آزمایی شود.</div>
          <div className="im-card" style={{ marginBottom: 14 }}>
            <div className="im-section-title"><AlertTriangle size={16} style={{ color: 'var(--im-coral)' }} /> اقدام‌های تکمیل‌شده بدون اثر یا بدون ارزیابی مجدد <span className="im-chip">{bad.length}</span></div>
            {bad.length === 0 ? <div className="im-notice ok">همهٔ اقدام‌های تکمیل‌شده یا اثر تأییدشده دارند یا هنوز در مهلت ارزیابی مجدد هستند.</div> : (
              <div className="im-table-wrap"><table className="im-table"><thead><tr><th>ریسک</th><th>اقدام</th><th>مسئول</th><th>تکمیل</th><th>امتیاز</th><th>وضعیت اثر</th></tr></thead><tbody>
                {bad.slice(0, 80).map((e) => { const r = riskOf.get(e.action.riskId)!; return (
                  <tr key={e.action.id} className="rk-row-click" onClick={() => onOpenRisk(r.id, 'response')}>
                    <td><span className="im-code">{r.code}</span></td><td>{e.action.description}</td><td className="im-helper">{dir.name(e.action.ownerId)}</td>
                    <td className="im-helper">{formatJalali((e.action.completedAt ?? e.action.updatedAt).slice(0, 10))}</td>
                    <td>{e.before !== null && e.after !== null ? <span>{e.before} ← <b>{e.after}</b></span> : <span className="im-helper">{e.before ?? '—'}</span>}</td>
                    <td><span className="rk-flag" style={{ ['--c' as string]: e.verdict === 'ineffective' || e.verdict === 'no_reduction' ? '#ef4444' : '#f59e0b' }}>{EFFECT_VERDICT_LABEL_FA[e.verdict]}</span></td>
                  </tr>) })}
              </tbody></table></div>
            )}
          </div>
          <div className="im-chart-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            {([['به تفکیک پروژه', byProject], ['به تفکیک مالک ریسک', byOwner], ['به تفکیک دسته', byCat]] as const).map(([t, rows]) => (
              <div key={t} className="im-card"><div className="im-section-title">اثربخشی برنامه‌های پاسخ — {t}</div>
                {rows.length === 0 ? <div className="im-helper">اقدام تکمیل‌شده‌ای نیست.</div> : <HBars max={100} rows={rows.slice(0, 10).map((x) => ({ key: x.key, label: x.key, value: x.effectivenessPct ?? 0, color: x.effectivenessPct === null ? '#64748b' : x.effectivenessPct >= 70 ? '#22c55e' : x.effectivenessPct >= 40 ? '#eab308' : '#ef4444', hint: x.effectivenessPct === null ? `بدون راستی‌آزمایی (${x.completed} اقدام)` : `${x.effectivenessPct}٪ از ${x.verified} راستی‌آزمایی` }))} />}
              </div>
            ))}
          </div>
        </>
      )}

      {sub === 'controls' && (
        <div className="im-card">
          <div className="im-section-title" style={{ justifyContent: 'space-between' }}>کنترل‌های موجود <span className="im-helper">{ctlAssessed.length ? `${Math.round((ctlAssessed.filter((c) => c.effectiveness === 'effective').length / ctlAssessed.length) * 100)}٪ مؤثر از ${ctlAssessed.length} کنترل آزمون‌شده` : 'کنترل آزمون‌شده‌ای نیست'}</span>
            <div className="im-seg" role="tablist">{([['all', 'همه'], ['critical', 'حیاتی'], ['problem', 'نیازمند اقدام']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={ctlFilter === k} className={ctlFilter === k ? 'on' : ''} onClick={() => setCtlFilter(k)}>{l}</button>)}</div>
          </div>
          {ctlRows.length === 0 ? <div className="im-empty">کنترلی برای نمایش نیست. کنترل‌ها را در تب «کنترل‌ها»ی هر ریسک ثبت کنید.</div> : (
            <div className="im-table-wrap"><table className="im-table"><thead><tr><th>کنترل</th><th>ریسک</th><th>نوع</th><th>مسئول</th><th>آخرین آزمون</th><th>اثربخشی</th></tr></thead><tbody>
              {ctlRows.slice(0, 150).map(({ c, r, problem }) => (
                <tr key={c.id} className="rk-row-click" onClick={() => onOpenRisk(r.id, 'controls')}>
                  <td><b>{c.name}</b> {c.isCritical && <span className="rk-flag" style={{ ['--c' as string]: '#ef4444' }}>حیاتی</span>} {problem && <span className="rk-flag" style={{ ['--c' as string]: '#f59e0b' }}>نیازمند آزمون/تمدید</span>}</td>
                  <td><span className="im-code">{r.code}</span> <ScoreTriple state={d.states.get(r.id)!} policy={d.policyFor(r.projectId)} /></td>
                  <td className="im-helper">{RM_CONTROL_TYPE_LABEL_FA[c.controlType]}</td><td className="im-helper">{dir.name(c.ownerId)}</td>
                  <td className="im-helper">{c.lastTestedAt ? formatJalali(c.lastTestedAt) : 'آزمون‌نشده'}</td>
                  <td><span className="rk-flag" style={{ ['--c' as string]: { not_tested: '#94a3b8', effective: '#22c55e', partial: '#eab308', ineffective: '#ef4444' }[c.effectiveness] }}>{RM_CONTROL_EFFECT_LABEL_FA[c.effectiveness]}</span></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </div>
      )}

      {pickProject && (
        <div className="im-overlay"><div className="im-modal" style={{ maxWidth: 420 }} role="dialog" aria-modal="true" aria-label="انتخاب پروژه">
          <div className="im-modal-head"><div className="im-modal-title">شاخص برای کدام پروژه؟</div><button className="im-modal-close" onClick={() => setPickProject(false)} aria-label="بستن">✕</button></div>
          <div className="im-grid" style={{ gap: 6, maxHeight: 360, overflow: 'auto' }}>{d.allProjects.map((p) => <button key={p.id} className="im-task" style={{ textAlign: 'right' }} onClick={() => { setPickProject(false); setKriForm({ projectId: p.id }) }}>{p.shortCode ? p.shortCode + ' · ' : ''}{p.name}</button>)}</div>
        </div></div>
      )}
      {kriForm && <KriFormModal projectId={kriForm.projectId} kri={kriForm.kri} onClose={() => setKriForm(null)} />}
    </div>
  )
}
