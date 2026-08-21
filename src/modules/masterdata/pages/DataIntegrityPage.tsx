import { useEffect, useMemo } from 'react'
import { AlertTriangle, CheckCircle2, CircleDashed, ShieldAlert } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { useAccessStore } from '../store/useAccessStore'
import { MAPPING_SOURCE_MODULE_LABEL_FA } from '../rbacTypes'

export function DataIntegrityPage() {
  const projects = useMasterDataStore((s) => s.projects)
  const loaded = useAccessStore((s) => s.loaded)
  const fetchAll = useAccessStore((s) => s.fetchAll)
  const sourceProjects = useAccessStore((s) => s.sourceProjects)
  const projectMappings = useAccessStore((s) => s.projectMappings)

  useEffect(() => {
    if (!loaded) fetchAll()
  }, [loaded, fetchAll])

  const stats = useMemo(() => {
    const mappedKeys = new Set(projectMappings.map((m) => `${m.sourceModule}:${m.sourceProjectId}`))
    const unmapped = sourceProjects.filter((sp) => !mappedKeys.has(`${sp.sourceModule}:${sp.sourceProjectId}`))

    const bySourceModulePerMaster = new Map<string, Map<string, number>>()
    for (const m of projectMappings) {
      if (!bySourceModulePerMaster.has(m.masterProjectId)) bySourceModulePerMaster.set(m.masterProjectId, new Map())
      const perModule = bySourceModulePerMaster.get(m.masterProjectId)!
      perModule.set(m.sourceModule, (perModule.get(m.sourceModule) ?? 0) + 1)
    }
    const conflicts: { masterProjectId: string; sourceModule: string; count: number }[] = []
    for (const [masterProjectId, perModule] of bySourceModulePerMaster) {
      for (const [sourceModule, count] of perModule) {
        if (count > 1) conflicts.push({ masterProjectId, sourceModule, count })
      }
    }

    const mappedMasterIds = new Set(projectMappings.map((m) => m.masterProjectId))
    const modulesPerMaster = new Map<string, Set<string>>()
    for (const m of projectMappings) {
      if (!modulesPerMaster.has(m.masterProjectId)) modulesPerMaster.set(m.masterProjectId, new Set())
      modulesPerMaster.get(m.masterProjectId)!.add(m.sourceModule)
    }
    const fullyMapped = [...modulesPerMaster.values()].filter((set) => set.size >= 2).length
    const partiallyMapped = [...modulesPerMaster.values()].filter((set) => set.size === 1).length
    const unconnectedMasterProjects = projects.filter((p) => !mappedMasterIds.has(p.id)).length

    return { unmapped, conflicts, fullyMapped, partiallyMapped, unconnectedMasterProjects }
  }, [projects, sourceProjects, projectMappings])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-extrabold">یکپارچگی داده</h2>
        <p className="text-xs text-secondary leading-6">
          وضعیت اتصال پروژه‌های ماژول‌های ریسک، مسائل و PipePulse به رجیستری مرکزی پروژه‌ها.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={CheckCircle2} tone="green" label="پروژه‌های کاملاً نگاشت‌شده" value={stats.fullyMapped} hint="متصل به ۲ ماژول یا بیشتر" />
        <StatCard icon={CircleDashed} tone="amber" label="نگاشت جزئی" value={stats.partiallyMapped} hint="فقط یک ماژول متصل است" />
        <StatCard icon={AlertTriangle} tone="red" label="پروژه‌های منبع نگاشت‌نشده" value={stats.unmapped.length} hint="در ماژول‌ها هستند ولی به پروژه مرکزی وصل نیستند" />
        <StatCard icon={ShieldAlert} tone="red" label="تعارض نگاشت" value={stats.conflicts.length} hint="بیش از یک پروژه از یک ماژول به یک پروژه مرکزی وصل شده" />
      </div>

      {stats.unconnectedMasterProjects > 0 && (
        <p className="text-[11px] text-muted">
          {stats.unconnectedMasterProjects} پروژه مرکزی هنوز به هیچ پروژه منبعی وصل نشده‌اند — طبیعی است اگر به‌تازگی در «داده‌های پایه» ایجاد شده باشند.
        </p>
      )}

      {stats.conflicts.length > 0 && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <p className="px-4 py-2.5 text-xs font-bold text-red-300 border-b" style={{ borderColor: 'var(--border-soft)' }}>
            موارد تعارض
          </p>
          <div className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {stats.conflicts.map((c, i) => (
              <div key={i} className="px-4 py-2.5 text-xs">
                {projects.find((p) => p.id === c.masterProjectId)?.officialName ?? c.masterProjectId} — {c.count} پروژه از{' '}
                {MAPPING_SOURCE_MODULE_LABEL_FA[c.sourceModule as keyof typeof MAPPING_SOURCE_MODULE_LABEL_FA]} به این پروژه مرکزی نگاشت شده‌اند
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.unmapped.length > 0 && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <p className="px-4 py-2.5 text-xs font-bold text-secondary border-b" style={{ borderColor: 'var(--border-soft)' }}>
            پروژه‌های نگاشت‌نشده — برای رفع، به تب «نگاشت پروژه‌ها» بروید
          </p>
          <div className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {stats.unmapped.map((sp) => (
              <div key={`${sp.sourceModule}:${sp.sourceProjectId}`} className="flex items-center gap-2 px-4 py-2 text-xs">
                <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-secondary">
                  {MAPPING_SOURCE_MODULE_LABEL_FA[sp.sourceModule]}
                </span>
                <span className="truncate">{sp.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: typeof CheckCircle2
  tone: 'green' | 'amber' | 'red'
  label: string
  value: number
  hint: string
}) {
  const toneClass = tone === 'green' ? 'text-green-400' : tone === 'amber' ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="glass-panel rounded-2xl p-4">
      <Icon size={18} className={toneClass} />
      <p className="mt-2 text-2xl font-extrabold num">{value}</p>
      <p className="mt-0.5 text-xs text-secondary">{label}</p>
      <p className="mt-1 text-[10px] text-muted leading-4">{hint}</p>
    </div>
  )
}
