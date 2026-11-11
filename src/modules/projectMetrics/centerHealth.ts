import { supabase } from '../../lib/supabaseClient'
import { statusFromScore, type DerivedHealth } from '../lifecycle/lib/health'
import type { HealthDimension, HealthStatus } from '../lifecycle/types'
import type { ProjectHealth } from './projectMetricsLoader'

// --- One health number everywhere: read the Health Centre (مرکز سلامت پروژه) --------------------------
// The radar used to show the project-dashboard health; the Health Centre computes a different index
// (its own indicators, weights and caps). To show a single figure in both places, read the Health
// Centre's stored snapshot (ph_snapshots) and present its index + verdict, mapped into the shared
// ProjectHealth shape. Falls back to the dashboard health only when no snapshot exists yet.
const CENTER_DIM: Record<string, HealthDimension> = { schedule: 'schedule', finance: 'cost', execution: 'construction', quality: 'quality', supply: 'procurement', risk: 'risk' }
const CENTER_STATUS: Record<string, HealthStatus> = { good: 'green', watch: 'yellow', bad: 'red', critical: 'red', none: 'yellow' }

export async function fetchCenterHealth(masterProjectId: string): Promise<ProjectHealth | null> {
  const { data } = await supabase.from('ph_snapshots')
    .select('health_index, status, domains, caps')
    .eq('master_project_id', masterProjectId)
    .order('snap_date', { ascending: false }).limit(1).maybeSingle()
  const row = data as { health_index: number | null; status: string; domains?: { key: string; score: number }[]; caps?: { reason?: string }[] } | null
  if (!row || row.health_index == null) return null
  const domains = row.domains ?? []
  const dims: DerivedHealth[] = domains.map((d) => {
    const score = Math.round(d.score)
    return { dimension: CENTER_DIM[d.key] ?? 'schedule', score, status: statusFromScore(score), explanation: '', isManual: false, assessed: true }
  })
  const weakest = domains.slice().sort((a, b) => a.score - b.score)[0]
  return {
    status: CENTER_STATUS[row.status] ?? 'yellow',
    score: Math.round(row.health_index),
    drivenBy: weakest ? (CENTER_DIM[weakest.key] ?? null) : null,
    isOverridden: false, overrideReason: '',
    dims, blockers: (row.caps ?? []).map((c) => c.reason ?? '').filter(Boolean),
  }
}
