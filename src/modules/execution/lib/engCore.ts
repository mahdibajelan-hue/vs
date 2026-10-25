import type { useEpcStore } from '../store/useEpcStore'
import { DEFAULT_ENG_RULES, engProgress, type Doc } from './engine/engineering'

type EngRow = ReturnType<typeof useEpcStore.getState>['engDocs'][number]

/** A project's engineering documents in the engine's shape — the same mapping the engineering pages use. */
export function engDocsOf(rows: EngRow[], projectId: string): Doc[] {
  return rows.filter((d) => d.projectId === projectId).map((d) => ({ id: d.id, code: d.docNo, title: d.title, discipline: d.discipline, contract: d.contract, weight: d.weight, critical: d.critical, plannedPrepared: d.plannedPrepared, plannedApproved: d.plannedApproved, actualPrepared: d.actualPrepared, actualApproved: d.actualApproved, status: d.status }))
}

/** Weighted engineering progress (prepared + approved milestones) of one project, as the engineering dashboard shows it. */
export function engCore(rows: EngRow[], projectId: string, today = new Date().toISOString().slice(0, 10)) {
  const docs = engDocsOf(rows, projectId)
  return { docs, progress: engProgress(docs, today, DEFAULT_ENG_RULES) }
}
