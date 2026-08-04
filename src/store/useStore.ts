import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ActivityKind, ActivitySchedule, DailyLog, IsoLine, PlannedProgressPoint, Project, ThemeMode } from '../types'
import { makeId } from '../lib/id'

interface AppState {
  projects: Project[]
  currentProjectId: string | null
  theme: ThemeMode

  currentProject: () => Project | null

  createProject: (data: { name: string; client: string; location: string; unit: string }) => string
  deleteProject: (id: string) => void
  selectProject: (id: string) => void
  updateProjectMeta: (id: string, data: Partial<Pick<Project, 'name' | 'client' | 'location' | 'unit'>>) => void

  setProjectSvg: (projectId: string, svgRaw: string, fileName: string, lines: IsoLine[]) => void
  addLine: (projectId: string, line: Omit<IsoLine, 'id' | 'createdAt'>) => void
  updateLine: (projectId: string, lineId: string, data: Partial<IsoLine>) => void
  deleteLine: (projectId: string, lineId: string) => void

  addLog: (projectId: string, log: Omit<DailyLog, 'id' | 'createdAt'>) => void
  updateLog: (projectId: string, logId: string, data: Partial<DailyLog>) => void
  deleteLog: (projectId: string, logId: string) => void

  setPlannedCurve: (projectId: string, curve: PlannedProgressPoint[]) => void

  upsertSchedule: (
    projectId: string,
    lineId: string,
    activity: ActivityKind,
    data: Partial<Omit<ActivitySchedule, 'id' | 'lineId' | 'activity'>>,
  ) => void
  addSchedules: (projectId: string, schedules: ActivitySchedule[]) => void

  toggleTheme: () => void
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,
      theme: 'dark',

      currentProject: () => {
        const { projects, currentProjectId } = get()
        return projects.find((p) => p.id === currentProjectId) ?? null
      },

      createProject: ({ name, client, location, unit }) => {
        const id = makeId('proj')
        const project: Project = {
          id,
          name,
          client,
          location,
          unit,
          svgRaw: null,
          svgFileName: null,
          lines: [],
          logs: [],
          plannedCurve: [],
          schedules: [],
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ projects: [...s.projects, project], currentProjectId: id }))
        return id
      },

      deleteProject: (id) => {
        set((s) => {
          const projects = s.projects.filter((p) => p.id !== id)
          const currentProjectId =
            s.currentProjectId === id ? (projects[0]?.id ?? null) : s.currentProjectId
          return { projects, currentProjectId }
        })
      },

      selectProject: (id) => set({ currentProjectId: id }),

      updateProjectMeta: (id, data) => {
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...data } : p)),
        }))
      },

      setProjectSvg: (projectId, svgRaw, fileName, lines) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, svgRaw, svgFileName: fileName, lines } : p,
          ),
        }))
      },

      addLine: (projectId, line) => {
        const newLine: IsoLine = { ...line, id: makeId('line'), createdAt: new Date().toISOString() }
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, lines: [...p.lines, newLine] } : p,
          ),
        }))
      },

      updateLine: (projectId, lineId, data) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, lines: p.lines.map((l) => (l.id === lineId ? { ...l, ...data } : l)) }
              : p,
          ),
        }))
      },

      deleteLine: (projectId, lineId) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  lines: p.lines.filter((l) => l.id !== lineId),
                  logs: p.logs.filter((l) => l.lineId !== lineId),
                }
              : p,
          ),
        }))
      },

      addLog: (projectId, log) => {
        const newLog: DailyLog = { ...log, id: makeId('log'), createdAt: new Date().toISOString() }
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, logs: [...p.logs, newLog] } : p,
          ),
        }))
      },

      updateLog: (projectId, logId, data) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId
              ? { ...p, logs: p.logs.map((l) => (l.id === logId ? { ...l, ...data } : l)) }
              : p,
          ),
        }))
      },

      deleteLog: (projectId, logId) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, logs: p.logs.filter((l) => l.id !== logId) } : p,
          ),
        }))
      },

      setPlannedCurve: (projectId, curve) => {
        set((s) => ({
          projects: s.projects.map((p) => (p.id === projectId ? { ...p, plannedCurve: curve } : p)),
        }))
      },

      upsertSchedule: (projectId, lineId, activity, data) => {
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p
            const existing = p.schedules.find((a) => a.lineId === lineId && a.activity === activity)
            if (existing) {
              return {
                ...p,
                schedules: p.schedules.map((a) => (a.id === existing.id ? { ...a, ...data } : a)),
              }
            }
            const newSchedule: ActivitySchedule = {
              id: makeId('sched'),
              lineId,
              activity,
              plannedStart: '',
              plannedEnd: '',
              actualStart: null,
              actualEnd: null,
              percentComplete: 0,
              ...data,
            }
            return { ...p, schedules: [...p.schedules, newSchedule] }
          }),
        }))
      },

      addSchedules: (projectId, schedules) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, schedules: [...p.schedules, ...schedules] } : p,
          ),
        }))
      },

      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'piping-iso-tracker-storage',
      version: 1,
      migrate: (persistedState) => {
        const state = persistedState as AppState
        if (state?.projects) {
          state.projects = state.projects.map((p) => ({ ...p, schedules: p.schedules ?? [] }))
        }
        return state
      },
    },
  ),
)
