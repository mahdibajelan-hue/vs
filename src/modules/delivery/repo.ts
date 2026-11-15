import { supabase } from '../../lib/supabaseClient'
import type { Answers } from './lib/questions'
import { typeFromProject } from './lib/questions'
import type { RegisterRisk, Result, Weights } from './lib/engine'
import type { RiskFamily } from './lib/bank'
import { guardNarrative, type NarrativeSentence } from '../reporting/lib/narrativeGuard'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const chk = <T extends { error: unknown }>(r: T): T => { if (r.error) throw r.error; return r }
const s = (v: unknown) => (v == null ? '' : String(v))

export type StudyStatus = 'draft' | 'analysed' | 'in_review' | 'approved' | 'rejected'
export interface Study { id: string; projectId: string; title: string; status: StudyStatus; answers: Answers; weights: Partial<Weights> | null; sources: Record<string, string>; currentVersion: number; createdName: string; createdAt: string; updatedAt: string; lifecycle: { strategy: string; at: string; by: string } | null }
export interface Version { id: string; studyId: string; version: number; answers: Answers; weights: Weights; result: Result; engineVersion: string; recommended: string | null; confidence: number | null; decisive: boolean; note: string; narrative: { sentences: NarrativeSentence[]; rejected: number } | null; narrativeAt: string | null; createdBy: string | null; createdName: string; createdAt: string }
export type DecisionKind = 'submitted' | 'approve' | 'approve_override' | 'return' | 'reject' | 'reopen'
export interface Decision { id: string; studyId: string; versionId: string; decision: DecisionKind; method: string | null; pricing: string[]; procurement: string[]; execution: string[]; rationale: string; overridesEngine: boolean; samePerson: boolean; decidedName: string; decidedAt: string }
export type Caps = Record<'view' | 'create' | 'edit' | 'submit' | 'approve' | 'export' | 'configure' | 'admin', boolean>

const studyOf = (r: Row): Study => ({ id: r.id, projectId: r.project_id, title: s(r.title), status: r.status, answers: (r.answers ?? {}) as Answers, weights: (r.weights ?? null) as Partial<Weights> | null, sources: (r.sources ?? {}) as Record<string, string>, currentVersion: Number(r.current_version) || 0, createdName: s(r.created_name), createdAt: s(r.created_at), updatedAt: s(r.updated_at), lifecycle: r.lifecycle_strategy ? { strategy: s(r.lifecycle_strategy), at: s(r.lifecycle_applied_at), by: s(r.lifecycle_applied_name) } : null })
const versionOf = (r: Row): Version => ({ id: r.id, studyId: r.study_id, version: Number(r.version), answers: r.answers, weights: r.weights, result: r.result as Result, engineVersion: s(r.engine_version), recommended: r.recommended ?? null, confidence: r.confidence == null ? null : Number(r.confidence), decisive: !!r.decisive, note: s(r.note), narrative: r.narrative ?? null, narrativeAt: r.narrative_at ?? null, createdBy: r.created_by ?? null, createdName: s(r.created_name), createdAt: s(r.created_at) })
const decisionOf = (r: Row): Decision => ({ id: r.id, studyId: r.study_id, versionId: r.version_id, decision: r.decision, method: r.method ?? null, pricing: r.pricing ?? [], procurement: r.procurement ?? [], execution: r.execution ?? [], rationale: s(r.rationale), overridesEngine: !!r.overrides_engine, samePerson: !!r.same_person, decidedName: s(r.decided_name), decidedAt: s(r.decided_at) })

