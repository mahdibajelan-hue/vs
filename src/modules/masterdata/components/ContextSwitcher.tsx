import { ChevronLeft, MapPin } from 'lucide-react'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { useMasterDataStore } from '../store/useMasterDataStore'

/**
 * Global Project Context switcher (spec section 24). Purely a picker over the shared
 * useProjectContextStore — see that store's file comment for why no product module consumes
 * the selection yet.
 */
export function ContextSwitcher() {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const projects = useMasterDataStore((s) => s.projects)
  const phasesByProject = useMasterDataStore((s) => s.phasesByProject)
  const fetchPhases = useMasterDataStore((s) => s.fetchPhases)

  const { portfolioId, programId, projectId, phaseId, setPortfolio, setProgram, setProject, setPhase } = useProjectContextStore()

  const programOptions = portfolioId ? programs.filter((p) => p.portfolioId === portfolioId) : programs
  const projectOptions = programId ? projects.filter((p) => p.programId === programId) : portfolioId ? projects.filter((p) => p.portfolioId === portfolioId) : projects
  const phaseOptions = projectId ? (phasesByProject[projectId] ?? []) : []

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border px-2.5 py-1.5" style={{ borderColor: 'var(--border-soft)' }}>
      <MapPin size={13} className="shrink-0 text-brand-400" />
      <span className="text-[11px] text-muted shrink-0">زمینه کاری:</span>

      <select value={portfolioId ?? ''} onChange={(e) => setPortfolio(e.target.value || null)} className="rounded-md bg-black/20 border border-white/10 px-1.5 py-1 text-[11px] outline-none focus:border-brand-400">
        <option value="">همه پورتفولیوها</option>
        {portfolios.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {(portfolioId || programId) && <ChevronLeft size={11} className="shrink-0 text-muted" />}

      <select
        value={programId ?? ''}
        onChange={(e) => setProgram(e.target.value || null)}
        disabled={programOptions.length === 0}
        className="rounded-md bg-black/20 border border-white/10 px-1.5 py-1 text-[11px] outline-none focus:border-brand-400 disabled:opacity-40"
      >
        <option value="">{portfolioId ? 'همه طرح‌های این پورتفولیو' : 'همه طرح‌ها'}</option>
        {programOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {(programId || projectId) && <ChevronLeft size={11} className="shrink-0 text-muted" />}

      <select
        value={projectId ?? ''}
        onChange={(e) => {
          const id = e.target.value || null
          setProject(id)
          if (id) fetchPhases(id)
        }}
        className="rounded-md bg-black/20 border border-white/10 px-1.5 py-1 text-[11px] outline-none focus:border-brand-400"
      >
        <option value="">{programId || portfolioId ? 'همه پروژه‌های این محدوده' : 'همه پروژه‌ها'}</option>
        {projectOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.officialName}
          </option>
        ))}
      </select>

      {projectId && phaseOptions.length > 0 && (
        <>
          <ChevronLeft size={11} className="shrink-0 text-muted" />
          <select value={phaseId ?? ''} onChange={(e) => setPhase(e.target.value || null)} className="rounded-md bg-black/20 border border-white/10 px-1.5 py-1 text-[11px] outline-none focus:border-brand-400">
            <option value="">همه فازها</option>
            {phaseOptions.map((ph) => (
              <option key={ph.id} value={ph.id}>
                {ph.name}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  )
}
