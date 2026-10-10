import { useEffect, useState } from 'react'
import { History, Plus, RefreshCw } from 'lucide-react'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { useFinanceControlStore, type FinAuditEntry, type FinConfigItem } from '../../store/useFinanceControlStore'
import { DEFAULT_THRESHOLDS, type FinThresholds } from '../../lib/financeControl'
import { useThresholds } from '../../lib/useThresholds'
import { fmtDate } from '../../components/FinanceKpiTile'
import { FINANCE_ACCENT } from '../../FinanceApp'

const FIELDS: { key: keyof Omit<FinThresholds, 'stageSlaDays'> | 'sla.submitted' | 'sla.under_review' | 'sla.certified'; label: string; hint?: string }[] = [
  { key: 'guaranteeExpiryDays', label: 'هشدار انقضای ضمانت‌نامه (روز مانده)' },
  { key: 'overdueCertificateDays', label: 'تأخیر پرداخت صورت‌وضعیت (روز)' },
  { key: 'sla.submitted', label: 'حداکثر ماندن در «ارائه‌شده» (روز)' },
  { key: 'sla.under_review', label: 'حداکثر ماندن در «بررسی» (روز)' },
  { key: 'sla.certified', label: 'حداکثر فاصلهٔ تأیید تا پرداخت (روز)' },
  { key: 'budgetWarnPct', label: 'هشدار مصرف بودجه (٪)' },
  { key: 'budgetCriticalPct', label: 'کسری بودجه (٪)' },
  { key: 'landBudgetWarnPct', label: 'هشدار بودجهٔ تملک اراضی (٪)' },
  { key: 'amendmentJumpPct', label: 'افزایش تجمعی مبلغ قرارداد (٪)' },
  { key: 'claimStaleDays', label: 'ادعای بی‌تصمیم (روز)' },
]
const KIND_FA: Record<FinConfigItem['kind'], string> = { contract_type: 'انواع قرارداد', cost_category: 'دسته‌بندی هزینه', currency: 'ارزها' }
const TABLE_FA: Record<string, string> = { fin_contracts: 'قرارداد', fin_contract_amendments: 'الحاقیه', fin_payment_certificates: 'صورت‌وضعیت', fin_payments: 'پرداخت', fin_guarantees: 'ضمانت‌نامه', fin_claims: 'ادعا', fin_retention_releases: 'حسن انجام کار', fin_budgets: 'بودجه', fin_budget_changes: 'تغییر بودجه', fin_budget_lines: 'ردیف بودجه', la_payments: 'پرداخت تملک اراضی' }
const ACT_FA: Record<string, string> = { INSERT: 'ایجاد', UPDATE: 'ویرایش', DELETE: 'حذف' }

