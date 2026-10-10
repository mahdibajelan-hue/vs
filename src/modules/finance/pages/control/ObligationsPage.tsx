import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { useFinanceStore } from '../../store/useFinanceStore'
import { useFinanceControlStore } from '../../store/useFinanceControlStore'
import { advanceStatus, CLEARANCE_FA, type Clearance } from '../../lib/financeInsights'
import { fmtCurrency } from '../../components/FinanceKpiTile'
import { FINANCE_ACCENT } from '../../FinanceApp'

const ST_FA: Record<Clearance['status'], string> = { pending: 'در جریان', issued: 'صادر شد', expired: 'منقضی' }

/** Advance payment and its amortisation, plus the clearances (social-security, insurance, tax) every contract needs before guarantees and retention can be released. */
export function ObligationsPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId && c.status !== 'draft' && c.status !== 'replaced')
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const clearances = useFinanceControlStore((s) => s.clearances)
  const save = useFinanceControlStore((s) => s.saveClearance)
  if (!project) return null
  return (
    <div className="space-y-4">
      <div className="fin-card p-4"><p className="fin-text-muted text-xs">پیش‌پرداخت، استهلاک و مفاصاحساب‌ها</p><h1 className="fin-text mt-1 text-lg font-extrabold">{project.officialName}</h1></div>
      {contracts.length === 0 && <div className="fin-card p-8 text-center text-xs fin-text-muted">قراردادی نیست.</div>}
      {contracts.map((c) => {
        const adv = advanceStatus(c, amendments, certificates)
        return (
          <div key={c.id} className="fin-card space-y-3 p-4">
            <p className="text-sm font-bold">{c.title || c.contractNumber} <span className="num text-[11px] fin-text-muted" dir="ltr">{c.contractNumber}</span></p>
            {adv ? (
              <div>
                <div className="mb-1 flex justify-between text-xs"><span className="fin-text-secondary">پیش‌پرداخت {fmtCurrency(adv.advance, c.currency)} ({c.advancePaymentPercent.toLocaleString('fa-IR')}٪)</span><span className="num font-bold" style={{ color: adv.behind ? '#b5573a' : undefined }}>مستهلک‌شده {adv.recoveredPct.toLocaleString('fa-IR')}٪ · کارکرد تأییدشده {adv.certifiedPct.toLocaleString('fa-IR')}٪</span></div>
                <div className="relative h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--fin-divider)' }}>
                  <div className="absolute inset-y-0 start-0 rounded-full" style={{ width: `${Math.min(100, adv.recoveredPct)}%`, background: adv.behind ? '#b5573a' : '#3e7c74' }} />
                  <div className="absolute inset-y-0 w-0.5" style={{ insetInlineStart: `${Math.min(100, adv.certifiedPct)}%`, background: 'var(--fin-text)' }} title="کارکرد تأییدشده" />
                </div>
                <p className="num mt-1 text-[11px] fin-text-muted">مانده برای استهلاک: {fmtCurrency(adv.balance, c.currency)}</p>
              </div>
            ) : <p className="text-xs fin-text-muted">این قرارداد پیش‌پرداخت ندارد.</p>}
            <div className="grid gap-2 lg:grid-cols-3">
              {(['social_security', 'insurance', 'tax'] as const).map((kind) => {
                const cl = clearances.find((x) => x.contractId === c.id && x.kind === kind) ?? { contractId: c.id, kind, status: 'pending' as const, number: '', issueDate: null, expiryDate: null, note: '' }
                const upd = (patch: Partial<Clearance>) => void save({ ...cl, ...patch })
                return (
                  <div key={kind} className="space-y-1.5 rounded-lg border p-2.5" style={{ borderColor: 'var(--fin-divider)' }}>
                    <p className="text-xs font-bold">{CLEARANCE_FA[kind]}</p>
                    <div className="flex gap-1.5">
                      <select className="fin-input w-28" value={cl.status} onChange={(e) => upd({ status: e.target.value as Clearance['status'] })}>{(['pending', 'issued', 'expired'] as const).map((s) => <option key={s} value={s}>{ST_FA[s]}</option>)}</select>
                      <input className="fin-input min-w-0 flex-1" dir="ltr" placeholder="شماره" defaultValue={cl.number} onBlur={(e) => e.target.value !== cl.number && upd({ number: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5"><div><span className="text-[10px] fin-text-muted">صدور</span><JalaliDateInput value={cl.issueDate ?? ''} onChange={(v) => upd({ issueDate: v || null })} /></div><div><span className="text-[10px] fin-text-muted">انقضا</span><JalaliDateInput value={cl.expiryDate ?? ''} onChange={(v) => upd({ expiryDate: v || null })} /></div></div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      <p className="text-[11px] leading-5" style={{ color: FINANCE_ACCENT }}>قرارداد تکمیل‌شده‌ای که مفاصاحساب تأمین اجتماعی صادرشده ندارد یا پیش‌پرداخت مستهلک‌نشده دارد، در «استثناها و اقدام» به‌عنوان یافتهٔ تحلیلی می‌آید.</p>
    </div>
  )
}
