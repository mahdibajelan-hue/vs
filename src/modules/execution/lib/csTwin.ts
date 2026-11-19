/**
 * Compressor-station digital twin — the plot plan coloured from the station registers.
 *
 * The drawing (cs_plot_shapes, migration 052) only says WHERE things are; WHAT state they are in always comes from the
 * registers (welds, spools, equipment, test packs, inspections), read «as of» a chosen day so the site can be replayed.
 * A station without a drawing gets an automatic layout from the registers' areas, which the team then drags into place.
 */
import { SPOOL_STAGES, equipmentEarned, inchDia, packReadiness, weldEarned, type CsEquipment, type CsInspection, type CsLine, type CsSpool, type CsTestPack, type CsWeld, type SpoolStage } from './csCore'

export type ShapeKind = 'site' | 'area' | 'equipment' | 'line' | 'label'
export interface PlotShape {
  id: string; projectId: string; kind: ShapeKind; refId: string | null; areaName: string; label: string
  x: number; y: number; w: number; h: number; rot: number; points: [number, number][]; z: number; note: string; archived: boolean
}
export type NewShape = Omit<PlotShape, 'id' | 'projectId' | 'archived'>
export interface Registers { lines: CsLine[]; spools: CsSpool[]; welds: CsWeld[]; equipment: CsEquipment[]; packs: CsTestPack[]; inspections: CsInspection[] }

// ── the registers as they stood on a day ─────────────────────────────────
const by = (d: string | null | undefined, asOf: string) => !!d && d <= asOf
/** every register row reduced to what had happened by `asOf` (dates after it are not yet done) */
export function asOf(r: Registers, day: string): Registers {
  return {
    lines: r.lines,
    welds: r.welds.map((w) => {
      const fit = by(w.fitupDate, day) ? w.fitupDate : null, weld = by(w.weldDate, day) ? w.weldDate : null
      const ndt = weld && by(w.ndtDate, day) ? w.ndtResult : 'pending'
      return { ...w, fitupDate: fit, weldDate: weld, ndtResult: ndt, ndtDate: ndt === 'pending' ? null : w.ndtDate }
    }),
    spools: r.spools.map((s) => {
      const stage = [...SPOOL_STAGES].reverse().find((st) => st !== 'planned' && by(s.stageDates[st], day)) ?? 'planned'
      return { ...s, stage: stage as SpoolStage }
    }),
    equipment: r.equipment.map((e) => ({ ...e, steps: Object.fromEntries(Object.entries(e.steps).filter(([, d]) => by(d, day))) })),
    packs: r.packs.map((p) => ({ ...p, status: by(p.reinstatedDate, day) ? 'reinstated' : by(p.testDate, day) ? 'tested' : p.status === 'ready' ? 'ready' : 'open' })),
    inspections: r.inspections.filter((i) => by(i.inspDate, day)),
  }
}
/** the first and last dates the registers know (the replay slider's range) */
export function dateRange(r: Registers): { from: string | null; to: string | null } {
  const ds: string[] = []
  for (const w of r.welds) for (const d of [w.fitupDate, w.weldDate, w.ndtDate]) if (d) ds.push(d)
  for (const s of r.spools) for (const d of Object.values(s.stageDates)) if (d) ds.push(d)
  for (const e of r.equipment) for (const d of Object.values(e.steps)) if (d) ds.push(d)
  for (const p of r.packs) for (const d of [p.testDate, p.reinstatedDate]) if (d) ds.push(d)
  ds.sort()
  return { from: ds[0] ?? null, to: ds.at(-1) ?? null }
}

// ── state of each item ───────────────────────────────────────────────────
export type ColorMode = 'progress' | 'welding' | 'testing' | 'quality'
export interface LineState { pct: number; welds: number; welded: number; accepted: number; rejected: number; waitingNdt: number; pack: CsTestPack | null; packState: 'none' | 'open' | 'ready' | 'tested' | 'reinstated'; spools: number; erected: number; issues: number }
export interface EqState { pct: number; next: string | null; issues: number }
export interface AreaState { pct: number; inchDia: number; equipment: number; lines: number; issues: number }
export interface TwinState { lines: Map<string, LineState>; equipment: Map<string, EqState>; areas: Map<string, AreaState>; overall: number }

