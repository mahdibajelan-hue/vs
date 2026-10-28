import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Loader2, Printer, Save } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { AUDIENCE_FA, AUDIENCE_PRESETS, DETAIL_FA, PERIOD_FA, SECTION_FA, composeReport, type Audience, type ComposerConfig, type Detail, type PeriodKind, type SectionKey } from '../lib/composerCore'
import { exportComposedReport } from '../lib/reportExport'
import { useAnalyticsStore } from '../store/useAnalyticsStore'
import { BlockView, FactsGate, Freshness, Help, Panel, fa } from '../components/rpx'
import { jd } from '../lib/analyticsCore'

const ALL_SECTIONS = Object.keys(SECTION_FA) as SectionKey[]
const today = () => new Date().toISOString().slice(0, 10)

const initial = (projectId: string | null): ComposerConfig => ({ audience: 'project', period: 'monthly', scope: projectId ? { level: 'project', id: projectId } : { level: 'all', id: null }, ...AUDIENCE_PRESETS.project })

/** The smart report builder: audience, period, scope, sections and level of detail → a report from live data; saved settings can be reused. */
export function ComposerPage({ projectId }: { projectId: string | null }) {
  const { portfolios, programs, projects } = useMasterDataStore()
  const { configs, loadConfigs, saveConfig } = useAnalyticsStore()
  const [cfg, setCfg] = useState<ComposerConfig>(() => initial(projectId))
  const [savedId, setSavedId] = useState<string>('')
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { void loadConfigs() }, [loadConfigs])

  const set = (p: Partial<ComposerConfig>) => setCfg((c) => ({ ...c, ...p }))
  const preset = (a: Audience) => setCfg((c) => ({ ...c, audience: a, sections: AUDIENCE_PRESETS[a].sections, detail: AUDIENCE_PRESETS[a].detail, scope: a === 'project' ? c.scope : c.scope.level === 'project' ? { level: 'all', id: null } : c.scope }))
  const toggle = (k: SectionKey) => set({ sections: cfg.sections.includes(k) ? cfg.sections.filter((x) => x !== k) : ALL_SECTIONS.filter((x) => x === k || cfg.sections.includes(x)) })
  const apply = (id: string) => {
    setSavedId(id)
    const c = configs.find((x) => x.id === id)
    if (c) { setCfg({ ...initial(null), ...(c.config as unknown as ComposerConfig) }); setName(c.name); setShared(c.shared) }
  }
  const save = async () => {
    if (!name.trim()) { setMsg('برای ذخیره، نام تنظیمات را بنویسید.'); return }
    setSaving(true); setMsg(null)
    const mine = configs.find((x) => x.id === savedId && x.name === name.trim())
    const e = await saveConfig(name.trim(), cfg as unknown as Record<string, unknown>, shared, mine?.id)
    setSaving(false); setMsg(e ? `ذخیره نشد: ${e}` : 'تنظیمات گزارش ذخیره شد.')
  }

  return (
    <div className="rpx">
      <div className="rpx-compose">
        <aside className="rpx-panel no-print" style={{ display: 'grid', gap: '.8rem', alignContent: 'start' }}>
          {configs.length > 0 && (
            <label className="rpx-field"><span>شروع از تنظیمات ذخیره‌شده</span>
              <select className="rpx-select" value={savedId} onChange={(e) => apply(e.target.value)}>
                <option value="">— تنظیمات تازه —</option>
                {configs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.shared ? ' (مشترک)' : ''}</option>)}
              </select>
            </label>
          )}
          <div className="rpx-field"><span>مخاطب <Help>هر مخاطب مجموعهٔ پیش‌فرضی از بخش‌ها و سطح جزئیات دارد؛ بعد از انتخاب می‌توانید بخش‌ها را تغییر دهید.</Help></span>
            <div className="rpx-bar">{(Object.keys(AUDIENCE_FA) as Audience[]).map((a) => <button key={a} className="rpx-chip" aria-pressed={cfg.audience === a} onClick={() => preset(a)}>{AUDIENCE_FA[a]}</button>)}</div>
            <p className="rpx-note">{AUDIENCE_PRESETS[cfg.audience].note}</p>
          </div>
          <div className="rpx-field"><span>دوره</span>
            <div className="rpx-bar">{(Object.keys(PERIOD_FA) as PeriodKind[]).map((p) => <button key={p} className="rpx-chip" aria-pressed={cfg.period === p} onClick={() => set({ period: p })}>{PERIOD_FA[p]}</button>)}</div>
            {cfg.period === 'custom' && (
              <div className="rpx-bar">
                <input type="date" className="rpx-input" aria-label="از تاریخ" value={cfg.from ?? ''} onChange={(e) => set({ from: e.target.value })} />
                <input type="date" className="rpx-input" aria-label="تا تاریخ" value={cfg.to ?? ''} onChange={(e) => set({ to: e.target.value })} />
                {cfg.from && cfg.to && <span className="rpx-muted">{jd(cfg.from)} تا {jd(cfg.to)}</span>}
              </div>
            )}
          </div>
          <div className="rpx-field"><span>محدوده</span>
            <select className="rpx-select" value={cfg.scope.level} onChange={(e) => set({ scope: { level: e.target.value as ComposerConfig['scope']['level'], id: null } })}>
              <option value="all">همهٔ پروژه‌های در دسترس</option><option value="portfolio">پورتفولیو</option><option value="program">طرح</option><option value="project">پروژه</option>
            </select>
            {cfg.scope.level !== 'all' && (
              <select className="rpx-select" value={cfg.scope.id ?? ''} onChange={(e) => set({ scope: { ...cfg.scope, id: e.target.value || null } })}>
                <option value="">انتخاب کنید</option>
                {(cfg.scope.level === 'portfolio' ? portfolios.map((p) => [p.id, p.name]) : cfg.scope.level === 'program' ? programs.map((p) => [p.id, p.name]) : projects.map((p) => [p.id, p.officialName])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            )}
          </div>
          <div className="rpx-field"><span>سطح جزئیات <Help>«خلاصه» حداکثر ۵ ردیف در هر بخش، «استاندارد» ۱۵ ردیف و «کامل» همهٔ ردیف‌ها.</Help></span>
            <div className="rpx-bar">{(Object.keys(DETAIL_FA) as Detail[]).map((d) => <button key={d} className="rpx-chip" aria-pressed={cfg.detail === d} onClick={() => set({ detail: d })}>{DETAIL_FA[d]}</button>)}</div>
          </div>
          <div className="rpx-field"><span>بخش‌ها ({fa(cfg.sections.length)})</span>
            <div className="rpx-checks">{ALL_SECTIONS.map((k) => <label key={k}><input type="checkbox" checked={cfg.sections.includes(k)} onChange={() => toggle(k)} /> {SECTION_FA[k]}</label>)}</div>
          </div>
          <div className="rpx-field"><span>ذخیرهٔ تنظیمات برای استفادهٔ دوباره</span>
            <input className="rpx-input" placeholder="مثلاً: گزارش هفتگی طرح غرب" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="rpx-muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> برای همهٔ کاربران قابل استفاده باشد</label>
            <button className="rpx-btn" onClick={save} disabled={saving}>{saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} ذخیرهٔ تنظیمات</button>
            {msg && <p className="rpx-note" role="status">{msg}</p>}
          </div>
        </aside>
        <FactsGate>{(all) => <Preview cfg={cfg} all={all} />}</FactsGate>
      </div>
    </div>
  )
}

