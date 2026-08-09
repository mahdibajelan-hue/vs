import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, FileOutput, Loader2, Save } from 'lucide-react'
import { REPORT_TYPES, REPORT_TYPE_LABEL_FA, WIDGET_CATEGORY_LABEL_FA, type ReportType, type WidgetCategory } from '../types'
import { useReportingStore } from '../store/useReportingStore'
import { useProjectIntelligence } from '../lib/useProjectIntelligence'
import { DEFAULT_PROFILE_WIDGETS, WIDGET_REGISTRY, computeReportPayload, widgetsByCategory } from '../lib/widgetRegistry'
import { WidgetGrid } from '../components/WidgetGrid'
import type { WidgetComputeContext } from '../lib/widgetTypes'

const CATEGORY_ORDER: WidgetCategory[] = ['executive', 'progress', 'risk', 'issue', 'intelligence', 'decision']

export function ReportBuilderPage({ masterProjectId }: { masterProjectId: string }) {
  const [reportType, setReportType] = useState<ReportType>('management')
  const [widgetIds, setWidgetIds] = useState<string[]>(DEFAULT_PROFILE_WIDGETS.management)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [saveName, setSaveName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatedNumber, setGeneratedNumber] = useState<string | null>(null)

  const { bundle, previousBundle, loading } = useProjectIntelligence(masterProjectId)
  const decisions = useReportingStore((s) => s.decisionsByProject[masterProjectId] ?? [])
  const actions = useReportingStore((s) => s.actionsByProject[masterProjectId] ?? [])
  const profiles = useReportingStore((s) => s.profiles)
  const createProfile = useReportingStore((s) => s.createProfile)
  const createSnapshot = useReportingStore((s) => s.createSnapshot)

  const profilesForType = useMemo(() => profiles.filter((p) => p.reportType === reportType), [profiles, reportType])
  const byCategory = useMemo(() => widgetsByCategory(), [])

  useEffect(() => {
    setWidgetIds(DEFAULT_PROFILE_WIDGETS[reportType])
    setProfileId(null)
    setGeneratedNumber(null)
  }, [reportType])

  const applyProfile = (id: string) => {
    if (!id) {
      setProfileId(null)
      setWidgetIds(DEFAULT_PROFILE_WIDGETS[reportType])
      return
    }
    setProfileId(id)
    const profile = profiles.find((p) => p.id === id)
    if (profile) setWidgetIds(profile.widgetIds.filter((w) => WIDGET_REGISTRY.some((wd) => wd.id === w)))
  }

  const toggleWidget = (id: string) => {
    setWidgetIds((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]))
    setGeneratedNumber(null)
  }

  const move = (id: string, dir: -1 | 1) => {
    setWidgetIds((prev) => {
      const idx = prev.indexOf(id)
      const next = idx + dir
      if (idx < 0 || next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[next]] = [copy[next], copy[idx]]
      return copy
    })
  }

  const handleSaveProfile = async () => {
    if (!saveName.trim() || widgetIds.length === 0) return
    setSavingProfile(true)
    await createProfile({ name: saveName.trim(), reportType, description: '', widgetIds })
    setSavingProfile(false)
    setSaveName('')
  }

  const handleGenerate = async () => {
    if (!bundle || widgetIds.length === 0) return
    setGenerating(true)
    const ctx: WidgetComputeContext = { bundle, previousBundle, decisions, actions }
    const payload = computeReportPayload(widgetIds, ctx)
    const id = await createSnapshot({
      masterProjectId,
      reportType,
      profileId,
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
      payload,
      widgetIds,
    })
    setGenerating(false)
    if (id) {
      const snap = useReportingStore.getState().snapshotsByProject[masterProjectId]?.find((s) => s.id === id)
      setGeneratedNumber(snap?.reportNumber ?? 'صادر شد')
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
      <div className="space-y-4">
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
              <select
                value={profileId ?? ''}
                onChange={(e) => applyProfile(e.target.value)}
                className="w-full rounded-lg bg-black/20 border border-white/10 px-2.5 py-1.5 text-xs outline-none"
              >
                <option value="">پیش‌فرض سیستم</option>
                {profilesForType.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] text-muted">شروع دوره</span>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-xs" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] text-muted">پایان دوره</span>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-xs" />
            </label>
          </div>
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

          <div className="mt-3 space-y-1.5">
            {widgetIds.map((id, i) => {
              const w = WIDGET_REGISTRY.find((x) => x.id === id)
              if (!w) return null
              return (
                <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2 py-1">
                  <span className="text-[11px]">{w.label}</span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => move(id, -1)} disabled={i === 0} className="rounded p-1 text-muted hover:bg-white/10 disabled:opacity-30">
                      <ArrowUp size={12} />
                    </button>
                    <button onClick={() => move(id, 1)} disabled={i === widgetIds.length - 1} className="rounded p-1 text-muted hover:bg-white/10 disabled:opacity-30">
                      <ArrowDown size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
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
              {savingProfile ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} ذخیره پروفایل
            </button>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating || widgetIds.length === 0 || !bundle}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-xs font-bold text-white hover:bg-teal-400 disabled:opacity-40"
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <FileOutput size={13} />} تولید گزارش (Snapshot)
          </button>
          {generatedNumber && (
            <p className="flex items-center gap-1 text-[11px] text-green-400">
              <Check size={12} /> گزارش {generatedNumber} به‌صورت پیش‌نویس ثبت شد — از «مرکز گزارش‌ها» قابل پیگیری است
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-muted">پیش‌نمایش زنده</p>
        {loading || !bundle ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-brand-400" />
          </div>
        ) : (
          <WidgetGrid widgetIds={widgetIds} mode="live" ctx={{ bundle, previousBundle, decisions, actions }} />
        )}
      </div>
    </div>
  )
}
