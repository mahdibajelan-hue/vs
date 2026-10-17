import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { QUAL_COLS, WELDER_COLS, explainPersonError, mapQual, mapWelder, type PersonSig, type Welder, type WelderQual } from '../lib/personnel'
import type { PersonKind } from '../lib/personnelForms'

/** Qualification of welders and coating applicators (per project): introduction, test (WQT), signatures, card. Data lives in ex_welders / ex_welder_quals (shared with the Execution module, which only reads it). */
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Caps { me: string | null; admin: boolean; register: boolean; review: boolean; signers: Record<string, string> }
const fail = (what: string, error: { message: string } | null): boolean => {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${what}: ${explainPersonError(error.message)}`)
  return true
}
const norm = (v: string) => v.trim().toUpperCase().replace(/\s+/g, ' ')

interface State {
  projectId: string | null; loading: boolean; welders: Welder[]; quals: WelderQual[]; caps: Caps
  load: (projectId: string) => Promise<void>
  /** switch the project that permissions / signers / new people refer to (the register itself lists every project) */
  setProject: (projectId: string) => Promise<void>
  refresh: () => Promise<void>
  loadImages: (id: string) => Promise<void>
  saveWelder: (w: Partial<Welder> & { raw: string; kind?: PersonKind }) => Promise<string | null>
  saveQual: (q: Partial<WelderQual> & { welderId: string }) => Promise<string | null>
  sign: (entity: 'wqt' | 'card', id: string, slot: 'a' | 'b') => Promise<boolean>
  reopen: (entity: 'wqt' | 'card', id: string) => Promise<boolean>
  setSigners: (signers: Record<string, string>) => Promise<boolean>
}
const NO_CAPS: Caps = { me: null, admin: false, register: false, review: false, signers: {} }

export const usePersonnelStore = create<State>((set, get) => ({
  projectId: null, loading: false, welders: [], quals: [], caps: NO_CAPS,
  load: async (projectId) => {
    set({ projectId, loading: true, caps: NO_CAPS })
    await get().refresh()
    set({ loading: false })
  },
  setProject: async (projectId) => {
    if (get().projectId === projectId) return
    set({ projectId, caps: NO_CAPS })
    const { data, error } = await supabase.rpc('ex_personnel_caps', { p_project: projectId })
    if (get().projectId === projectId && !error && data) set({ caps: data as Caps })
  },
  refresh: async () => {
    const pid = get().projectId; if (!pid) return
    const [rw, rq, caps] = await Promise.all([supabase.from('ex_welders').select(WELDER_COLS), supabase.from('ex_welder_quals').select(QUAL_COLS), supabase.rpc('ex_personnel_caps', { p_project: pid })])
    if (get().projectId !== pid) return // another project was opened meanwhile
    if (!rw.error) { const old = new Map(get().welders.map((x) => [x.id, x])); set({ welders: ((rw.data ?? []) as unknown as Row[]).map((r) => mapWelder(r, old.get(r.id))) }) }
    if (!rq.error) set({ quals: ((rq.data ?? []) as unknown as Row[]).map(mapQual) })
    if (!caps.error && caps.data) set({ caps: caps.data as Caps })
    fail('بارگذاری صلاحیت جوشکاران', rw.error ?? rq.error)
  },
  loadImages: async (id) => {
    const { data, error } = await supabase.from('ex_welders').select('photo, card_sign_a, card_sign_b').eq('id', id).single()
    if (error || !data) return
    const d = data as unknown as { photo: string; card_sign_a: PersonSig | null; card_sign_b: PersonSig | null }
    set({ welders: get().welders.map((w) => (w.id === id ? { ...w, photo: d.photo ?? '', cardSignA: d.card_sign_a ?? w.cardSignA, cardSignB: d.card_sign_b ?? w.cardSignB } : w)) })
  },
  saveWelder: async (w) => {
    const projectId = get().projectId; if (!projectId) return null
    const key = norm(w.raw); if (!key) return null
    const common = { welder_raw: w.raw.trim(), full_name: w.fullName ?? '', national_id: w.nationalId ?? '', org_id: w.orgId ?? null, status: w.status ?? 'active', note: w.note ?? '' }
    const res = w.id
      ? await supabase.from('ex_welders').update({ ...common, ...(w.photo !== undefined ? { photo: w.photo } : {}), ...(w.card ? { card: w.card } : {}) }).eq('id', w.id).select('id').single()
      : await supabase.from('ex_welders').insert({ ...common, project_id: projectId, welder_key: key, kind: w.kind ?? 'welder', photo: w.photo ?? '', card: w.card ?? {} }).select('id').single()
    if (res.error?.code === '23505') { fail('ثبت (این نشانه یا شماره کارت قبلاً در پروژه ثبت شده است)', res.error); return null }
    if (fail('ثبت مشخصات', res.error)) return null
    const id = (res.data as { id: string }).id
    await get().refresh()
    if (w.photo !== undefined) set({ welders: get().welders.map((x) => (x.id === id ? { ...x, photo: w.photo as string } : x)) })
    return id
  },
  saveQual: async (q) => {
    const projectId = get().projectId; if (!projectId) return null
    const nz = (v: string | undefined) => { const x = Number(String(v ?? '').replace('٫', '.')); return String(v ?? '').trim() !== '' && Number.isFinite(x) ? x : null }
    const t = q.wqt ?? {}
    const owner = get().welders.find((x) => x.id === q.welderId)?.projectId ?? projectId
    const row = { project_id: owner, welder_id: q.welderId, wqt: t, wqt_no: t.wqtNo ?? '', process: t.process ?? t.sys ?? '', position: t.position ?? '', material_group: t.baseMat ?? '', thk_min: nz(t.thkMin), thk_max: nz(t.thkMax), issue_date: t.testDate || null }
    const res = q.id ? await supabase.from('ex_welder_quals').update(row).eq('id', q.id).select('id').single() : await supabase.from('ex_welder_quals').insert(row).select('id').single()
    if (fail('ثبت آزمون', res.error)) return null
    await get().refresh(); return (res.data as { id: string }).id
  },
  sign: async (entity, id, slot) => {
    const { error } = await supabase.rpc('ex_person_sign', { p_entity: entity, p_id: id, p_slot: slot })
    if (fail('امضا', error)) return false
    await get().refresh(); if (entity === 'card') await get().loadImages(id)
    return true
  },
  reopen: async (entity, id) => {
    const { error } = await supabase.rpc('ex_person_reopen', { p_entity: entity, p_id: id })
    if (fail('بازگشایی', error)) return false
    await get().refresh(); return true
  },
  setSigners: async (signers) => {
    const projectId = get().projectId; if (!projectId) return false
    const { error } = await supabase.rpc('ex_personnel_set_signers', { p_project: projectId, p_signers: signers })
    if (fail('تعیین امضاکنندگان', error)) return false
    await get().refresh(); return true
  },
}))
