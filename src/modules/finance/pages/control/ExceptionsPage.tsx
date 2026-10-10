import { useMemo, useState } from 'react'
import { AlertOctagon, ShieldAlert, ListChecks } from 'lucide-react'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useModuleStore } from '../../../../store/useModuleStore'
import { useDeepLinkStore } from '../../../../store/useDeepLinkStore'
import { useFinanceStore } from '../../store/useFinanceStore'
import { useFinanceControlStore, type FinLink } from '../../store/useFinanceControlStore'
import { findExceptions, landBridge, type FinException } from '../../lib/financeControl'
import { useThresholds } from '../../lib/useThresholds'
import { currentBudget, currentContractValue } from '../../lib/financeCalc'
import { StampBadge } from '../../components/FinanceDashboardUI'
import { FINANCE_ACCENT } from '../../FinanceApp'

const SEV_FA = { critical: 'بحرانی', high: 'زیاد', medium: 'متوسط' } as const
const SEV_TONE = { critical: 'bad', high: 'warn', medium: 'info' } as const

/**
 * What needs a management decision, found from the live data with the thresholds in force. Each finding can become an Issue or a Risk in their own modules
 * (once — the link is remembered), and the owner, due date and status of those items come back here. Those modules stay the owners of the formal process.
 */
export function ExceptionsPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts)
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const guarantees = useFinanceStore((s) => s.guarantees)
  const claims = useFinanceStore((s) => s.claims)
  const budgets = useFinanceStore((s) => s.budgets)
  const budgetChanges = useFinanceStore((s) => s.budgetChanges)
  const land = useFinanceControlStore((s) => s.land)
  const links = useFinanceControlStore((s) => s.links)
  const targets = useFinanceControlStore((s) => s.linkTargets)
  const raise = useFinanceControlStore((s) => s.raise)
  const enterModule = useModuleStore((s) => s.enterModule)
  const requestLink = useDeepLinkStore((s) => s.request)
  const { thresholds, version } = useThresholds()
  const [busy, setBusy] = useState<string | null>(null)

  const items = useMemo(() => {
    const pc = contracts.filter((c) => c.masterProjectId === masterProjectId)
    const ids = new Set(pc.map((c) => c.id))
    const b = budgets.find((x) => x.masterProjectId === masterProjectId) ?? null
    const budget = currentBudget(b, budgetChanges.filter((x) => x.masterProjectId === masterProjectId))
    const landSum = land.get(masterProjectId)
    const commitment = pc.filter((c) => c.status === 'active' || c.status === 'completed').reduce((n, c) => n + currentContractValue(c, amendments), 0) + (landSum?.exposure ?? 0)
    return findExceptions({ contracts: pc, amendments, certificates: certificates.filter((c) => ids.has(c.contractId)), guarantees: guarantees.filter((g) => ids.has(g.contractId)), claims: claims.filter((c) => ids.has(c.contractId)), thresholds, today: new Date().toISOString().slice(0, 10),
      budgetByProject: new Map([[masterProjectId, { budget, commitment }]]), land: landSum ? new Map([[masterProjectId, landBridge(landSum, thresholds)]]) : undefined })
  }, [contracts, amendments, certificates, guarantees, claims, budgets, budgetChanges, land, masterProjectId, thresholds])

  const linkOf = (e: FinException, kind: 'issue' | 'risk'): FinLink | undefined => links.find((l) => l.masterProjectId === masterProjectId && l.sourceType === e.sourceType && l.sourceId === e.sourceId && l.targetType === kind)
  const go = (l: FinLink) => { requestLink({ module: l.targetType === 'issue' ? 'issues' : 'risk', recordId: l.targetId, masterProjectId }); enterModule(l.targetType === 'issue' ? 'issues' : 'risk') }
  const doRaise = async (e: FinException, target: 'issue' | 'risk') => { setBusy(`${e.key}:${target}`); await raise({ sourceType: e.sourceType, sourceId: e.sourceId, projectId: masterProjectId, target, title: e.title, description: `${e.title}\n\n${e.detail}`, severity: e.severity }); setBusy(null) }
  if (!project) return null

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="fin-text-muted text-xs">موارد نیازمند تصمیم مدیریتی</p><h1 className="fin-text mt-1 text-lg font-extrabold">{project.officialName}</h1></div>
        <p className="text-[11px] fin-text-muted">آستانه‌ها: {version ? `نسخهٔ ${version.toLocaleString('fa-IR')}` : 'پیش‌فرض'} (تنظیمات)</p>
      </div>
      {items.length === 0 ? (
        <div className="fin-card flex items-center justify-center gap-2 p-8 text-sm fin-text-muted"><ListChecks size={16} /> مورد استثنایی دیده نشد.</div>
      ) : items.map((e) => {
        const li = linkOf(e, 'issue'); const lr = linkOf(e, 'risk')
        return (
          <div key={e.key} className="fin-card flex flex-wrap items-center gap-3 p-4">
            <AlertOctagon size={16} style={{ color: e.severity === 'critical' ? '#b5573a' : e.severity === 'high' ? '#c28a2b' : '#5c7290' }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-6">{e.title}</p>
              <p className="text-[11.5px] fin-text-secondary">{e.detail}</p>
              {[li, lr].filter((x): x is FinLink => !!x).map((l) => {
                const t = targets.get(l.targetId)
                return <button key={l.id} onClick={() => go(l)} className="me-2 mt-1 text-[11px] underline" style={{ color: FINANCE_ACCENT }}>{l.targetType === 'issue' ? 'مسئله' : 'ریسک'} {t?.code || ''}{t?.status ? ` · ${t.status}` : ''}</button>
              })}
            </div>
            <StampBadge label={SEV_FA[e.severity]} tone={SEV_TONE[e.severity]} />
            <div className="flex gap-1.5">
              <button disabled={!!li || busy === `${e.key}:issue`} onClick={() => doRaise(e, 'issue')} className="rounded-lg border px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40" style={{ borderColor: 'var(--fin-divider)' }}>{li ? 'مسئله ثبت شد' : 'ثبت مسئله'}</button>
              <button disabled={!!lr || busy === `${e.key}:risk`} onClick={() => doRaise(e, 'risk')} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40" style={{ borderColor: 'var(--fin-divider)' }}><ShieldAlert size={11} />{lr ? 'ریسک ثبت شد' : 'ثبت ریسک'}</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
