import { create } from 'zustand'
import { loadTwin, type TwinSettings } from '../../pipelinedigitaltwin/repo'
import { elevAt, hasRealProfile, profileOf, rangesOfJoints, smysOf, type HtParams, type HtStage, type ProfilePoint, type SectionPlan } from '../lib/htCore'
import * as repo from '../repo'
import { DEFAULT_HT_SETTINGS, type CtDefect, type CtRecord, type CtTest, type FormKind, type HtEvent, type HtForm, type HtPack, type HtReading, type HtSection, type HtSettings, type ReadingInput, type TargetKind } from '../repo'
import { igsOf, PSI_PER_BAR, testLimits, type IgsParams, type WallPart } from '../lib/igs'

/** where the elevation profile came from */
export type ProfileSource = 'land' | 'twin' | 'table' | null

/**
 * Hydrotest + coating tests of the project in context. The line itself (route, profile, pipe spec, valves, which joints are
 * backfilled / coated) is read from the digital twin's data, so this module never keeps its own copy of the pipe.
 */
interface State {
  projectId: string | null
  loading: boolean
  error: string | null
  flash: string | null
  // the line, from the twin
  pipe: TwinSettings | null
  startKm: number
  routeKm: number
  profile: ProfilePoint[]
  profileSource: ProfileSource
  profileName: string | null
  /** valves, stations, pig traps: where a section should preferably end */
  preferredKm: { km: number; tag: string }[]
  backfilled: [number, number][]
  coated: [number, number][]
  stations: string[]
  // this module
  settings: HtSettings
  sections: HtSection[]
  packs: HtPack[]
  readings: HtReading[]
  events: HtEvent[]
  records: CtRecord[]
  defects: CtDefect[]
  forms: HtForm[]
  ctTests: CtTest[]

  load: (pid: string) => Promise<void>
  params: () => HtParams | null
  /** the project's IGS procedure parameters (defaults filled in) */
  igs: () => IgsParams
  saveSettings: (x: HtSettings, by: string) => Promise<boolean>
  savePlan: (plan: SectionPlan[], by: string) => Promise<boolean>
  patchSection: (id: string, p: { plannedDate?: string | null; note?: string; wallMix?: WallPart[] | null; weldFrom?: string; weldTo?: string; elevStart?: number; elevEnd?: number; headElev?: number }) => Promise<boolean>
  saveForm: (kind: TargetKind, id: string, f: { kind: FormKind; data: Record<string, unknown>; result: HtForm['result']; at: string | null }, by: string) => Promise<boolean>
  setStage: (kind: TargetKind, id: string, stage: HtStage, failed: boolean, note: string, by: string) => Promise<boolean>
  addReading: (kind: TargetKind, id: string, x: ReadingInput, by: string) => Promise<boolean>
  savePack: (x: Partial<HtPack> & { code: string; designPressureBar: number; testPressureBar: number }, by: string) => Promise<HtPack | null>
  deletePack: (id: string) => Promise<boolean>
  addRecord: (x: Omit<CtRecord, 'id' | 'by'>, by: string) => Promise<CtRecord | null>
  addDefect: (x: Omit<CtDefect, 'id' | 'by' | 'status' | 'repairedAt'>, by: string) => Promise<boolean>
  setDefect: (id: string, status: CtDefect['status']) => Promise<boolean>
  saveCtTest: (x: Omit<CtTest, 'id' | 'by' | 'updatedAt'> & { id?: string }, by: string) => Promise<CtTest | null>
}

const msg = (e: unknown) => (e as { message?: string })?.message ?? 'خطای نامشخص'