/** per line / equipment / area state from (already as-of) registers */
export function twinState(r: Registers): TwinState {
  const packOf = new Map(r.packs.map((p) => [p.id, p]))
  const openIssues = (id: string) => r.inspections.filter((i) => i.subjectId === id && !i.archived && i.result === 'reject').length
  const lines = new Map<string, LineState>()
  for (const l of r.lines) {
    if (l.archived) continue
    const ws = r.welds.filter((w) => w.lineId === l.id && !w.archived)
    const tot = ws.reduce((n, w) => n + inchDia(w), 0)
    const earned = ws.reduce((n, w) => n + inchDia(w) * weldEarned(w, l.ndtPct >= 100), 0)
    const pack = l.testPackId ? packOf.get(l.testPackId) ?? null : null
    const ready = pack && (pack.status === 'open' || pack.status === 'ready') ? packReadiness(pack, r.lines, r.welds).ready : false
    const sp = r.spools.filter((s) => s.lineId === l.id && !s.archived)
    lines.set(l.id, {
      pct: tot ? earned / tot : 0, welds: ws.length, welded: ws.filter((w) => w.weldDate).length, accepted: ws.filter((w) => w.ndtResult === 'accept').length,
      rejected: ws.filter((w) => w.ndtResult === 'reject').length, waitingNdt: ws.filter((w) => w.weldDate && w.ndtResult === 'pending' && (l.ndtPct >= 100 || w.ndtSelected)).length,
      pack, packState: !pack ? 'none' : pack.status === 'tested' || pack.status === 'reinstated' ? pack.status : ready ? 'ready' : 'open',
      spools: sp.length, erected: sp.filter((s) => s.stage === 'erected').length,
      issues: ws.filter((w) => w.ndtResult === 'reject').length + openIssues(l.id) + sp.reduce((n, s) => n + openIssues(s.id), 0),
    })
  }
  const equipment = new Map<string, EqState>()
  for (const e of r.equipment) if (!e.archived) {
    const steps = ['set', 'level', 'grout', 'align', 'piping']
    equipment.set(e.id, { pct: equipmentEarned(e), next: steps.find((k) => !e.steps[k]) ?? null, issues: openIssues(e.id) })
  }
  // an area: inch-dia-weighted piping and the average of its equipment, weighted by how much of each it has
  const areas = new Map<string, AreaState>()
  const names = new Set([...r.lines.filter((l) => !l.archived).map((l) => l.area), ...r.equipment.filter((e) => !e.archived).map((e) => e.area)].filter(Boolean))
  let allW = 0, allE = 0
  for (const a of names) {
    const ls = r.lines.filter((l) => !l.archived && l.area === a), es = r.equipment.filter((e) => !e.archived && e.area === a)
    const id = ls.reduce((n, l) => n + r.welds.filter((w) => w.lineId === l.id && !w.archived).reduce((m, w) => m + inchDia(w), 0), 0)
    const pipe = id ? ls.reduce((n, l) => { const s = lines.get(l.id)!; return n + s.pct * r.welds.filter((w) => w.lineId === l.id && !w.archived).reduce((m, w) => m + inchDia(w), 0) }, 0) / id : null
    const eq = es.length ? es.reduce((n, e) => n + equipment.get(e.id)!.pct, 0) / es.length : null
    const pct = pipe != null && eq != null ? (pipe + eq) / 2 : pipe ?? eq ?? 0
    areas.set(a, { pct, inchDia: id, equipment: es.length, lines: ls.length, issues: ls.reduce((n, l) => n + (lines.get(l.id)?.issues ?? 0), 0) + es.reduce((n, e) => n + (equipment.get(e.id)?.issues ?? 0), 0) })
    allW += pct; allE++
  }
  return { lines, equipment, areas, overall: allE ? allW / allE : 0 }
}

// ── colours ─────────────────────────────────────────────────────────────
/** 0 → slate, then amber → green as the work completes (readable on the dark and light themes) */
export function progressColor(p: number): string {
  if (p <= 0) return '#64748b'
  if (p >= 0.999) return '#10b981'
  const h = 32 + (150 - 32) * p // amber → green
  return `hsl(${Math.round(h)} 78% 48%)`
}
export const PACK_COLOR: Record<LineState['packState'], string> = { none: '#64748b', open: '#f59e0b', ready: '#38bdf8', tested: '#10b981', reinstated: '#14b8a6' }
export function lineColor(s: LineState | undefined, mode: ColorMode): string {
  if (!s) return '#64748b'
  if (mode === 'testing') return PACK_COLOR[s.packState]
  if (mode === 'quality') return s.issues ? '#ef4444' : s.waitingNdt ? '#f59e0b' : s.welded ? '#10b981' : '#64748b'
  if (mode === 'welding') return s.rejected ? '#ef4444' : !s.welds ? '#64748b' : s.welded === s.welds && !s.waitingNdt ? '#10b981' : s.welded ? '#f59e0b' : '#94a3b8'
  return progressColor(s.pct)
}
export function eqColor(s: EqState | undefined, mode: ColorMode): string {
  if (!s) return '#64748b'
  if (mode === 'quality') return s.issues ? '#ef4444' : '#10b981'
  if (mode === 'testing' || mode === 'welding') return s.pct >= 0.999 ? '#10b981' : '#64748b'
  return progressColor(s.pct)
}