function Preview({ cfg, all }: { cfg: ComposerConfig; all: Parameters<typeof composeReport>[1] }) {
  const needId = cfg.scope.level !== 'all' && !cfg.scope.id
  const r = useMemo(() => (needId ? null : composeReport(cfg, all, today())), [cfg, all, needId])
  const [busy, setBusy] = useState(false)
  if (needId) return <p className="rpx-empty">محدوده را انتخاب کنید.</p>
  if (!r) return null
  if (!r.projects) return <p className="rpx-empty">پروژه‌ای در این محدوده در دسترس شما نیست.</p>
  return (
    <div className="rpx-report">
      <div className="rpx-bar no-print" style={{ justifyContent: 'space-between' }}>
        <Freshness />
        <div className="rpx-bar">
          <button className="rpx-btn" disabled={busy} onClick={async () => { setBusy(true); await exportComposedReport(r, `${r.title}-${r.generatedAt}.xlsx`); setBusy(false) }}>{busy ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} خروجی Excel</button>
          <button className="rpx-btn is-primary" onClick={() => window.print()}><Printer size={12} /> چاپ / PDF</button>
        </div>
      </div>
      <header className="rpx-report-head">
        <div><p className="rpx-muted">{r.scopeLabel} · {fa(r.projects)} پروژه</p><h2>{r.title}</h2></div>
        <p className="rpx-muted">دوره: {r.periodLabel} · تهیه: {jd(r.generatedAt)}</p>
      </header>
      <div className="rpx-caveats">{r.caveats.map((c, i) => <span key={i}>{c}</span>)}</div>
      {r.sections.map((s) => (
        <Panel key={s.key} title={s.title}>
          {s.empty ? <p className="rpx-empty">{s.empty}</p> : <div style={{ display: 'grid', gap: '.65rem' }}>{s.blocks.map((b) => <div key={b.key}>{s.blocks.length > 1 && <p className="rpx-muted" style={{ marginBottom: 4, fontWeight: 700 }}>{b.title}</p>}<BlockView b={b} /></div>)}</div>}
        </Panel>
      ))}
      <p className="rpx-note">همهٔ اعداد از ماژول‌های منبع و با همان تعریف‌های «مرکز تحلیل» محاسبه شده‌اند. پیشنهادها مصوبه نیستند.</p>
    </div>
  )
}