export interface DsData { studies: Study[]; versions: Version[]; decisions: Decision[] }
export async function loadAll(pid: string): Promise<DsData> {
  const [st, ve, de] = await Promise.all([
    supabase.from('ds_studies').select('*').eq('project_id', pid).order('updated_at', { ascending: false }),
    supabase.from('ds_versions').select('*').eq('project_id', pid).order('version'),
    supabase.from('ds_decisions').select('*').eq('project_id', pid).order('decided_at'),
  ])
  chk(st); chk(ve); chk(de)
  return { studies: ((st.data ?? []) as Row[]).map(studyOf), versions: ((ve.data ?? []) as Row[]).map(versionOf), decisions: ((de.data ?? []) as Row[]).map(decisionOf) }
}
export async function loadCaps(pid: string): Promise<Caps> {
  const r = await supabase.rpc('ds_my_caps', { p_project: pid })
  const d = (r.data ?? {}) as Record<string, unknown>
  return { view: d.view === true, create: d.create === true, edit: d.edit === true, submit: d.submit === true, approve: d.approve === true, export: d.export === true, configure: d.configure === true, admin: d.admin === true }
}
export async function saveStudy(id: string | null, pid: string, title: string, answers: Answers, weights: Partial<Weights> | null, sources: Record<string, string>): Promise<string> {
  return chk(await supabase.rpc('ds_save_study', { p_id: id, p_project: pid, p_title: title, p_answers: answers, p_weights: weights, p_sources: sources })).data as string
}
export async function saveVersion(studyId: string, answers: Answers, weights: Weights, result: Result, note: string): Promise<string> {
  return chk(await supabase.rpc('ds_save_version', { p_study: studyId, p_answers: answers, p_weights: weights, p_result: result, p_engine: result.engineVersion, p_note: note })).data as string
}
/** the Stage-Gate lifecycle of the project (linked by sg_projects.master_project_id) and its current master-schedule strategy */
export async function lifecycleNow(pid: string): Promise<{ linked: boolean; name: string; strategy: string | null; govStatus: string | null }> {
  const p = await supabase.from('sg_projects').select('name').eq('master_project_id', pid).maybeSingle()
  const name = s(p.data?.name)
  if (!name) return { linked: false, name: '', strategy: null, govStatus: null }
  const m = await supabase.from('sg_lifecycle_master_schedule').select('execution_strategy, governance_status').eq('project_name', name).maybeSingle()
  return { linked: true, name, strategy: m.data?.execution_strategy ?? null, govStatus: m.data?.governance_status ?? null }
}
export async function applyToLifecycle(studyId: string, strategy: string) { chk(await supabase.rpc('ds_apply_to_lifecycle', { p_study: studyId, p_strategy: strategy })) }
export async function decide(studyId: string, d: DecisionKind, method: string | null, pricing: string[], procurement: string[], execution: string[], rationale: string) {
  chk(await supabase.rpc('ds_decide', { p_study: studyId, p_decision: d, p_method: method, p_pricing: pricing, p_procurement: procurement, p_execution: execution, p_rationale: rationale }))
}

// ── what the platform already knows about the project: its record and its open risks
const FAMILY_OF: Record<string, RiskFamily> = {
  engineering: 'design', eng_change: 'design', land_art9: 'permits', land_owner: 'permits', legal: 'permits', proc_longlead: 'supply', proc_supplier: 'supply', procurement: 'supply',
  cost: 'price', schedule: 'interface', hr: 'interface', construction: 'ground', con_lower: 'ground', con_weld: 'operations', con_coat: 'operations', hse_env: 'operations', hse_safety: 'operations', comm_handover: 'operations', comm_hydro: 'operations',
}
const ANSWER_OF: Partial<Record<RiskFamily, string>> = { design: 'changeLikelihood', permits: 'permitRisk', supply: 'supplyRisk', interface: 'interfaceRisk', ground: 'groundRisk' }
export interface Prefill { answers: Answers; sources: Record<string, string>; risks: RegisterRisk[]; contracts: { title: string; type: string; value: number | null; currency: string }[]; project: Row | null }
export async function prefill(pid: string): Promise<Prefill> {
  const [mp, rp, fc] = await Promise.all([
    supabase.from('master_projects').select('official_name, project_type, project_category, contract_type, contract_value, forecast_cost_at_completion, currency, planned_start_date, planned_finish_date, location, scope_summary, objectives, status').eq('id', pid).maybeSingle(),
    supabase.from('rm_projects').select('id').eq('master_ref_id', pid),
    supabase.from('fin_contracts').select('title, contract_type, contract_value, currency, contract_role').eq('master_project_id', pid),
  ])
  const p = (mp.data ?? null) as Row | null
  const answers: Answers = {}, sources: Record<string, string> = {}
  if (p) {
    const t = typeFromProject(`${s(p.project_type)} ${s(p.project_category)}`)
    if (t) { answers.projectType = t; sources.projectType = 'شناسنامهٔ پروژه' }
    const val = Number(p.forecast_cost_at_completion ?? p.contract_value)
    if (Number.isFinite(val) && val > 0) { const rial = /ریال|irr|rial/i.test(s(p.currency)) || !s(p.currency); answers.capex = Math.round(rial ? val / 1e9 : val); sources.capex = 'شناسنامهٔ پروژه' }
    if (p.planned_start_date && p.planned_finish_date) {
      const m = Math.round((Date.parse(p.planned_finish_date) - Date.parse(p.planned_start_date)) / (864e5 * 30.44))
      if (m > 0) { answers.durationMonths = m; sources.durationMonths = 'شناسنامهٔ پروژه' }
    }
    const scope = `${s(p.scope_summary)} ${s(p.objectives)}`.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    const km = scope.match(/(\d{2,4})\s*(?:کیلومتر|km)/i)
    if (km && answers.projectType === 'pipeline') { answers.lengthKm = Number(km[1]); sources.lengthKm = 'شرح محدودهٔ پروژه' }
    if (/ایستگاه|station/i.test(scope) && /خط|pipeline/i.test(scope)) { answers.distinctScopes = true; sources.distinctScopes = 'شرح محدودهٔ پروژه' }
  }
  const risks: RegisterRisk[] = []
  const ids = ((rp.data ?? []) as Row[]).map((r) => r.id as string)
  if (ids.length) {
    const rr = await supabase.from('rm_risks').select('code, title, category, status, initial_probability, initial_impact').in('project_id', ids).not('status', 'in', '(closed,realized)')
    for (const r of (rr.data ?? []) as Row[]) {
      const fam = FAMILY_OF[s(r.category)]; if (!fam) continue
      const pr = Number(r.initial_probability), im = Number(r.initial_impact)
      if (pr >= 1 && pr <= 5 && im >= 1 && im <= 5) risks.push({ family: fam, probability: pr, impact: im, title: s(r.title), code: s(r.code) })
    }
    for (const [fam, key] of Object.entries(ANSWER_OF) as [RiskFamily, string][]) {
      const xs = risks.filter((r) => r.family === fam); if (!xs.length) continue
      answers[key] = Math.max(...xs.map((r) => r.probability)); sources[key] = `ماژول مدیریت ریسک (${xs.length.toLocaleString('fa-IR')} ریسک باز)`
    }
    const land = risks.filter((r) => r.family === 'permits')
    if (land.length) { answers.landRisk = Math.max(...land.map((r) => r.probability)); sources.landRisk = `ماژول مدیریت ریسک (${land.length.toLocaleString('fa-IR')} ریسک باز)` }
  }
  const contracts = ((fc.data ?? []) as Row[]).map((c) => ({ title: s(c.title), type: s(c.contract_type), value: c.contract_value == null ? null : Number(c.contract_value), currency: s(c.currency) }))
  return { answers, sources, risks, contracts, project: p }
}

