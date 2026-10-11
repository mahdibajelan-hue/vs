import { useEffect, useMemo, useState } from 'react'
import { ArrowUpLeft, Briefcase, Compass, Search, Sprout, Users, X } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import { OpenToWorkRing, WorkStatusChip } from '../components/OpenToWorkRing'
import { jobRoleLabel, sortedJobRoles } from '../lib/competencyData'
import { meetsCompetencyFilters, rankRoles, READINESS_META, roleFit, type LevelRow, type Readiness, type Requirement, type RoleFit } from '../lib/roleFit'
import { fa } from '../lib/resultsModel'
import type { CompetencyAssessment } from '../types'

const fitColor = (fit: number | null) => (fit == null ? '#94a3b8' : fit >= 85 ? '#34d399' : fit >= 70 ? '#38bdf8' : fit >= 55 ? '#fbbf24' : '#f87171')
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('')
const READY_ORDER: Readiness[] = ['ready', 'near', 'developing', 'far', 'unknown']

function FitRing({ fit, size = 46 }: { fit: number | null; size?: number }) {
  const r = size / 2 - 4, c = 2 * Math.PI * r, v = fit == null ? 0 : fit / 100
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={fit == null ? 'بدون شواهد' : `تناسب ${fa(fit)} درصد`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--im-line-2)" strokeWidth="4" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={fitColor(fit)} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.3} fontWeight="800" fill="var(--im-text)">{fit == null ? '—' : fa(fit)}</text>
    </svg>
  )
}

