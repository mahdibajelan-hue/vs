import { useEffect, useMemo, useState } from 'react'
import { Activity, FileText, Gauge, History, Link2, ListChecks, ShieldCheck, X } from 'lucide-react'
import { useRiskStore } from '../store/useRiskStore'
import { useRiskPeopleStore } from '../store/useRiskPeopleStore'
import { useRiskRole } from '../lib/useRiskData'
import { computeRiskState } from '../lib/riskState'
import { effectivePolicy, ZONE_COLOR, ZONE_LABEL_FA } from '../lib/riskPolicy'
import { HelpButton } from '../../issues/components/Help'
import { RK_HELP } from '../lib/help'
import { KriCard, KriFormModal } from './KriParts'
import { RiskFormModal } from './RiskFormModal'
import { ScoreTriple, StatusChip, LevelChip } from './rk'
import { AssessmentTab } from './drawer/AssessmentTab'
import { ControlsTab } from './drawer/ControlsTab'
import { EvidenceTab } from './drawer/EvidenceTab'
import { HistoryTab } from './drawer/HistoryTab'
import { LinksTab } from './drawer/LinksTab'
import { OverviewTab } from './drawer/OverviewTab'
import { ResponseTab } from './drawer/ResponseTab'

export type RiskTabId = 'overview' | 'assessment' | 'response' | 'controls' | 'kri' | 'links' | 'evidence' | 'history'
const TABS: { id: RiskTabId; label: string; icon: typeof Gauge }[] = [
  { id: 'overview', label: 'نمای کلی', icon: FileText }, { id: 'assessment', label: 'ارزیابی', icon: Gauge }, { id: 'response', label: 'پاسخ و اقدام', icon: ListChecks },
  { id: 'controls', label: 'کنترل‌ها', icon: ShieldCheck }, { id: 'kri', label: 'KRI', icon: Activity }, { id: 'links', label: 'ارتباطات', icon: Link2 }, { id: 'evidence', label: 'شواهد', icon: FileText }, { id: 'history', label: 'تاریخچه', icon: History },
]

/** Everything about one risk. Opened from any list; closes only with × / the close button (not by clicking outside). */
export function RiskDrawer({ riskId, initialTab = 'overview', onClose }: { riskId: string; initialTab?: RiskTabId; onClose: () => void }) {
  const risk = useRiskStore((s) => s.risks.find((r) => r.id === riskId))
  const assessments = useRiskStore((s) => s.assessments)
  const actions = useRiskStore((s) => s.actions)
  const controls = useRiskStore((s) => s.controls)
  const kris = useRiskStore((s) => s.kris)
  const policies = useRiskStore((s) => s.policies)
  const fetchProject = useRiskPeopleStore((s) => s.fetchProject)
  const [tab, setTab] = useState<RiskTabId>(initialTab)
  const [editing, setEditing] = useState(false)
  const [kriForm, setKriForm] = useState<{ kri?: (typeof kris)[number] } | null>(null)
  const role = useRiskRole(risk?.projectId)
  useEffect(() => { if (risk) fetchProject(risk.projectId) }, [risk, fetchProject])
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing && !kriForm) onClose() }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose, editing, kriForm])

  const policy = useMemo(() => effectivePolicy(policies, risk?.projectId ?? null), [policies, risk?.projectId])
  const state = useMemo(() => (risk ? computeRiskState(risk, assessments, actions, controls, kris, policy) : null), [risk, assessments, actions, controls, kris, policy])
  if (!risk || !state) return null
  const props = { risk, state, policy, canEdit: role.canEdit && risk.status !== 'closed', canManage: role.canManage }
  const myKris = kris.filter((k) => k.riskId === risk.id)
  const counts: Partial<Record<RiskTabId, number>> = { response: actions.filter((a) => a.riskId === risk.id).length, controls: controls.filter((c) => c.riskId === risk.id).length, kri: myKris.length, assessment: state.assessmentCount }

  return (
    <div className="im-drawer-ov">
      <aside className="im-drawer rk-drawer-wide" role="dialog" aria-modal="true" aria-label={`ریسک ${risk.code}`}>
        <div className="im-drawer-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}><span className="im-code">{risk.code}</span><StatusChip status={risk.status} /><LevelChip level={state.level} /><span className="rk-flag" style={{ ['--c' as string]: ZONE_COLOR[state.residualZone] }}>باقیمانده: {ZONE_LABEL_FA[state.residualZone]}</span></div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, lineHeight: 1.7 }}>{risk.title}</h2>
            </div>
            <div className="im-actions" style={{ flexWrap: 'nowrap' }}><HelpButton content={RK_HELP.drawer} /><button className="im-modal-close" onClick={onClose} aria-label="بستن"><X size={16} /></button></div>
          </div>
          <div style={{ marginTop: 10 }}><ScoreTriple state={state} policy={policy} large /></div>
        </div>
        <div className="rk-tabs" role="tablist" style={{ padding: '0 14px', margin: 0 }}>
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`im-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              <t.icon size={13} aria-hidden />{t.label}{counts[t.id] ? <span className="n">{counts[t.id]}</span> : null}
            </button>
          ))}
        </div>
        <div className="im-drawer-body">
          {tab === 'overview' && <OverviewTab {...props} onEdit={() => setEditing(true)} />}
          {tab === 'assessment' && <AssessmentTab {...props} />}
          {tab === 'response' && <ResponseTab {...props} />}
          {tab === 'controls' && <ControlsTab {...props} />}
          {tab === 'kri' && (
            <div>
              <div className="im-actions" style={{ justifyContent: 'space-between', marginBottom: 10 }}><span className="im-helper">شاخص‌هایی که پیش از وقوع این ریسک تغییر می‌کنند.</span>{props.canEdit && <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setKriForm({})}>شاخص جدید</button>}</div>
              {myKris.length === 0 ? <div className="im-empty">برای این ریسک شاخص هشداری تعریف نشده است.</div> : <div className="im-grid" style={{ gap: 10 }}>{myKris.map((k) => <KriCard key={k.id} kri={k} canEdit={props.canEdit} onEdit={(x) => setKriForm({ kri: x })} />)}</div>}
            </div>
          )}
          {tab === 'links' && <LinksTab {...props} />}
          {tab === 'evidence' && <EvidenceTab {...props} />}
          {tab === 'history' && <HistoryTab {...props} />}
        </div>
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--im-line)' }}><button className="im-btn im-btn-ghost" onClick={onClose}>بستن</button></div>
      </aside>
      {editing && <RiskFormModal risk={risk} onClose={() => setEditing(false)} />}
      {kriForm && <KriFormModal projectId={risk.projectId} riskId={risk.id} kri={kriForm.kri} onClose={() => setKriForm(null)} />}
    </div>
  )
}
