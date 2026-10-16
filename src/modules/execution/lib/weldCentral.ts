import { SHARED } from './weldProfile'
import { weldKey } from './welds'

/** The central record of a weld holds the facts every form of that weld shows (pipe, size, thickness, joint length, bend angle). A technical form READS them from there; rows never carry their own copy once the central record has the value.
 *  Pure helpers: which central attribute a form field shows, and how a row looks with the central values laid over it. */
export type Attr = 'pipe' | 'size' | 'thk' | 'length' | 'bend'
export type Central = Partial<Record<Attr, string>>
export const attrOfKey = (formKey: string, key: string): Attr | null => { for (const s of SHARED) if (s.keys.includes(key) && (!s.forms || s.forms.includes(formKey))) return s.attr as Attr; return null }
export const ATTR_LABEL: Record<Attr, string> = Object.fromEntries(SHARED.map((s) => [s.attr, s.label])) as Record<Attr, string>

/** `detail` with every shared field replaced by the central value (when the central record has one). */
export function overlayDetail(formKey: string, detail: Record<string, unknown>, central: Central | undefined): Record<string, unknown> {
  if (!central) return detail
  let out = detail
  for (const s of SHARED) {
    const v = central[s.attr as Attr]; if (!v || (s.forms && !s.forms.includes(formKey))) continue
    const key = s.keys.find((k) => k in detail) ?? s.keys[0]
    if (out === detail) out = { ...detail }
    out[key] = v
  }
  return out
}
export const centralKey = (detail: Record<string, unknown>): string | null => weldKey(detail.sec, detail.weldNo ?? detail.jointNo)