/** Talent pool and role matching: every assessed candidate is matched against every job role's competency requirements, so the same evidence answers «who suits this role», «which roles suit this person» and «what stands in the way». */
export function TalentPage({ onOpen, onExitToHub, nav }: { onOpen: (id: string, stage?: 'results' | 'idp' | 'profile') => void; onExitToHub: () => void; nav: Partial<Record<CompetencySection, () => void>> }) {
  const assessments = useCompetencyStore((s) => s.assessments)
  const showDemo = useCompetencyStore((s) => s.showDemoData)
  const scores = useCompetencyStore((s) => s.allCompetencyScores)
  const fetchScores = useCompetencyStore((s) => s.fetchAllCompetencyScores)
  const competencies = useCompetencyStore((s) => s.competencies)
  const requirements = useCompetencyStore((s) => s.jobCompetencyRequirements)
  const roleCfg = useCompetencyStore((s) => s.jobRoleConfigs)
  const [role, setRole] = useState('best')
  const [query, setQuery] = useState('')
  const [minFit, setMinFit] = useState(0)
  const [ready, setReady] = useState<Readiness | 'all'>('all')
  const [openOnly, setOpenOnly] = useState(false)
  const [filters, setFilters] = useState<{ competencyId: string; minLevel: number }[]>([])
  const [draft, setDraft] = useState({ competencyId: '', minLevel: 3 })
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { void fetchScores() }, [fetchScores])

  const reqByRole = useMemo(() => { const m = new Map<string, Requirement[]>(); for (const r of requirements) m.set(r.jobRole, [...(m.get(r.jobRole) ?? []), r]); return m }, [requirements])
  const compName = useMemo(() => new Map(competencies.map((c) => [c.id, c.labelFa])), [competencies])
  const levelCount = (id: string) => competencies.find((c) => c.id === id)?.proficiencyLevels.length || 5
  const rows = useMemo(() => {
    const byA = new Map<string, LevelRow[]>(); for (const s of scores) byA.set(s.assessmentId, [...(byA.get(s.assessmentId) ?? []), { competencyId: s.competencyId, actualLevel: s.actualLevel }])
    return assessments.filter((a) => showDemo || !a.isDemo).filter((a) => byA.has(a.id)).map((a) => {
      const levels = byA.get(a.id)!
      const ranking = rankRoles(levels, reqByRole)
      const chosen: RoleFit | undefined = role === 'best' ? ranking[0] : roleFit(role, levels, reqByRole.get(role) ?? [])
      return { a, levels, ranking, chosen }
    })
  }, [assessments, scores, reqByRole, role, showDemo])
  const q = query.trim().toLowerCase()
  const shown = rows.filter((r) => (!q || `${r.a.candidateName} ${r.a.candidatePosition} ${r.a.currentEmployer}`.toLowerCase().includes(q)) && (r.chosen?.fit ?? 0) >= minFit && (ready === 'all' || r.chosen?.readiness === ready) && (!openOnly || r.a.workStatus === 'open_to_work') && meetsCompetencyFilters(r.levels, filters))
    .sort((x, y) => ((y.chosen?.fit ?? -1) - 15 * (y.chosen?.criticalGaps.length ?? 0)) - ((x.chosen?.fit ?? -1) - 15 * (x.chosen?.criticalGaps.length ?? 0)))
  const readyCount = rows.filter((r) => r.chosen?.readiness === 'ready').length
  const openCount = rows.filter((r) => r.a.workStatus === 'open_to_work').length
  const fits = rows.map((r) => r.chosen?.fit).filter((x): x is number => x != null)
  const avgFit = fits.length ? Math.round(fits.reduce((p, c) => p + c, 0) / fits.length) : null
  const picked = open ? rows.find((r) => r.a.id === open) : null
  const rl = (id: string) => jobRoleLabel(roleCfg, id)
  const rolesWithReqs = sortedJobRoles(roleCfg).filter((r) => reqByRole.has(r.jobRole))

  return (
    <CompetencySidebarShell active="talent" nav={nav} title="بانک استعداد و تناسب شغلی" onExitToHub={onExitToHub}>
      <div className="im-tiles im-tiles-sm" style={{ marginTop: 0 }}>
        {[{ l: 'داوطلب دارای نمایهٔ شایستگی', v: fa(rows.length), c: '#a855f7' }, { l: role === 'best' ? 'آمادهٔ همین حالا (برای بهترین نقش)' : `آمادهٔ همین حالا برای «${rl(role)}»`, v: fa(readyCount), c: '#34d399' }, { l: 'آمادهٔ همکاری', v: fa(openCount), c: '#3f9b2f' }, { l: 'میانگین تناسب شغلی', v: avgFit == null ? '—' : `${fa(avgFit)}٪`, c: '#38bdf8' }].map((k) => (
          <div key={k.l} className="im-tile" style={{ ['--c' as string]: k.c }}><div className="im-tile-body"><span className="im-tile-title">{k.l}</span><b className="im-tile-num" style={{ fontSize: 24 }}>{k.v}</b></div></div>
        ))}
      </div>

      <section className="im-card comp-talent-filters">
        <div className="comp-talent-row">
          <label className="comp-talent-f"><span>نقش هدف</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="best">بهترین نقش برای هر نفر</option>
              {rolesWithReqs.map((r) => <option key={r.jobRole} value={r.jobRole}>{r.labelFa}</option>)}
            </select></label>
          <label className="comp-talent-f"><span>حداقل تناسب: {fa(minFit)}٪</span><input type="range" min={0} max={95} step={5} value={minFit} onChange={(e) => setMinFit(+e.target.value)} style={{ padding: 0 }} /></label>
          <label className="comp-talent-f"><span>جست‌وجو</span><span className="comp-talent-search"><Search size={14} aria-hidden /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="نام، سمت یا کارفرمای فعلی" /></span></label>
        </div>
        <div className="comp-talent-row">
          <div className="comp-pills" role="group" aria-label="سطح آمادگی">
            <button className={`comp-pill${ready === 'all' ? ' on' : ''}`} onClick={() => setReady('all')}>همهٔ سطوح</button>
            {READY_ORDER.map((k) => <button key={k} className={`comp-pill${ready === k ? ' on' : ''}`} onClick={() => setReady(k)}>{READINESS_META[k].label}</button>)}
          </div>
          <label className="comp-talent-check"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> فقط آمادهٔ همکاری</label>
        </div>
        <div className="comp-talent-row">
          <select value={draft.competencyId} onChange={(e) => setDraft({ ...draft, competencyId: e.target.value })} aria-label="شایستگی" style={{ maxWidth: 260 }}>
            <option value="">شایستگی…</option>{competencies.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.labelFa}</option>)}
          </select>
          <select value={draft.minLevel} onChange={(e) => setDraft({ ...draft, minLevel: +e.target.value })} aria-label="حداقل سطح" style={{ maxWidth: 140 }}>
            {Array.from({ length: draft.competencyId ? levelCount(draft.competencyId) : 5 }, (_, i) => i + 1).map((l) => <option key={l} value={l}>سطح {fa(l)} به بالا</option>)}
          </select>
          <button className="im-btn im-btn-ghost" disabled={!draft.competencyId || filters.some((f) => f.competencyId === draft.competencyId)} onClick={() => { setFilters([...filters, draft]); setDraft({ ...draft, competencyId: '' }) }}>افزودن شرط</button>
          {filters.map((f) => <span key={f.competencyId} className="comp-chip">{compName.get(f.competencyId)} ≥ {fa(f.minLevel)}<button aria-label="حذف شرط" onClick={() => setFilters(filters.filter((x) => x.competencyId !== f.competencyId))}><X size={11} /></button></span>)}
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="im-card im-empty" style={{ padding: 26 }}>هنوز نمایهٔ شایستگی‌ای محاسبه نشده است. پس از ثبت نمره‌ها و باز کردن «نتیجه»ی هر داوطلب، شایستگی‌ها محاسبه می‌شود و اینجا برای تطبیق با نقش‌ها در دسترس است.</div>
      ) : shown.length === 0 ? (
        <div className="im-card im-empty" style={{ padding: 26 }}>هیچ داوطلبی با این شرایط پیدا نشد؛ شرط‌ها را کم کنید.</div>
      ) : (
        <div className="comp-talent-list">
          <p className="im-helper" style={{ margin: 0 }}>{fa(shown.length)} نفر · مرتب‌شده بر اساس تناسب (هر شکاف حیاتی معادل ۱۵ امتیاز کسر می‌شود)</p>
          {shown.map((r) => {
            const c = r.chosen, meta = READINESS_META[c?.readiness ?? 'unknown']
            return (
              <button key={r.a.id} className="comp-talent-card" onClick={() => setOpen(r.a.id)}>
                <OpenToWorkRing active={r.a.workStatus === 'open_to_work'} size={46}>
                  <span className="comp-avatar">{r.a.photoUrl ? <img src={r.a.photoUrl} alt="" /> : initials(r.a.candidateName)}</span>
                </OpenToWorkRing>
                <div className="comp-talent-main">
                  <b>{r.a.candidateName || 'بدون نام'}</b>
                  <span className="sub">{r.a.candidatePosition || '—'}{r.a.yearsExperienceTotal != null ? ` · ${fa(r.a.yearsExperienceTotal)} سال سابقه` : ''}</span>
                  <span className="comp-talent-tags"><WorkStatusChip status={r.a.workStatus} projectName={r.a.workProjectName} /></span>
                </div>
                <div className="comp-talent-fit">
                  <FitRing fit={c?.fit ?? null} />
                  <div><span className="sub">{role === 'best' ? 'بهترین نقش' : 'نقش هدف'}</span><b>{c ? rl(c.roleId) : '—'}</b>
                    <span className="comp-ready" style={{ ['--c' as string]: meta.color }}>{meta.label}</span></div>
                </div>
                <div className="comp-talent-more">
                  {c && c.criticalGaps.length > 0 && <span className="comp-warn">{fa(c.criticalGaps.length)} شکاف حیاتی</span>}
                  {c && c.monthsToReady != null && c.monthsToReady > 0 && <span className="sub">≈ {fa(c.monthsToReady)} ماه تا آمادگی</span>}
                  {c && c.coverage < 0.6 && <span className="sub">شواهد {fa(c.coverage * 100)}٪</span>}
                </div>
                <ArrowUpLeft size={16} aria-hidden className="comp-talent-go" />
              </button>
            )
          })}
        </div>
      )}

      {picked && <Passport a={picked.a} levels={picked.levels} ranking={picked.ranking} role={role === 'best' ? picked.ranking[0]?.roleId ?? '' : role} reqByRole={reqByRole} compName={compName} rl={rl} onClose={() => setOpen(null)} onOpen={onOpen} />}
    </CompetencySidebarShell>
  )
}