export const useTestingStore = create<State>()((set, get) => {
  const run = async (f: () => Promise<void>, done?: string) => {
    try { await f(); if (done) set({ flash: done }); return true } catch (e) { set({ error: msg(e) }); return false }
  }
  return {
    projectId: null, loading: false, error: null, flash: null,
    pipe: null, startKm: 0, routeKm: 0, profile: [], profileSource: null, profileName: null, preferredKm: [], backfilled: [], coated: [], stations: [],
    settings: DEFAULT_HT_SETTINGS, sections: [], packs: [], readings: [], events: [], records: [], defects: [], forms: [], ctTests: [],

    load: async (pid) => {
      set({ loading: get().projectId !== pid, projectId: pid, error: null })
      try {
        const [tw, ht] = await Promise.all([loadTwin(pid), repo.loadTesting(pid)])
        const fromRoute = profileOf(tw.points, tw.startKm)
        const routeHas = hasRealProfile(fromRoute)
        const table = ht.settings.profile ?? []
        const profile = routeHas ? fromRoute : table
        const L = tw.settings.stockLengthM
        const kmLen = fromRoute.length ? fromRoute[fromRoute.length - 1].km - tw.startKm : (table.length ? table[table.length - 1].km - table[0].km : 0)
        set({
          loading: false, pipe: tw.settings, startKm: tw.startKm, routeKm: tw.points.length >= 2 ? kmLen : 0,
          profile, profileSource: routeHas ? (tw.routeOrigin === 'land' ? 'land' : 'twin') : table.length >= 2 ? 'table' : null,
          profileName: routeHas ? tw.routeName : ht.settings.profileName,
          preferredKm: tw.assets.filter((a) => a.kind === 'valve' || a.kind === 'station' || a.kind === 'launcher').map((a) => ({ km: a.km, tag: a.tag })),
          backfilled: rangesOfJoints(tw.rows.filter((r) => r.backfill === 'completed').map((r) => r.joint_no), L, tw.startKm),
          coated: rangesOfJoints(tw.rows.filter((r) => r.coating === 'completed').map((r) => r.joint_no), L, tw.startKm),
          stations: tw.assets.filter((a) => a.kind === 'station').map((a) => a.tag),
          ...ht,
          // sections saved before the point elevations were kept: their start / end / test-head elevations from the profile
          sections: ht.sections.map((x) => {
            if (!Number.isNaN(x.elevStart) && !Number.isNaN(x.elevEnd) && !Number.isNaN(x.headElev)) return x
            const has = profile.length >= 2
            const es = Number.isNaN(x.elevStart) ? (has ? elevAt(profile, x.kmFrom) : x.elevMin) : x.elevStart
            const ee = Number.isNaN(x.elevEnd) ? (has ? elevAt(profile, x.kmTo) : x.elevMin) : x.elevEnd
            return { ...x, elevStart: es, elevEnd: ee, headElev: Number.isNaN(x.headElev) ? Math.min(es, ee) : x.headElev }
          }),
        })
      } catch (e) {
        set({ loading: false, error: /ht_|ct_|relation|schema cache/i.test(msg(e)) ? 'جدول‌های ماژول آزمایش‌ها ساخته نشده‌اند (supabase/testing/001_testing.sql).' : msg(e) })
      }
    },
    /** the sectioning inputs: the pipe from the twin, the test rules from the settings */
    params: () => {
      const p = get().pipe, x = get().settings
      if (!p) return null
      const smys = x.smysOverride ?? smysOf(p.material)
      if (!smys) return null
      const g = get().igs()
      return { odMm: p.diameterIn * 25.4, wtMm: p.wallMm, smysMpa: smys, designPressureBar: p.designPressureBar, testFactor: x.testFactor, maxHoopPct: x.maxHoopPct, maxSectionKm: x.method === 'igs' ? g.maxSectionKm : x.maxSectionKm, minSectionKm: x.minSectionKm, density: x.density, igs: x.method === 'igs' ? (() => { const l = testLimits(p.diameterIn, smys * 145.038, p.wallMm / 25.4, p.designPressureBar * PSI_PER_BAR, g); return { strengthPct: l.lowPct, minHighPct: l.highMinPct, gBarPerM: g.psiPerM / PSI_PER_BAR } })() : undefined }
    },
    saveSettings: async (x, by) => {
      const pid = get().projectId
      if (!pid) return false
      return run(async () => { await repo.saveSettings(pid, x, by); await get().load(pid) }, 'تنظیمات ذخیره شد')
    },
    savePlan: async (plan, by) => {
      const pid = get().projectId
      if (!pid) return false
      if (get().sections.some((s) => s.stage !== 'planned' || s.failed)) { set({ error: 'آزمون بعضی قطعه‌ها شروع شده است؛ قطعه‌بندی را دیگر نمی‌توان جایگزین کرد.' }); return false }
      return run(async () => { await repo.replacePlan(pid, plan, by); await get().load(pid) }, `${plan.length.toLocaleString('fa-IR')} قطعه ذخیره شد`)
    },
    igs: () => igsOf(get().settings.igs),
    saveForm: (kind, id, f, by) => run(async () => {
      const r = await repo.saveForm(get().projectId!, kind, id, f, by)
      set({ forms: [...get().forms.filter((x) => !(x.targetId === id && x.kind === f.kind)), r] })
    }, f.result === 'pass' ? 'صورتجلسه ذخیره شد — قبول' : f.result === 'fail' ? 'صورتجلسه ذخیره شد — مردود' : 'صورتجلسه ذخیره شد'),
    patchSection: (id, p) => run(async () => {
      await repo.patchTarget('section', id, {
        ...(p.plannedDate !== undefined ? { planned_date: p.plannedDate } : {}), ...(p.note !== undefined ? { note: p.note } : {}),
        ...(p.wallMix !== undefined ? { wall_mix: p.wallMix } : {}), ...(p.weldFrom !== undefined ? { weld_from: p.weldFrom } : {}), ...(p.weldTo !== undefined ? { weld_to: p.weldTo } : {}),
        ...(p.elevStart !== undefined ? { elev_start: p.elevStart } : {}), ...(p.elevEnd !== undefined ? { elev_end: p.elevEnd } : {}), ...(p.headElev !== undefined ? { head_elev: p.headElev } : {}),
      })
      set({ sections: get().sections.map((s) => (s.id === id ? { ...s, ...p } : s)) })
    }),
    setStage: (kind, id, stage, failed, note, by) => run(async () => {
      const pid = get().projectId!
      await repo.patchTarget(kind, id, { stage, failed, failed_note: failed ? note : '' })
      const ev = await repo.logEvent(pid, kind, id, stage, failed, note, by)
      const up = <T extends { id: string }>(l: T[]) => l.map((x) => (x.id === id ? { ...x, stage, failed, failedNote: failed ? note : '' } : x))
      set({ sections: kind === 'section' ? up(get().sections) : get().sections, packs: kind === 'pack' ? up(get().packs) : get().packs, events: [ev, ...get().events] })
    }, failed ? 'مردودی ثبت شد' : 'مرحله ثبت شد'),
    addReading: (kind, id, x, by) => run(async () => {
      const r = await repo.addReading(get().projectId!, kind, id, x, by)
      set({ readings: [...get().readings, r].sort((a, b) => a.at.localeCompare(b.at)) })
    }, 'قرائت ثبت شد'),
    savePack: async (x, by) => {
      try { const p = await repo.savePack(get().projectId!, x, by); set({ packs: [...get().packs.filter((q) => q.id !== p.id), p].sort((a, b) => a.code.localeCompare(b.code)), flash: 'بستهٔ آزمون ذخیره شد' }); return p }
      catch (e) { set({ error: /duplicate|unique/i.test(msg(e)) ? 'این کد بسته قبلاً ثبت شده است.' : msg(e) }); return null }
    },
    deletePack: (id) => run(async () => { await repo.deletePack(id); set({ packs: get().packs.filter((p) => p.id !== id) }) }),
    addRecord: async (x, by) => {
      try { const r = await repo.addRecord(get().projectId!, x, by); set({ records: [r, ...get().records], flash: 'آزمون پوشش ثبت شد' }); return r }
      catch (e) { set({ error: msg(e) }); return null }
    },
    addDefect: (x, by) => run(async () => { const d = await repo.addDefect(get().projectId!, x, by); set({ defects: [...get().defects, d].sort((a, b) => a.km - b.km) }) }, 'عیب ثبت شد'),
    saveCtTest: async (x, by) => {
      try { const r = await repo.saveCtTest(get().projectId!, x, by); set({ ctTests: [r, ...get().ctTests.filter((t) => t.id !== r.id)], flash: r.result === 'pass' ? 'بازرسی پوشش ذخیره شد — قبول' : r.result === 'fail' ? 'بازرسی پوشش ذخیره شد — مردود' : 'بازرسی پوشش ذخیره شد' }); return r }
      catch (e) { set({ error: /ct_tests|relation|schema cache/i.test(msg(e)) ? 'جدول بازرسی پوشش ساخته نشده است (supabase/testing/004_coating_qc.sql).' : msg(e) }); return null }
    },
    setDefect: (id, status) => run(async () => { const d = await repo.setDefect(id, status); set({ defects: get().defects.map((x) => (x.id === id ? d : x)) }) }),
  }
})
