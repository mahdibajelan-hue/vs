import { useState } from 'react'
import { Landmark, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { retentionHeldTotal, retentionLiability, retentionReleasedTotal, upcomingRetentionReleases } from '../lib/financeCalc'
import { fmtCurrency, fmtDate } from '../components/FinanceKpiTile'
import { MetricCard, StampBadge } from '../components/FinanceDashboardUI'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import {
  FIN_RETENTION_RELEASE_STAGE_LABEL_FA,
  FIN_RETENTION_RELEASE_STAGES,
  FIN_RETENTION_RELEASE_STATUS_LABEL_FA,
  FIN_RETENTION_RELEASE_STATUSES,
  type FinRetentionRelease,
  type FinRetentionReleaseStage,
  type FinRetentionReleaseStatus,
} from '../types'

const STATUS_TONE: Record<FinRetentionReleaseStatus, 'good' | 'warn' | 'neutral'> = { pending: 'warn', released: 'good', cancelled: 'neutral' }

/**
 * حسن انجام کار (Retention) — the amount withheld is already visible per-certificate; this page is
 * the liability side an owner PM/CEO actually needs: how much is currently held across a project's
 * contracts, and the planned/actual schedule for releasing it back (provisional handover, final
 * handover after the defects-liability period).
 */
export function RetentionPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const certificates = useFinanceStore((s) => s.certificates)
  const releases = useFinanceStore((s) => s.retentionReleases)
  const createRetentionRelease = useFinanceStore((s) => s.createRetentionRelease)
  const updateRetentionRelease = useFinanceStore((s) => s.updateRetentionRelease)
  const deleteRetentionRelease = useFinanceStore((s) => s.deleteRetentionRelease)

  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<FinRetentionRelease | null>(null)

  if (!project) return <div className="flex h-40 items-center justify-center text-xs fin-text-muted">پروژه یافت نشد</div>

  const contractIds = new Set(contracts.map((c) => c.id))
  const scopedCertificates = certificates.filter((c) => contractIds.has(c.contractId))
  const scopedReleases = releases.filter((r) => contractIds.has(r.contractId)).sort((a, b) => (a.plannedDate ?? '9999') < (b.plannedDate ?? '9999') ? -1 : 1)
  const currency = contracts[0]?.currency ?? project.currency ?? 'ریال'
  const contractOf = (id: string) => contracts.find((c) => c.id === id)
  const contractLabel = (id: string) => contractOf(id)?.title || contractOf(id)?.contractNumber || '—'
  const upcoming = upcomingRetentionReleases(scopedReleases)

  return (
    <div className="space-y-4">
      <div className="fin-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="fin-text-muted text-xs">حسن انجام کار</p>
          <h1 className="fin-text mt-1 text-lg font-extrabold">{project.officialName}</h1>
        </div>
        {contracts.length > 0 && (
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: '#3e7c74' }}>
            <Plus size={13} /> برنامه آزادسازی جدید
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard icon={Landmark} label="حسن انجام کار نزد کارفرما (بدهی جاری)" value={fmtCurrency(retentionLiability(scopedCertificates, scopedReleases), currency)} color="#b8863b" />
        <MetricCard icon={ShieldCheck} label="مجموع کسرشده تا امروز" value={fmtCurrency(retentionHeldTotal(scopedCertificates), currency)} color="#5c7290" />
        <MetricCard icon={ShieldCheck} label="مجموع آزادشده" value={fmtCurrency(retentionReleasedTotal(scopedReleases), currency)} color="#3e7c74" />
        <MetricCard
          icon={Landmark}
          label="آزادسازی نزدیک (۶۰ روز آینده)"
          value={upcoming.length.toLocaleString('fa-IR')}
          color={upcoming.length > 0 ? '#b5573a' : '#3e7c74'}
          status={upcoming.length > 0 ? 'warn' : 'good'}
        />
      </div>

      {contracts.length === 0 ? (
        <div className="fin-card p-8 text-center text-xs fin-text-muted">ابتدا برای این پروژه یک قرارداد ثبت کنید.</div>
      ) : scopedReleases.length === 0 ? (
        <div className="fin-card p-8 text-center text-xs fin-text-muted">هنوز برنامه آزادسازی حسن انجام کاری ثبت نشده است.</div>
      ) : (
        <div className="fin-card overflow-x-auto p-4">
          <table className="w-full min-w-[760px] text-right text-[11px]">
            <thead>
              <tr className="fin-text-muted text-[10px]">
                <th className="pb-2 font-medium">قرارداد</th>
                <th className="pb-2 font-medium">مرحله</th>
                <th className="pb-2 font-medium">تاریخ برنامه‌ریزی‌شده</th>
                <th className="pb-2 font-medium">مبلغ برنامه‌ریزی‌شده</th>
                <th className="pb-2 font-medium">تاریخ واقعی</th>
                <th className="pb-2 font-medium">مبلغ واقعی</th>
                <th className="pb-2 font-medium">وضعیت</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {scopedReleases.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--fin-divider)' }}>
                  <td className="fin-text py-2">{contractLabel(r.contractId)}</td>
                  <td className="fin-text py-2">{FIN_RETENTION_RELEASE_STAGE_LABEL_FA[r.releaseStage]}</td>
                  <td className="num fin-text-muted py-2">{fmtDate(r.plannedDate)}</td>
                  <td className="num fin-text py-2 font-bold">{fmtCurrency(r.plannedAmount, currency)}</td>
                  <td className="num fin-text-muted py-2">{fmtDate(r.actualDate)}</td>
                  <td className="num fin-text py-2">{r.actualAmount != null ? fmtCurrency(r.actualAmount, currency) : '—'}</td>
                  <td className="py-2">
                    <StampBadge label={FIN_RETENTION_RELEASE_STATUS_LABEL_FA[r.status]} tone={STATUS_TONE[r.status]} />
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditing(r)} className="fin-text-secondary text-[10.5px] hover:underline">
                        ویرایش
                      </button>
                      <button onClick={() => deleteRetentionRelease(r.id)} className="fin-text-muted hover:text-red-400">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <RetentionModal
          title="برنامه آزادسازی جدید"
          contracts={contracts}
          onClose={() => setShowNew(false)}
          onSave={async (contractId, data) => {
            await createRetentionRelease(contractId, data)
            setShowNew(false)
          }}
        />
      )}
      {editing && (
        <RetentionModal
          title="ویرایش برنامه آزادسازی"
          contracts={contracts}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (_contractId, data) => {
            await updateRetentionRelease(editing.id, data)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function RetentionModal({
  title,
  contracts,
  initial,
  onClose,
  onSave,
}: {
  title: string
  contracts: { id: string; title: string; contractNumber: string }[]
  initial?: FinRetentionRelease
  onClose: () => void
  onSave: (contractId: string, data: Partial<FinRetentionRelease>) => Promise<void>
}) {
  const [contractId, setContractId] = useState(initial?.contractId ?? contracts[0]?.id ?? '')
  const [releaseStage, setReleaseStage] = useState<FinRetentionReleaseStage>(initial?.releaseStage ?? 'provisional_handover')
  const [plannedDate, setPlannedDate] = useState(initial?.plannedDate ?? '')
  const [plannedAmount, setPlannedAmount] = useState(initial?.plannedAmount != null ? String(initial.plannedAmount) : '')
  const [actualDate, setActualDate] = useState(initial?.actualDate ?? '')
  const [actualAmount, setActualAmount] = useState(initial?.actualAmount != null ? String(initial.actualAmount) : '')
  const [status, setStatus] = useState<FinRetentionReleaseStatus>(initial?.status ?? 'pending')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!contractId) return
    setSaving(true)
    await onSave(contractId, {
      releaseStage,
      plannedDate: plannedDate || null,
      plannedAmount: plannedAmount === '' ? 0 : Number(plannedAmount),
      actualDate: actualDate || null,
      actualAmount: actualAmount === '' ? null : Number(actualAmount),
      status,
      notes,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="fin-card w-full max-w-sm space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="fin-text flex items-center gap-2 text-sm font-extrabold">
          <Landmark size={15} style={{ color: '#3e7c74' }} /> {title}
        </h3>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">قرارداد</span>
          <select value={contractId} onChange={(e) => setContractId(e.target.value)} className="fin-input" autoFocus>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || c.contractNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">مرحله آزادسازی</span>
          <select value={releaseStage} onChange={(e) => setReleaseStage(e.target.value as FinRetentionReleaseStage)} className="fin-input">
            {FIN_RETENTION_RELEASE_STAGES.map((s) => (
              <option key={s} value={s}>
                {FIN_RETENTION_RELEASE_STAGE_LABEL_FA[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">تاریخ برنامه‌ریزی‌شده</span>
          <JalaliDateInput value={plannedDate} onChange={setPlannedDate} />
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">مبلغ برنامه‌ریزی‌شده</span>
          <input type="number" value={plannedAmount} onChange={(e) => setPlannedAmount(e.target.value)} className="fin-input num" />
        </label>
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">وضعیت</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as FinRetentionReleaseStatus)} className="fin-input">
            {FIN_RETENTION_RELEASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FIN_RETENTION_RELEASE_STATUS_LABEL_FA[s]}
              </option>
            ))}
          </select>
        </label>
        {status === 'released' && (
          <>
            <label className="block">
              <span className="fin-text-secondary mb-1 block text-xs">تاریخ واقعی آزادسازی</span>
              <JalaliDateInput value={actualDate} onChange={setActualDate} />
            </label>
            <label className="block">
              <span className="fin-text-secondary mb-1 block text-xs">مبلغ واقعی آزادشده</span>
              <input type="number" value={actualAmount} onChange={(e) => setActualAmount(e.target.value)} className="fin-input num" placeholder={plannedAmount || '0'} />
            </label>
          </>
        )}
        <label className="block">
          <span className="fin-text-secondary mb-1 block text-xs">یادداشت</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="fin-input" rows={2} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="fin-text-secondary rounded-lg px-4 py-2 text-sm hover:opacity-70">
            انصراف
          </button>
          <button onClick={submit} disabled={saving || !contractId} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40" style={{ background: '#3e7c74' }}>
            {saving ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </div>
      </div>
    </div>
  )
}
