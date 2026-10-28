import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Gauge, Loader2, Lock, Save } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { DEFAULT_THRESHOLDS, type Thresholds } from '../lib/evidenceReport'
import { EVIDENCE_WIDGET, loadThresholds } from '../lib/evidenceLoader'

type Row = Record<string, unknown>
const FIELDS: { key: keyof Thresholds; label: string; hint: string; step: number; min: number; max: number }[] = [
  { key: 'gapMaterial', label: 'عقب‌ماندگی «مهم»', hint: 'واحد درصد پیشرفت عقب از برنامه', step: 0.5, min: 0, max: 50 },
  { key: 'gapWatch', label: 'عقب‌ماندگی «زیر نظر»', hint: 'واحد درصد', step: 0.5, min: 0, max: 50 },
  { key: 'idxMaterial', label: 'SPI / CPI «مهم» کمتر از', hint: 'شاخص عملکرد', step: 0.01, min: 0.5, max: 1 },
  { key: 'idxWatch', label: 'SPI / CPI «زیر نظر» کمتر از', hint: 'شاخص عملکرد', step: 0.01, min: 0.5, max: 1 },
  { key: 'vacMaterialPct', label: 'بیش‌هزینهٔ «مهم»', hint: 'درصد بودجه', step: 0.5, min: 0, max: 50 },
  { key: 'staleDays', label: 'کهنه شدن منبع داده', hint: 'روز بدون ثبت تازه', step: 1, min: 1, max: 120 },
  { key: 'trendMinPoints', label: 'کمینهٔ نقطه برای روند', hint: 'نقطهٔ تاریخ‌دار', step: 1, min: 2, max: 12 },
  { key: 'effectWaitDays', label: 'انتظار برای داوری اثر اقدام', hint: 'روز پس از تکمیل', step: 1, min: 0, max: 90 },
]

/** Thresholds (global and per project, versioned — every report records the version it used) and the quality of issued reports. */
export function ReportSettingsPage({ masterProjectId, projectName }: { masterProjectId: string | null; projectName: string }) {
  const [canConfigure, setCanConfigure] = useState(false)
  const [scope, setScope] = useState<'global' | 'project'>('global')
  const [global, setGlobal] = useState<{ id: string; thresholds: Thresholds; version: number } | null>(null)
  const [project, setProject] = useState<{ id: string; thresholds: Partial<Thresholds>; version: number } | null>(null)
  const [draft, setDraft] = useState<Thresholds>(DEFAULT_THRESHOLDS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    const t = await loadThresholds(masterProjectId)
    setGlobal(t.global); setProject(t.project)
    setDraft(scope === 'global' ? (t.global?.thresholds ?? DEFAULT_THRESHOLDS) : t.thresholds)
  }
  useEffect(() => { void supabase.rpc('rp_can_configure').then(({ data }) => setCanConfigure(data === true)) }, [])
  useEffect(() => { void reload() }, [masterProjectId, scope]) // eslint-disable-line react-hooks/exhaustive-deps

  const invalid = draft.gapWatch > draft.gapMaterial ? '«زیر نظر» باید کوچک‌تر یا برابر «مهم» باشد.' : draft.idxWatch < draft.idxMaterial ? 'آستانهٔ «زیر نظر» شاخص باید بزرگ‌تر یا برابر «مهم» باشد.' : null

  const save = async () => {
    if (invalid) return
    setSaving(true); setError(null)
    const current = scope === 'global' ? global : project
    const row = { master_project_id: scope === 'global' ? null : masterProjectId, thresholds: draft, version: (current?.version ?? 0) + 1, updated_at: new Date().toISOString() }
    const q = current ? supabase.from('rp_thresholds').update(row).eq('id', current.id) : supabase.from('rp_thresholds').insert(row)
    const { error: e } = await q
    setSaving(false)
    if (e) { setError(e.message); return }
    setSaved(true); setTimeout(() => setSaved(false), 1800)
    await reload()
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <section className="glass-panel rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold"><Gauge size={15} /> آستانه‌های اهمیت</p>
            <p className="mt-1 text-[11px] leading-5 text-muted">هر گزارش نسخهٔ آستانه‌ای را که با آن ساخته شده ثبت می‌کند. آستانهٔ پروژه، در صورت وجود، جای آستانهٔ سراسری را می‌گیرد.</p>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/10 p-1">
            <button onClick={() => setScope('global')} className={`rounded-full px-3 py-1 text-[11px] ${scope === 'global' ? 'bg-teal-500/20 text-teal-300' : 'text-secondary'}`}>سراسری {global ? `(نسخهٔ ${global.version.toLocaleString('fa-IR')})` : '(پیش‌فرض)'}</button>
            {masterProjectId && <button onClick={() => setScope('project')} className={`rounded-full px-3 py-1 text-[11px] ${scope === 'project' ? 'bg-teal-500/20 text-teal-300' : 'text-secondary'}`}>این پروژه {project ? `(نسخهٔ ${project.version.toLocaleString('fa-IR')})` : '(بدون استثنا)'}</button>}
          </div>
        </div>
        {scope === 'project' && <p className="mb-3 text-[11px] text-muted">آستانهٔ اختصاصی «{projectName}». تا ذخیره نشود، آستانهٔ سراسری به کار می‌رود.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
              <span className="min-w-0"><span className="block text-xs font-bold">{f.label}</span><span className="block text-[10px] text-muted">{f.hint} · پیش‌فرض {DEFAULT_THRESHOLDS[f.key].toLocaleString('fa-IR')}</span></span>
              <input type="number" step={f.step} min={f.min} max={f.max} disabled={!canConfigure} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })} className="w-24 rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs" dir="ltr" />
            </label>
          ))}
        </div>
        {invalid && <p className="mt-2 text-[11px] text-red-300">{invalid}</p>}
        {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
        <div className="mt-3 flex items-center gap-2">
          {canConfigure ? (
            <button onClick={() => void save()} disabled={saving || !!invalid} className="flex items-center gap-1 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {saved ? 'ذخیره شد' : 'ذخیره و افزایش نسخه'}
            </button>
          ) : <span className="flex items-center gap-1 text-[11px] text-muted"><Lock size={12} /> تغییر آستانه‌ها فقط با دسترسی «پیکربندی» گزارش‌گیری</span>}
        </div>
      </section>

      <QualityPanel />
    </div>
  )
}

