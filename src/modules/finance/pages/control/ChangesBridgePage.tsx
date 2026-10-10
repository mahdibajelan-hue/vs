import { useMemo, useState } from 'react'
import { ExternalLink, GitPullRequestArrow } from 'lucide-react'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useModuleStore } from '../../../../store/useModuleStore'
import { useDeepLinkStore } from '../../../../store/useDeepLinkStore'
import { useFinanceStore } from '../../store/useFinanceStore'
import { useFinanceControlStore, type FinChangeRequest } from '../../store/useFinanceControlStore'
import { contractFile, PENDING_CHANGE_STATUSES } from '../../lib/financeControl'
import { fmtCurrency, fmtDate } from '../../components/FinanceKpiTile'
import { StampBadge } from '../../components/FinanceDashboardUI'
import { FINANCE_ACCENT } from '../../FinanceApp'

const STATUS_FA: Record<string, string> = { draft: 'پیش‌نویس', submitted: 'پیشنهادشده', evaluating: 'در حال بررسی', awaiting_approval: 'در انتظار تصویب', approved: 'تأییدشده', rejected: 'ردشده', returned: 'برگشت‌خورده', implementing: 'در حال اجرا', implemented: 'اجراشده', closed: 'بسته‌شده', cancelled: 'لغوشده' }
const TONE = (s: string): 'good' | 'bad' | 'warn' | 'info' | 'neutral' => (['approved', 'implementing', 'implemented', 'closed'].includes(s) ? 'good' : ['rejected', 'cancelled'].includes(s) ? 'bad' : PENDING_CHANGE_STATUSES.includes(s) ? 'warn' : s === 'returned' ? 'info' : 'neutral')
const OUTCOME_FA: Record<string, string> = { created: 'الحاقیه ساخته شد', updated: 'الحاقیه به‌روز شد', voided: 'الحاقیه باطل شد', currency_mismatch: 'ارز درخواست با ارز قرارداد فرق دارد؛ اعمال دستی لازم است', contract_missing: 'قرارداد یافت نشد', error: 'خطا در همگام‌سازی' }

/**
 * Change management → contracts. Approval rules and authority stay in the change module; this page only receives its valid results:
 * an approved change becomes exactly one amendment on its contract (never typed twice), edits update it and cancellation voids it.
 * Proposed amounts of changes still in flight are shown as a *scenario*, apart from every approved figure.
 */
export function ChangesBridgePage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const amendments = useFinanceStore((s) => s.amendments)
  const changes = useFinanceControlStore((s) => s.changes).filter((c) => c.masterProjectId === masterProjectId)
  const log = useFinanceControlStore((s) => s.syncLog).filter((l) => l.source === 'change' && l.masterProjectId === masterProjectId)
  const enterModule = useModuleStore((s) => s.enterModule)
  const requestLink = useDeepLinkStore((s) => s.request)
  const [scenario, setScenario] = useState(false)

  const byContract = useMemo(() => contracts.map((c) => {
    const f = contractFile(c, amendments)
    const mine = changes.filter((x) => x.contractId === c.id)
    const pending = mine.filter((x) => PENDING_CHANGE_STATUSES.includes(x.status))
    const pendingAmount = pending.reduce((n, x) => n + x.proposedAmount, 0)
    const pendingDays = pending.reduce((n, x) => n + x.proposedDays, 0)
    return { c, f, mine, pending, pendingAmount, pendingDays }
  }), [contracts, amendments, changes])
  const open = (r: FinChangeRequest) => { requestLink({ module: 'change', recordId: r.id, masterProjectId }); enterModule('change') }
  if (!project) return null
  const manual = log.filter((l) => l.outcome === 'currency_mismatch' || l.outcome === 'contract_missing' || l.outcome === 'error')

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="fin-text-muted text-xs">تغییرات قراردادی (از مدیریت تغییرات)</p><h1 className="fin-text mt-1 text-lg font-extrabold">{project.officialName}</h1></div>
        <label className="flex items-center gap-2 text-xs fin-text-secondary"><input type="checkbox" checked={scenario} onChange={(e) => setScenario(e.target.checked)} /> نمایش سناریوی تغییرات تصویب‌نشده</label>
      </div>

      {manual.length > 0 && (
        <div className="fin-card space-y-1 border p-4 text-xs" style={{ borderColor: '#b5573a66' }}>
          <p className="font-bold" style={{ color: '#b5573a' }}>موارد نیازمند اقدام دستی</p>
          {manual.map((l) => <p key={l.id} className="fin-text-secondary">{OUTCOME_FA[l.outcome]} — {l.detail}</p>)}
        </div>
      )}

      {byContract.length === 0 ? <div className="fin-card p-8 text-center text-xs fin-text-muted">برای این پروژه قراردادی ثبت نشده است.</div> : byContract.map(({ c, f, mine, pendingAmount, pendingDays }) => (
        <div key={c.id} className="fin-card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">{c.title || c.contractNumber}</p>
            <span className="num text-[11px] fin-text-muted" dir="ltr">{c.contractNumber}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Fig label="مبلغ اولیه" value={fmtCurrency(f.original, c.currency)} />
            <Fig label="الحاقیه‌های تصویب‌شده" value={`${f.amendmentsTotal >= 0 ? '+' : ''}${fmtCurrency(f.amendmentsTotal, c.currency)}`} hint={`${f.increasePct.toLocaleString('fa-IR')}٪ · ${f.amendmentCount.toLocaleString('fa-IR')} مورد`} />
            <Fig label="مبلغ اصلاح‌شده" value={fmtCurrency(f.current, c.currency)} strong />
            <Fig label="پایان اصلاح‌شده" value={f.currentEnd ? fmtDate(f.currentEnd) : '—'} hint={f.daysExtension ? `${f.daysExtension.toLocaleString('fa-IR')} روز تمدید` : undefined} />
          </div>
          {scenario && (
            <div className="rounded-lg border border-dashed px-3 py-2 text-xs" style={{ borderColor: '#c28a2b88' }}>
              <span className="font-bold" style={{ color: '#c28a2b' }}>سناریوی احتمالی (مصوب نیست)</span>
              <span className="mx-2 fin-text-secondary">اگر همهٔ درخواست‌های در جریان تصویب شوند:</span>
              <span className="num font-bold">{fmtCurrency(f.current + pendingAmount, c.currency)}</span>
              {pendingDays !== 0 && <span className="num fin-text-muted"> · {pendingDays.toLocaleString('fa-IR')} روز</span>}
            </div>
          )}
          {mine.length > 0 && (
            <div className="space-y-1">
              {mine.map((r) => (
                <button key={r.id} onClick={() => open(r)} className="flex w-full items-center gap-3 rounded-lg border px-3 py-1.5 text-start hover:opacity-80" style={{ borderColor: 'var(--fin-divider)' }}>
                  <GitPullRequestArrow size={13} style={{ color: FINANCE_ACCENT }} />
                  <span className="num text-[11px] fin-text-muted" dir="ltr">{r.crNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-xs">{r.title}</span>
                  <StampBadge label={STATUS_FA[r.status] ?? r.status} tone={TONE(r.status)} />
                  <span className="num shrink-0 text-xs font-bold">{fmtCurrency(r.approvedAmount ?? r.proposedAmount, c.currency)}</span>
                  <ExternalLink size={11} className="fin-text-muted" />
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function Fig({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return <div><p className="fin-text-muted text-[10.5px]">{label}</p><p className={`num mt-0.5 ${strong ? 'text-sm font-extrabold' : 'text-xs font-bold'}`}>{value}</p>{hint && <p className="text-[10px] fin-text-muted">{hint}</p>}</div>
}