/** Rules that can change without a code change. Thresholds are versioned (a new version never rewrites an old one); lists are soft-deleted. */
export function ControlSettingsPage({ masterProjectId }: { masterProjectId: string | null }) {
  const { thresholds, version } = useThresholds()
  const versions = useFinanceControlStore((s) => s.settingsVersions)
  const items = useFinanceControlStore((s) => s.configItems)
  const syncLog = useFinanceControlStore((s) => s.syncLog)
  const saveSettings = useFinanceControlStore((s) => s.saveSettings)
  const saveItem = useFinanceControlStore((s) => s.saveConfigItem)
  const loadAudit = useFinanceControlStore((s) => s.loadAudit)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [audit, setAudit] = useState<FinAuditEntry[] | null>(null)
  const [newItem, setNewItem] = useState<Record<string, { key: string; label: string }>>({})

  const value = (k: string): number => {
    if (k.startsWith('sla.')) return thresholds.stageSlaDays[k.slice(4) as keyof FinThresholds['stageSlaDays']]
    return thresholds[k as keyof Omit<FinThresholds, 'stageSlaDays'>] as number
  }
  const dirty = Object.keys(draft).length > 0
  const submit = async () => {
    const v: Partial<FinThresholds> = { ...thresholds, stageSlaDays: { ...thresholds.stageSlaDays } }
    for (const [k, raw] of Object.entries(draft)) {
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) continue
      if (k.startsWith('sla.')) v.stageSlaDays = { ...v.stageSlaDays!, [k.slice(4)]: n }
      else (v as Record<string, number>)[k] = n
    }
    if (await saveSettings(v, validFrom, note)) { setDraft({}); setNote('') }
  }
  useEffect(() => { void loadAudit(masterProjectId, 60).then(setAudit) }, [loadAudit, masterProjectId])

  return (
    <div className="space-y-4">
      <div className="fin-card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-extrabold">آستانهٔ هشدارها و مهلت‌ها</p><p className="text-[11px] fin-text-muted">نسخهٔ جاری: {version ? version.toLocaleString('fa-IR') : 'پیش‌فرض'}</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="block"><span className="mb-1 block text-[11px] fin-text-secondary">{f.label}</span>
              <input type="number" min={0} className="fin-input num" value={draft[f.key] ?? String(value(f.key))} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} /></label>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="mb-1 block text-[11px] fin-text-secondary">اعمال از تاریخ</span><JalaliDateInput value={validFrom} onChange={setValidFrom} /></label>
          <label className="block min-w-0 flex-1"><span className="mb-1 block text-[11px] fin-text-secondary">دلیل تغییر</span><input className="fin-input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <button disabled={!dirty || validFrom < new Date().toISOString().slice(0, 10)} onClick={submit} className="rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-40" style={{ background: FINANCE_ACCENT }}>ثبت نسخهٔ جدید</button>
          {dirty && <button onClick={() => setDraft({})} className="text-xs fin-text-muted"><RefreshCw size={12} className="inline" /> انصراف</button>}
        </div>
        <p className="text-[11px] leading-5 fin-text-muted">هر ثبت یک نسخهٔ جدید می‌سازد و از تاریخ اعمال به بعد گزارش‌ها از آن استفاده می‌کنند؛ نسخه‌های قبلی و ارقام قطعی گذشته تغییر نمی‌کنند. (فقط کاربران دارای مجوز «پیکربندی مالی»)</p>
        {versions.length > 0 && (
          <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead><tr className="fin-text-muted text-right"><th className="py-1 font-medium">نسخه</th><th className="font-medium">از تاریخ</th><th className="font-medium">دلیل</th></tr></thead>
            <tbody>{[...versions].reverse().map((v) => <tr key={v.version} className="border-t" style={{ borderColor: 'var(--fin-divider)' }}><td className="num py-1">{v.version.toLocaleString('fa-IR')}</td><td className="num">{fmtDate(v.validFrom)}</td><td>{v.note || '—'}</td></tr>)}</tbody></table></div>
        )}
        <details className="text-[11px] fin-text-muted"><summary className="cursor-pointer">مقادیر پیش‌فرض سامانه</summary><p className="num mt-1" dir="ltr">{JSON.stringify(DEFAULT_THRESHOLDS)}</p></details>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(['contract_type', 'cost_category', 'currency'] as const).map((kind) => {
          const list = items.filter((i) => i.kind === kind)
          const nw = newItem[kind] ?? { key: '', label: '' }
          return (
            <div key={kind} className="fin-card space-y-2 p-4">
              <p className="text-xs font-extrabold">{KIND_FA[kind]}</p>
              {list.map((i) => (
                <div key={i.id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate" style={{ opacity: i.active ? 1 : 0.45 }}>{i.label} <span className="num fin-text-muted" dir="ltr">({i.key})</span></span>
                  <button className="text-[11px] fin-text-muted underline" onClick={() => saveItem(kind, i.key, i.label, !i.active)}>{i.active ? 'غیرفعال' : 'فعال'}</button>
                </div>
              ))}
              <div className="flex gap-1.5 pt-1">
                <input className="fin-input w-20" dir="ltr" placeholder="کلید" value={nw.key} onChange={(e) => setNewItem({ ...newItem, [kind]: { ...nw, key: e.target.value } })} />
                <input className="fin-input min-w-0 flex-1" placeholder="عنوان" value={nw.label} onChange={(e) => setNewItem({ ...newItem, [kind]: { ...nw, label: e.target.value } })} />
                <button disabled={!nw.key.trim() || !nw.label.trim()} className="rounded-lg px-2 text-white disabled:opacity-40" style={{ background: FINANCE_ACCENT }} aria-label="افزودن" onClick={async () => { if (await saveItem(kind, nw.key, nw.label, true)) setNewItem({ ...newItem, [kind]: { key: '', label: '' } }) }}><Plus size={14} /></button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="fin-card p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold"><History size={13} /> سابقهٔ تغییرات مالی و قراردادی</p>
          {!audit || audit.length === 0 ? <p className="py-4 text-center text-xs fin-text-muted">سابقه‌ای نیست.</p> : (
            <div className="max-h-80 space-y-1 overflow-y-auto text-[11.5px]">
              {audit.map((a) => <p key={a.id} className="border-t pt-1" style={{ borderColor: 'var(--fin-divider)' }}><span className="num fin-text-muted">{fmtDate(a.at)}</span> · <b>{ACT_FA[a.action] ?? a.action}</b> {TABLE_FA[a.table] ?? a.table}{a.action === 'UPDATE' && a.oldRow && a.newRow ? ` — ${Object.keys(a.newRow).filter((k) => !['updated_at', 'updated_by'].includes(k) && JSON.stringify(a.newRow![k]) !== JSON.stringify(a.oldRow![k])).slice(0, 4).join('، ')}` : ''}</p>)}
            </div>
          )}
        </div>
        <div className="fin-card p-4">
          <p className="mb-2 text-xs font-extrabold">گزارش همگام‌سازی بین ماژول‌ها</p>
          {syncLog.length === 0 ? <p className="py-4 text-center text-xs fin-text-muted">رویدادی ثبت نشده است.</p> : (
            <div className="max-h-80 space-y-1 overflow-y-auto text-[11.5px]">
              {syncLog.map((l) => <p key={l.id} className="border-t pt-1" style={{ borderColor: 'var(--fin-divider)' }}><span className="num fin-text-muted">{fmtDate(l.at)}</span> · {l.source} · <b style={{ color: ['error', 'currency_mismatch', 'contract_missing'].includes(l.outcome) ? '#b5573a' : undefined }}>{l.outcome}</b>{l.detail ? ` — ${l.detail}` : ''}</p>)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
