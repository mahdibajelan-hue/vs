import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ActivityKind, ActivitySchedule, DailyLog, Equipment3D, IsoLine, Joint, Milestone, NewDailyLogInput, PlannedProgressPoint, Project, ReportConfig, ThemeMode, UserRole } from '../types'
import { makeId } from '../lib/id'
import { createDefaultMilestones } from '../lib/milestones'
import { defaultReportConfig } from '../lib/reportConfig'
import { createSafeLocalStorage } from '../lib/safeStorage'
import { sanitizeSvg } from '../lib/sanitizeSvg'
import { deleteProjectModel3d, uploadProjectModel3d } from '../lib/model3dStorage'
import { supabase } from '../lib/supabaseClient'
import { friendlyErrorMessage } from '../lib/friendlyError'
import { useAuthStore } from './useAuthStore'
import { useMembersStore } from './useMembersStore'
import { useSystemStore } from './useSystemStore'
import {
  equipment3dFromRow,
  equipment3dToRow,
  jointFromRow,
  jointToRow,
  lineFromRow,
  lineToRow,
  logFromRow,
  logToRow,
  projectFromRow,
  projectSummaryFromRow,
  spoolFromRow,
  spoolToRow,
  type ProjectSummary,
} from '../lib/supabaseData'

/**
 * Supabase calls fail silently by default (RLS rejection, network error, schema mismatch) —
 * a mutation just does nothing with no visible feedback. Every write path funnels its error
 * through here so it surfaces in the StorageErrorBanner instead of vanishing.
 */
function reportSupabaseError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

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

  /** Returns the newly-inserted lines (with real db ids) — match by svgElementId to relate other new records to them. */
  setProjectSvg: (projectId: string, svgRaw: string, fileName: string, lines: IsoLine[]) => Promise<IsoLine[]>
  /** Uploads an FBX (or other supported) 3D model to Storage and records its path on the project. Returns false on failure. */
  setProjectModel3d: (projectId: string, file: File) => Promise<boolean>
  clearProjectModel3d: (projectId: string) => Promise<void>
  addLine: (projectId: string, line: Omit<IsoLine, 'id' | 'createdAt'>) => Promise<void>
  updateLine: (projectId: string, lineId: string, data: Partial<IsoLine>) => Promise<void>
  deleteLine: (projectId: string, lineId: string) => Promise<void>
  mergeFragmentsIntoNewLine: (
    projectId: string,
    data: { svgElementIds: string[]; svgElementId: string; size: string; plannedLength?: number; totalWelds?: number },
  ) => Promise<void>
  addFragmentsToLine: (projectId: string, lineId: string, elementIds: string[]) => Promise<void>
  removeFragmentsFromLines: (projectId: string, elementIds: string[]) => Promise<void>

  addLog: (projectId: string, log: NewDailyLogInput) => Promise<void>
  updateLog: (projectId: string, logId: string, data: Partial<DailyLog>) => Promise<void>
  deleteLog: (projectId: string, logId: string) => Promise<void>
  /** Owner (or admin) audit outside the approve/reject cycle — confirms as-is or corrects the values. */
  auditLogAsOwner: (projectId: string, logId: string, data: { lengthDone?: number; weldCount?: number; note?: string }) => Promise<void>
  /** Re-applies a raw audit_log snapshot (already snake_case, straight from the DB row) — restores an edited or deleted entry. */
  restoreLogSnapshot: (projectId: string, logId: string, snapshot: Record<string, unknown>) => Promise<void>

  setPlannedCurve: (projectId: string, curve: PlannedProgressPoint[]) => Promise<void>

  upsertSchedule: (
    projectId: string,
    lineId: string,
    activity: ActivityKind,
    data: Partial<Omit<ActivitySchedule, 'id' | 'lineId' | 'activity'>>,
  ) => Promise<void>
  addSchedules: (projectId: string, schedules: ActivitySchedule[]) => Promise<void>
  /** Consultant confirms one line's activity plan is correct. */
  approveScheduleRowAsConsultant: (projectId: string, lineId: string, activity: ActivityKind) => Promise<void>
  /** Owner signs off on the whole project schedule (all lines/activities) — outside the per-row consultant approve cycle. */
  approveScheduleAsOwner: (projectId: string) => Promise<void>

  setEquipment: (projectId: string, equipment: Project['equipment']) => Promise<void>

  /** Places a joint at the end of its line's sequence (sequenceNumber = current max + 1). */
  addJoint: (projectId: string, joint: Omit<Joint, 'id' | 'createdAt' | 'sequenceNumber'>) => Promise<void>
  updateJoint: (projectId: string, jointId: string, data: Partial<Joint>) => Promise<void>
  deleteJoint: (projectId: string, jointId: string) => Promise<void>

  addEquipment3D: (projectId: string, equipment: Omit<Equipment3D, 'id' | 'createdAt'>) => Promise<void>
  updateEquipment3D: (projectId: string, equipmentId: string, data: Partial<Equipment3D>) => Promise<void>
  deleteEquipment3D: (projectId: string, equipmentId: string) => Promise<void>

  /** Creates (or updates, if one already links these two joints) the spool between two consecutive joints and links it to 3D mesh objects. */
  upsertSpool: (
    projectId: string,
    data: { lineId: string; startJointId: string | null; endJointId: string | null; meshObjectNames: string[] },
    spoolId?: string,
  ) => Promise<void>
  deleteSpool: (projectId: string, spoolId: string) => Promise<void>

  setMilestones: (projectId: string, milestones: Milestone[]) => Promise<void>
  approveMilestoneAsConsultant: (projectId: string, milestoneId: string) => Promise<void>
  /** Owner (or admin) audit outside the approve cycle — confirms as-is or corrects the percent. */
  auditMilestoneAsOwner: (projectId: string, milestoneId: string, percentComplete?: number) => Promise<void>


  setReportConfig: (projectId: string, config: ReportConfig) => Promise<void>

  toggleTheme: () => void
}

