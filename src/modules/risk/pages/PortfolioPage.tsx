import { useMemo, useState } from 'react'
import { Boxes, GitBranch, Lightbulb, Link2, Network, Wallet } from 'lucide-react'
import { HelpButton } from '../../issues/components/Help'
import { HBars } from '../../issues/components/charts'
import { Kpi } from '../../issues/components/ui'
import { useRiskData, useRiskDirectory, useRiskRole } from '../lib/useRiskData'
import { useRiskStore } from '../store/useRiskStore'
import { RK_HELP } from '../lib/help'
import { FACTOR_LABEL_FA, clusterSimilar, corporateRollup, dependentCounts, orgAdvice, quantExposure, sharedFactors } from '../lib/riskPortfolio'
import { ScoreTriple, nf, useCategoryLabel } from '../components/rk'
import type { PageProps } from '../RiskApp'

const LV_COLOR = { low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444' } as const
const LV_LABEL = { low: 'کم', medium: 'متوسط', high: 'زیاد', critical: 'بحرانی' } as const

/** Cross-project intelligence: similar risks, common causes/sources, corporate («mother») risks, dependencies, and organisation-level proposals. */
export function PortfolioPage({ onOpenRisk }: PageProps) {
  const d = useRiskData()
  const dir = useRiskDirectory()
  const catLabel = useCategoryLabel()
  const role = useRiskRole(d.scope === 'all' ? null : d.scope)
  const { createCorporate, attachCorporate } = useRiskStore.getState()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [threshold, setThreshold] = useState(0.42)

  const clusters = useMemo(() => clusterSimilar(d.risks, { threshold }), [d.risks, threshold])
  const factors = useMemo(() => sharedFactors(d.risks, d.states), [d.risks, d.states])
  const corps = useMemo(() => corporateRollup(d.corporate, d.risks, d.states), [d.corporate, d.risks, d.states])
  const advice = useMemo(() => orgAdvice(clusters, factors, corps), [clusters, factors, corps])
  const deps = useMemo(() => dependentCounts(d.links), [d.links])
  const quant = useMemo(() => quantExposure(d.risks, d.assessments), [d.risks, d.assessments])
  const projName = (id: string) => d.allProjects.find((p) => p.id === id)?.name ?? '—'
  const riskOf = useMemo(() => new Map(d.risks.map((r) => [r.id, r])), [d.risks])
  const linchpins = [...deps.entries()].filter(([id]) => riskOf.get(id)?.status !== 'closed').sort((a, b) => b[1] - a[1]).slice(0, 6)

  const makeMother = async (clusterId: string) => {
    const c = clusters.find((x) => x.id === clusterId)
    if (!c) return
    setBusy(clusterId); setErr('')
    const head = c.members[0]
    const r = await createCorporate({ title: c.keywords.length ? `ریسک مشترک: ${c.keywords.slice(0, 3).join('، ')}` : head.title, description: `تجمیع ${c.members.length} ریسک مشابه در ${c.projectIds.length} پروژه`, category: head.category, ownerId: null, correctivePlan: '' })
    if (!r.ok || !r.id) { setErr(r.error ?? 'ساخت ریسک مادر ممکن نشد'); setBusy(null); return }
    for (const m of c.members) await attachCorporate(m.id, r.id)
    setBusy(null)
  }

  return (
    <div className="im-page">
      <div className="im-topbar"><div><div className="im-page-title"><Network size={22} style={{ color: 'var(--im-teal)' }} />هوش پورتفولیو</div><div className="im-page-sub">ریسک‌های مشترک و تجمیعی، تمرکز بر منابع مشترک و ریسک سازمانی</div></div><div className="im-actions"><HelpButton content={RK_HELP.portfolio} /></div></div>

      <div className="im-kpi-grid">
        <Kpi label="گروه ریسک مشابه بین پروژه‌ها" value={clusters.length} tone={clusters.length ? 'warn' : 'good'} icon={Boxes} index={0} />
        <Kpi label="تمرکز روی منبع مشترک" value={factors.filter((f) => f.kind !== 'category').length} tone="warn" icon={GitBranch} index={1} />
        <Kpi label="ریسک مادر (سازمانی)" value={corps.length} icon={Network} color="#6366f1" index={2} />
        <Kpi label="ریسک‌های محوری (دیگران وابسته‌اند)" value={linchpins.length} icon={Link2} color="#14b8a6" index={3} />
        <Kpi label="زیان مورد انتظار (فقط کمّی)" value={quant.covered ? nf(quant.expectedLoss) : '—'} hint={`فقط ${quant.covered} از ${quant.total} ریسک فعال ارزیابی کمی دارند؛ جمع امتیازهای ترتیبی ساخته نمی‌شود`} icon={Wallet} index={4} />
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title"><Lightbulb size={16} style={{ color: 'var(--im-amber)' }} /> پیشنهادهای اصلاحی در سطح سازمان <span className="im-helper">برای ریسک‌هایی که علت مشترک دارند</span></div>
        {advice.length === 0 ? <div className="im-notice ok">علت مشترک یا تمرکز مشکوکی بین پروژه‌ها دیده نشد (داده‌ها: {d.risks.length} ریسک در {new Set(d.risks.map((r) => r.projectId)).size} پروژه).</div> : (
          <div className="im-adv-list">{advice.map((a) => (
            <div key={a.id} className="im-adv" style={{ ['--c' as string]: 'var(--im-amber)' }}>
              <div className="im-adv-ic"><Lightbulb size={18} aria-hidden /></div>
              <div style={{ minWidth: 0, flex: 1 }}><div className="im-adv-t">{a.title}</div><div className="im-adv-why"><b>چرا:</b> {a.why}</div><div className="im-adv-do"><b>پیشنهاد:</b> {a.todo}</div>
                <div className="im-actions" style={{ marginTop: 6 }}>{a.riskIds.slice(0, 6).map((id) => { const r = riskOf.get(id); return r ? <button key={id} className="im-chip" title={r.title} onClick={() => onOpenRisk(id)}>{r.code}</button> : null })}{a.riskIds.length > 6 && <span className="im-helper">+{a.riskIds.length - 6}</span>}</div></div>
            </div>
          ))}</div>
        )}
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title"><Boxes size={16} style={{ color: 'var(--im-violet)' }} /> ریسک‌های مشابه و تکرارشونده بین پروژه‌ها
          <label className="im-helper" style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>حساسیت شباهت<input type="range" min={0.25} max={0.7} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ width: 110 }} aria-label="حساسیت شباهت" /></label></div>
        <div className="im-helper" style={{ marginBottom: 8 }}>شباهت متنی عنوان، رویداد و علت؛ نتیجه پیشنهاد است و تأیید با شماست.</div>
        {err && <div className="im-err">{err}</div>}
        {clusters.length === 0 ? <div className="im-helper">گروه مشابهی بین حداقل دو پروژه یافت نشد.</div> : clusters.slice(0, 12).map((c) => (
          <div key={c.id} className="im-task" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><div><b>{c.members.length} ریسک در {c.projectIds.length} پروژه</b> {c.keywords.map((k) => <span key={k} className="rk-flag" style={{ marginInlineStart: 4 }}>{k}</span>)}</div>
              {role.canManage && !c.members.every((m) => m.corporateRiskId) && <button className="im-btn im-btn-ghost im-btn-sm" disabled={busy === c.id} onClick={() => makeMother(c.id)}>{busy === c.id ? 'در حال ساخت…' : 'تجمیع زیر یک ریسک مادر'}</button>}</div>
            <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>{c.members.slice(0, 6).map((m) => <button key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, textAlign: 'right', fontSize: 12.5 }} onClick={() => onOpenRisk(m.id)}><span><span className="im-code">{m.code}</span> {m.title.slice(0, 70)} <span className="im-helper">— {projName(m.projectId)}</span></span><ScoreTriple state={d.states.get(m.id)!} policy={d.policyFor(m.projectId)} /></button>)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div className="im-card">
          <div className="im-section-title"><GitBranch size={16} style={{ color: 'var(--im-coral)' }} /> تمرکز بر منبع مشترک <span className="im-helper">پیمانکار، حوزه، بسته، ایستگاه</span></div>
          {factors.filter((f) => f.kind !== 'category').length === 0 ? <div className="im-helper">منبع مشترکی با ریسک چندپروژه‌ای ثبت نشده است. فیلدهای «پیمانکار»، «حوزهٔ تخصصی» و «بستهٔ کاری» را در شناسنامهٔ ریسک پر کنید.</div> : (
            <div className="im-table-wrap"><table className="rk-compare"><thead><tr><th>منبع</th><th>نوع</th><th>پروژه</th><th>ریسک</th><th>توزیع سطح</th></tr></thead><tbody>
              {factors.filter((f) => f.kind !== 'category').slice(0, 12).map((f) => (
                <tr key={f.kind + f.key}><td><b>{f.label}</b></td><td className="im-helper">{FACTOR_LABEL_FA[f.kind]}</td><td>{f.projects}</td><td>{f.risks}</td>
                  <td><div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', minWidth: 90 }} title={(['critical', 'high', 'medium', 'low'] as const).map((l) => `${LV_LABEL[l]} ${f.levelMix[l]}`).join(' · ')}>{(['critical', 'high', 'medium', 'low'] as const).map((l) => f.levelMix[l] ? <i key={l} style={{ flex: f.levelMix[l], background: LV_COLOR[l] }} /> : null)}</div></td></tr>
              ))}
            </tbody></table></div>
          )}
        </div>
        <div className="im-card">
          <div className="im-section-title">تمرکز در دسته‌بندی‌ها</div>
          <HBars rows={factors.filter((f) => f.kind === 'category').slice(0, 10).map((f) => ({ key: f.key, label: catLabel(f.key), value: f.risks, color: f.criticalCount ? '#ef4444' : undefined, hint: `${f.projects} پروژه${f.criticalCount ? ` · ${f.criticalCount} بحرانی` : ''}` }))} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
        <div className="im-card">
          <div className="im-section-title"><Network size={16} style={{ color: 'var(--im-indigo)' }} /> ریسک‌های مادر (سازمانی)</div>
          {corps.length === 0 ? <div className="im-helper">هنوز ریسک مادری تعریف نشده. از «ریسک‌های مشابه» یا تب «ارتباطات» هر ریسک می‌توان ساخت؛ ریسک‌های پروژه‌ای با سوابق مستقل خود باقی می‌مانند.</div> : corps.map((c) => (
            <div key={c.corp.id} className="im-task" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><span className="im-code">{c.corp.code}</span> <b>{c.corp.title}</b></div><span className="rk-flag" style={{ ['--c' as string]: LV_COLOR[c.worst as 'low'] }}>بدترین: {LV_LABEL[c.worst as 'low']}</span></div>
              <div className="im-helper">{c.children.length} ریسک فرزند در {c.projects} پروژه · {c.active} فعال{c.corp.ownerId ? ` · ${dir.name(c.corp.ownerId)}` : ''}</div>
              {c.corp.correctivePlan && <div className="im-helper">برنامهٔ اصلاحی: {c.corp.correctivePlan}</div>}
              <div className="im-actions" style={{ marginTop: 4 }}>{c.children.slice(0, 6).map((m) => <button key={m.id} className="im-chip" onClick={() => onOpenRisk(m.id)}>{m.code}</button>)}</div>
            </div>
          ))}
        </div>
        <div className="im-card">
          <div className="im-section-title"><Link2 size={16} style={{ color: 'var(--im-teal)' }} /> ریسک‌های محوری و وابستگی‌ها</div>
          {linchpins.length === 0 ? <div className="im-helper">وابستگی‌ای بین ریسک‌ها ثبت نشده است. در تب «ارتباطات» هر ریسک، رابطهٔ «وابسته به» را ثبت کنید.</div> : linchpins.map(([id, n]) => { const r = riskOf.get(id)!; return <button key={id} className="im-task" style={{ display: 'flex', width: '100%', textAlign: 'right', justifyContent: 'space-between', gap: 8, marginBottom: 6 }} onClick={() => onOpenRisk(id)}><span><span className="im-code">{r.code}</span> {r.title.slice(0, 60)}</span><span className="rk-flag" style={{ ['--c' as string]: '#14b8a6' }}>{n} ریسک وابسته</span></button> })}
          {quant.covered > 0 && <div className="im-notice info" style={{ marginTop: 10 }}>زیان مورد انتظار ({quant.covered} ریسک با ارزیابی کمی): <b>{nf(quant.expectedLoss)} ریال</b>. این عدد فقط همین زیرمجموعه را پوشش می‌دهد و با سایر ریسک‌ها جمع زده نمی‌شود.</div>}
        </div>
      </div>
    </div>
  )
}
