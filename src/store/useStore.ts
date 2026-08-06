import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ActivityKind, ActivitySchedule, DailyLog, IsoLine, Milestone, PlannedProgressPoint, Project, ReportConfig, Risk, ThemeMode, UserRole } from '../types'
import { makeId } from '../lib/id'
import { createDefaultMilestones } from '../lib/milestones'
import { defaultReportConfig } from '../lib/reportConfig'
import { createSafeLocalStorage } from '../lib/safeStorage'
import { supabase } from '../lib/supabaseClient'
import { useMembersStore } from './useMembersStore'
import { lineFromRow, lineToRow, logFromRow, logToRow, projectFromRow, projectSummaryFromRow, type ProjectSummary } from '../lib/supabaseData'

interface AppState {
  projects: ProjectSummary[]
  currentProjectId: string | null
  /** Full data for the currently-selected project, loaded on demand. Only trust it when its id matches currentProjectId. */
  projectDetail: Project | null
  loadingProjects: boolean
  loadingDetail: boolean
  theme: ThemeMode

  currentProject: () => Project | null

  fetchProjects: () => Promise<void>
  createProject: (data: { name: string; client: string; location: string; unit: string; role: UserRole }) => Promise<string>
  importProject: (project: Project) => Promise<string>
  deleteProject: (id: string) => Promise<void>
  selectProject: (id: string) => Promise<void>
  updateProjectMeta: (id: string, data: Partial<Pick<Project, 'name' | 'client' | 'location' | 'unit'>>) => Promise<void>

  setProjectSvg: (projectId: string, svgRaw: string, fileName: string, lines: IsoLine[]) => Promise<void>
  addLine: (projectId: string, line: Omit<IsoLine, 'id' | 'createdAt'>) => Promise<void>
  updateLine: (projectId: string, lineId: string, data: Partial<IsoLine>) => Promise<void>
  deleteLine: (projectId: string, lineId: string) => Promise<void>
  mergeFragmentsIntoNewLine: (
    projectId: string,
    data: { svgElementIds: string[]; svgElementId: string; size: string; plannedLength?: number; totalWelds?: number },
  ) => Promise<void>
  addFragmentsToLine: (projectId: string, lineId: string, elementIds: string[]) => Promise<void>
  removeFragmentsFromLines: (projectId: string, elementIds: string[]) => Promise<void>

  addLog: (projectId: string, log: Omit<DailyLog, 'id' | 'createdAt'>) => Promise<void>
  updateLog: (projectId: string, logId: string, data: Partial<DailyLog>) => Promise<void>
  deleteLog: (projectId: string, logId: string) => Promise<void>

  setPlannedCurve: (projectId: string, curve: PlannedProgressPoint[]) => Promise<void>

  upsertSchedule: (
    projectId: string,
    lineId: string,
    activity: ActivityKind,
    data: Partial<Omit<ActivitySchedule, 'id' | 'lineId' | 'activity'>>,
  ) => Promise<void>
  addSchedules: (projectId: string, schedules: ActivitySchedule[]) => Promise<void>

  setMilestones: (projectId: string, milestones: Milestone[]) => Promise<void>

  addRisk: (projectId: string, risk: Omit<Risk, 'id' | 'createdAt'>) => Promise<void>
  updateRisk: (projectId: string, riskId: string, data: Partial<Risk>) => Promise<void>
  deleteRisk: (projectId: string, riskId: string) => Promise<void>

  setReportConfig: (projectId: string, config: ReportConfig) => Promise<void>

  toggleTheme: () => void
}