async function fetchProjectDetail(id: string): Promise<Project | null> {
  const [{ data: projectRow }, { data: lineRows }, { data: logRows }, { data: jointRows }, { data: equipment3dRows }, { data: spoolRows }] =
    await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('lines').select('*').eq('project_id', id).order('created_at'),
      supabase.from('daily_logs').select('*').eq('project_id', id).order('date', { ascending: false }),
      supabase.from('joints').select('*').eq('project_id', id).order('sequence_number'),
      supabase.from('equipment3d').select('*').eq('project_id', id).order('created_at'),
      supabase.from('spools').select('*').eq('project_id', id).order('created_at'),
    ])
  if (!projectRow) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return projectFromRow(
    projectRow as any,
    (lineRows ?? []) as any,
    (logRows ?? []) as any,
    (jointRows ?? []) as any,
    (equipment3dRows ?? []) as any,
    (spoolRows ?? []) as any,
  )
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,
      projectDetail: null,
      // Starts true (not false) so the loading spinner in App.tsx covers the gap between
      // "user is authed" and "fetchProjects() has actually run" — otherwise that gap briefly
      // shows the empty "create project / load demo" screen on every single page load, and an
      // impatient click there creates a duplicate project even though real ones exist.
      loadingProjects: true,
      loadingDetail: false,
      theme: 'dark',

      currentProject: () => {
        const { projectDetail, currentProjectId } = get()
        return projectDetail && projectDetail.id === currentProjectId ? projectDetail : null
      },

      fetchProjects: async () => {
        set({ loadingProjects: true })
        const { data, error } = await supabase.from('projects').select('id,name,client,location,unit,created_at').order('created_at', { ascending: false })
        reportSupabaseError('بارگذاری فهرست پروژه‌ها', error)
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
        if (error || !data) {
          reportSupabaseError('ایجاد پروژه', error ?? { message: 'خطای نامشخص' })
          throw new Error(error?.message ?? 'خطا در ایجاد پروژه')
        }
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
          p_svg_raw: project.svgRaw ? sanitizeSvg(project.svgRaw) : project.svgRaw,
          p_svg_file_name: project.svgFileName,
          p_schedules: [],
          p_milestones: project.milestones?.length ? project.milestones : createDefaultMilestones(),
          p_report_config: project.reportConfig ?? defaultReportConfig(),
          p_planned_curve: project.plannedCurve ?? [],
        })
        if (error || !data) {
          reportSupabaseError('وارد کردن پروژه', error ?? { message: 'خطای نامشخص' })
          throw new Error(error?.message ?? 'خطا در وارد کردن پروژه')
        }
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
        const { error } = await supabase.from('projects').delete().eq('id', id)
        if (reportSupabaseError('حذف پروژه', error)) return
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
        const { error } = await supabase.from('projects').update(data).eq('id', id)
        if (reportSupabaseError('ذخیره اطلاعات پروژه', error)) return
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...data } : p)),
          projectDetail: s.projectDetail?.id === id ? { ...s.projectDetail, ...data } : s.projectDetail,
        }))
      },

      setProjectSvg: async (projectId, svgRaw, fileName, lines) => {
        svgRaw = sanitizeSvg(svgRaw)
        const { error: updateErr } = await supabase.from('projects').update({ svg_raw: svgRaw, svg_file_name: fileName }).eq('id', projectId)
        if (reportSupabaseError('ذخیره نقشه SVG', updateErr)) return []
        const { error: deleteErr } = await supabase.from('lines').delete().eq('project_id', projectId)
        if (reportSupabaseError('پاک‌سازی خطوط قبلی', deleteErr)) return []
        let newLines: IsoLine[] = []
        if (lines.length) {
          // lineToRow never carries the client-side placeholder id (it isn't a real uuid) — the
          // db assigns real ids on insert. Callers that need to relate other new records (logs,
          // schedules) to these lines must match on svgElementId against the returned rows below.
          const { data, error: insertErr } = await supabase.from('lines').insert(lines.map((l) => lineToRow(projectId, l))).select()
          if (reportSupabaseError('ذخیره خطوط استخراج‌شده', insertErr)) return []
          newLines = (data ?? []).map(lineFromRow)
        }
        set((s) =>
          s.projectDetail?.id === projectId
            ? { projectDetail: { ...s.projectDetail, svgRaw, svgFileName: fileName, lines: newLines, logs: [] } }
            : {},
        )
        return newLines
      },

      setProjectModel3d: async (projectId, file) => {
        const { path, error: uploadErr } = await uploadProjectModel3d(projectId, file)
        if (uploadErr || !path) {
          reportSupabaseError('بارگذاری مدل سه‌بعدی', { message: uploadErr ?? 'خطای نامشخص' })
          return false
        }
        const { error: updateErr } = await supabase.from('projects').update({ model3d_path: path, model3d_file_name: file.name }).eq('id', projectId)
        if (reportSupabaseError('ذخیره مدل سه‌بعدی', updateErr)) return false
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, model3dPath: path, model3dFileName: file.name } } : {}))
        return true
      },

      clearProjectModel3d: async (projectId) => {
        const current = get().projectDetail
        const path = current?.id === projectId ? current.model3dPath : null
        const { error: updateErr } = await supabase.from('projects').update({ model3d_path: null, model3d_file_name: null }).eq('id', projectId)
        if (reportSupabaseError('حذف مدل سه‌بعدی', updateErr)) return
        if (path) await deleteProjectModel3d(path)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, model3dPath: null, model3dFileName: null } } : {}))
      },

      addLine: async (projectId, line) => {
        const { data, error } = await supabase.from('lines').insert(lineToRow(projectId, line)).select().single()
        if (reportSupabaseError('افزودن خط', error) || !data) return
        const newLine = lineFromRow(data)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, lines: [...s.projectDetail.lines, newLine] } } : {}))
      },

      updateLine: async (projectId, lineId, data) => {
        const { error } = await supabase.from('lines').update(lineToRow(projectId, data)).eq('id', lineId)
        if (reportSupabaseError('ذخیره تغییرات خط', error)) return
        set((s) =>
          s.projectDetail?.id === projectId
            ? { projectDetail: { ...s.projectDetail, lines: s.projectDetail.lines.map((l) => (l.id === lineId ? { ...l, ...data } : l)) } }
            : {},
        )
      },

      deleteLine: async (projectId, lineId) => {
        const { error } = await supabase.from('lines').delete().eq('id', lineId)
        if (reportSupabaseError('حذف خط', error)) return
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
        const { data, error } = await supabase
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
        if (reportSupabaseError('ساخت خط جدید از قطعات', error)) return
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
        const payload: Partial<DailyLog> = { ...log, contractorLengthDone: log.lengthDone, contractorWeldCount: log.weldCount }
        const { data, error } = await supabase.from('daily_logs').insert(logToRow(projectId, payload)).select().single()
        if (reportSupabaseError('ثبت گزارش روزانه', error) || !data) return
        const newLog = logFromRow(data)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, logs: [...s.projectDetail.logs, newLog] } } : {}))
      },

      updateLog: async (projectId, logId, data) => {
        const current = get().projectDetail?.logs.find((l) => l.id === logId)
        let payload: Partial<DailyLog> = data
        if (data.approvalStatus === 'approved' && current) {
          // Freeze what the consultant approved, separate from whatever the owner may later correct.
          payload = { ...data, consultantLengthDone: data.lengthDone ?? current.lengthDone, consultantWeldCount: data.weldCount ?? current.weldCount }
        } else if (
          data.approvalStatus === undefined &&
          current?.approvalStatus === 'approved' &&
          (data.lengthDone !== undefined || data.weldCount !== undefined || data.date !== undefined)
        ) {
          // Editing the values of an already-approved entry reopens it — the consultant (and, if
          // they'd already audited it, the owner) needs to look at it again with the new numbers.
          payload = {
            ...data,
            approvalStatus: 'pending',
            reviewedBy: null,
            reviewNote: '',
            ownerReviewedAt: null,
            ownerReviewedBy: null,
            ownerLengthDone: null,
            ownerWeldCount: null,
            ownerNote: '',
          }
        }
        const { error } = await supabase.from('daily_logs').update(logToRow(projectId, payload)).eq('id', logId)
        if (reportSupabaseError('ذخیره تغییرات گزارش', error)) return
        set((s) =>
          s.projectDetail?.id === projectId
            ? { projectDetail: { ...s.projectDetail, logs: s.projectDetail.logs.map((l) => (l.id === logId ? { ...l, ...payload } : l)) } }
            : {},
        )
      },

      deleteLog: async (projectId, logId) => {
        const { error } = await supabase.from('daily_logs').delete().eq('id', logId)
        if (reportSupabaseError('حذف گزارش', error)) return
        set((s) =>
          s.projectDetail?.id === projectId
            ? { projectDetail: { ...s.projectDetail, logs: s.projectDetail.logs.filter((l) => l.id !== logId) } }
            : {},
        )
      },

      auditLogAsOwner: async (projectId, logId, data) => {
        const current = get().projectDetail?.logs.find((l) => l.id === logId)
        if (!current) return
        const lengthDone = data.lengthDone ?? current.lengthDone
        const weldCount = data.weldCount ?? current.weldCount
        const payload: Partial<DailyLog> = {
          lengthDone,
          weldCount,
          ownerLengthDone: lengthDone,
          ownerWeldCount: weldCount,
          ownerReviewedAt: new Date().toISOString(),
          ownerReviewedBy: useAuthStore.getState().profile?.id ?? null,
          ownerNote: data.note ?? '',
        }
        const { error } = await supabase.from('daily_logs').update(logToRow(projectId, payload)).eq('id', logId)
        if (reportSupabaseError('ثبت ممیزی کارفرما', error)) return
        set((s) =>
          s.projectDetail?.id === projectId
            ? { projectDetail: { ...s.projectDetail, logs: s.projectDetail.logs.map((l) => (l.id === logId ? { ...l, ...payload } : l)) } }
            : {},
        )
      },

      restoreLogSnapshot: async (projectId, logId, snapshot) => {
        const { data: existing } = await supabase.from('daily_logs').select('id').eq('id', logId).maybeSingle()
        const { error } = existing
          ? await supabase.from('daily_logs').update(snapshot).eq('id', logId)
          : await supabase.from('daily_logs').insert(snapshot)
        if (reportSupabaseError('بازیابی سابقه', error)) return
        if (get().currentProjectId === projectId) await get().selectProject(projectId)
      },

      setPlannedCurve: async (projectId, curve) => {
        const { error } = await supabase.from('projects').update({ planned_curve: curve }).eq('id', projectId)
        if (reportSupabaseError('ذخیره منحنی برنامه‌ریزی‌شده', error)) return
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, plannedCurve: curve } } : {}))
      },

      upsertSchedule: async (projectId, lineId, activity, data) => {
        const detail = get().projectDetail
        if (!detail || detail.id !== projectId) return
        const existing = detail.schedules.find((a) => a.lineId === lineId && a.activity === activity)
        // Editing the plan invalidates a stale consultant approval on this row, and the owner's
        // whole-plan sign-off (it was signed off on the previous version of the plan).
        const planChanged =
          !!existing &&
          ((data.plannedStart !== undefined && data.plannedStart !== existing.plannedStart) ||
            (data.plannedEnd !== undefined && data.plannedEnd !== existing.plannedEnd))
        const invalidateRow = planChanged ? { consultantApprovedAt: null, consultantApprovedBy: null } : {}
        const next = existing
          ? detail.schedules.map((a) => (a.id === existing.id ? { ...a, ...data, ...invalidateRow } : a))
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
                consultantApprovedAt: null,
                consultantApprovedBy: null,
                ...data,
              } as ActivitySchedule,
            ]
        const invalidateOverall = planChanged && detail.scheduleApprovedAt ? { schedule_owner_approved_at: null, schedule_owner_approved_by: null } : {}
        const { error } = await supabase.from('projects').update({ schedules: next, ...invalidateOverall }).eq('id', projectId)
        if (reportSupabaseError('ذخیره زمان‌بندی', error)) return
        set((s) =>
          s.projectDetail?.id === projectId
            ? {
                projectDetail: {
                  ...s.projectDetail,
                  schedules: next,
                  ...(planChanged ? { scheduleApprovedAt: null, scheduleApprovedBy: null } : {}),
                },
              }
            : {},
        )
      },

      addSchedules: async (projectId, schedules) => {
        const detail = get().projectDetail
        const existing = detail?.id === projectId ? detail.schedules : []
        const next = [...existing, ...schedules]
        const { error } = await supabase.from('projects').update({ schedules: next }).eq('id', projectId)
        if (reportSupabaseError('ذخیره زمان‌بندی', error)) return
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, schedules: next } } : {}))
      },

      approveScheduleRowAsConsultant: async (projectId, lineId, activity) => {
        const detail = get().projectDetail
        if (!detail || detail.id !== projectId) return
        const next = detail.schedules.map((a) =>
          a.lineId === lineId && a.activity === activity
            ? { ...a, consultantApprovedAt: new Date().toISOString(), consultantApprovedBy: useAuthStore.getState().profile?.id ?? null }
            : a,
        )
        const { error } = await supabase.from('projects').update({ schedules: next }).eq('id', projectId)
        if (reportSupabaseError('تایید ردیف برنامه', error)) return
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, schedules: next } } : {}))
      },

      approveScheduleAsOwner: async (projectId) => {
        const approvedAt = new Date().toISOString()
        const approvedBy = useAuthStore.getState().profile?.id ?? null
        const { error } = await supabase
          .from('projects')
          .update({ schedule_owner_approved_at: approvedAt, schedule_owner_approved_by: approvedBy })
          .eq('id', projectId)
        if (reportSupabaseError('تایید کلی برنامه زمان‌بندی', error)) return
        set((s) =>
          s.projectDetail?.id === projectId
            ? { projectDetail: { ...s.projectDetail, scheduleApprovedAt: approvedAt, scheduleApprovedBy: approvedBy } }
            : {},
        )
      },

      setEquipment: async (projectId, equipment) => {
        const { error } = await supabase.from('projects').update({ equipment }).eq('id', projectId)
        if (reportSupabaseError('ذخیره فهرست تجهیزات', error)) return
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, equipment } } : {}))
      },

      addJoint: async (projectId, joint) => {
        const detail = get().projectDetail
        if (!detail || detail.id !== projectId) return
        const nextSeq = Math.max(0, ...detail.joints.filter((j) => j.lineId === joint.lineId).map((j) => j.sequenceNumber)) + 1
        const { data, error } = await supabase
          .from('joints')
          .insert(jointToRow(projectId, { ...joint, sequenceNumber: nextSeq }))
          .select()
          .single()
        if (reportSupabaseError('افزودن اتصال', error) || !data) return
        const newJoint = jointFromRow(data)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, joints: [...s.projectDetail.joints, newJoint] } } : {}))
      },

      updateJoint: async (projectId, jointId, data) => {
        const { error } = await supabase.from('joints').update(jointToRow(projectId, data)).eq('id', jointId)
        if (reportSupabaseError('ذخیره تغییرات اتصال', error)) return
        set((s) =>
          s.projectDetail?.id === projectId
            ? { projectDetail: { ...s.projectDetail, joints: s.projectDetail.joints.map((j) => (j.id === jointId ? { ...j, ...data } : j)) } }
            : {},
        )
      },

      deleteJoint: async (projectId, jointId) => {
        const { error } = await supabase.from('joints').delete().eq('id', jointId)
        if (reportSupabaseError('حذف اتصال', error)) return
        set((s) =>
          s.projectDetail?.id === projectId
            ? {
                projectDetail: {
                  ...s.projectDetail,
                  joints: s.projectDetail.joints.filter((j) => j.id !== jointId),
                  // A spool that referenced this joint as a bound loses that bound rather than pointing at a dead id.
                  spools: s.projectDetail.spools.map((sp) => ({
                    ...sp,
                    startJointId: sp.startJointId === jointId ? null : sp.startJointId,
                    endJointId: sp.endJointId === jointId ? null : sp.endJointId,
                  })),
                },
              }
            : {},
        )
      },

      addEquipment3D: async (projectId, equipment) => {
        const { data, error } = await supabase.from('equipment3d').insert(equipment3dToRow(projectId, equipment)).select().single()
        if (reportSupabaseError('افزودن تجهیز', error) || !data) return
        const newEquipment = equipment3dFromRow(data)
        set((s) =>
          s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, equipment3d: [...s.projectDetail.equipment3d, newEquipment] } } : {},
        )
      },

      updateEquipment3D: async (projectId, equipmentId, data) => {
        const { error } = await supabase.from('equipment3d').update(equipment3dToRow(projectId, data)).eq('id', equipmentId)
        if (reportSupabaseError('ذخیره تغییرات تجهیز', error)) return
        set((s) =>
          s.projectDetail?.id === projectId
            ? { projectDetail: { ...s.projectDetail, equipment3d: s.projectDetail.equipment3d.map((e) => (e.id === equipmentId ? { ...e, ...data } : e)) } }
            : {},
        )
      },

      deleteEquipment3D: async (projectId, equipmentId) => {
        const { error } = await supabase.from('equipment3d').delete().eq('id', equipmentId)
        if (reportSupabaseError('حذف تجهیز', error)) return
        set((s) =>
          s.projectDetail?.id === projectId
            ? {
                projectDetail: {
                  ...s.projectDetail,
                  equipment3d: s.projectDetail.equipment3d.filter((e) => e.id !== equipmentId),
                  joints: s.projectDetail.joints.map((j) => (j.connectedEquipmentId === equipmentId ? { ...j, connectedEquipmentId: null } : j)),
                },
              }
            : {},
        )
      },

      upsertSpool: async (projectId, data, spoolId) => {
        if (spoolId) {
          const { error } = await supabase.from('spools').update(spoolToRow(projectId, data)).eq('id', spoolId)
          if (reportSupabaseError('ذخیره اسپول', error)) return
          set((s) =>
            s.projectDetail?.id === projectId
              ? { projectDetail: { ...s.projectDetail, spools: s.projectDetail.spools.map((sp) => (sp.id === spoolId ? { ...sp, ...data } : sp)) } }
              : {},
          )
          return
        }
        const { data: row, error } = await supabase.from('spools').insert(spoolToRow(projectId, data)).select().single()
        if (reportSupabaseError('ایجاد اسپول', error) || !row) return
        const newSpool = spoolFromRow(row)
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, spools: [...s.projectDetail.spools, newSpool] } } : {}))
      },

      deleteSpool: async (projectId, spoolId) => {
        const { error } = await supabase.from('spools').delete().eq('id', spoolId)
        if (reportSupabaseError('حذف اسپول', error)) return
        set((s) =>
          s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, spools: s.projectDetail.spools.filter((sp) => sp.id !== spoolId) } } : {},
        )
      },

      setMilestones: async (projectId, milestones) => {
        const { error } = await supabase.from('projects').update({ milestones }).eq('id', projectId)
        if (reportSupabaseError('ذخیره مایلستون‌ها', error)) return
        set((s) => (s.projectDetail?.id === projectId ? { projectDetail: { ...s.projectDetail, milestones } } : {}))
      },

      approveMilestoneAsConsultant: async (projectId, milestoneId) => {
        const detail = get().projectDetail
        if (!detail || detail.id !== projectId) return
        const next = detail.milestones.map((m) =>
          m.id === milestoneId
            ? { ...m, consultantApprovedAt: new Date().toISOString(), consultantApprovedBy: useAuthStore.getState().profile?.id ?? null }
            : m,
        )
        await get().setMilestones(projectId, next)
      },

      auditMilestoneAsOwner: async (projectId, milestoneId, percentComplete) => {
        const detail = get().projectDetail
        if (!detail || detail.id !== projectId) return
        const next = detail.milestones.map((m) =>
          m.id === milestoneId
            ? {
                ...m,
                percentComplete: percentComplete ?? m.percentComplete,
                ownerReviewedAt: new Date().toISOString(),
                ownerReviewedBy: useAuthStore.getState().profile?.id ?? null,
              }
            : m,
        )
        await get().setMilestones(projectId, next)
      },

      setReportConfig: async (projectId, config) => {
        const { error } = await supabase.from('projects').update({ report_config: config }).eq('id', projectId)
        if (reportSupabaseError('ذخیره تنظیمات گزارش', error)) return
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
