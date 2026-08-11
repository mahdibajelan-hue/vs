import { useEffect, useMemo, useRef, useState } from 'react'
import { Briefcase, Download, FileSpreadsheet, Layers, Loader2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { exportElementToPdf } from '../../../lib/export'
import { exportReportToExcel } from '../lib/reportExport'
import { useScopedIntelligence } from '../lib/useProjectIntelligence'
import { type IntelligenceScope } from '../lib/dataAdapter'
import { DEFAULT_PROFILE_WIDGETS, WIDGET_REGISTRY, computeReportPayload, widgetsByCategory } from '../lib/widgetRegistry'
import { WidgetGrid } from '../components/WidgetGrid'
import { EMPTY_ARRAY, useReportingStore } from '../store/useReportingStore'
import { REPORT_TYPES, REPORT_TYPE_LABEL_FA, WIDGET_CATEGORY_LABEL_FA, type ReportType, type WidgetCategory } from '../types'
import type { WidgetComputeContext } from '../lib/widgetTypes'

const CATEGORY_ORDER: WidgetCategory[] = ['executive', 'progress', 'risk', 'issue', 'intelligence', 'decision']

/**
 * Portfolio/Program-level executive reports (architecture spec §8: "Users must be able to
 * generate a Portfolio Executive Report / Program Management Report, each automatically
 * aggregating the appropriate lower levels"). Reuses the exact same Widget Registry, live
 * renderer and export pipeline as the per-project Report Builder — the only difference is the
 * data bundle is aggregated across every project under the chosen Portfolio/Program instead of
 * one project (see fetchScopedIntelligence). Decisions/actions and saved Snapshot history stay
 * project-scoped for now (rasta_decisions/rasta_actions/rasta_report_snapshots are keyed to a
 * single master_projects row) — this page offers live viewing plus direct PDF/Excel export
 * instead of saving to Report Center.
 */
export function PortfolioReportPage() {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const profiles = useReportingStore((s) => s.profiles)
  const createProfile = useReportingStore((s) => s.createProfile)

  const [scopeType, setScopeType] = useState<'portfolio' | 'program'>('portfolio')
  const [scopeId, setScopeId] = useState<string | null>(null)
  const [reportType, setReportType] = useState<ReportType>('management')
  const [widgetIds, setWidgetIds] = useState<string[]>(DEFAULT_PROFILE_WIDGETS.management)
  const [saveName, setSaveName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [exporting, setExporting] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const targets = scopeType === 'portfolio' ? portfolios : programs

  useEffect(() => {
    setScopeId(targets.length > 0 ? targets[0].id : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeType])

  useEffect(() => {
    setWidgetIds(DEFAULT_PROFILE_WIDGETS[reportType])
  }, [reportType])

  const scope: IntelligenceScope | null = scopeId ? { type: scopeType, id: scopeId } : null
  const { bundle, previousBundle, loading } = useScopedIntelligence(scope)
  const decisions = EMPTY_ARRAY
  const actions = EMPTY_ARRAY

  const profilesForType = useMemo(() => profiles.filter((p) => p.reportType === reportType), [profiles, reportType])
  const byCategory = useMemo(() => widgetsByCategory(), [])
  const scopeLabel = scopeType === 'portfolio' ? 'پورتفولیو' : 'طرح'
  const targetName = targets.find((t) => t.id === scopeId)?.name ?? ''

  const toggleWidget = (id: string) => setWidgetIds((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]))

  const applyProfile = (id: string) => {
    if (!id) {
      setWidgetIds(DEFAULT_PROFILE_WIDGETS[reportType])
      return
    }
    const profile = profiles.find((p) => p.id === id)
    if (profile) setWidgetIds(profile.widgetIds.filter((w) => WIDGET_REGISTRY.some((wd) => wd.id === w)))
  }

  const handleSaveProfile = async () => {
    if (!saveName.trim() || widgetIds.length === 0) return
    setSavingProfile(true)
    await createProfile({ name: saveName.trim(), reportType, description: '', widgetIds })
    setSavingProfile(false)
    setSaveName('')
  }

  const handleExportPdf = async () => {
    if (!gridRef.current) return
    setExporting(true)
    try {
      await exportElementToPdf(gridRef.current, `گزارش-${scopeLabel}-${targetName}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  const handleExportExcel = async () => {
    if (!bundle) return
    setExporting(true)
    try {
      const ctx: WidgetComputeContext = { bundle, previousBundle, decisions, actions }
      const payload = computeReportPayload(widgetIds, ctx)
      await exportReportToExcel(`${scopeLabel}-${targetName}`, widgetIds, payload, `گزارش-${scopeLabel}-${targetName}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-2 text-sm font-bold">سطح گزارش</p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setScopeType('portfolio')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                scopeType === 'portfolio' ? 'bg-teal-500/20 text-teal-300' : 'border border-white/10 text-secondary hover:bg-white/5'
              }`}
            >
              <Briefcase size={13} /> پورتفولیو
            </button>
            <button
              onClick={() => setScopeType('program')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                scopeType === 'program' ? 'bg-teal-500/20 text-teal-300' : 'border border-white/10 text-secondary hover:bg-white/5'
              }`}
            >
              <Layers size={13} /> طرح
            </button>
          </div>
          <select
            value={scopeId ?? ''}
            onChange={(e) => setScopeId(e.target.value || null)}
            className="mt-2.5 w-full rounded-lg bg-black/20 border border-white/10 px-2.5 py-1.5 text-xs outline-none"
          >
            <option value="">{targets.length === 0 ? `${scopeLabel}ای تعریف نشده است` : `یک ${scopeLabel} انتخاب کنید`}</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code})
              </option>
            ))}
          </select>
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-2 text-sm font-bold">نوع گزارش</p>
          <div className="flex flex-wrap gap-1.5">
            {REPORT_TYPES.map((rt) => (
              <button
                key={rt}
                onClick={() => setReportType(rt)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  reportType === rt ? 'bg-teal-500/20 text-teal-300' : 'border border-white/10 text-secondary hover:bg-white/5'
                }`}
              >
                {REPORT_TYPE_LABEL_FA[rt]}
              </button>
            ))}
          </div>
          {profilesForType.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[11px] text-muted">شروع از یک پروفایل ذخیره‌شده</p>
              <select onChange={(e) => applyProfile(e.target.value)} className="w-full rounded-lg bg-black/20 border border-white/10 px-2.5 py-1.5 text-xs outline-none">
                <option value="">پیش‌فرض سیستم</option>
                {profilesForType.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-2 text-sm font-bold">ویجت‌های گزارش ({widgetIds.length})</p>
          <div className="space-y-3">
            {CATEGORY_ORDER.map((cat) => (
              <div key={cat}>
                <p className="mb-1 text-[10px] font-bold text-muted">{WIDGET_CATEGORY_LABEL_FA[cat]}</p>
                <div className="space-y-1">
                  {(byCategory[cat] ?? []).map((w) => (
                    <label key={w.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-white/5">
                      <input type="checkbox" checked={widgetIds.includes(w.id)} onChange={() => toggleWidget(w.id)} className="accent-brand-400" />
                      {w.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-5 text-muted">
            ویجت‌های وابسته به داده PipePulse تک‌پروژه‌ای (نمودار S و نقاط عطف) در سطح پورتفولیو/طرح داده‌ای برای نمایش ندارند — این محدودیت شناخته‌شده است، چون میانگین یا مجموع چند نمودار S معنای مدیریتی روشنی ندارد.
          </p>
        </div>

        <div className="glass-panel space-y-2 rounded-2xl p-4">
          <div className="flex gap-1.5">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="نام پروفایل جدید"
              className="flex-1 rounded-lg bg-black/20 border border-white/10 px-2.5 py-1.5 text-xs outline-none"
            />
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile || !saveName.trim()}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-secondary hover:bg-white/5 disabled:opacity-40"
            >
              {savingProfile ? <Loader2 size={12} className="animate-spin" /> : null} ذخیره پروفایل
            </button>
          </div>
          <button
            onClick={handleExportPdf}
            disabled={exporting || !bundle}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-xs font-bold text-white hover:bg-teal-400 disabled:opacity-40"
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} خروجی PDF
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exporting || !bundle}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-secondary hover:bg-white/5 disabled:opacity-40"
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} خروجی اکسل
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-muted">پیش‌نمایش زنده — {targetName || `${scopeLabel}ای انتخاب نشده`}</p>
        {!scope ? (
          <div className="flex h-40 items-center justify-center text-xs text-muted">یک {scopeLabel} از سمت راست انتخاب کنید</div>
        ) : loading || !bundle ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-brand-400" />
          </div>
        ) : (
          <div ref={gridRef}>
            <WidgetGrid widgetIds={widgetIds} mode="live" ctx={{ bundle, previousBundle, decisions, actions }} />
          </div>
        )}
      </div>
    </div>
  )
}
