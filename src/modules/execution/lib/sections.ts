import { registerKey } from './registers'

/**
 * Sections (سکشن) of a pipeline: the line is laid into the trench section by section — about 1000 m, under 100 joints.
 * Each section is fitted-up, welded, radiographed and coated on its own; once every operation is accepted it is
 * lowered. Its two ends stay open for the radiography crawler and are joined later (tie-in), so a fit-up never joins
 * two sections.
 *
 * Sections are a fixed grid on the chainage (from `startKm`, every `lengthM`): a pipe belongs to the section its start
 * lies in. The number never changes whatever order the pipes are strung or fitted in.
 */
export interface SectionPlan { startKm: number; lengthM: number; maxJoints: number }
export const DEFAULT_SECTION_PLAN: SectionPlan = { startKm: 0, lengthM: 1000, maxJoints: 100 }

export const sectionOf = (km: number, plan: SectionPlan): number => Math.max(1, Math.floor(((km - plan.startKm) * 1000 + 1e-6) / plan.lengthM) + 1)
export const sectionRange = (sec: number, plan: SectionPlan) => ({ fromKm: plan.startKm + ((sec - 1) * plan.lengthM) / 1000, toKm: plan.startKm + (sec * plan.lengthM) / 1000 })

export interface StrungPipe { key: string; raw: string; km: number; lengthM: number; thkIn: number | null; odIn: number | null }
/** a fit-up already recorded (another report, or a row of the one being written: `mine`) */
export interface JointRec { before: string; after: string; sec: string; no: string; mine?: boolean; welded?: boolean; rtOk?: boolean; rtRep?: boolean; coated?: boolean }

export type SlotKind = 'free' | 'done' | 'mine' | 'boundary' | 'gap' | 'blocked'
/** the place between two strung pipes, in chainage order: where a joint is (or can be) made */
export interface Slot { before: StrungPipe; after: StrungPipe; km: number; sec: number; kind: SlotKind; joint?: JointRec; suggested?: boolean; why?: string }
export interface SectionView {
  sec: number; fromKm: number; toKm: number; pipes: StrungPipe[]; slots: Slot[]
  stats: { slots: number; fitted: number; welded: number; rtOk: number; coated: number; ready: boolean }
}

/** the strung line cut into sections: pipes in chainage order and, between neighbours, the joint slots */
export function lineSections(pipes: StrungPipe[], joints: JointRec[], plan: SectionPlan): SectionView[] {
  const sorted = [...pipes].sort((a, b) => a.km - b.km)
  const byPair = new Map<string, JointRec>(), usedAsBefore = new Set<string>(), usedAsAfter = new Set<string>()
  for (const j of joints) { byPair.set(`${j.before}|${j.after}`, j); usedAsBefore.add(j.before); usedAsAfter.add(j.after) }
  const out = new Map<number, SectionView>()
  const view = (sec: number) => { let v = out.get(sec); if (!v) { const r = sectionRange(sec, plan); v = { sec, ...r, pipes: [], slots: [], stats: { slots: 0, fitted: 0, welded: 0, rtOk: 0, coated: 0, ready: false } }; out.set(sec, v) } return v }
  sorted.forEach((p, i) => {
    const sec = sectionOf(p.km, plan)
    view(sec).pipes.push(p)
    const next = sorted[i + 1]
    if (!next) return
    const nsec = sectionOf(next.km, plan)
    const gapM = (next.km - p.km) * 1000 - p.lengthM
    const joint = byPair.get(`${p.key}|${next.key}`)
    let kind: SlotKind, why: string | undefined
    if (joint) kind = joint.mine ? 'mine' : 'done'
    else if (nsec !== sec) { kind = 'boundary'; why = 'انتهای سکشن — برای ورود کرالر باز می‌ماند (تای‌این بعدی)' }
    else if (Math.abs(gapM) > 3) { kind = 'gap'; why = gapM > 0 ? `فاصلهٔ ${Math.round(gapM)} متری — لولهٔ میانی ریسه نشده` : 'هم‌پوشانی کیلومتر ریسه — کیلومتر لوله‌ها را بررسی کنید' }
    else if (usedAsBefore.has(p.key) || usedAsAfter.has(next.key)) { kind = 'blocked'; why = 'یکی از سرهای این دو لوله در سرجوش دیگری به کار رفته' }
    else kind = 'free'
    view(sec).slots.push({ before: p, after: next, km: next.km, sec, kind, joint, why })
  })
  for (const v of out.values()) {
    const inner = v.slots.filter((s) => s.kind !== 'boundary' && s.kind !== 'gap')
    const js = v.slots.filter((s) => s.joint).map((s) => s.joint!)
    v.stats = { slots: inner.length, fitted: js.length, welded: js.filter((j) => j.welded).length, rtOk: js.filter((j) => j.rtOk).length, coated: js.filter((j) => j.coated).length, ready: false }
    // ready for lowering: every joint inside the section made, welded, passed by radiography and coated
    v.stats.ready = v.stats.slots > 0 && v.stats.fitted === v.stats.slots && js.every((j) => j.welded && j.rtOk && j.coated)
    // the guide: free slots next to a joint already made (the fit-up front), else the first free slot of the section
    const free = v.slots.filter((s) => s.kind === 'free')
    for (let i = 0; i < v.slots.length; i++) {
      const s = v.slots[i]; if (s.kind !== 'free') continue
      const near = [v.slots[i - 1], v.slots[i + 1]].some((n) => n && (n.kind === 'done' || n.kind === 'mine'))
      if (near) s.suggested = true
    }
    if (free.length && !free.some((s) => s.suggested)) free[0].suggested = true
  }
  return [...out.values()].sort((a, b) => a.sec - b.sec)
}

