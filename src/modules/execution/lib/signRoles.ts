import type { SignParty } from '../epcTypes'

/** Signing roles of a project (e.g. «مسئول دفتر فنی» prepares, «سرپرست کارگاه» approves, «ناظر مربوطه» reviews, «سرپرست دستگاه نظارت» approves): defined once with the person and the forms they sign.
 *  The per-form signature slots used by the database (ex_sign_slots) are DERIVED from them. */
export interface SignRole {
  key: string; label: string; party: SignParty; userId: string | null; sort: number; required: boolean; forms: string[]
  /** a specialist-supervisor role: the signer depends on the form's supervision discipline (weld inspector for welding,
   *  film interpreter for radiography, civil inspector for earthwork …) — discipline key → person */
  specialists?: Record<string, string | null>
}
export interface SlotRow { formKey: string; slotKey: string; label: string; party: SignParty; userId: string | null; sort: number; required: boolean }
export interface ExistingSlot extends SlotRow { id: string }

export const SUGGESTED_ROLES: Omit<SignRole, 'userId' | 'forms'>[] = [
  { key: 'prep', label: 'تهیه‌کننده — مسئول دفتر فنی پیمانکار', party: 'contractor', sort: 1, required: true },
  { key: 'appr', label: 'تأییدکننده — سرپرست کارگاه', party: 'contractor', sort: 2, required: true },
  { key: 'rev', label: 'ناظر تخصصی', party: 'supervision', sort: 3, required: true, specialists: {} },
  { key: 'sup', label: 'تأیید نهایی — سرپرست دستگاه نظارت', party: 'supervision', sort: 4, required: true },
]

/** supervision disciplines: who checks which site minutes */
export const DISCIPLINES: { key: string; label: string }[] = [
  { key: 'line', label: 'ناظر خط (حمل، ریسه، خمکاری)' },
  { key: 'weld', label: 'ناظر جوش' },
  { key: 'rt', label: 'مفسر فیلم رادیوگرافی' },
  { key: 'coating', label: 'ناظر عایق و پوشش' },
  { key: 'civil', label: 'ناظر سیویل و عملیات خاکی' },
]
const GROUP_DISC: Record<string, string> = { pipeline: 'line', weld: 'weld', rt: 'rt', coating: 'coating', ground: 'civil', qc: 'weld' }
const FORM_DISC: Record<string, string> = { fitup: 'weld', tie_in: 'weld', lowering: 'coating', work: 'line' }
/** the discipline of a form: the project's own choice, else fit-up/tie-in → weld, lowering & holiday → coating, else by the form's group */
export const disciplineOf = (formKey: string, group: string | undefined, own: Record<string, string> = {}): string => own[formKey] || FORM_DISC[formKey] || GROUP_DISC[group ?? ''] || 'line'
export const disciplineLabel = (k: string) => DISCIPLINES.find((d) => d.key === k)?.label ?? k

/** the per-form slots: a specialist role takes the person and the title of the form's discipline */
export const desiredSlots = (roles: SignRole[], discOf: (formKey: string) => string = () => 'line'): SlotRow[] => roles.flatMap((r) => [...new Set(r.forms)].map((f) => {
  if (!r.specialists) return { formKey: f, slotKey: r.key, label: r.label, party: r.party, userId: r.userId, sort: r.sort, required: r.required }
  const d = discOf(f)
  return { formKey: f, slotKey: r.key, label: `${r.label} — ${disciplineLabel(d)}`, party: r.party, userId: r.specialists[d] ?? null, sort: r.sort, required: r.required }
}))
const same = (a: SlotRow, b: SlotRow) => a.label === b.label && a.party === b.party && a.userId === b.userId && a.sort === b.sort && a.required === b.required
/** what must change in the slot table so it equals the roles: rows to write, ids to remove */
export function diffSlots(existing: ExistingSlot[], desired: SlotRow[]): { upsert: SlotRow[]; remove: string[] } {
  const key = (s: { formKey: string; slotKey: string }) => `${s.formKey}|${s.slotKey}`
  const have = new Map(existing.map((e) => [key(e), e])), want = new Map(desired.map((d) => [key(d), d]))
  return { upsert: desired.filter((d) => { const e = have.get(key(d)); return !e || !same(e, d) }), remove: existing.filter((e) => !want.has(key(e))).map((e) => e.id) }
}
