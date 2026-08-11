import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronLeft, Clock, Folders, Layers, ListChecks, Loader2, Milestone } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useIssuesStore } from '../store/useIssuesStore'
import { IM_PRIORITY_COLOR, IM_PRIORITY_LABEL_FA, type ImIssue } from '../types'
import { isIssueOpen, isIssueOverdue } from '../lib/issueRing'
import {
  buildIssuePortfolioTree,
  fetchIssueProjectMappings,
  summarizeProjectIssues,
  type IssueRollupTotals,
  type PortfolioIssueRollup,
  type ProgramIssueRollup,
  type ProjectIssueSummary,
} from '../lib/portfolioRollup'

/**
 * Three-level Portfolio -> Program -> Project rollup for Issue Management — mirrors the Risk
 * module's PortfolioRollupPage, reusing the same shared masterdata hierarchy and the same
 * rasta_project_mappings join (source_module = 'issues'), so no independent/hardcoded numbers.
 */
export function PortfolioRollupPage({ onSelectIssue }: { onSelectIssue: (issueId: string) => void }) {
  const masterDataLoaded = useMasterDataStore((s) => s.loaded)
  const masterDataLoading = useMasterDataStore((s) => s.loading)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const masterProjects = useMasterDataStore((s) => s.projects)

  const imLoading = useIssuesStore((s) => s.loading)
  const imProjects = useIssuesStore((s) => s.projects)
  const issues = useIssuesStore((s) => s.issues)

  const [mappings, setMappings] = useState<Map<string, string> | null>(null)

  useEffect(() => {
    if (!masterDataLoaded && !masterDataLoading) fetchMasterData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchIssueProjectMappings().then((m) => {
      if (!cancelled) setMappings(m)
    })
    return () => {
      cancelled = true
    }
  }, [imProjects])

  const issuesByProject = useMemo(() => {
    const map = new Map<string, ImIssue[]>()
    for (const i of issues) {
      if (!map.has(i.projectId)) map.set(i.projectId, [])
      map.get(i.projectId)!.push(i)
    }
    return map
  }, [issues])

  const summaries = useMemo<ProjectIssueSummary[]>(() => {
    if (!mappings) return []
    return masterProjects.map((mp) => {
      const imProjectId = mappings.get(mp.id) ?? null
      return summarizeProjectIssues(mp, imProjectId, imProjectId ? issuesByProject.get(imProjectId) ?? [] : [])
    })
  }, [masterProjects, mappings, issuesByProject])

  const tree = useMemo(() => buildIssuePortfolioTree(portfolios, programs, masterProjects, summaries), [portfolios, programs, masterProjects, summaries])
  const mappedCount = summaries.filter((s) => s.imProjectId !== null).length

  if (masterDataLoading || imLoading || mappings === null) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--im-amber)' }} />
      </div>
    )
  }

  return (
    <div>
      <div className="im-topbar">
        <div>
          <p className="im-page-title">تحلیل سه‌سطحی مشکلات — پورتفولیو / طرح / پروژه</p>
          <p className="im-page-sub">
            ساختار پورتفولیو، طرح و پروژه از ماژول «داده‌های پایه» گرفته می‌شود — {mappedCount} از {masterProjects.length} پروژه به ماژول مدیریت رخداد متصل است.
          </p>
        </div>
      </div>

      {portfolios.length === 0 ? (
        <div className="im-empty">
          <div className="im-big">📁</div>
          <p>هنوز پورتفولیویی در داده‌های پایه تعریف نشده است</p>
        </div>
      ) : (
        <div className="im-grid" style={{ gap: 14 }}>
          {tree.map((rollup) => (
            <PortfolioCard key={rollup.portfolio.id} rollup={rollup} onSelectIssue={onSelectIssue} />
          ))}
        </div>
      )}
    </div>
  )
}