async function fetchProjectDetail(id: string): Promise<Project | null> {
  const [{ data: projectRow }, { data: lineRows }, { data: logRows }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', id).single(),
    supabase.from('lines').select('*').eq('project_id', id).order('created_at'),
    supabase.from('daily_logs').select('*').eq('project_id', id).order('date', { ascending: false }),
  ])
  if (!projectRow) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return projectFromRow(projectRow as any, (lineRows ?? []) as any, (logRows ?? []) as any)
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,
      projectDetail: null,
      loadingProjects: false,
      loadingDetail: false,
      theme: 'dark',

      currentProject: () => {
        const { projectDetail, currentProjectId } = get()
        return projectDetail && projectDetail.id === currentProjectId ? projectDetail : null
      },

      fetchProjects: async () => {
        set({ loadingProjects: true })
        const { data } = await supabase.from('projects').select('id,name,client,location,unit,created_at').order('created_at', { ascending: false })
        set({ projects: (data ?? []).map(projectSummaryFromRow), loadingProjects: false })
      },

      selectProject: async (id) => {
        set({ currentProjectId: id, projectDetail: null, loadingDetail: true })
        useMembersStore.getState().fetchForProject(id)
        const detail = await fetchProjectDetail(id)
        set((s) => (s.currentProjectId === id ? { projectDetail: detail, loadingDetail: false } : { loadingDetail: false }))
      },

      createProject: async ({ name, client, location, unit, role }) => {
        const { data, error } = await supabase.rpc('create_project_with_owner', {
          p_name: name,
          p_role: role,
          p_client: client,
          p_location: location,
          p_unit: unit,
          p_milestones: createDefaultMilestones(),
          p_report_config: defaultReportConfig(),
        })
        if (error || !data) throw new Error(error?.message ?? 'خطا در ایجاد پروژه')
        await get().fetchProjects()
        await get().selectProject(data.id)
        return data.id as string
      },

      importProject: async (project) => {
        const { data, error } = await supabase.rpc('create_project_with_owner', {
          p_name: `${project.name} (وارد شده)`,
          // Importer becomes 'contractor' by default — the project owner can change this later from Members.
          p_role: 'contractor',
          p_client: project.client,
          p_location: project.location,
          p_unit: project.unit,
          p_svg_raw: project.svgRaw,
          p_svg_file_name: project.svgFileName,
          p_schedules: [],
          p_milestones: project.milestones?.length ? project.milestones : createDefaultMilestones(),
          p_risks: project.risks ?? [],
          p_report_config: project.reportConfig ?? defaultReportConfig(),
          p_planned_curve: project.plannedCurve ?? [],
        })
        if (error || !data) throw new Error(error?.message ?? 'خطا در وارد کردن پروژه')
        const newProjectId = data.id as string

        const lineResults = await Promise.all(
          project.lines.map((l) => supabase.from('lines').insert(lineToRow(newProjectId, l)).select().single()),
        )
        const idMap = new Map<string, string>()
        project.lines.forEach((l, i) => {
          const row = lineResults[i]?.data
          if (row) idMap.set(l.id, row.id)
        })

        const logRows = project.logs
          .map((log) => ({ ...log, lineId: idMap.get(log.lineId) }))
          .filter((log): log is DailyLog => !!log.lineId)
          .map((log) => logToRow(newProjectId, log))
        if (logRows.length) await supabase.from('daily_logs').insert(logRows)

        await get().fetchProjects()
        await get().selectProject(newProjectId)
        return newProjectId
      },

      deleteProject: async (id) => {
        await supabase.from('projects').delete().eq('id', id)
        const wasCurrent = get().currentProjectId === id
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
        if (!wasCurrent) return
        const next = get().projects[0]?.id
        if (next) {
          await get().selectProject(next)
        } else {
          set({ currentProjectId: null, projectDetail: null })
          useMembersStore.getState().clear()
        }
      },

      updateProjectMeta: async (id, data) => {
        await supabase.from('projects').update(data).eq('id', id)
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...data } : p)),
          projectDetail: s.projectDetail?.id === id ? { ...s.projectDetail, ...data } : s.projectDetail,
        }))
      },

      setProjectSvg: async (projectId, svgRaw, fileName, lines) => {
        await supabase.from('projects').update({ svg_raw: svgRaw, svg_file_name: fileName }).eq('id', projectId)
        await supabase.from('lines').delete().eq('project_id', projectId)
        let newLines: IsoLine[] = []
        if (lines.length) {
          const { data } = await supabase.from('lines').insert(lines.map((l) => lineToRow(projectId, l))).select()
          newLines = (data ?? []).map(lineFromRow)
        }
        set((s) =>
          s.projectDetail?.id === projectId
            ? { projectDetail: { ...s.projectDetail, svgRaw, svgFileName: fileName, lines: newLines, logs: [] } }
            : {},
        )
      },

      addLine: async (projectId, line) => {
        const { data } = await supabase.from('lines').insert(lineToRow(projectId, line)).select().single()
        if (!data) return
        const newLine = lineFromRow(data)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, lines: [...s.projectDetail.lines, newLine] } } : {}))
      },

      updateLine: async (projectId, lineId, data) => {
        await supabase.from('lines').update(lineToRow(projectId, data)).eq('id', lineId)
        set((s) =>
          s.projectDetail?.id === projectId
            ? { projectDetail: { ...s.projectDetail, lines: s.projectDetail.lines.map((l) => (l.id === lineId ? { ...l, ...data } : l)) } }
            : {},
        )
      },

      deleteLine: async (projectId, lineId) => {
        await supabase.from('lines').delete().eq('id', lineId)
        set((s) =>
          s.projectDetail?.id === projectId
            ? {
                projectDetail: {
                  ...s.projectDetail,
                  lines: s.projectDetail.lines.filter((l) => l.id !== lineId),
                  logs: s.projectDetail.logs.filter((l) => l.lineId !== lineId),
                },
              }
            : {},
        )
      },

      mergeFragmentsIntoNewLine: async (projectId, { svgElementIds, svgElementId, size, plannedLength, totalWelds }) => {
        const detail = get().projectDetail
        if (!detail || detail.id !== projectId) return
        const idSet = new Set(svgElementIds)
        const affected = detail.lines.filter((l) => l.svgElementIds.some((id) => idSet.has(id)))
        await Promise.all(
          affected.map((l) => supabase.from('lines').update({ svg_element_ids: l.svgElementIds.filter((id) => !idSet.has(id)) }).eq('id', l.id)),
        )
        const { data } = await supabase
          .from('lines')
          .insert(
            lineToRow(projectId, {
              svgElementId,
              svgElementIds,
              size,
              spec: '',
              service: '',
              contractor: '',
              plannedLength: plannedLength ?? 10,
              totalWelds: totalWelds ?? 1,
              status: 'not_started',
            }),
          )
          .select()
          .single()
        const newLine = data ? lineFromRow(data) : null
        set((s) => {
          if (!s.projectDetail || s.projectDetail.id !== projectId) return {}
          const stripped = s.projectDetail.lines.map((l) =>
            affected.some((a) => a.id === l.id) ? { ...l, svgElementIds: l.svgElementIds.filter((id) => !idSet.has(id)) } : l,
          )
          return { projectDetail: { ...s.projectDetail, lines: newLine ? [...stripped, newLine] : stripped } }
        })
      },

      addFragmentsToLine: async (projectId, lineId, elementIds) => {
        const detail = get().projectDetail
        if (!detail || detail.id !== projectId) return
        const idSet = new Set(elementIds)
        const others = detail.lines.filter((l) => l.id !== lineId && l.svgElementIds.some((id) => idSet.has(id)))
        const target = detail.lines.find((l) => l.id === lineId)
        const merged = [...new Set([...(target?.svgElementIds ?? []), ...elementIds])]
        await Promise.all([
          ...others.map((l) => supabase.from('lines').update({ svg_element_ids: l.svgElementIds.filter((id) => !idSet.has(id)) }).eq('id', l.id)),
          supabase.from('lines').update({ svg_element_ids: merged }).eq('id', lineId),
        ])
        set((s) => {
          if (!s.projectDetail || s.projectDetail.id !== projectId) return {}
          return {
            projectDetail: {
              ...s.projectDetail,
              lines: s.projectDetail.lines.map((l) => {
                if (l.id === lineId) return { ...l, svgElementIds: merged }
                if (others.some((o) => o.id === l.id)) return { ...l, svgElementIds: l.svgElementIds.filter((id) => !idSet.has(id)) }
                return l
              }),
            },
          }
        })
      },

      removeFragmentsFromLines: async (projectId, elementIds) => {
        const detail = get().projectDetail
        if (!detail || detail.id !== projectId) return
        const idSet = new Set(elementIds)
        const affected = detail.lines.filter((l) => l.svgElementIds.some((id) => idSet.has(id)))
        await Promise.all(
          affected.map((l) => supabase.from('lines').update({ svg_element_ids: l.svgElementIds.filter((id) => !idSet.has(id)) }).eq('id', l.id)),
        )
        set((s) =>
          s.projectDetail?.id === projectId
            ? {
                projectDetail: {
                  ...s.projectDetail,
                  lines: s.projectDetail.lines.map((l) =>
                    affected.some((a) => a.id === l.id) ? { ...l, svgElementIds: l.svgElementIds.filter((id) => !idSet.has(id)) } : l,
                  ),
                },
              }
            : {},
        )
      },

      addLog: async (projectId, log) => {
        const { data } = await supabase.from('daily_logs').insert(logToRow(projectId, log)).select().single()
        if (!data) return
        const newLog = logFromRow(data)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, logs: [...s.projectDetail.logs, newLog] } } : {}))
      },

      updateLog: async (projectId, logId, data) => {
        await supabase.from('daily_logs').update(logToRow(projectId, data)).eq('id', logId)
        set((s) =>
          s.projectDetail?.id === projectId
            ? { projectDetail: { ...s.projectDetail, logs: s.projectDetail.logs.map((l) => (l.id === logId ? { ...l, ...data } : l)) } }
            : {},
        )
      },

      deleteLog: async (projectId, logId) => {
        await supabase.from('daily_logs').delete().eq('id', logId)
        set((s) =>
          s.projectDetail?.id === projectId
            ? { projectDetail: { ...s.projectDetail, logs: s.projectDetail.logs.filter((l) => l.id !== logId) } }
            : {},
        )
      },

      setPlannedCurve: async (projectId, curve) => {
        await supabase.from('projects').update({ planned_curve: curve }).eq('id', projectId)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, plannedCurve: curve } } : {}))
      },

      upsertSchedule: async (projectId, lineId, activity, data) => {
        const detail = get().projectDetail
        if (!detail || detail.id !== projectId) return
        const existing = detail.schedules.find((a) => a.lineId === lineId && a.activity === activity)
        const next = existing
          ? detail.schedules.map((a) => (a.id === existing.id ? { ...a, ...data } : a))
          : [
              ...detail.schedules,
              {
                id: makeId('sched'),
                lineId,
                activity,
                plannedStart: '',
                plannedEnd: '',
                actualStart: null,
                actualEnd: null,
                percentComplete: 0,
                ...data,
              } as ActivitySchedule,
            ]
        await supabase.from('projects').update({ schedules: next }).eq('id', projectId)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, schedules: next } } : {}))
      },

      addSchedules: async (projectId, schedules) => {
        const detail = get().projectDetail
        if (!detail || detail.id !== projectId) return
        const next = [...detail.schedules, ...schedules]
        await supabase.from('projects').update({ schedules: next }).eq('id', projectId)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, schedules: next } } : {}))
      },

      setMilestones: async (projectId, milestones) => {
        await supabase.from('projects').update({ milestones }).eq('id', projectId)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, milestones } } : {}))
      },

      addRisk: async (projectId, risk) => {
        const detail = get().projectDetail
        if (!detail || detail.id !== projectId) return
        const next = [...detail.risks, { ...risk, id: makeId('risk'), createdAt: new Date().toISOString() }]
        await supabase.from('projects').update({ risks: next }).eq('id', projectId)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, risks: next } } : {}))
      },

      updateRisk: async (projectId, riskId, data) => {
        const detail = get().projectDetail
        if (!detail || detail.id !== projectId) return
        const next = detail.risks.map((r) => (r.id === riskId ? { ...r, ...data } : r))
        await supabase.from('projects').update({ risks: next }).eq('id', projectId)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, risks: next } } : {}))
      },

      deleteRisk: async (projectId, riskId) => {
        const detail = get().projectDetail
        if (!detail || detail.id !== projectId) return
        const next = detail.risks.filter((r) => r.id !== riskId)
        await supabase.from('projects').update({ risks: next }).eq('id', projectId)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, risks: next } } : {}))
      },

      setReportConfig: async (projectId, config) => {
        await supabase.from('projects').update({ report_config: config }).eq('id', projectId)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, reportConfig: config } } : {}))
      },

      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'piping-iso-tracker-ui',
      storage: createJSONStorage(createSafeLocalStorage),
      version: 1,
      partialize: (s) => ({ theme: s.theme }) as AppState,
    },
  ),
)