function Passport({ a, levels, ranking, role, reqByRole, compName, rl, onClose, onOpen }: { a: CompetencyAssessment; levels: LevelRow[]; ranking: RoleFit[]; role: string; reqByRole: Map<string, Requirement[]>; compName: Map<string, string>; rl: (id: string) => string; onClose: () => void; onOpen: (id: string, stage?: 'results' | 'idp' | 'profile') => void }) {
  const [sel, setSel] = useState(role)
  const reqs = reqByRole.get(sel) ?? []
  const by = new Map(levels.map((l) => [l.competencyId, l.actualLevel]))
  const fit = ranking.find((r) => r.roleId === sel) ?? roleFit(sel, levels, reqs)
  const meta = READINESS_META[fit.readiness]
  const max = 5
  return (
    <>
      <div className="comp-drawer-bg" onClick={onClose} aria-hidden />
      <aside className="comp-drawer" role="dialog" aria-modal="true" aria-label={`پاسپورت شایستگی ${a.candidateName}`}>
        <header>
          <div><h2>{a.candidateName}</h2><p className="im-helper" style={{ margin: 0 }}>{a.candidatePosition || '—'} · پاسپورت شایستگی</p></div>
          <button className="im-btn im-btn-ghost" onClick={onClose} aria-label="بستن"><X size={15} /></button>
        </header>
        <div className="body">
          <div className="comp-talent-fit" style={{ justifyContent: 'flex-start' }}>
            <FitRing fit={fit.fit} size={64} />
            <div style={{ display: 'grid', gap: 4 }}>
              <select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="نقش" style={{ maxWidth: 280 }}>{[...reqByRole.keys()].map((r) => <option key={r} value={r}>{rl(r)}</option>)}</select>
              <span className="comp-ready" style={{ ['--c' as string]: meta.color }}>{meta.label}</span>
              <span className="sub">{meta.hint}</span>
            </div>
          </div>
          <section>
            <h3 className="comp-h3">سطح شایستگی در برابر الزام نقش</h3>
            <div className="comp-levels">
              {reqs.map((r) => { const act = by.get(r.competencyId); return (
                <div key={r.competencyId} className="comp-level">
                  <span className="l">{compName.get(r.competencyId) ?? '—'}{r.isCritical && <em>حیاتی</em>}</span>
                  <div className="t" role="img" aria-label={`سطح ${act == null ? 'نامشخص' : fa(act)} از ${fa(max)}، الزام ${fa(r.requiredLevel)}`}>
                    {act != null && <i style={{ width: `${(act / max) * 100}%`, background: act >= r.requiredLevel ? '#34d399' : r.isCritical ? '#f87171' : '#fbbf24' }} />}
                    <u style={{ insetInlineStart: `${(r.requiredLevel / max) * 100}%` }} title={`الزام: ${fa(r.requiredLevel)}`} />
                  </div>
                  <b>{act == null ? 'بدون شواهد' : fa(act, 1)}</b>
                </div>
              ) })}
              {reqs.length === 0 && <p className="im-helper">برای این نقش الزام شایستگی تعریف نشده است.</p>}
            </div>
            <p className="im-helper" style={{ margin: '6px 0 0' }}>خط عمودی: سطح موردنیاز نقش · نبود شواهد به معنی نبود شایستگی نیست و در تناسب حساب نمی‌شود.</p>
          </section>
          {fit.gaps.length > 0 && (
            <section><h3 className="comp-h3">فاصله تا آمادگی{fit.monthsToReady ? ` (حدود ${fa(fit.monthsToReady)} ماه)` : ''}</h3>
              <ul className="comp-gaps">{fit.gaps.slice(0, 6).map((g) => <li key={g.competencyId}><b>{compName.get(g.competencyId)}</b><span>{fa(g.actual, 1)} ← {fa(g.required)}</span>{g.isCritical && <em>حیاتی</em>}</li>)}</ul>
            </section>
          )}
          <section>
            <h3 className="comp-h3"><Compass size={14} aria-hidden /> مسیر شغلی: نقش‌های مناسب</h3>
            <div style={{ display: 'grid', gap: 6 }}>
              {ranking.slice(0, 5).map((r) => { const m = READINESS_META[r.readiness]; return (
                <button key={r.roleId} className={`comp-path${r.roleId === sel ? ' on' : ''}`} onClick={() => setSel(r.roleId)}>
                  <FitRing fit={r.fit} size={36} /><span><b>{rl(r.roleId)}</b><span className="sub">{m.label}{r.monthsToReady ? ` · ≈ ${fa(r.monthsToReady)} ماه` : ''}</span></span>
                </button>
              ) })}
            </div>
          </section>
          <div className="comp-talent-row">
            <button className="im-btn im-btn-primary" onClick={() => onOpen(a.id, 'idp')}><Sprout size={14} /> برنامهٔ توسعهٔ فردی</button>
            <button className="im-btn im-btn-ghost" onClick={() => onOpen(a.id, 'results')}><Briefcase size={14} /> نتیجهٔ ارزیابی</button>
            <button className="im-btn im-btn-ghost" onClick={() => onOpen(a.id, 'profile')}><Users size={14} /> مشخصات</button>
          </div>
        </div>
      </aside>
    </>
  )
}
