import { useMemo } from 'react'
import { useAuthStore } from '../../../../store/useAuthStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { DISCREPANCY_KIND_LABEL_FA, CHANGE_FIELD_LABEL_FA, TXN_KIND_LABEL_FA } from '../../types'
import { isOpenTarget, type MaterialModel } from './useMaterialModel'
import { buildMyTasks, type MyTask } from './myTasks'

/** The signed-in person's open work in this project, from the same records every other page reads. */
export function useMyTasks(model: MaterialModel, projectId: string | null): MyTask[] {
  const cs = useMaterialControlStore()
  const uid = useAuthStore((s) => s.profile?.id ?? null)
  return useMemo(() => {
    if (!projectId) return []
    const mat = new Map(model.materials.map((x) => [x.id, x]))
    const item = new Map(model.items.map((i) => [i.id, i]))
    const pkg = new Map(model.packages.map((p) => [p.id, p]))
    const reqs = cs.requisitions.filter((r) => r.masterProjectId === projectId)
    const reqIds = new Set(reqs.map((r) => r.id))
    const records: { id: string; type: 'risk' | 'issue'; title: string; due: string | null }[] = []
    const seen = new Set<string>()
    for (const l of cs.links) {
      if (l.masterProjectId !== projectId || seen.has(l.targetId)) continue
      const t = cs.linkTargets.get(l.targetId)
      if (t && t.ownerId === uid && isOpenTarget(t)) { seen.add(l.targetId); records.push({ id: t.id, type: t.kind, title: `${t.code ? `${t.code} · ` : ''}${t.title}`, due: t.dueDate }) }
    }
    return buildMyTasks({
      uid, today: model.today, can: (a) => cs.can(projectId, a),
      stages: model.stages, defs: new Map(cs.stageDefs.map((d) => [d.key, d])),
      stageLabel: (s) => { const it = item.get(s.itemId); return { item: (it && mat.get(it.materialId)?.description) || '—', pkg: (it && pkg.get(it.packageId)?.code) || '—' } },
      discrepancies: model.discrepancies, discLabel: (d) => `${DISCREPANCY_KIND_LABEL_FA[d.kind]} — ${mat.get(d.materialId ?? '')?.description ?? ''}`,
      changes: cs.changes.filter((c) => c.masterProjectId === projectId), changeLabel: (c) => `${CHANGE_FIELD_LABEL_FA[c.field]} — ${mat.get(c.materialId)?.description ?? ''}`,
      txns: cs.txns.filter((t) => t.masterProjectId === projectId), txnLabel: (t) => `${TXN_KIND_LABEL_FA[t.kind]} ${mat.get(t.materialId)?.description ?? ''}`,
      requisitions: reqs, signers: cs.reqSigners.filter((s) => reqIds.has(s.requisitionId)), records,
    })
  }, [model, cs.stageDefs, cs.changes, cs.txns, cs.requisitions, cs.reqSigners, cs.links, cs.linkTargets, cs.roles, cs.settings, projectId, uid]) // eslint-disable-line react-hooks/exhaustive-deps
}
