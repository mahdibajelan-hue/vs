import { useCallback, useEffect, useState } from 'react'
import { FileCheck2, Loader2, RefreshCw } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useReportingStore } from '../store/useReportingStore'
import { EVIDENCE_WIDGET, loadEvidenceReport } from '../lib/evidenceLoader'
import type { EvidenceReport } from '../lib/evidenceReport'
import { EvidenceReportView } from '../components/EvidenceReportView'

/**
 * The management report built from evidence: computed live from the modules' own records, and frozen into a numbered
 * report (review → approval → issue in the report centre) when the user records a version.
 */
export function EvidenceReportPage({ masterProjectId, onOpenCenter }: { masterProjectId: string; onOpenCenter: () => void }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const createSnapshot = useReportingStore((s) => s.createSnapshot)
  const [report, setReport] = useState<EvidenceReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null); setSaved(null)
    try { setReport((await loadEvidenceReport(masterProjectId, project?.officialName ?? '')).report) }
    catch (e) { setError(e instanceof Error ? e.message : 'خطا در ساخت گزارش') }
    setLoading(false)
  }, [masterProjectId, project?.officialName])

  useEffect(() => { void load() }, [load])

  const record = async () => {
    if (!report) return
    setSaving(true)
    const id = await createSnapshot({ masterProjectId, reportType: 'management', profileId: null, periodStart: null, periodEnd: report.asOf, payload: { [EVIDENCE_WIDGET]: report }, widgetIds: [EVIDENCE_WIDGET] })
    setSaving(false)
    if (id) setSaved(useReportingStore.getState().snapshotsByProject[masterProjectId]?.find((s) => s.id === id)?.reportNumber ?? 'ثبت شد')
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <div className="glass-panel flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3">
        <p className="text-[11.5px] leading-6 text-muted">هر جمله از داده‌های ثبت‌شدهٔ ماژول‌ها ساخته می‌شود و شاهدش زیر آن آمده است. گزارش با «ثبت نسخه» شماره می‌گیرد و پس از بازبینی و تأیید در مرکز گزارش‌ها صادر می‌شود؛ گزارش صادرشده مبنای مقایسهٔ گزارش بعدی است.</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-secondary hover:bg-white/5 disabled:opacity-40">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> به‌روزرسانی
          </button>
          <button type="button" onClick={() => void record()} disabled={!report || saving || !!saved} className="flex items-center gap-1 rounded-lg border border-sky-400/40 bg-sky-500/15 px-2.5 py-1.5 text-[11px] font-bold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <FileCheck2 size={12} />} {saved ? 'ثبت شد' : 'ثبت نسخهٔ گزارش'}
          </button>
        </div>
      </div>
      {saved && (
        <div className="rounded-xl border border-green-400/30 bg-green-500/10 px-3 py-2 text-[12px] text-green-300">
          گزارش {saved} به‌صورت پیش‌نویس ثبت شد. <button type="button" className="underline" onClick={onOpenCenter}>بازبینی و صدور در مرکز گزارش‌ها</button>
        </div>
      )}
      {error ? <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>
        : loading || !report ? <div className="flex h-60 items-center justify-center gap-2 text-xs text-muted"><Loader2 size={18} className="animate-spin" /> گردآوری داده از ماژول‌ها…</div>
        : <EvidenceReportView report={report} />}
    </div>
  )
}