// ── automatic layout ────────────────────────────────────────────────────
/**
 * A first drawing from the registers: one block per area (laid out in a grid), the area's equipment as footprints along
 * its top and its lines as horizontal runs under them. Only what has no shape yet is placed; nothing drawn is moved.
 */
export function autoLayout(r: Registers, existing: PlotShape[]): NewShape[] {
  const live = existing.filter((s) => !s.archived)
  const hasRef = new Set(live.filter((s) => s.refId).map((s) => `${s.kind}:${s.refId}`))
  const hasArea = new Set(live.filter((s) => s.kind === 'area').map((s) => s.areaName))
  const eqs = r.equipment.filter((e) => !e.archived), lns = r.lines.filter((l) => !l.archived)
  const names = [...new Set([...eqs.map((e) => e.area || 'بدون ناحیه'), ...lns.map((l) => l.area || 'بدون ناحیه')])].sort((a, b) => a.localeCompare(b, 'fa'))
  const out: NewShape[] = []
  const base = { rot: 0, note: '', label: '', areaName: '', refId: null as string | null, points: [] as [number, number][], z: 0 }
  const cols = Math.max(1, Math.ceil(Math.sqrt(names.length)))
  const AW = 60, GAP = 12
  const sizeOf = (a: string) => {
    const ne = eqs.filter((e) => (e.area || 'بدون ناحیه') === a).length, nl = lns.filter((l) => (l.area || 'بدون ناحیه') === a).length
    return { ne, nl, h: 14 + Math.ceil(ne / 4) * 14 + Math.min(nl, 24) * 2.2 + 8 }
  }
  const rows: number[] = []
  names.forEach((a, i) => { const r0 = Math.floor(i / cols); rows[r0] = Math.max(rows[r0] ?? 0, sizeOf(a).h) })
  const rowY = rows.map((_, i) => GAP + rows.slice(0, i).reduce((n, h) => n + h + GAP, 0))
  names.forEach((a, i) => {
    const c = i % cols, r0 = Math.floor(i / cols)
    const x = GAP + c * (AW + GAP), y = rowY[r0], h = rows[r0]
    if (!hasArea.has(a)) out.push({ ...base, kind: 'area', areaName: a, label: a, x, y, w: AW, h, z: 0 })
    eqs.filter((e) => (e.area || 'بدون ناحیه') === a).forEach((e, k) => {
      if (hasRef.has(`equipment:${e.id}`)) return
      const big = /compressor|driver/.test(e.kind)
      out.push({ ...base, kind: 'equipment', refId: e.id, areaName: a, label: e.tag, x: x + 3 + (k % 4) * 14.2, y: y + 10 + Math.floor(k / 4) * 14, w: big ? 12.5 : 10, h: big ? 10 : 8, z: 2 })
    })
    const ty = y + 12 + Math.ceil(eqs.filter((e) => (e.area || 'بدون ناحیه') === a).length / 4) * 14
    lns.filter((l) => (l.area || 'بدون ناحیه') === a).slice(0, 24).forEach((l, k) => {
      if (hasRef.has(`line:${l.id}`)) return
      const ly = ty + k * 2.2
      out.push({ ...base, kind: 'line', refId: l.id, areaName: a, label: l.lineNo, x: 0, y: 0, w: 0, h: 0, points: [[x + 4, ly], [x + AW - 4, ly]], z: 1 })
    })
  })
  if (!live.some((s) => s.kind === 'site')) {
    const w = GAP + cols * (AW + GAP), h = rowY.length ? rowY[rowY.length - 1] + rows[rows.length - 1] + GAP : 100
    out.unshift({ ...base, kind: 'site', label: 'محدودهٔ ایستگاه', x: 0, y: 0, w: Math.max(w, 80), h: Math.max(h, 60), z: -1 })
  }
  return out
}
/** the drawing's extent (site, or every shape) for the initial view */
export function extentOf(shapes: PlotShape[]): { x: number; y: number; w: number; h: number } {
  const live = shapes.filter((s) => !s.archived)
  const site = live.find((s) => s.kind === 'site')
  if (site) return { x: site.x, y: site.y, w: site.w, h: site.h }
  const xs: number[] = [], ys: number[] = []
  for (const s of live) { if (s.kind === 'line') for (const [px, py] of s.points) { xs.push(px); ys.push(py) } else { xs.push(s.x, s.x + s.w); ys.push(s.y, s.y + s.h) } }
  if (!xs.length) return { x: 0, y: 0, w: 100, h: 70 }
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x: x - 5, y: y - 5, w: Math.max(...xs) - x + 10, h: Math.max(...ys) - y + 10 }
}
