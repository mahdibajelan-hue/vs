import { useEffect, useMemo, useState } from 'react'
import { Check, Link2, Plus, Sparkles, Unlink } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { useAccessStore } from '../store/useAccessStore'
import { MAPPING_SOURCE_MODULE_LABEL_FA } from '../rbacTypes'
import { similarityScore } from '../lib/similarity'

const SUGGEST_THRESHOLD = 55

export function ProjectMappingPage() {
  const projects = useMasterDataStore((s) => s.projects)
  const createProject = useMasterDataStore((s) => s.createProject)
  const loaded = useAccessStore((s) => s.loaded)
  const fetchAll = useAccessStore((s) => s.fetchAll)
  const sourceProjects = useAccessStore((s) => s.sourceProjects)
  const projectMappings = useAccessStore((s) => s.projectMappings)
  const createMapping = useAccessStore((s) => s.createMapping)
  const deleteMapping = useAccessStore((s) => s.deleteMapping)

  useEffect(() => {
    if (!loaded) fetchAll()
  }, [loaded, fetchAll])

  const mappedKeys = useMemo(() => new Set(projectMappings.map((m) => `${m.sourceModule}:${m.sourceProjectId}`)), [projectMappings])
  const unmapped = sourceProjects.filter((sp) => !mappedKeys.has(`${sp.sourceModule}:${sp.sourceProjectId}`))
  const masterProjectName = (id: string) => projects.find((p) => p.id === id)?.officialName ?? '—'

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-extrabold">نگاشت پروژه‌ها</h2>
        <p className="text-xs text-secondary leading-6">
          هر پروژه در ماژول‌های ریسک، مسائل و PipePulse رجیستری مستقل خودش را دارد. این صفحه آن‌ها را به یک «پروژه مرکزی» (Master Project)
          متصل می‌کند تا گزارش‌گیری آینده بر اساس شناسه پروژه انجام شود، نه تطبیق نام. هیچ ادغامی خودکار انجام نمی‌شود — تایید هر مورد با شماست.
        </p>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <p className="px-4 py-2.5 text-xs font-bold text-secondary border-b flex items-center gap-1.5" style={{ borderColor: 'var(--border-soft)' }}>
          <Link2 size={13} /> نگاشت‌های تاییدشده ({projectMappings.length})
        </p>
        {projectMappings.length === 0 ? (
          <p className="p-5 text-center text-xs text-muted">هنوز هیچ پروژه‌ای نگاشت نشده است</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {projectMappings.map((m) => {
              const source = sourceProjects.find((sp) => sp.sourceModule === m.sourceModule && sp.sourceProjectId === m.sourceProjectId)
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-secondary">
                    {MAPPING_SOURCE_MODULE_LABEL_FA[m.sourceModule]}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm">{source?.name ?? m.aliasName ?? '—'}</p>
                  <span className="shrink-0 text-muted">←</span>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{masterProjectName(m.masterProjectId)}</p>
                  <button onClick={() => deleteMapping(m.id)} className="shrink-0 text-muted hover:text-red-400 transition-colors" title="لغو نگاشت">
                    <Unlink size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <p className="px-4 py-2.5 text-xs font-bold text-secondary border-b" style={{ borderColor: 'var(--border-soft)' }}>
          پروژه‌های نگاشت‌نشده ({unmapped.length})
        </p>
        {unmapped.length === 0 ? (
          <p className="p-5 text-center text-xs text-muted">همه پروژه‌های منبع نگاشت شده‌اند</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {unmapped.map((sp) => (
              <UnmappedRow
                key={`${sp.sourceModule}:${sp.sourceProjectId}`}
                source={sp}
                projects={projects}
                onMap={(masterProjectId) => createMapping({ masterProjectId, sourceModule: sp.sourceModule, sourceProjectId: sp.sourceProjectId, aliasName: sp.name })}
                onCreateAndMap={async () => {
                  const id = await createProject({ officialName: sp.name })
                  if (id) await createMapping({ masterProjectId: id, sourceModule: sp.sourceModule, sourceProjectId: sp.sourceProjectId, aliasName: sp.name })
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function UnmappedRow({
  source,
  projects,
  onMap,
  onCreateAndMap,
}: {
  source: { sourceModule: string; sourceProjectId: string; name: string }
  projects: { id: string; officialName: string; shortName: string }[]
  onMap: (masterProjectId: string) => void
  onCreateAndMap: () => void
}) {
  const [manualId, setManualId] = useState('')
  const [busy, setBusy] = useState(false)

  const bestMatch = useMemo(() => {
    let best: { id: string; name: string; score: number } | null = null
    for (const p of projects) {
      const score = Math.max(similarityScore(source.name, p.officialName), p.shortName ? similarityScore(source.name, p.shortName) : 0)
      if (score >= SUGGEST_THRESHOLD && (!best || score > best.score)) best = { id: p.id, name: p.officialName, score }
    }
    return best
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.name, projects.length])

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-secondary">
        {MAPPING_SOURCE_MODULE_LABEL_FA[source.sourceModule as keyof typeof MAPPING_SOURCE_MODULE_LABEL_FA]}
      </span>
      <p className="min-w-0 flex-1 truncate text-sm">{source.name}</p>

      {bestMatch && (
        <button
          onClick={async () => {
            setBusy(true)
            await onMap(bestMatch.id)
            setBusy(false)
          }}
          disabled={busy}
          className="flex items-center gap-1 rounded-lg border border-green-400/40 bg-green-500/10 px-2 py-1 text-[11px] text-green-300 hover:bg-green-500/20 transition-colors disabled:opacity-40"
          title={`تطابق ${bestMatch.score}٪`}
        >
          <Sparkles size={11} /> {bestMatch.name} ({bestMatch.score}٪) <Check size={11} />
        </button>
      )}

      <select value={manualId} onChange={(e) => setManualId(e.target.value)} className="rounded-lg bg-black/20 border border-white/10 px-2 py-1 text-[11px] outline-none">
        <option value="">نگاشت دستی...</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.officialName}
          </option>
        ))}
      </select>
      <button
        onClick={async () => {
          if (!manualId) return
          setBusy(true)
          await onMap(manualId)
          setBusy(false)
        }}
        disabled={!manualId || busy}
        className="text-[11px] font-medium text-brand-300 hover:underline disabled:opacity-40"
      >
        اعمال
      </button>

      <button
        onClick={async () => {
          setBusy(true)
          await onCreateAndMap()
          setBusy(false)
        }}
        disabled={busy}
        className="flex items-center gap-1 rounded-lg border border-dashed border-white/15 px-2 py-1 text-[11px] text-secondary hover:bg-white/5 transition-colors disabled:opacity-40"
      >
        <Plus size={11} /> پروژه مرکزی جدید
      </button>
    </div>
  )
}
