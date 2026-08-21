import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import type { EstAssumptions, EstEstimateRecord, EstFullInputs, EstProject, EstProjectDraft, EstResults } from '../types'
import {
  estAssumptionsFromRow, estEstimateFromRow, estProjectFromRow,
  type EstAssumptionsRow, type EstEstimateRow, type EstProjectRow,
} from '../lib/estimatorData'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

interface EstimatorStoreState {
  projects: EstProject[]
  currentProjectId: string | null
  currentProject: EstProject | null
  estimates: EstEstimateRecord[]
  assumptions: EstAssumptions | null
  loadingProjects: boolean
  loadingEstimates: boolean
  loadingAssumptions: boolean
  saving: boolean
  savingAssumptions: boolean

  fetchAssumptions: () => Promise<void>
  saveAssumptions: (a: EstAssumptions) => Promise<boolean>
  fetchProjects: () => Promise<void>
  createProject: (draft: EstProjectDraft) => Promise<string | null>
  selectProject: (id: string | null) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  fetchEstimates: (projectId: string) => Promise<void>
  saveEstimate: (args: {
    projectId: string
    label: string
    inputs: EstFullInputs
    results: EstResults
    fxEurPerUsd: number
    fxRialPerUsd: number
    grandTotalEur: number
    grandTotalRial: number
  }) => Promise<void>
  deleteEstimate: (id: string, projectId: string) => Promise<void>
}

export const useEstimatorStore = create<EstimatorStoreState>()((set, get) => ({
  projects: [],
  currentProjectId: null,
  currentProject: null,
  estimates: [],
  assumptions: null,
  loadingProjects: true,
  loadingEstimates: false,
  loadingAssumptions: true,
  saving: false,
  savingAssumptions: false,

  fetchAssumptions: async () => {
    set({ loadingAssumptions: true })
    const { data, error } = await supabase.from('est_assumptions').select('overhead, lifecycle, specs').eq('id', true).maybeSingle()
    if (reportError('بارگذاری مبانی محاسبات', error)) {
      set({ loadingAssumptions: false })
      return
    }
    set({ assumptions: data ? estAssumptionsFromRow(data as EstAssumptionsRow) : null, loadingAssumptions: false })
  },

  saveAssumptions: async (a) => {
    set({ savingAssumptions: true })
    const { error } = await supabase.from('est_assumptions').upsert({ id: true, overhead: a.overhead, lifecycle: a.lifecycle, specs: a.specs })
    set({ savingAssumptions: false })
    if (reportError('ذخیره مبانی محاسبات', error)) return false
    set({ assumptions: a })
    return true
  },

  fetchProjects: async () => {
    set({ loadingProjects: true })
    const { data, error } = await supabase.from('est_projects').select('*').order('created_at', { ascending: false })
    if (reportError('بارگذاری پروژه‌ها', error)) {
      set({ loadingProjects: false })
      return
    }
    set({ projects: ((data ?? []) as EstProjectRow[]).map(estProjectFromRow), loadingProjects: false })
  },

  createProject: async (draft) => {
    const { data, error } = await supabase
      .from('est_projects')
      .insert({
        name: draft.name,
        has_onshore: draft.hasOnshore,
        has_offshore: draft.hasOffshore,
        has_compressor_station: draft.hasCompressorStation,
        launcher_count: draft.launcherCount,
        receiver_count: draft.receiverCount,
        tie_in_count: draft.tieInCount,
        block_valve_count: draft.blockValveCount,
        has_telecom_scada: draft.hasTelecomScada,
      })
      .select('*')
      .single()
    if (error || !data) {
      reportError('ایجاد پروژه', error ?? { message: 'خطای نامشخص' })
      return null
    }
    await get().fetchProjects()
    const project = estProjectFromRow(data as EstProjectRow)
    await get().selectProject(project.id)
    return project.id
  },

  selectProject: async (id) => {
    if (!id) {
      set({ currentProjectId: null, currentProject: null, estimates: [] })
      return
    }
    const project = get().projects.find((p) => p.id === id) ?? null
    set({ currentProjectId: id, currentProject: project })
    await get().fetchEstimates(id)
  },

  deleteProject: async (id) => {
    const { error } = await supabase.from('est_projects').delete().eq('id', id)
    if (reportError('حذف پروژه', error)) return
    if (get().currentProjectId === id) set({ currentProjectId: null, currentProject: null, estimates: [] })
    await get().fetchProjects()
  },

  fetchEstimates: async (projectId) => {
    set({ loadingEstimates: true })
    const { data, error } = await supabase
      .from('est_estimates')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (reportError('بارگذاری تاریخچه محاسبات', error)) {
      set({ loadingEstimates: false })
      return
    }
    set({ estimates: ((data ?? []) as EstEstimateRow[]).map(estEstimateFromRow), loadingEstimates: false })
  },

  saveEstimate: async ({ projectId, label, inputs, results, fxRialPerUsd, grandTotalEur, grandTotalRial }) => {
    set({ saving: true })
    const { error } = await supabase.from('est_estimates').insert({
      project_id: projectId,
      label,
      inputs,
      results,
      fx_rial_per_usd: fxRialPerUsd,
      grand_total_eur: grandTotalEur,
      grand_total_rial: grandTotalRial,
    })
    set({ saving: false })
    if (reportError('ذخیره محاسبه در تاریخچه', error)) return
    await get().fetchEstimates(projectId)
  },

  deleteEstimate: async (id, projectId) => {
    const { error } = await supabase.from('est_estimates').delete().eq('id', id)
    if (reportError('حذف رکورد تاریخچه', error)) return
    await get().fetchEstimates(projectId)
  },
}))
