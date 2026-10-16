/** One weld, one set of facts. The facts that every form of a weld repeats (pipe number, size, thickness, joint length, bend angle) are entered where the weld first appears; every later form of the same weld gets them offered from here instead of being typed again.
 *  The profile is DERIVED from the saved rows (latest date wins) — nothing is stored twice and no row is ever rewritten by it. */
export interface ProfileLine { formKey: string; date: string; detail: Record<string, unknown> }
export interface Fact { value: string; from: string; date: string }
export type Profile = Partial<Record<'pipe' | 'size' | 'thk' | 'length' | 'bend', Fact>>
const JOINT_FORMS = ['fitup', 'welding', 'tie_in']
export const SHARED: { attr: keyof Profile; label: string; keys: string[]; forms?: string[] }[] = [
  { attr: 'pipe', label: 'شمارهٔ لوله', keys: ['pipeNo'] },
  { attr: 'size', label: 'قطر (in)', keys: ['sizeIn', 'odIn', 'diaIn'] },
  { attr: 'thk', label: 'ضخامت (in)', keys: ['thkIn'] },
  { attr: 'length', label: 'طول (m)', keys: ['lengthM'], forms: JOINT_FORMS },
  { attr: 'bend', label: 'زاویه خم', keys: ['bendDeg'], forms: JOINT_FORMS },
]
const filled = (v: unknown) => v != null && String(v).trim() !== '' && String(v).trim() !== '0'

export function buildProfile(lines: ProfileLine[]): Profile {
  const out: Profile = {}
  const sorted = [...lines].sort((a, b) => a.date.localeCompare(b.date))
  for (const l of sorted) for (const s of SHARED) {
    if (s.forms && !s.forms.includes(l.formKey)) continue
    const k = s.keys.find((x) => filled(l.detail[x])); if (!k) continue
    out[s.attr] = { value: String(l.detail[k]).trim(), from: l.formKey, date: l.date }
  }
  return out
}

/** What may be filled into a row of `formKey` whose columns are `columns`: only EMPTY fields, only facts the profile knows. */
export function fillPatch(formKey: string, columns: ReadonlySet<string>, detail: Record<string, unknown>, profile: Profile): Record<string, string> {
  const patch: Record<string, string> = {}
  for (const s of SHARED) {
    const fact = profile[s.attr]; if (!fact) continue
    if (s.forms && !s.forms.includes(formKey)) continue
    const key = s.keys.find((k) => columns.has(k)); if (!key) continue
    if (!filled(detail[key])) patch[key] = fact.value
  }
  return patch
}
