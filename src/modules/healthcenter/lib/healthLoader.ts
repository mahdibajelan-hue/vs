/**
 * Project Health Center — gathers what the engine reads from the modules that already hold it (reporting facts,
 * execution site records, PSSR and testing counts), loads the settings and the snapshot history, and stores the
 * day's snapshot. Everything is read with the user's own session, so row-level security decides what is visible.
 */
import { supabase } from '../../../lib/supabaseClient'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { factsOf } from '../../reporting/store/useAnalyticsStore'
import { loadSiteInput } from '../../reporting/lib/periodReportLoader'
import { computeHealth, mergeSettings, type DomainScore, type HealthResult, type HealthSettings, type Indicator, type CapHit } from './healthCore'

export interface Snapshot {
  date: string
  index: number
  rawIndex: number | null
  status: string
  coverage: number | null
  domains: DomainScore[]
  indicators: Record<string, Pick<Indicator, 'value' | 'score' | 'status'>>
  caps: CapHit[]
}

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function loadSettings(projectId: string | null): Promise<{ settings: HealthSettings; global: Partial<HealthSettings> | null; project: Partial<HealthSettings> | null }> {
  const { data } = await supabase.from('ph_settings').select('master_project_id, config')
  const rows = (data ?? []) as { master_project_id: string | null; config: Partial<HealthSettings> }[]
  const global = rows.find((r) => r.master_project_id == null)?.config ?? null
  const project = projectId ? rows.find((r) => r.master_project_id === projectId)?.config ?? null : null
  return { settings: mergeSettings(global, project), global, project }
}

export async function saveSettings(projectId: string | null, config: Partial<HealthSettings>): Promise<string | null> {
  const q = supabase.from('ph_settings').select('id')
  const { data } = await (projectId ? q.eq('master_project_id', projectId) : q.is('master_project_id', null)).maybeSingle()
  const row = { master_project_id: projectId, config, updated_at: new Date().toISOString() }
  const res = data?.id ? await supabase.from('ph_settings').update(row).eq('id', data.id) : await supabase.from('ph_settings').insert(row)
  return res.error ? 'ذخیرهٔ تنظیمات انجام نشد؛ فقط مدیر سامانه می‌تواند تنظیمات را تغییر دهد.' : null
}

export async function loadHistory(projectId: string): Promise<Snapshot[]> {
  const { data } = await supabase.from('ph_snapshots').select('snap_date, health_index, raw_index, status, coverage, domains, indicators, caps')
    .eq('master_project_id', projectId).order('snap_date', { ascending: true }).limit(400)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    date: String(r.snap_date), index: Number(r.health_index), rawIndex: r.raw_index == null ? null : Number(r.raw_index), status: String(r.status),
    coverage: r.coverage == null ? null : Number(r.coverage), domains: (r.domains as DomainScore[]) ?? [], indicators: (r.indicators as Snapshot['indicators']) ?? {}, caps: (r.caps as CapHit[]) ?? [],
  }))
}

/** the latest snapshot of every project the user can read — the «projects by health» list */
export async function loadLatestSnapshots(): Promise<Map<string, Snapshot>> {
  const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
  const { data } = await supabase.from('ph_snapshots').select('master_project_id, snap_date, health_index, raw_index, status, coverage, domains, caps')
    .gte('snap_date', since).order('snap_date', { ascending: false }).limit(2000)
  const out = new Map<string, Snapshot>()
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const id = String(r.master_project_id)
    if (out.has(id)) continue
    out.set(id, { date: String(r.snap_date), index: Number(r.health_index), rawIndex: r.raw_index == null ? null : Number(r.raw_index), status: String(r.status), coverage: r.coverage == null ? null : Number(r.coverage), domains: (r.domains as DomainScore[]) ?? [], indicators: {}, caps: (r.caps as CapHit[]) ?? [] })
  }
  return out
}

async function extraCounts(projectId: string) {
  const { data, error } = await supabase.rpc('ph_extra_counts', { p: projectId })
  const r = (Array.isArray(data) ? data[0] : data) as { punch_a: number; ht_failed: number; has_pssr: boolean; has_ht: boolean } | undefined
  if (error || !r) return { punchA: null, htFailed: null }
  return { punchA: r.has_pssr ? r.punch_a : null, htFailed: r.has_ht ? r.ht_failed : null }
}

/** a snapshot as the engine's «previous» result (trend and drivers only need these fields) */
export function asPrevious(s: Snapshot | null): HealthResult | null {
  if (!s) return null
  return { index: s.index, domains: s.domains, indicators: Object.fromEntries(Object.entries(s.indicators).map(([k, v]) => [k, { id: k, value: v.value, score: v.score, status: v.status, prev: null, series: [], note: '' }])) } as unknown as HealthResult
}

/** compute a project's health now and keep today's snapshot */
export async function computeProjectHealth(projectId: string, settings: HealthSettings, history: Snapshot[], store = true): Promise<HealthResult> {
  const md = useMasterDataStore.getState()
  if (!md.loaded) await md.fetchAll()
  const p = useMasterDataStore.getState().projects.find((x) => x.id === projectId)
  if (!p) throw new Error('پروژه در دادهٔ پایه یافت نشد یا به آن دسترسی ندارید.')
  const facts = await factsOf(p)
  const [site, extra] = await Promise.all([loadSiteInput(p.id, p.officialName, facts).catch(() => null), extraCounts(p.id)])
  const today = todayIso()
  const prev = [...history].reverse().find((h) => h.date < today) ?? null
  const result = computeHealth({ today, facts, site, extra }, settings, asPrevious(prev))
  if (store) await saveSnapshot(result)
  return result
}

export async function saveSnapshot(r: HealthResult): Promise<void> {
  const indicators = Object.fromEntries(Object.entries(r.indicators).map(([k, v]) => [k, { value: v.value, score: v.score, status: v.status }]))
  await supabase.from('ph_snapshots').upsert({
    master_project_id: r.projectId, snap_date: r.asOf, health_index: r.index, raw_index: r.rawIndex, status: r.status, coverage: r.coverage,
    domains: r.domains.map(({ key, score, coverage, weight }) => ({ key, score, coverage, weight })), indicators, caps: r.caps, updated_at: new Date().toISOString(),
  }, { onConflict: 'master_project_id,snap_date' })
}

/** recompute and store today's snapshot for every project the user can read (the «projects by health» refresh) */
export async function refreshAll(onProgress: (done: number, total: number) => void): Promise<{ done: number; failed: string[] }> {
  const md = useMasterDataStore.getState()
  if (!md.loaded) await md.fetchAll()
  const acc = await supabase.rpc('rp_accessible_projects')
  if (acc.error) return { done: 0, failed: ['بررسی دسترسی پروژه‌ها انجام نشد'] }
  const allowed = new Set(((acc.data ?? []) as unknown[]).map((r) => String(typeof r === 'object' && r ? Object.values(r)[0] : r)))
  const projects = useMasterDataStore.getState().projects.filter((p) => allowed.has(p.id))
  const failed: string[] = []
  let done = 0
  for (const p of projects) {
    try {
      const { settings } = await loadSettings(p.id)
      const hist = await loadHistory(p.id)
      await computeProjectHealth(p.id, settings, hist)
    } catch { failed.push(p.officialName) }
    onProgress(++done, projects.length)
  }
  return { done, failed }
}