/**
 * The next joint numbers of a section, in the project's own style: «J-0045» after «J-0044», «12» after «11». A section
 * without joints yet starts at 1, written like the project's other joints (prefix and zero padding).
 */
export function nextJointNos(sec: string, count: number, joints: { sec: string; no: string }[]): string[] {
  const pat = /^(.*?)(\d+)$/
  const inSec = joints.filter((j) => registerKey(j.sec) === registerKey(sec)).map((j) => pat.exec(j.no.trim())).filter((m): m is RegExpExecArray => !!m)
  const sample = inSec[inSec.length - 1] ?? joints.map((j) => pat.exec(j.no.trim())).find((m): m is RegExpExecArray => !!m)
  const prefix = sample ? sample[1] : '', width = sample ? sample[2].length : 0
  let n = inSec.reduce((mx, m) => Math.max(mx, Number(m[2])), 0)
  const taken = new Set(joints.filter((j) => registerKey(j.sec) === registerKey(sec)).map((j) => registerKey(j.no)))
  const out: string[] = []
  while (out.length < count) { n++; const no = `${prefix}${String(n).padStart(width, '0')}`; if (!taken.has(registerKey(no))) out.push(no) }
  return out
}

/** the fit-up rows a pick adds: section, joint number, the two pipes and the facts of the pipe after the joint */
export function fitupRows(slots: Slot[], joints: { sec: string; no: string }[]): Record<string, unknown>[] {
  const bySec = new Map<number, Slot[]>()
  for (const s of slots) bySec.set(s.sec, [...(bySec.get(s.sec) ?? []), s])
  const out: { km: number; row: Record<string, unknown> }[] = []
  for (const [sec, ss] of bySec) {
    const nos = nextJointNos(String(sec), ss.length, joints)
    ss.sort((a, b) => a.km - b.km).forEach((s, i) => out.push({ km: s.km, row: { sec: String(sec), jointNo: nos[i], pipeNo2: s.before.raw, pipeNo: s.after.raw,
      ...(s.after.lengthM ? { lengthM: s.after.lengthM } : {}), ...(s.after.thkIn != null ? { thkIn: s.after.thkIn } : {}), ...(s.after.odIn != null ? { sizeIn: s.after.odIn } : {}) } }))
  }
  return out.sort((a, b) => a.km - b.km).map((x) => x.row)
}

/** a joint number typed on a later form (welding, radiography, coating, lowering): its section, when the fit-up records name one */
export function sectionOfJoint(no: unknown, joints: { sec: string; no: string }[]): string | null {
  const k = registerKey(no); if (!k) return null
  const secs = [...new Set(joints.filter((j) => registerKey(j.no) === k && j.sec).map((j) => j.sec))]
  return secs.length === 1 ? secs[0] : null
}