function TotalsRow({ totals }: { totals: IssueRollupTotals }) {
  const criticalStatus = totals.criticalCount === 0 ? 'good' : totals.criticalCount <= 2 ? 'warn' : 'bad'
  const overdueStatus = totals.overdueCount === 0 ? 'good' : totals.overdueCount <= 2 ? 'warn' : 'bad'
  const onTimeStatus = totals.avgOnTimeRate >= 70 ? 'good' : totals.avgOnTimeRate >= 40 ? 'warn' : 'bad'
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11.5 }}>
      <Badge label="پروژه متصل" value={`${totals.mappedProjectCount}/${totals.projectCount}`} color="var(--im-muted-2)" />
      <Badge label="مشکلات باز" value={totals.openIssues} color="var(--im-violet)" />
      <Badge label="بحرانی" value={totals.criticalCount} color="var(--im-coral)" status={criticalStatus} />
      <Badge label="معوق" value={totals.overdueCount} color="var(--im-coral)" status={overdueStatus} />
      <Badge label="میانگین حل (روز)" value={totals.avgResolutionDays} color="var(--im-amber)" />
      <Badge label="بهنگام‌بودن" value={`${totals.avgOnTimeRate}%`} color="var(--im-mint)" status={onTimeStatus} />
    </div>
  )
}

const STATUS_COLOR: Record<'good' | 'warn' | 'bad', string> = { good: 'var(--im-mint)', warn: 'var(--im-amber)', bad: 'var(--im-coral)' }

function Badge({ label, value, color, status }: { label: string; value: string | number; color: string; status?: 'good' | 'warn' | 'bad' }) {
  const displayColor = status ? STATUS_COLOR[status] : color
  return (
    <span className="im-chip" style={{ color: displayColor }}>
      <b className="num">{value}</b> {label}
    </span>
  )
}

function PortfolioCard({ rollup, onSelectIssue }: { rollup: PortfolioIssueRollup; onSelectIssue: (issueId: string) => void }) {
  const [open, setOpen] = useState(false)
  const allProjects = useMemo(() => [...rollup.programs.flatMap((p) => p.projects), ...rollup.directProjects], [rollup])

  return (
    <div className="im-card">
      <button onClick={() => setOpen((v) => !v)} style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'right' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {open ? <ChevronDown size={15} style={{ color: 'var(--im-muted)' }} /> : <ChevronLeft size={15} style={{ color: 'var(--im-muted)' }} />}
          <Folders size={15} style={{ color: 'var(--im-amber)' }} />
          <span style={{ fontSize: 14, fontWeight: 800 }}>{rollup.portfolio.name}</span>
          <span style={{ fontSize: 10, color: 'var(--im-muted)' }}>({rollup.portfolio.code})</span>
        </span>
      </button>
      <div style={{ marginTop: 8, paddingRight: 24 }}>
        <TotalsRow totals={rollup.totals} />
      </div>
      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 24, borderTop: '1px solid var(--im-line)', paddingTop: 12 }}>
          {rollup.programs.map((pr) => (
            <ProgramRow key={pr.program.id} rollup={pr} onSelectIssue={onSelectIssue} />
          ))}
          {rollup.directProjects.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--im-muted-2)' }}>
                <Milestone size={12} /> پروژه‌های مستقیم پورتفولیو (بدون طرح)
              </p>
              {rollup.directProjects.map((p) => (
                <ProjectRow key={p.masterProjectId} summary={p} />
              ))}
            </div>
          )}
          {rollup.programs.length === 0 && rollup.directProjects.length === 0 && <p style={{ fontSize: 11, color: 'var(--im-muted)' }}>پروژه‌ای در این پورتفولیو تعریف نشده است</p>}

          <IssueAttentionList label="این پورتفولیو" projects={allProjects} onSelectIssue={onSelectIssue} />
        </div>
      )}
    </div>
  )
}