interface ReviewRow { snapshot_id: string; finding_id: string; verdict: 'confirmed' | 'rejected' | 'unclear'; reviewed_at: string }

/** How often controllers confirm what issued reports said — the real measure of the report's «intelligence». */
function QualityPanel() {
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [issued, setIssued] = useState<{ total: number; findings: number } | null>(null)
  useEffect(() => {
    const since = new Date(Date.now() - 90 * 86400000).toISOString()
    void Promise.all([
      supabase.from('rp_finding_reviews').select('snapshot_id, finding_id, verdict, reviewed_at').gte('reviewed_at', since),
      supabase.from('rasta_report_snapshots').select('id, payload').contains('widget_ids', [EVIDENCE_WIDGET]).in('status', ['approved', 'issued']).gte('created_at', since),
    ]).then(([r, s]) => {
      setRows((r.data ?? []) as ReviewRow[])
      const snaps = (s.data ?? []) as Row[]
      setIssued({ total: snaps.length, findings: snaps.reduce((a, x) => a + (((x.payload as Row)?.[EVIDENCE_WIDGET] as { findings?: { materiality: string }[] } | undefined)?.findings?.filter((f) => f.materiality !== 'ok').length ?? 0), 0) })
    })
  }, [])
  const stats = useMemo(() => {
    const list = rows ?? []
    const by = (v: ReviewRow['verdict']) => list.filter((x) => x.verdict === v).length
    const kind = new Map<string, { c: number; n: number }>()
    for (const x of list) { const k = x.finding_id.replace(/^f-/, '').split('-')[0]; const e = kind.get(k) ?? { c: 0, n: 0 }; e.n++; if (x.verdict === 'confirmed') e.c++; kind.set(k, e) }
    return { n: list.length, confirmed: by('confirmed'), rejected: by('rejected'), unclear: by('unclear'), kind: [...kind].sort((a, b) => b[1].n - a[1].n) }
  }, [rows])
  if (!rows || !issued) return <div className="flex h-24 items-center justify-center"><Loader2 size={18} className="animate-spin text-muted" /></div>
  const pct = (a: number) => (stats.n ? `${Math.round((a / stats.n) * 100).toLocaleString('fa-IR')}٪` : '—')
  return (
    <section className="glass-panel rounded-2xl p-4">
      <p className="flex items-center gap-1.5 text-sm font-bold"><CheckCircle2 size={15} /> کیفیت گزارش‌های صادرشده (۹۰ روز اخیر)</p>
      <p className="mt-1 text-[11px] leading-5 text-muted">کنترل پروژه در مرکز گزارش‌ها هر یافتهٔ گزارش تأییدشده یا صادرشده را «تأیید»، «رد» یا «نامشخص» می‌کند. درصد تأیید معیار واقعی درستی گزارش است، نه ادعای «هوشمند بودن».</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['گزارش تأییدشده / صادرشده', issued.total.toLocaleString('fa-IR')],
          ['یافتهٔ بازبینی‌شده', `${stats.n.toLocaleString('fa-IR')} از ${issued.findings.toLocaleString('fa-IR')}`],
          ['تأییدشده', pct(stats.confirmed)],
          ['ردشده', pct(stats.rejected)],
        ].map(([l, v]) => <div key={l} className="rounded-xl border border-white/10 bg-black/10 p-2.5"><p className="text-[10px] text-muted">{l}</p><p className="mt-0.5 text-base font-extrabold">{v}</p></div>)}
      </div>
      {stats.kind.length > 0 ? (
        <ul className="mt-3 space-y-1 text-[11.5px]">
          {stats.kind.map(([k, v]) => <li key={k} className="flex justify-between border-b border-white/5 py-1"><span>{k}</span><span className="text-muted">{v.c.toLocaleString('fa-IR')} تأیید از {v.n.toLocaleString('fa-IR')}</span></li>)}
        </ul>
      ) : <p className="mt-3 text-[11px] text-muted">هنوز هیچ یافته‌ای بازبینی نشده است؛ پس از صدور گزارش، یافته‌ها را در مرکز گزارش‌ها بازبینی کنید.</p>}
    </section>
  )
}