// ── the narrative: the reporting service rephrases the engine's own findings; every sentence cites them
export async function narrate(items: { id: string; text: string }[]): Promise<{ sentences: NarrativeSentence[]; rejected: number } | { error: string }> {
  const ping = await supabase.functions.invoke('rp-narrate', { body: { task: 'ping' } }).catch(() => null)
  if (!(ping?.data as { available?: boolean } | null)?.available) return { error: 'سرویس جمله‌بندی هوشمند در این محیط پیکربندی نشده است؛ گزارش با متن خود موتور کامل است.' }
  const { data, error } = await supabase.functions.invoke('rp-narrate', { body: { task: 'narrate', items } })
  const d = data as { available?: boolean; sentences?: NarrativeSentence[]; rejected?: number; error?: string } | null
  if (error || !d?.available) return { error: error?.message ?? d?.error ?? 'بدون پاسخ' }
  const g = guardNarrative(d.sentences ?? [], items)
  return { sentences: g.accepted, rejected: (d.rejected ?? 0) + g.rejected.length }
}
export async function saveNarrative(versionId: string, n: { sentences: NarrativeSentence[]; rejected: number }) { chk(await supabase.rpc('ds_set_narrative', { p_version: versionId, p_narrative: n })) }

const ERR: Record<string, string> = {
  not_allowed: 'دسترسی این کار را ندارید (سطح دسترسی در «مدیریت کاربران»).', ds_locked: 'این مطالعه در جریان تصمیم یا تصویب‌شده است و تغییر نمی‌کند؛ برای بازبینی، تصویب‌کننده باید آن را بازگشایی کند.',
  ds_same_person: 'تصمیم‌گیرنده نباید همان کسی باشد که تحلیل را تهیه کرده است.', ds_rationale: 'برای این تصمیم نوشتن دلیل (دست‌کم یک جمله) الزامی است.',
  ds_rationale_indicative: 'تحلیل قطعی نیست (اطمینان کم یا گزینه‌های هم‌امتیاز)؛ تصویب آن با نوشتن دلیل مدیریتی ممکن است.', ds_no_method: 'روش اجرای تصویب‌شده را انتخاب کنید.',
  ds_bad_step: 'این مرحله اکنون مجاز نیست.', ds_no_version: 'ابتدا تحلیل را اجرا و نسخه را ثبت کنید.', ds_no_title: 'عنوان مطالعه را بنویسید.', ds_narrative_exists: 'متن هوشمند این نسخه پیش‌تر ثبت شده است.',
  ds_not_approved: 'فقط راهبرد تصویب‌شده به چرخهٔ عمر منتقل می‌شود.', ds_bad_strategy: 'راهبرد زمان‌بندی نامعتبر است.',
  ds_lifecycle_locked: 'برنامهٔ چرخهٔ عمر این پروژه تصویب، خط مبنا یا در حال اجراست؛ تغییر راهبرد آن باید از مسیر بازنگری در ماژول چرخهٔ عمر انجام شود.',
}
export function explain(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  for (const [k, v] of Object.entries(ERR)) if (m.includes(k)) return v
  return m
}