function ProgramRow({ rollup, onSelectIssue }: { rollup: ProgramIssueRollup; onSelectIssue: (issueId: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="im-card" style={{ background: 'var(--im-panel-2)' }}>
      <button onClick={() => setOpen((v) => !v)} style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'right' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {open ? <ChevronDown size={13} style={{ color: 'var(--im-muted)' }} /> : <ChevronLeft size={13} style={{ color: 'var(--im-muted)' }} />}
          <Layers size={13} style={{ color: 'var(--im-amber)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{rollup.program.name}</span>
          <span style={{ fontSize: 10, color: 'var(--im-muted)' }}>({rollup.program.code})</span>
        </span>
      </button>
      <div style={{ marginTop: 6, paddingRight: 20 }}>
        <TotalsRow totals={rollup.totals} />
      </div>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 20 }}>
          {rollup.projects.length === 0 ? (
            <p style={{ fontSize: 11, color: 'var(--im-muted)' }}>پروژه‌ای در این طرح تعریف نشده است</p>
          ) : (
            rollup.projects.map((p) => <ProjectRow key={p.masterProjectId} summary={p} />)
          )}
          <IssueAttentionList label="این طرح" projects={rollup.projects} onSelectIssue={onSelectIssue} />
        </div>
      )}
    </div>
  )
}

function ProjectRow({ summary }: { summary: ProjectIssueSummary }) {
  const mapped = summary.imProjectId !== null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 10, padding: '8px 10px', fontSize: 11.5, background: 'var(--im-panel)' }}>
      <span style={{ fontWeight: 600 }}>{summary.projectName}</span>
      {mapped ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="num" style={{ color: 'var(--im-muted)' }}>
            {summary.openIssues} باز
          </span>
          {summary.criticalCount > 0 && (
            <span className="num im-chip" style={{ color: 'var(--im-coral)' }}>
              {summary.criticalCount} بحرانی
            </span>
          )}
          {summary.overdueCount > 0 && (
            <span className="num im-chip" style={{ color: 'var(--im-coral)' }}>
              {summary.overdueCount} معوق
            </span>
          )}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--im-muted)' }}>به ماژول مدیریت رخداد متصل نیست</span>
      )}
    </div>
  )
}

/** Aggregated critical + overdue issues across a set of projects (a program's own, or a whole portfolio's). */
function IssueAttentionList({ label, projects, onSelectIssue }: { label: string; projects: ProjectIssueSummary[]; onSelectIssue: (issueId: string) => void }) {
  const allIssues = useIssuesStore((s) => s.issues)
  const mappedProjectIds = useMemo(() => new Set(projects.map((p) => p.imProjectId).filter((id): id is string => !!id)), [projects])
  const projectNameByImId = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) if (p.imProjectId) map.set(p.imProjectId, p.projectName)
    return map
  }, [projects])

  const attention = useMemo(
    () =>
      allIssues
        .filter((i) => mappedProjectIds.has(i.projectId) && (i.priority === 'critical' || isIssueOverdue(i)) && isIssueOpen(i))
        .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'critical' ? -1 : 1)),
    [allIssues, mappedProjectIds],
  )

  if (attention.length === 0) return null

  return (
    <div className="im-card" style={{ background: 'var(--im-panel)' }}>
      <p style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800 }}>
        <AlertTriangle size={12} style={{ color: 'var(--im-coral)' }} /> نیازمند توجه مدیریت در {label} ({attention.length})
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {attention.map((issue) => (
          <button
            key={issue.id}
            onClick={() => onSelectIssue(issue.id)}
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderRadius: 8, padding: '6px 8px', fontSize: 11, textAlign: 'right' }}
            className="im-issue-card"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <ListChecks size={11} style={{ color: 'var(--im-muted)' }} />
              <span style={{ fontWeight: 700 }}>{issue.title}</span>
            </span>
            <span style={{ fontSize: 10, color: 'var(--im-muted)' }}>({projectNameByImId.get(issue.projectId)})</span>
            <span className="im-chip" style={{ color: IM_PRIORITY_COLOR[issue.priority] }}>
              {IM_PRIORITY_LABEL_FA[issue.priority]}
            </span>
            {isIssueOverdue(issue) && (
              <span className="im-chip" style={{ color: 'var(--im-coral)' }}>
                <Clock size={10} /> معوق
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
