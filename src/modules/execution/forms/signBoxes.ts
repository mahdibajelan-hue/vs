import { addr, type GridTemplate } from './gridTypes.ts'

/** which of the four standard signatures a sheet's caption names: 0 prepares · 1 site manager · 2 specialist supervisor · 3 head of supervision */
export function signRoleOf(text: string): number | null {
  const t = text.replace(/\s+/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  if (/سرپرست\s*(دستگاه\s*)?نظارت|رئیس\s*نظارت/.test(t)) return 3
  if (/بررسی|ناظر/.test(t)) return 2
  if (/سرپرست\s*کارگاه|رئیس\s*کارگاه/.test(t)) return 1
  if (/تهیه|دفتر\s*فنی/.test(t)) return 0
  return null
}

/**
 * The signature boxes an approved sheet already has: a caption cell naming the signer («تهیه کننده: مسئول دفتر فنی»,
 * «بررسی کننده: ناظر مرتبط» …) with an empty box right under it. Each box gets the slot of the same order (slots sorted by
 * their signing order). Returns cell address → slot key, only when EVERY slot found its box — otherwise {} and the paper
 * prints its own row of signature boxes instead, so no signature is ever left out.
 */
export function sheetSignCells(tpl: GridTemplate, slotKeys: string[]): Record<string, string> {
  if (!slotKeys.length) return {}
  const at = new Map(tpl.cells.map((c) => [`${c.r},${c.c}`, c]))
  const found = new Map<number, string>()
  for (const c of tpl.cells) {
    const role = c.v ? signRoleOf(c.v) : null
    if (role == null || found.has(role)) continue
    const below = at.get(`${c.r + (c.rs ?? 1)},${c.c}`)
    if (below && !(below.v ?? '').trim()) found.set(role, addr(below.r, below.c))
  }
  // the slots in order map to roles 0..n-1 (two slots → the contractor's two; four → all four)
  const out: Record<string, string> = {}
  for (let i = 0; i < slotKeys.length; i++) { const a = found.get(i); if (!a) return {}; out[a] = slotKeys[i] }
  return out
}
