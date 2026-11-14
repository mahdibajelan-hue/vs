import * as repo from '../repo'
import { train, type Model, type Sample } from './learn'

/** the learning record, read once per visit and refreshed after each new decision */
let cache: Promise<repo.AiSample[]> | null = null
export const aiSamples = (fresh = false): Promise<repo.AiSample[]> => { if (!cache || fresh) cache = repo.loadAiSamples().catch(() => []); return cache }
export async function recordAi(row: Record<string, unknown>) { await repo.addAiSample(row); cache = null }
export const toSamples = (rows: repo.AiSample[]): Sample[] => rows.filter((r) => r.feats && r.action !== 'missed').map((r) => ({ f: r.feats!, real: r.action !== 'dismissed', code: r.action === 'dismissed' ? null : r.finalCode }))
export async function currentModel(): Promise<{ model: Model | null; decisions: number }> { const s = toSamples(await aiSamples()); return { model: train(s), decisions: s.length } }
export const iou = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)), i = x * y
  return i / Math.max(1e-9, a.w * a.h + b.w * b.h - i)
}
